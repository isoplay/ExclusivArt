'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  Plus,
  Trash2,
} from 'lucide-react'
import { createMaterial } from '@/app/dashboard/estoque/actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  const [localMateriais, setLocalMateriais] = useState<Material[]>(materiais)

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

  const [isMaterialOpen, setIsMaterialOpen] = useState(false)
  const [novoMaterialNome, setNovoMaterialNome] = useState('')
  const [novoMaterialTipo, setNovoMaterialTipo] = useState('')
  const [novoMaterialUnidade, setNovoMaterialUnidade] = useState('un')
  const [novoMaterialCor, setNovoMaterialCor] = useState('#808080')
  const [novoMaterialQuantidade, setNovoMaterialQuantidade] = useState('0')
  const [novoMaterialMinimo, setNovoMaterialMinimo] = useState('30')
  const [novoMaterialCusto, setNovoMaterialCusto] = useState('0')

  const isEditMode = mode === 'edit'
  const isMaterialsLocked = Boolean(initialPedido?.estoque_baixado)

  useEffect(() => {
    setLocalMateriais(materiais)
  }, [materiais])

  useEffect(() => {
    if (!initialPedido) return

    const itemPrincipal = initialPedido.pedido_itens?.[0]
    const categoriaId = inferCategoriaId(initialPedido, categorias)

    setClienteNome(initialPedido.cliente_nome || '')
    setClienteContato(initialPedido.cliente_contato || '')
    setClienteEndereco(initialPedido.cliente_endereco || '')
    setPrazoEntrega(toDateInput(initialPedido.prazo_entrega))
    setCategoriaSelecionada(categoriaId)
    setQuantidadeItens(Math.max(1, itemPrincipal?.quantidade || 1))
    setComponentesSelecionados(getInitialComponentes(initialPedido, grupos, materiais))
    setShowResumo(false)
    setObservacoes(initialPedido.observacoes || '')
    setObservacaoCliente(initialPedido.observacao_cliente || '')
    setGrupoAtual('')
    setMaterialAtual('')
    setMargemPercentual(100)
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

    return localMateriais
      .filter((material) => normalizeKey(material.tipo) === tipo)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [grupoAtualObj?.nome, localMateriais])

  const custoMateriaisUnitario = componentesSelecionados.reduce(
    (acc, componente) => acc + componente.custo_unit * componente.quantidade,
    0
  )
  const maodeobraUnitario = maodeobra[categoriaSelecionada] || 0
  const custoMateriaisTotal = custoMateriaisUnitario * quantidadeItens
  const maodeobraTotal = maodeobraUnitario * quantidadeItens
  const custoBase = custoMateriaisTotal + maodeobraTotal
  const margemAplicada = margemPercentual
  const valorComMargem = custoBase * (1 + margemAplicada / 100)
  const valorFinalArredondado = arredondarParaCimaMeioReal(valorComMargem)
  const ajusteArredondamento = valorFinalArredondado - valorComMargem
  const lucroEstimado = valorFinalArredondado - custoBase

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

  function abrirNovoMaterial() {
    setNovoMaterialTipo(grupoAtualObj?.nome || gruposCat[0]?.nome || '')
    setIsMaterialOpen(true)
  }

  function resetNovoMaterial() {
    setNovoMaterialNome('')
    setNovoMaterialTipo(grupoAtualObj?.nome || gruposCat[0]?.nome || '')
    setNovoMaterialUnidade('un')
    setNovoMaterialCor('#808080')
    setNovoMaterialQuantidade('0')
    setNovoMaterialMinimo('30')
    setNovoMaterialCusto('0')
  }

  function handleCreateMaterial(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!novoMaterialTipo) {
      toast.error('Selecione o tipo do material')
      return
    }

    const formData = new FormData()
    formData.set('nome', novoMaterialNome)
    formData.set('tipo', novoMaterialTipo)
    formData.set('unidade', novoMaterialUnidade)
    formData.set('cor', novoMaterialCor)
    formData.set('quantidade', novoMaterialQuantidade)
    formData.set('quantidade_minima', novoMaterialMinimo)
    formData.set('custo_unitario', novoMaterialCusto)
    formData.set('preco_compra', '0')

    startTransition(async () => {
      const result = await createMaterial(formData)

      if (!result.success) {
        toast.error(result.error || 'Erro ao cadastrar material')
        return
      }

      if (!result.material) {
        toast.error('Material cadastrado, mas nao foi possivel seleciona-lo automaticamente.')
        return
      }

      const material = result.material
      setLocalMateriais((prev) => [...prev.filter((item) => item.id !== material.id), material])

      const grupoDoMaterial = gruposCat.find(
        (grupo) => normalizeKey(grupo.nome) === normalizeKey(material.tipo)
      )

      if (grupoDoMaterial) {
        setGrupoAtual(grupoDoMaterial.id)
        setMaterialAtual(material.id)
      }

      toast.success('Material cadastrado e selecionado.')
      setIsMaterialOpen(false)
      resetNovoMaterial()
    })
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

  function salvarPedido() {
    if (!clienteNome.trim()) {
      toast.error('Nome do cliente obrigatorio')
      return
    }
    if (!categoriaSelecionada && !isMaterialsLocked) {
      toast.error('Selecione o tipo de produto')
      return
    }
    if (componentesSelecionados.length === 0 && !isMaterialsLocked) {
      toast.error('Adicione pelo menos um componente')
      return
    }
    if (!prazoEntrega) {
      toast.error('Prazo de entrega obrigatorio')
      return
    }

    setShowResumo(true)
  }

  function confirmarPedido() {
    startTransition(async () => {
      try {
        const payload = {
          cliente_nome: clienteNome,
          cliente_telefone: clienteContato || null,
          cliente_endereco: clienteEndereco || null,
          categoria_id: categoriaSelecionada,
          quantidade_itens: quantidadeItens,
          componentes: componentesSelecionados.map((componente) => ({
            material_id: componente.material_id,
            quantidade: componente.quantidade,
          })),
          prazo_entrega: prazoEntrega,
          observacoes: observacoes || null,
          observacao_cliente: observacaoCliente || null,
          margem_percentual: margemPercentual,
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
                <p className="text-sm">{categoriaAtual?.nome || 'Produto bloqueado'}</p>
                <p className="text-sm text-muted-foreground">
                  {quantidadeItens} unidade(s) ate {formatDateBR(prazoEntrega)}
                </p>
              </div>
            </div>

            {componentesSelecionados.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Componentes</p>
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
                  <span>{formatCurrency(custoMateriaisTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Mao de obra</span>
                  <span>{formatCurrency(maodeobraTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Custo base</span>
                  <span>{formatCurrency(custoBase)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Margem aplicada</span>
                  <span>{margemAplicada}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Valor com margem</span>
                  <span>{formatCurrency(valorComMargem)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Arredondamento</span>
                  <span>{formatCurrency(ajusteArredondamento)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-base font-semibold">
                  <span>Preco final</span>
                  <span className="text-green-700">{formatCurrency(valorFinalArredondado)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Lucro estimado</span>
                  <span className="font-medium text-green-700">{formatCurrency(lucroEstimado)}</span>
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

          <Card className="overflow-hidden rounded-xl">
            <CardHeader>
              <CardTitle className="text-lg">Tipo de Produto</CardTitle>
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
                Margem aplicada sobre o custo base total (materiais + mao de obra). Padrao: 100%.
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
                        Nenhum material do tipo {grupoAtualObj?.nome}. Cadastre aqui sem sair do pedido.
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={abrirNovoMaterial}
                      disabled={gruposCat.length === 0 || isMaterialsLocked}
                      className="w-full justify-center sm:w-auto"
                    >
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      Novo material
                    </Button>
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
                <span className="text-muted-foreground">Produto</span>
                <span className="text-right font-medium">{categoriaAtual?.nome || '-'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Quantidade</span>
                <span className="font-medium">{quantidadeItens}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Componentes</span>
                <span className="font-medium">{componentesSelecionados.length}</span>
              </div>
            </div>

            <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between gap-4">
                <span>Custo materiais</span>
                <span>{formatCurrency(custoMateriaisTotal)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Mao de obra</span>
                <span>{formatCurrency(maodeobraTotal)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Custo base</span>
                <span>{formatCurrency(custoBase)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
                <span>Preco final ({margemAplicada}%)</span>
                <span className="text-green-700">{formatCurrency(valorFinalArredondado)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={salvarPedido}
                disabled={isPending || (componentesSelecionados.length === 0 && !isMaterialsLocked)}
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

      <Dialog
        open={isMaterialOpen}
        onOpenChange={(open) => {
          setIsMaterialOpen(open)
          if (!open) resetNovoMaterial()
        }}
      >
        <DialogContent className="!bottom-2 !left-2 !right-2 !top-2 max-h-none w-auto max-w-none !translate-x-0 !translate-y-0 overflow-y-auto bg-white p-4 sm:!bottom-auto sm:!left-[50%] sm:!right-auto sm:!top-[50%] sm:max-h-[90svh] sm:max-w-xl sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:p-6">
          <DialogHeader>
            <DialogTitle>Cadastrar material</DialogTitle>
            <DialogDescription>
              O material entra no estoque e fica disponivel neste pedido imediatamente.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateMaterial} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="novo-material-nome">Nome *</Label>
                <Input
                  id="novo-material-nome"
                  value={novoMaterialNome}
                  onChange={(event) => setNovoMaterialNome(event.target.value)}
                  required
                  placeholder="Ex: Conta de cristal azul"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="novo-material-tipo">Tipo *</Label>
                <Select value={novoMaterialTipo} onValueChange={setNovoMaterialTipo}>
                  <SelectTrigger id="novo-material-tipo">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {gruposCat.map((grupo) => (
                      <SelectItem key={grupo.id} value={grupo.nome}>
                        {grupo.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="novo-material-unidade">Unidade *</Label>
                <Select value={novoMaterialUnidade} onValueChange={setNovoMaterialUnidade}>
                  <SelectTrigger id="novo-material-unidade">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {['un', 'm', 'cm', 'g', 'kg', 'ml', 'l', 'pct'].map((unidade) => (
                      <SelectItem key={unidade} value={unidade}>
                        {unidade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="novo-material-quantidade">Quantidade inicial *</Label>
                <Input
                  id="novo-material-quantidade"
                  value={novoMaterialQuantidade}
                  onChange={(event) => setNovoMaterialQuantidade(event.target.value)}
                  inputMode="decimal"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="novo-material-minimo">Estoque minimo *</Label>
                <Input
                  id="novo-material-minimo"
                  value={novoMaterialMinimo}
                  onChange={(event) => setNovoMaterialMinimo(event.target.value)}
                  inputMode="decimal"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="novo-material-custo">Custo unitario (R$) *</Label>
                <Input
                  id="novo-material-custo"
                  value={novoMaterialCusto}
                  onChange={(event) => setNovoMaterialCusto(event.target.value)}
                  inputMode="decimal"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="novo-material-cor">Cor</Label>
                <div className="flex min-h-10 items-center gap-3">
                  <Input
                    id="novo-material-cor"
                    type="color"
                    value={novoMaterialCor}
                    onChange={(event) => setNovoMaterialCor(event.target.value)}
                    className="h-10 w-16 cursor-pointer p-1"
                  />
                  <span className="text-sm text-muted-foreground">{novoMaterialCor}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setIsMaterialOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Salvando...' : 'Salvar material'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
