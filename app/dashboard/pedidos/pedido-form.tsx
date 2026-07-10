'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  PackageCheck,
  Plus,
  Trash2,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type {
  CategoriaProduto,
  ComponenteEstoque,
  GrupoComponente,
  Material,
  PedidoComItens,
} from '@/lib/types/database'
import { parseDecimalInput } from '@/lib/number'
import { arredondarParaCimaMeioReal, formatDateBR } from '@/lib/utils'
import { createPedidoCustomizado, updatePedidoCustomizado } from './actions'

interface ComponenteSelecionado {
  grupo_id: string
  grupo_nome: string
  material_id: string
  material_nome: string
  quantidade: number
  custo_unit: number
  unidade: string
  estoque_atual: number
}

interface PedidoItemDraft {
  id: string
  categoria_id: string
  quantidade_itens: number
  componentes: ComponenteSelecionado[]
  margem_percentual: number
  mao_obra_valor: string
  preco_final_manual: string
  motivo_ajuste_preco: string
}

type PedidoFormMode = 'create' | 'edit'

function normalizeKey(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function getEstoqueAtual(material: Material) {
  return material.quantidade_atual ?? material.quantidade ?? 0
}

function toDateInput(value: string | null | undefined) {
  if (!value) return ''
  return value.slice(0, 10)
}

function findGrupoForMaterial(
  material: Material | undefined,
  grupos: GrupoComponente[],
  fallbackId = ''
) {
  if (!material) return null

  return (
    grupos.find((grupo) => grupo.id === fallbackId) ||
    grupos.find((grupo) => normalizeKey(grupo.nome) === normalizeKey(material.tipo)) ||
    null
  )
}

function getInitialComponentes(
  pedido: PedidoComItens | null | undefined,
  grupos: GrupoComponente[],
  materiais: Material[]
): ComponenteSelecionado[] {
  if (!pedido) return []

  const quantidadeItens = Math.max(1, pedido.pedido_itens?.[0]?.quantidade || 1)

  return (pedido.pedido_itens || []).flatMap((item) =>
    (item.pedido_itens_materiais || []).map((pedidoMaterial) => {
      const material =
        pedidoMaterial.material ||
        materiais.find((materialItem) => materialItem.id === pedidoMaterial.material_id)
      const grupo = findGrupoForMaterial(material, grupos)
      const quantidade = Math.max(1, Math.round((pedidoMaterial.quantidade || 1) / quantidadeItens))

      return {
        grupo_id: grupo?.id || '',
        grupo_nome: grupo?.nome || material?.tipo || 'Material',
        material_id: pedidoMaterial.material_id,
        material_nome: material?.nome || 'Material',
        quantidade,
        custo_unit: material?.custo_unitario || 0,
        unidade: material?.unidade || 'un',
        estoque_atual: material ? getEstoqueAtual(material) : 0,
      }
    })
  )
}

function getInitialItemDrafts(
  pedido: PedidoComItens | null | undefined,
  categorias: CategoriaProduto[],
  grupos: GrupoComponente[],
  materiais: Material[]
): PedidoItemDraft[] {
  if (!pedido) return []

  return (pedido.pedido_itens || []).map((item, index) => {
    const categoriaId =
      categorias.find((categoria) => normalizeKey(categoria.nome) === normalizeKey(item.produto?.nome))?.id ||
      pedido.tipo_produto_id ||
      ''
    const quantidadeItens = Math.max(1, item.quantidade || 1)
    const componentesItem = (item.pedido_itens_materiais || []).map((pedidoMaterial) => {
      const material =
        pedidoMaterial.material ||
        materiais.find((materialItem) => materialItem.id === pedidoMaterial.material_id)
      const grupo = findGrupoForMaterial(material, grupos)
      const quantidade = Math.max(1, Math.round((pedidoMaterial.quantidade || 1) / quantidadeItens))

      return {
        grupo_id: grupo?.id || '',
        grupo_nome: grupo?.nome || material?.tipo || 'Material',
        material_id: pedidoMaterial.material_id,
        material_nome: material?.nome || 'Material',
        quantidade,
        custo_unit: material?.custo_unitario || 0,
        unidade: material?.unidade || 'un',
        estoque_atual: material ? getEstoqueAtual(material) : 0,
      }
    })

    return {
      id: item.id || `item-${index + 1}`,
      categoria_id: categoriaId,
      quantidade_itens: quantidadeItens,
      componentes: componentesItem,
      margem_percentual: 100,
      mao_obra_valor: '',
      preco_final_manual: item.preco_manual ? String(Number(item.valor_total || 0)).replace('.', ',') : '',
      motivo_ajuste_preco: item.motivo_ajuste_preco || '',
    }
  })
}

function inferCategoriaId(
  pedido: PedidoComItens,
  categorias: CategoriaProduto[]
) {
  if (pedido.tipo_produto_id) return pedido.tipo_produto_id

  const produtoNome = pedido.pedido_itens?.[0]?.produto?.nome
  if (!produtoNome) return ''

  return categorias.find((categoria) => normalizeKey(categoria.nome) === normalizeKey(produtoNome))?.id || ''
}

export function PedidoForm({
  categorias,
  grupos,
  componentes,
  materiais,
  maodeobra,
  mode = 'create',
  initialPedido = null,
  onSuccess,
}: {
  categorias: CategoriaProduto[]
  grupos: GrupoComponente[]
  componentes: (ComponenteEstoque & { material: Material })[]
  materiais: Material[]
  maodeobra: { [categoria_id: string]: number }
  mode?: PedidoFormMode
  initialPedido?: PedidoComItens | null
  onSuccess?: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [clienteNome, setClienteNome] = useState('')
  const [clienteContato, setClienteContato] = useState('')
  const [clienteEndereco, setClienteEndereco] = useState('')
  const [prazoEntrega, setPrazoEntrega] = useState('')
  const [categoriaSelecionada, setCategoriaSelecionada] = useState('')
  const [quantidadeItens, setQuantidadeItens] = useState(1)
  const [componentesSelecionados, setComponentesSelecionados] = useState<ComponenteSelecionado[]>([])
  const [showResumo, setShowResumo] = useState(false)
  const [observacoes, setObservacoes] = useState('')
  const [observacaoCliente, setObservacaoCliente] = useState('')
  const [grupoAtual, setGrupoAtual] = useState('')
  const [materialAtual, setMaterialAtual] = useState('')
  const [margemPercentual, setMargemPercentual] = useState(100)
  const [maoObraValor, setMaoObraValor] = useState('')
  const [precoFinalManual, setPrecoFinalManual] = useState('')
  const [motivoAjustePreco, setMotivoAjustePreco] = useState('')
  const [itensPedido, setItensPedido] = useState<PedidoItemDraft[]>([])

  const isEditMode = mode === 'edit'
  const isMaterialsLocked = Boolean(initialPedido?.estoque_baixado)

  useEffect(() => {
    if (!initialPedido) return

    const initialDrafts = getInitialItemDrafts(initialPedido, categorias, grupos, materiais)
    const itemPrincipal = initialPedido.pedido_itens?.[0]
    const draftPrincipal = initialDrafts[0]
    const categoriaId = inferCategoriaId(initialPedido, categorias)

    setClienteNome(initialPedido.cliente_nome || '')
    setClienteContato(initialPedido.cliente_contato || '')
    setClienteEndereco(initialPedido.cliente_endereco || '')
    setPrazoEntrega(toDateInput(initialPedido.prazo_entrega))
    setCategoriaSelecionada(draftPrincipal?.categoria_id || categoriaId)
    setQuantidadeItens(draftPrincipal?.quantidade_itens || Math.max(1, itemPrincipal?.quantidade || 1))
    setComponentesSelecionados(draftPrincipal?.componentes || [])
    setShowResumo(false)
    setObservacoes(initialPedido.observacoes || '')
    setObservacaoCliente(initialPedido.observacao_cliente || '')
    setGrupoAtual('')
    setMaterialAtual('')
    setMargemPercentual(draftPrincipal?.margem_percentual || 100)
    setMaoObraValor(draftPrincipal?.mao_obra_valor || '')
    const valorItemAtual = Number(itemPrincipal?.valor_total ?? initialPedido.valor_total ?? 0)
    setPrecoFinalManual(draftPrincipal?.preco_final_manual || (itemPrincipal?.preco_manual ? String(valorItemAtual).replace('.', ',') : ''))
    setMotivoAjustePreco(draftPrincipal?.motivo_ajuste_preco || itemPrincipal?.motivo_ajuste_preco || '')
    setItensPedido(initialDrafts.slice(1))
  }, [categorias, initialPedido, grupos, materiais])

  const categoriaAtual = categorias.find((categoria) => categoria.id === categoriaSelecionada)
  const gruposCat = useMemo(
    () =>
      grupos
        .filter((grupo) => grupo.categoria_id === categoriaSelecionada && grupo.ativo !== false)
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
    [categoriaSelecionada, grupos]
  )
  const grupoAtualObj = gruposCat.find((grupo) => grupo.id === grupoAtual)
  const materiaisDoTipo = useMemo(() => {
    const tipo = normalizeKey(grupoAtualObj?.nome)
    if (!tipo) return []

    return materiais
      .filter((material) => normalizeKey(material.tipo) === tipo)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [grupoAtualObj?.nome, materiais])

  const custoMateriaisUnitario = componentesSelecionados.reduce(
    (acc, componente) => acc + componente.custo_unit * componente.quantidade,
    0
  )
  const custoMateriaisTotal = custoMateriaisUnitario * quantidadeItens
  const maodeobraTotal = Math.max(0, parseDecimalInput(maoObraValor))
  const custoBase = custoMateriaisTotal + maodeobraTotal
  const margemAplicada = margemPercentual
  const valorComMargem = custoBase * (1 + margemAplicada / 100)
  const valorFinalArredondado = arredondarParaCimaMeioReal(valorComMargem)
  const precoManualNumber = parseDecimalInput(precoFinalManual)
  const hasPrecoManual = precoFinalManual.trim() !== '' && precoManualNumber >= 0
  const valorFinalCobrado = hasPrecoManual ? precoManualNumber : valorFinalArredondado
  const ajusteArredondamento = valorFinalArredondado - valorComMargem
  const diferencaPrecoManual = valorFinalCobrado - valorFinalArredondado
  const percentualAjusteManual =
    valorFinalArredondado > 0 ? (diferencaPrecoManual / valorFinalArredondado) * 100 : 0
  const lucroEstimado = valorFinalCobrado - custoBase
  const itemAtualValido =
    Boolean(categoriaSelecionada) && componentesSelecionados.length > 0 && quantidadeItens > 0

  function createLocalItemId() {
    return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  function getItemLabel(item: PedidoItemDraft, index: number) {
    const categoria = categorias.find((categoriaItem) => categoriaItem.id === item.categoria_id)
    return categoria?.nome || `Item ${index + 1}`
  }

  function calcularItem(item: PedidoItemDraft) {
    const quantidade = Math.max(1, item.quantidade_itens || 1)
    const custoMateriaisUnitarioItem = item.componentes.reduce(
      (acc, componente) => acc + componente.custo_unit * componente.quantidade,
      0
    )
    const custoMateriaisTotalItem = custoMateriaisUnitarioItem * quantidade
    const maodeobraTotalItem = Math.max(0, parseDecimalInput(item.mao_obra_valor))
    const custoBaseItem = custoMateriaisTotalItem + maodeobraTotalItem
    const margemItem = Math.max(0, item.margem_percentual || 0)
    const valorComMargemItem = custoBaseItem * (1 + margemItem / 100)
    const valorCalculadoItem = arredondarParaCimaMeioReal(valorComMargemItem)
    const precoManual = parseDecimalInput(item.preco_final_manual)
    const hasManual = item.preco_final_manual.trim() !== '' && precoManual >= 0
    const valorFinalItem = hasManual ? precoManual : valorCalculadoItem

    return {
      custoMateriaisTotal: custoMateriaisTotalItem,
      maodeobraTotal: maodeobraTotalItem,
      custoBase: custoBaseItem,
      valorCalculado: valorCalculadoItem,
      valorFinal: valorFinalItem,
      hasManual,
    }
  }

  function buildCurrentItemDraft(): PedidoItemDraft {
    return {
      id: createLocalItemId(),
      categoria_id: categoriaSelecionada,
      quantidade_itens: quantidadeItens,
      componentes: componentesSelecionados,
      margem_percentual: margemPercentual,
      mao_obra_valor: maoObraValor,
      preco_final_manual: precoFinalManual,
      motivo_ajuste_preco: motivoAjustePreco,
    }
  }

  const itensParaSalvar = [
    ...itensPedido,
    ...(itemAtualValido && !isMaterialsLocked ? [buildCurrentItemDraft()] : []),
  ]
  const totaisItensSalvos = itensPedido.map((item) => calcularItem(item))
  const totalItensSalvos = totaisItensSalvos.reduce((acc, item) => acc + item.valorFinal, 0)
  const totalCalculadoItensSalvos = totaisItensSalvos.reduce((acc, item) => acc + item.valorCalculado, 0)
  const totalCustoMateriaisItensSalvos = totaisItensSalvos.reduce(
    (acc, item) => acc + item.custoMateriaisTotal,
    0
  )
  const totalMaodeobraItensSalvos = totaisItensSalvos.reduce((acc, item) => acc + item.maodeobraTotal, 0)
  const totalCustoBaseItensSalvos = totaisItensSalvos.reduce((acc, item) => acc + item.custoBase, 0)
  const totalPedidoCobrado = totalItensSalvos + (itemAtualValido && !isMaterialsLocked ? valorFinalCobrado : 0)
  const totalPedidoCalculado =
    totalCalculadoItensSalvos + (itemAtualValido && !isMaterialsLocked ? valorFinalArredondado : 0)
  const totalCustoMateriaisPedido =
    totalCustoMateriaisItensSalvos + (itemAtualValido && !isMaterialsLocked ? custoMateriaisTotal : 0)
  const totalMaodeobraPedido =
    totalMaodeobraItensSalvos + (itemAtualValido && !isMaterialsLocked ? maodeobraTotal : 0)
  const totalCustoBasePedido =
    totalCustoBaseItensSalvos + (itemAtualValido && !isMaterialsLocked ? custoBase : 0)
  const quantidadeItensPedido =
    itensPedido.reduce((acc, item) => acc + Math.max(1, item.quantidade_itens || 1), 0) +
    (itemAtualValido && !isMaterialsLocked ? quantidadeItens : 0)
  const quantidadeComponentesPedido =
    itensPedido.reduce((acc, item) => acc + item.componentes.length, 0) +
    (itemAtualValido && !isMaterialsLocked ? componentesSelecionados.length : 0)

  function resetForm() {
    setClienteNome('')
    setClienteContato('')
    setClienteEndereco('')
    setPrazoEntrega('')
    setCategoriaSelecionada('')
    setQuantidadeItens(1)
    setComponentesSelecionados([])
    setShowResumo(false)
    setObservacoes('')
    setObservacaoCliente('')
    setGrupoAtual('')
    setMaterialAtual('')
    setMargemPercentual(100)
    setMaoObraValor('')
    setPrecoFinalManual('')
    setMotivoAjustePreco('')
    setItensPedido([])
  }

  function limparItemAtual() {
    setCategoriaSelecionada('')
    setQuantidadeItens(1)
    setComponentesSelecionados([])
    setGrupoAtual('')
    setMaterialAtual('')
    setMargemPercentual(100)
    setMaoObraValor('')
    setPrecoFinalManual('')
    setMotivoAjustePreco('')
  }

  function handleCategoriaChange(value: string) {
    setCategoriaSelecionada(value)
    setGrupoAtual('')
    setMaterialAtual('')
    setComponentesSelecionados([])
  }

  function handleGrupoChange(value: string) {
    setGrupoAtual(value)
    setMaterialAtual('')
  }

  function adicionarComponente() {
    const material = materiaisDoTipo.find((item) => item.id === materialAtual)
    if (!material || !grupoAtualObj || isMaterialsLocked) return

    setComponentesSelecionados((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.grupo_id === grupoAtual && item.material_id === material.id
      )

      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = {
          ...next[existingIndex],
          quantidade: next[existingIndex].quantidade + 1,
          estoque_atual: getEstoqueAtual(material),
        }
        return next
      }

      return [
        ...prev,
        {
          grupo_id: grupoAtual,
          grupo_nome: grupoAtualObj.nome,
          material_id: material.id,
          material_nome: material.nome,
          quantidade: 1,
          custo_unit: material.custo_unitario || 0,
          unidade: material.unidade,
          estoque_atual: getEstoqueAtual(material),
        },
      ]
    })

    setMaterialAtual('')
  }

  function removerComponente(index: number) {
    if (isMaterialsLocked) return
    setComponentesSelecionados((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
  }

  function alterarQuantidade(index: number, delta: number) {
    if (isMaterialsLocked) return
    setComponentesSelecionados((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        quantidade: Math.max(1, next[index].quantidade + delta),
      }
      return next
    })
  }

  function definirQuantidade(index: number, value: string) {
    if (isMaterialsLocked) return
    const quantidade = Number.parseInt(value, 10)
    if (!Number.isFinite(quantidade)) return

    setComponentesSelecionados((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        quantidade: Math.max(1, quantidade),
      }
      return next
    })
  }

  function adicionarOutroItem() {
    if (isMaterialsLocked) return
    if (!itemAtualValido) {
      toast.error('Monte o item atual antes de adicionar outro')
      return
    }
    if (precoFinalManual.trim() && precoManualNumber < 0) {
      toast.error('Preco final invalido')
      return
    }
    if (maoObraValor.trim() && parseDecimalInput(maoObraValor) < 0) {
      toast.error('Mao de obra invalida')
      return
    }

    setItensPedido((prev) => [...prev, buildCurrentItemDraft()])
    limparItemAtual()
    toast.success('Item adicionado ao pedido')
  }

  function editarItemPedido(id: string) {
    if (isMaterialsLocked) return
    const item = itensPedido.find((itemPedido) => itemPedido.id === id)
    if (!item) return

    if (itemAtualValido) {
      setItensPedido((prev) => [
        ...prev.filter((itemPedido) => itemPedido.id !== id),
        buildCurrentItemDraft(),
      ])
    } else {
      setItensPedido((prev) => prev.filter((itemPedido) => itemPedido.id !== id))
    }

    setCategoriaSelecionada(item.categoria_id)
    setQuantidadeItens(item.quantidade_itens)
    setComponentesSelecionados(item.componentes)
    setGrupoAtual('')
    setMaterialAtual('')
    setMargemPercentual(item.margem_percentual)
    setMaoObraValor(item.mao_obra_valor)
    setPrecoFinalManual(item.preco_final_manual)
    setMotivoAjustePreco(item.motivo_ajuste_preco)
  }

  function duplicarItemPedido(id: string) {
    if (isMaterialsLocked) return
    const item = itensPedido.find((itemPedido) => itemPedido.id === id)
    if (!item) return

    setItensPedido((prev) => [
      ...prev,
      {
        ...item,
        id: createLocalItemId(),
        componentes: item.componentes.map((componente) => ({ ...componente })),
      },
    ])
  }

  function excluirItemPedido(id: string) {
    if (isMaterialsLocked) return
    setItensPedido((prev) => prev.filter((item) => item.id !== id))
  }

  function salvarPedido() {
    if (!clienteNome.trim()) {
      toast.error('Nome do cliente obrigatorio')
      return
    }
    if (!isMaterialsLocked && itensPedido.length === 0 && !itemAtualValido) {
      toast.error('Adicione pelo menos um item ao pedido')
      return
    }
    if (!isMaterialsLocked && categoriaSelecionada && componentesSelecionados.length === 0) {
      toast.error('Adicione componentes ao item atual ou limpe o item antes de continuar')
      return
    }
    if (!prazoEntrega) {
      toast.error('Prazo de entrega obrigatorio')
      return
    }
    if (precoFinalManual.trim() && precoManualNumber < 0) {
      toast.error('Preco final invalido')
      return
    }
    if (maoObraValor.trim() && parseDecimalInput(maoObraValor) < 0) {
      toast.error('Mao de obra invalida')
      return
    }
    if (itensPedido.some((item) => item.preco_final_manual.trim() && parseDecimalInput(item.preco_final_manual) < 0)) {
      toast.error('Existe item com preco final invalido')
      return
    }
    if (itensPedido.some((item) => item.mao_obra_valor.trim() && parseDecimalInput(item.mao_obra_valor) < 0)) {
      toast.error('Existe item com mao de obra invalida')
      return
    }

    setShowResumo(true)
  }

  function confirmarPedido() {
    startTransition(async () => {
      try {
        const itensPayload = isMaterialsLocked
          ? []
          : itensParaSalvar.map((item) => {
              const precoManual = parseDecimalInput(item.preco_final_manual)

              return {
                categoria_id: item.categoria_id,
                quantidade_itens: item.quantidade_itens,
                componentes: item.componentes.map((componente) => ({
                  material_id: componente.material_id,
                  quantidade: componente.quantidade,
                })),
                margem_percentual: item.margem_percentual,
                mao_obra_valor: parseDecimalInput(item.mao_obra_valor),
                valor_final_manual:
                  item.preco_final_manual.trim() !== '' && precoManual >= 0 ? precoManual : null,
                motivo_ajuste_preco: item.motivo_ajuste_preco || null,
              }
            })
        const primeiroItem = itensPayload[0]
        const payload = {
          cliente_nome: clienteNome,
          cliente_telefone: clienteContato || null,
          cliente_endereco: clienteEndereco || null,
          categoria_id: primeiroItem?.categoria_id || categoriaSelecionada,
          quantidade_itens: primeiroItem?.quantidade_itens || quantidadeItens,
          componentes:
            primeiroItem?.componentes ||
            componentesSelecionados.map((componente) => ({
              material_id: componente.material_id,
              quantidade: componente.quantidade,
            })),
          prazo_entrega: prazoEntrega,
          observacoes: observacoes || null,
          observacao_cliente: observacaoCliente || null,
          margem_percentual: primeiroItem?.margem_percentual || margemPercentual,
          valor_final_manual: primeiroItem?.valor_final_manual ?? (hasPrecoManual ? valorFinalCobrado : null),
          motivo_ajuste_preco: primeiroItem?.motivo_ajuste_preco ?? (motivoAjustePreco || null),
          itens: itensPayload.length > 0 ? itensPayload : undefined,
        }

        const result =
          isEditMode && initialPedido
            ? await updatePedidoCustomizado(initialPedido.id, payload)
            : await createPedidoCustomizado(payload)

        if (result.success) {
          toast.success(isEditMode ? 'Pedido atualizado com sucesso!' : 'Pedido criado com sucesso!')
          if (!isEditMode) resetForm()
          onSuccess?.()
        } else {
          toast.error(result.error || 'Erro ao salvar pedido')
        }
      } catch (error) {
        toast.error('Erro ao salvar pedido')
        console.error(error)
      }
    })
  }

  if (showResumo) {
    return (
      <div className="space-y-4">
        <Card className="overflow-hidden rounded-xl">
          <CardHeader>
            <CardTitle>{isEditMode ? 'Resumo da Edicao' : 'Resumo do Pedido'}</CardTitle>
            <CardDescription>Revise os dados antes de confirmar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isMaterialsLocked && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="line-clamp-none">Materiais bloqueados</AlertTitle>
                <AlertDescription>
                  Este pedido ja baixou estoque. Apenas dados do cliente, prazo e observacoes serao atualizados.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <div className="space-y-1 rounded-lg border p-3">
                <p className="text-sm font-semibold">Cliente</p>
                <p className="text-sm">{clienteNome}</p>
                {clienteContato && <p className="text-sm text-muted-foreground">{clienteContato}</p>}
                {clienteEndereco && <p className="text-sm text-muted-foreground">{clienteEndereco}</p>}
              </div>
              <div className="space-y-1 rounded-lg border p-3">
                <p className="text-sm font-semibold">Pedido</p>
                <p className="text-sm">
                  {itensParaSalvar.length > 1
                    ? `${itensParaSalvar.length} itens no pedido`
                    : categoriaAtual?.nome || 'Produto bloqueado'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {quantidadeItensPedido || quantidadeItens} unidade(s) ate {formatDateBR(prazoEntrega)}
                </p>
              </div>
            </div>

            {itensParaSalvar.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Itens do pedido</p>
                <div className="space-y-2">
                  {itensParaSalvar.map((item, index) => {
                    const totais = calcularItem(item)

                    return (
                      <div
                        key={`${item.id}-${index}`}
                        className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            Item {index + 1}: {getItemLabel(item, index)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantidade_itens} unidade(s), {item.componentes.length} componente(s)
                          </p>
                        </div>
                        <Badge variant="secondary">{formatCurrency(totais.valorFinal)}</Badge>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {componentesSelecionados.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">
                  {itensPedido.length > 0 ? 'Componentes do item atual' : 'Componentes'}
                </p>
                <div className="space-y-2">
                  {componentesSelecionados.map((componente) => (
                    <div
                      key={`${componente.grupo_id}-${componente.material_id}`}
                      className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">{componente.material_nome}</p>
                        <p className="text-xs text-muted-foreground">{componente.grupo_nome}</p>
                      </div>
                      <Badge variant="secondary">
                        {componente.quantidade} {componente.unidade} por item
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isMaterialsLocked && (
              <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
                <div className="flex justify-between">
                  <span>Custo dos materiais</span>
                  <span>{formatCurrency(totalCustoMateriaisPedido || custoMateriaisTotal)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-base font-semibold">
                  <span>Preco calculado total</span>
                  <span>{formatCurrency(totalPedidoCalculado || valorFinalArredondado)}</span>
                </div>
                {(hasPrecoManual || itensPedido.some((item) => calcularItem(item).hasManual)) && (
                  <>
                    <div className="flex justify-between">
                      <span>Preco final cobrado total</span>
                      <span className="font-semibold text-green-700">
                        {formatCurrency(totalPedidoCobrado || valorFinalCobrado)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Diferenca</span>
                      <span
                        className={
                          totalPedidoCobrado - totalPedidoCalculado < 0
                            ? 'text-rose-700'
                            : 'text-green-700'
                        }
                      >
                        {formatCurrency(totalPedidoCobrado - totalPedidoCalculado)}
                      </span>
                    </div>
                    {motivoAjustePreco && (
                      <div className="flex justify-between gap-3">
                        <span>Motivo</span>
                        <span className="text-right">{motivoAjustePreco}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between">
                  <span>Lucro estimado</span>
                  <span className="font-medium text-green-700">
                    {formatCurrency((totalPedidoCobrado || valorFinalCobrado) - (totalCustoBasePedido || custoBase))}
                  </span>
                </div>
              </div>
            )}

            {observacaoCliente && (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-semibold">Observacao para o cliente</p>
                <p className="text-sm text-muted-foreground">{observacaoCliente}</p>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setShowResumo(false)} disabled={isPending}>
                Voltar
              </Button>
              <Button onClick={confirmarPedido} disabled={isPending} className="bg-green-600 hover:bg-green-700">
                {isPending
                  ? 'Salvando...'
                  : isEditMode
                    ? 'Salvar Alteracoes'
                    : 'Confirmar Pedido'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          {isMaterialsLocked && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-950">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="line-clamp-none">Edicao limitada</AlertTitle>
              <AlertDescription>
                Este pedido ja baixou estoque. Produto, componentes, quantidade e margem ficam bloqueados.
              </AlertDescription>
            </Alert>
          )}

          <Card className="overflow-hidden rounded-xl">
            <CardHeader>
              <CardTitle className="text-lg">Dados do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cliente-nome">Nome do Cliente *</Label>
                  <Input
                    id="cliente-nome"
                    value={clienteNome}
                    onChange={(event) => setClienteNome(event.target.value)}
                    placeholder="Nome completo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente-contato">Contato</Label>
                  <Input
                    id="cliente-contato"
                    value={clienteContato}
                    onChange={(event) => setClienteContato(event.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prazo-entrega">Prazo de Entrega *</Label>
                  <Input
                    id="prazo-entrega"
                    type="date"
                    value={prazoEntrega}
                    onChange={(event) => setPrazoEntrega(event.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cliente-endereco">Endereco</Label>
                  <Input
                    id="cliente-endereco"
                    value={clienteEndereco}
                    onChange={(event) => setClienteEndereco(event.target.value)}
                    placeholder="Rua, numero, complemento"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {itensPedido.length > 0 && (
            <Card className="overflow-hidden rounded-xl">
              <CardHeader>
                <CardTitle className="text-lg">Itens do pedido</CardTitle>
                <CardDescription>
                  Cada item pode ter produto, componentes, quantidade e preco final proprios.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {itensPedido.map((item, index) => {
                  const totais = calcularItem(item)

                  return (
                    <div
                      key={item.id}
                      className="grid min-w-0 gap-3 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          Item {index + 1}: {getItemLabel(item, index)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantidade_itens} unidade(s), {item.componentes.length} componente(s)
                        </p>
                        <p className="mt-1 text-sm font-medium text-green-700">
                          {formatCurrency(totais.valorFinal)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => editarItemPedido(item.id)}
                          disabled={isMaterialsLocked}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => duplicarItemPedido(item.id)}
                          disabled={isMaterialsLocked}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => excluirItemPedido(item.id)}
                          disabled={isMaterialsLocked}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden rounded-xl">
            <CardHeader>
              <CardTitle className="text-lg">Item atual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid min-w-0 gap-4 md:grid-cols-2 min-[1180px]:grid-cols-[minmax(0,1fr)_112px_112px]">
                <div className="min-w-0 space-y-2 md:col-span-2 min-[1180px]:col-span-1">
                  <Label htmlFor="categoria">Produto *</Label>
                  <Select
                    value={categoriaSelecionada}
                    onValueChange={handleCategoriaChange}
                    disabled={isMaterialsLocked}
                  >
                    <SelectTrigger id="categoria">
                      <SelectValue placeholder="Selecione um produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map((categoria) => (
                        <SelectItem key={categoria.id} value={categoria.id}>
                          {categoria.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="quantidade">Quantidade *</Label>
                  <Input
                    id="quantidade"
                    type="number"
                    min="1"
                    value={quantidadeItens}
                    disabled={isMaterialsLocked}
                    onChange={(event) => setQuantidadeItens(Math.max(1, parseInt(event.target.value) || 1))}
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="margem">Margem (%) *</Label>
                  <Input
                    id="margem"
                    type="number"
                    min="0"
                    step="5"
                    value={margemPercentual}
                    disabled={isMaterialsLocked}
                    onChange={(event) => setMargemPercentual(Math.max(0, parseInt(event.target.value) || 0))}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Margem aplicada sobre materiais e mao de obra informada. Padrao: 100%.
              </p>
            </CardContent>
          </Card>

          {categoriaSelecionada && (
            <Card className="overflow-hidden rounded-xl">
              <CardHeader>
                <CardTitle className="text-lg">Componentes</CardTitle>
                <CardDescription>
                  Escolha o tipo de componente; o material sera filtrado pelo tipo cadastrado no estoque.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {gruposCat.length === 0 && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="line-clamp-none">Nenhum tipo de componente ativo</AlertTitle>
                    <AlertDescription>
                      Adicione os tipos em Configuracoes para montar pedidos deste produto.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="grupo-componente">Tipo de Componente</Label>
                    <Select
                      value={grupoAtual}
                      onValueChange={handleGrupoChange}
                      disabled={gruposCat.length === 0 || isMaterialsLocked}
                    >
                      <SelectTrigger id="grupo-componente">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {gruposCat.map((grupo) => (
                          <SelectItem key={grupo.id} value={grupo.id}>
                            {grupo.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="material-componente">Material</Label>
                    <Select
                      value={materialAtual}
                      onValueChange={setMaterialAtual}
                      disabled={!grupoAtual || materiaisDoTipo.length === 0 || isMaterialsLocked}
                    >
                      <SelectTrigger id="material-componente">
                        <SelectValue placeholder="Selecione o material" />
                      </SelectTrigger>
                      <SelectContent>
                        {materiaisDoTipo.map((material) => (
                          <SelectItem key={material.id} value={material.id}>
                            {material.nome} - {getEstoqueAtual(material)} {material.unidade}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {grupoAtual && materiaisDoTipo.length === 0 && (
                      <p className="text-xs text-amber-700">
                        Nenhum material do tipo {grupoAtualObj?.nome}. Cadastre este material em Estoque para usar no pedido.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    onClick={adicionarComponente}
                    disabled={!materialAtual || isMaterialsLocked}
                    className="w-full sm:w-auto"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Componente
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={adicionarOutroItem}
                    disabled={!itemAtualValido || isMaterialsLocked}
                    className="w-full sm:w-auto"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar outro item
                  </Button>
                  {itemAtualValido && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={limparItemAtual}
                      disabled={isMaterialsLocked}
                      className="w-full sm:w-auto"
                    >
                      Limpar item atual
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {componentesSelecionados.length > 0 && (
            <Card className="overflow-hidden rounded-xl">
              <CardHeader>
                <CardTitle className="text-lg">Itens Selecionados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {componentesSelecionados.map((componente, index) => (
                  <div
                    key={`${componente.grupo_id}-${componente.material_id}`}
                    className="grid min-w-0 gap-3 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{componente.material_nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {componente.grupo_nome} - estoque {componente.estoque_atual} {componente.unidade}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9"
                        onClick={() => alterarQuantidade(index, -1)}
                        disabled={isMaterialsLocked}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Input
                        aria-label={`Quantidade de ${componente.material_nome}`}
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={componente.quantidade}
                        disabled={isMaterialsLocked}
                        onChange={(event) => definirQuantidade(index, event.target.value)}
                        className="h-8 w-20 text-center"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9"
                        onClick={() => alterarQuantidade(index, 1)}
                        disabled={isMaterialsLocked}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <span className="min-w-20 text-right text-sm font-semibold">
                        {formatCurrency(componente.custo_unit * componente.quantidade)}
                      </span>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-9 w-9"
                        onClick={() => removerComponente(index)}
                        disabled={isMaterialsLocked}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!isMaterialsLocked && categoriaSelecionada && (
            <Card className="overflow-hidden rounded-xl">
              <CardHeader>
                <CardTitle className="text-lg">Preço final</CardTitle>
                <CardDescription>
                  O sistema mantém o cálculo original, mas permite cobrar outro valor quando necessário.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="mao-obra-valor">Mao de obra</Label>
                    <Input
                      id="mao-obra-valor"
                      inputMode="decimal"
                      value={maoObraValor}
                      onChange={(event) => setMaoObraValor(event.target.value)}
                      placeholder="Ex: 20,00"
                    />
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="text-muted-foreground">Preço calculado</p>
                    <p className="mt-1 text-xl font-semibold text-[#15142a]">
                      {formatCurrency(valorFinalArredondado)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preco-final-manual">Preço final cobrado</Label>
                    <Input
                      id="preco-final-manual"
                      inputMode="decimal"
                      value={precoFinalManual}
                      onChange={(event) => setPrecoFinalManual(event.target.value)}
                      placeholder={`Ex: ${valorFinalArredondado.toFixed(2).replace('.', ',')}`}
                    />
                  </div>
                </div>

                {hasPrecoManual && (
                  <div className="rounded-lg border border-[#eadff4] bg-[#fbf8ff] p-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Diferença</span>
                      <span className={diferencaPrecoManual < 0 ? 'font-medium text-rose-700' : 'font-medium text-green-700'}>
                        {formatCurrency(diferencaPrecoManual)} ({percentualAjusteManual.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="motivo-ajuste-preco">Motivo do ajuste</Label>
                  <Input
                    id="motivo-ajuste-preco"
                    value={motivoAjustePreco}
                    onChange={(event) => setMotivoAjustePreco(event.target.value)}
                    maxLength={500}
                    placeholder="Ex: cliente recorrente, desconto combinado, arredondamento"
                  />
                </div>
              </CardContent>
            </Card>
          )}

            <Card className="overflow-hidden rounded-xl">
            <CardHeader>
              <CardTitle className="text-lg">Observacao para o cliente</CardTitle>
              <CardDescription>
                Texto opcional exibido nos detalhes e no link publico de acompanhamento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={observacaoCliente}
                onChange={(event) => setObservacaoCliente(event.target.value)}
                placeholder="Ex: Terco personalizado com o nome Kiliane, entremeio e crucifixo resinados"
                rows={4}
                maxLength={1200}
              />
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-xl">
            <CardHeader>
              <CardTitle className="text-lg">Observacoes internas</CardTitle>
              <CardDescription>Opcional. Nao aparece no link publico da cliente.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                placeholder="Detalhes internos do pedido"
                rows={3}
                maxLength={1200}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit overflow-hidden rounded-xl xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PackageCheck className="h-5 w-5" />
              Resumo
            </CardTitle>
            <CardDescription>Valores calculados para o pedido</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Itens</span>
                <span className="text-right font-medium">
                  {itensPedido.length + (itemAtualValido ? 1 : 0)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Quantidade total</span>
                <span className="font-medium">{quantidadeItensPedido || quantidadeItens}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Componentes</span>
                <span className="font-medium">{quantidadeComponentesPedido || componentesSelecionados.length}</span>
              </div>
            </div>

            <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between gap-4">
                <span>Custo materiais</span>
                <span>{formatCurrency(totalCustoMateriaisPedido || custoMateriaisTotal)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
                <span>Preco calculado</span>
                <span>{formatCurrency(totalPedidoCalculado || valorFinalArredondado)}</span>
              </div>
              <div className="flex justify-between gap-4 text-base font-semibold">
                <span>Preco cobrado</span>
                <span className="text-green-700">{formatCurrency(totalPedidoCobrado || valorFinalCobrado)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={salvarPedido}
                disabled={isPending || (itensPedido.length === 0 && !itemAtualValido && !isMaterialsLocked)}
                className="bg-green-600 hover:bg-green-700"
              >
                {isPending
                  ? 'Processando...'
                  : isEditMode
                    ? 'Salvar Alteracoes'
                    : 'Criar Pedido'}
              </Button>
              <Button type="button" variant="outline" onClick={isEditMode ? onSuccess : resetForm} disabled={isPending}>
                {isEditMode ? 'Fechar' : 'Cancelar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

    </>
  )
}
