'use server'

import { revalidatePath } from 'next/cache'
import { createAuthenticatedClient } from '@/lib/auth'
import { getCanonicalMaterialType, MATERIAL_TYPES } from '@/lib/material-types'
import { logServerError } from '@/lib/server-log'
import type { TipoComponenteConfig } from '@/lib/types/database'

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeKey(value: string | null | undefined) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function revalidateConfiguracoesDependentes() {
  revalidatePath('/dashboard/configuracoes')
  revalidatePath('/dashboard/estoque')
  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard/produtos')
}

export async function getTiposComponentesConfig(): Promise<TipoComponenteConfig[]> {
  const supabase = await createAuthenticatedClient()

  try {
    const { data: grupos, error } = await supabase
      .from('grupos_componentes')
      .select(
        `
        id,
        nome,
        ativo,
        ordem,
        categoria:categorias_produtos (
          nome,
          ativo
        )
      `
      )
      .order('ordem')

    if (error) {
      logServerError('config_get_tipos_componentes_failed', error, {
        table: 'grupos_componentes',
      })
      return []
    }

    const { data: materiais, error: materiaisError } = await supabase
      .from('materiais')
      .select('id, tipo')
      .eq('ativo', true)

    if (materiaisError) {
      logServerError('config_get_material_types_failed', materiaisError, {
        table: 'materiais',
      })
    }

    const materialCount = new Map<string, number>()
    ;(materiais || []).forEach((material) => {
      const tipo = getCanonicalMaterialType(material.tipo)
      if (!tipo) return
      materialCount.set(tipo, (materialCount.get(tipo) || 0) + 1)
    })

    const grouped = new Map<string, TipoComponenteConfig>(
      MATERIAL_TYPES.map((tipo) => [
        normalizeKey(tipo.nome),
        {
          nome: tipo.nome,
          ativo: false,
          total_grupos: 0,
          categorias: [],
          materiais_vinculados: materialCount.get(tipo.nome) || 0,
          ordem: tipo.ordem,
        },
      ])
    )

    ;(grupos || []).forEach((grupo: any) => {
      const nome = getCanonicalMaterialType(grupo.nome)
      if (!nome) return

      const key = normalizeKey(nome)

      const categoria = Array.isArray(grupo.categoria) ? grupo.categoria[0] : grupo.categoria
      if (categoria?.ativo === false) return

      const current =
        grouped.get(key) ||
        ({
          nome,
          ativo: false,
          total_grupos: 0,
          categorias: [] as string[],
          materiais_vinculados: materialCount.get(nome) || 0,
          ordem: grupo.ordem ?? 999,
        } satisfies TipoComponenteConfig)

      current.ativo = current.ativo || grupo.ativo === true
      current.total_grupos += 1
      current.ordem = Math.min(current.ordem, grupo.ordem ?? 999)

      if (categoria?.nome && !current.categorias.includes(categoria.nome)) {
        current.categorias.push(categoria.nome)
      }

      grouped.set(key, current)
    })

    return Array.from(grouped.values()).sort((a, b) => {
      if (a.ordem !== b.ordem) return a.ordem - b.ordem
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })
  } catch (error) {
    logServerError('config_get_tipos_componentes_exception', error, {
      tables: ['grupos_componentes', 'materiais'],
    })
    return []
  }
}

export async function criarTipoComponente(formData: FormData) {
  const supabase = await createAuthenticatedClient()
  const nome = getCanonicalMaterialType(formData.get('nome') as string)

  if (!nome) {
    return { success: false, error: 'Use um dos seis tipos padronizados' }
  }

  const { data: categorias, error: categoriasError } = await supabase
    .from('categorias_produtos')
    .select('id, nome')
    .eq('ativo', true)

  if (categoriasError || !categorias?.length) {
    logServerError('config_categories_lookup_failed', categoriasError, {
      table: 'categorias_produtos',
    })
    return {
      success: false,
      error: 'Cadastre um produto antes de criar tipos de componente',
    }
  }

  const { data: gruposExistentes, error: gruposError } = await supabase
    .from('grupos_componentes')
    .select('categoria_id, nome, ordem')

  if (gruposError) {
    logServerError('config_groups_lookup_failed', gruposError, {
      table: 'grupos_componentes',
    })
    return { success: false, error: 'Nao foi possivel consultar os componentes' }
  }

  const existingByCategory = new Set(
    (gruposExistentes || []).map(
      (grupo) => `${grupo.categoria_id}:${normalizeKey(grupo.nome)}`
    )
  )
  const nextOrder =
    Math.max(0, ...(gruposExistentes || []).map((grupo) => grupo.ordem ?? 0)) + 1

  const gruposParaInserir = categorias
    .filter((categoria) => !existingByCategory.has(`${categoria.id}:${normalizeKey(nome)}`))
    .map((categoria) => ({
      categoria_id: categoria.id,
      nome,
      descricao: null,
      obrigatorio: false,
      permite_multipla_selecao: false,
      ordem: nextOrder,
      ativo: true,
    }))

  if (gruposParaInserir.length > 0) {
    const { error } = await supabase.from('grupos_componentes').insert(gruposParaInserir)

    if (error) {
      logServerError('config_create_component_type_failed', error, {
        table: 'grupos_componentes',
      })
      return { success: false, error: 'Nao foi possivel criar o tipo de componente' }
    }
  } else {
    const { error } = await supabase
      .from('grupos_componentes')
      .update({ ativo: true })
      .eq('nome', nome)

    if (error) {
      logServerError('config_reactivate_component_type_failed', error, {
        table: 'grupos_componentes',
      })
      return { success: false, error: 'Nao foi possivel reativar o tipo de componente' }
    }
  }

  revalidateConfiguracoesDependentes()
  return { success: true }
}

export async function renomearTipoComponente(nomeAtual: string, formData: FormData) {
  const nome = getCanonicalMaterialType(formData.get('nome') as string)
  const atual = getCanonicalMaterialType(nomeAtual)

  if (!nome || !atual) {
    return { success: false, error: 'Use um dos seis tipos padronizados' }
  }

  if (nome === atual) {
    return { success: true }
  }

  return { success: false, error: 'Os tipos padronizados não podem ser renomeados' }
}

export async function alternarTipoComponente(nome: string, ativo: boolean) {
  const supabase = await createAuthenticatedClient()
  const tipo = getCanonicalMaterialType(nome)

  if (!tipo) {
    return { success: false, error: 'Tipo de componente inválido' }
  }

  if (!ativo) {
    return { success: false, error: 'Os seis tipos padronizados devem permanecer ativos' }
  }

  const { error } = await supabase
    .from('grupos_componentes')
    .update({ ativo })
    .eq('nome', tipo)

  if (error) {
    logServerError('config_toggle_component_type_failed', error, {
      table: 'grupos_componentes',
    })
    return { success: false, error: 'Nao foi possivel alterar o tipo de componente' }
  }

  revalidateConfiguracoesDependentes()
  return { success: true }
}
