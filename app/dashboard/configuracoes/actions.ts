'use server'

import { revalidatePath } from 'next/cache'
import { createAuthenticatedClient } from '@/lib/auth'
import { getCanonicalMaterialType } from '@/lib/material-types'
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
    const materialTypeNames = new Map<string, string>()
    ;(materiais || []).forEach((material) => {
      const tipo = getCanonicalMaterialType(material.tipo)
      if (!tipo) return
      const key = normalizeKey(tipo)
      materialCount.set(key, (materialCount.get(key) || 0) + 1)
      materialTypeNames.set(key, tipo)
    })

    const grouped = new Map<string, TipoComponenteConfig>(
      Array.from(materialTypeNames, ([key, nome]) => [
        key,
        {
          nome,
          ativo: false,
          total_grupos: 0,
          categorias: [],
          materiais_vinculados: materialCount.get(key) || 0,
          ordem: 999,
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
          materiais_vinculados: materialCount.get(normalizeKey(nome)) || 0,
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
    return { success: false, error: 'Informe um tipo de componente valido' }
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
    .select('id, categoria_id, nome, ordem')

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
    const idsExistentes = (gruposExistentes || [])
      .filter((grupo) => normalizeKey(grupo.nome) === normalizeKey(nome))
      .map((grupo) => grupo.id)

    const { error } = await supabase
      .from('grupos_componentes')
      .update({ ativo: true })
      .in('id', idsExistentes)

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
  const supabase = await createAuthenticatedClient()
  const nome = getCanonicalMaterialType(formData.get('nome') as string)
  const atual = getCanonicalMaterialType(nomeAtual)

  if (!nome || !atual) {
    return { success: false, error: 'Informe um tipo de componente valido' }
  }

  if (normalizeKey(nome) === normalizeKey(atual)) {
    return { success: true }
  }

  const { error } = await supabase.rpc('renomear_tipo_componente', {
    p_nome_atual: atual,
    p_novo_nome: nome,
  })

  if (error) {
    logServerError('config_rename_component_type_failed', error, {
      tables: ['grupos_componentes', 'materiais'],
    })
    return {
      success: false,
      error: error.message.includes('tipo_destino_existente')
        ? 'Ja existe um tipo com esse nome'
        : 'Nao foi possivel renomear o tipo de componente',
    }
  }

  revalidateConfiguracoesDependentes()
  return { success: true }
}

export async function alternarTipoComponente(nome: string, ativo: boolean) {
  const supabase = await createAuthenticatedClient()
  const tipo = getCanonicalMaterialType(nome)

  if (!tipo) {
    return { success: false, error: 'Tipo de componente inválido' }
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

export async function ordenarTiposComponentes(nomes: string[]) {
  const supabase = await createAuthenticatedClient()

  if (!Array.isArray(nomes) || nomes.length === 0 || nomes.length > 200) {
    return { success: false, error: 'Ordem invalida' }
  }

  const ordemPorTipo = new Map<string, number>()
  nomes.forEach((nome, index) => {
    const tipo = getCanonicalMaterialType(nome)
    if (!tipo) return
    const key = normalizeKey(tipo)
    if (!ordemPorTipo.has(key)) {
      ordemPorTipo.set(key, index + 1)
    }
  })

  if (ordemPorTipo.size !== nomes.length) {
    return { success: false, error: 'Lista de tipos invalida' }
  }

  const { data: grupos, error: gruposError } = await supabase
    .from('grupos_componentes')
    .select('id, nome')

  if (gruposError) {
    logServerError('config_order_component_types_lookup_failed', gruposError, {
      table: 'grupos_componentes',
    })
    return { success: false, error: 'Nao foi possivel consultar os tipos' }
  }

  const updates = (grupos || [])
    .map((grupo) => ({
      id: grupo.id,
      ordem: ordemPorTipo.get(normalizeKey(grupo.nome)),
    }))
    .filter((grupo): grupo is { id: string; ordem: number } => typeof grupo.ordem === 'number')

  const results = await Promise.all(
    updates.map((grupo) =>
      supabase
        .from('grupos_componentes')
        .update({ ordem: grupo.ordem })
        .eq('id', grupo.id)
    )
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) {
    logServerError('config_order_component_types_failed', failed.error, {
      table: 'grupos_componentes',
    })
    return { success: false, error: 'Nao foi possivel salvar a ordem dos tipos' }
  }

  revalidateConfiguracoesDependentes()
  return { success: true }
}
