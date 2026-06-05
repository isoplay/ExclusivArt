'use server'

import { revalidatePath } from 'next/cache'
import { createAuthenticatedClient } from '@/lib/auth'
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

    if (materiaisError) {
      logServerError('config_get_material_types_failed', materiaisError, {
        table: 'materiais',
      })
    }

    const materialCount = new Map<string, number>()
    ;(materiais || []).forEach((material) => {
      const key = normalizeKey(material.tipo)
      if (!key) return
      materialCount.set(key, (materialCount.get(key) || 0) + 1)
    })

    const grouped = new Map<string, TipoComponenteConfig>()

    ;(grupos || []).forEach((grupo: any) => {
      const nome = normalizeText(grupo.nome)
      const key = normalizeKey(nome)
      if (!key) return

      const categoria = Array.isArray(grupo.categoria) ? grupo.categoria[0] : grupo.categoria
      if (categoria?.ativo === false) return

      const current =
        grouped.get(key) ||
        ({
          nome,
          ativo: false,
          total_grupos: 0,
          categorias: [] as string[],
          materiais_vinculados: materialCount.get(key) || 0,
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
  const nome = normalizeText(formData.get('nome') as string)

  if (!nome) {
    return { success: false, error: 'Informe o nome do tipo de componente' }
  }

  const { data: categorias, error: categoriasError } = await supabase
    .from('categorias_produtos')
    .select('id, nome')
    .eq('ativo', true)

  if (categoriasError || !categorias?.length) {
    console.error('Error fetching categories:', categoriasError)
    return {
      success: false,
      error: 'Cadastre um produto antes de criar tipos de componente',
    }
  }

  const { data: gruposExistentes, error: gruposError } = await supabase
    .from('grupos_componentes')
    .select('categoria_id, nome, ordem')

  if (gruposError) {
    console.error('Error fetching existing component groups:', gruposError)
    return { success: false, error: gruposError.message }
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
      console.error('Error creating component type:', error)
      return { success: false, error: error.message }
    }
  } else {
    const { error } = await supabase
      .from('grupos_componentes')
      .update({ ativo: true })
      .eq('nome', nome)

    if (error) {
      console.error('Error reactivating component type:', error)
      return { success: false, error: error.message }
    }
  }

  revalidateConfiguracoesDependentes()
  return { success: true }
}

export async function renomearTipoComponente(nomeAtual: string, formData: FormData) {
  const supabase = await createAuthenticatedClient()
  const nome = normalizeText(formData.get('nome') as string)
  const atual = normalizeText(nomeAtual)

  if (!nome) {
    return { success: false, error: 'Informe o novo nome do tipo' }
  }

  if (normalizeKey(nome) === normalizeKey(atual)) {
    return { success: true }
  }

  const { error: gruposError } = await supabase
    .from('grupos_componentes')
    .update({ nome })
    .eq('nome', atual)

  if (gruposError) {
    console.error('Error renaming component type:', gruposError)
    return { success: false, error: gruposError.message }
  }

  const { error: materiaisError } = await supabase
    .from('materiais')
    .update({ tipo: nome })
    .eq('tipo', atual)

  if (materiaisError) {
    console.error('Error updating material component type:', materiaisError)
    return { success: false, error: materiaisError.message }
  }

  revalidateConfiguracoesDependentes()
  return { success: true }
}

export async function alternarTipoComponente(nome: string, ativo: boolean) {
  const supabase = await createAuthenticatedClient()
  const tipo = normalizeText(nome)

  const { error } = await supabase
    .from('grupos_componentes')
    .update({ ativo })
    .eq('nome', tipo)

  if (error) {
    console.error('Error toggling component type:', error)
    return { success: false, error: error.message }
  }

  revalidateConfiguracoesDependentes()
  return { success: true }
}
