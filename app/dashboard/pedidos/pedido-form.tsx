'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
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
import type { CategoriaProduto, ComponenteEstoque, GrupoComponente, Material } from '@/lib/types/database'
import { createPedidoCustomizado } from './actions'
import { arredondarParaCimaMeioReal, formatDateBR } from '@/lib/utils'

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

export function PedidoForm({
  categorias,
  grupos,
  componentes,
  materiais,
  maodeobra,
  onSuccess,
}: {
  categorias: CategoriaProduto[]
  grupos: GrupoComponente[]
  componentes: (ComponenteEstoque & { material: Material })[]
  materiais: Material[]
  maodeobra: { [categoria_id: string]: number }
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
  const [grupoAtual, setGrupoAtual] = useState('')
  const [materialAtual, setMaterialAtual] = useState('')

  // Margem de lucro configurável por pedido (padrão 100% conforme regra)
  const [margemPercentual, setMargemPercentual] = useState(100)

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
  const maodeobraUnitario = maodeobra[categoriaSelecionada] || 0

  // Mesma conta usada ao salvar: componentes ficam a custo real; margem e
  // arredondamento entram apenas no total do pedido.
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

  function adicionarComponente() {
    const material = materiaisDoTipo.find((item) => item.id === materialAtual)
    if (!material || !grupoAtualObj) return

    // Componente entra pelo custo cadastrado no estoque.
    const custoUnit = material.custo_unitario || 0

    setComponentesSelecionados((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.grupo_id === grupoAtual && item.material_id === material.id
      )

      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = {
          ...next[existingIndex],
          quantidade: next[existingIndex].quantidade + 1,
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
          custo_unit: custoUnit,
          unidade: material.unidade,
          estoque_atual: getEstoqueAtual(material),
        },
      ]
    })

    setMaterialAtual('')
  }

  function removerComponente(index: number) {
    setComponentesSelecionados((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
  }

  function alterarQuantidade(index: number, delta: number) {
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
      toast.error('Nome do cliente obrigatório')
      return
    }
    if (!categoriaSelecionada) {
      toast.error('Selecione o tipo de produto')
      return
    }
    if (componentesSelecionados.length === 0) {
      toast.error('Adicione pelo menos um componente')
      return
    }
    if (!prazoEntrega) {
      toast.error('Prazo de entrega obrigatório')
      return
    }

    setShowResumo(true)
  }

  function confirmarPedido() {
    startTransition(async () => {
      try {
        const result = await createPedidoCustomizado({
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
          margem_percentual: margemPercentual,
        })

        if (result.success) {
          toast.success('Pedido criado com sucesso!')
          resetForm()
          onSuccess?.()
        } else {
          toast.error(result.error || 'Erro ao criar pedido')
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
        <Card>
          <CardHeader>
            <CardTitle>Resumo do Pedido</CardTitle>
            <CardDescription>Revise os dados antes de confirmar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1 rounded-lg border p-3">
                <p className="text-sm font-semibold">Cliente</p>
                <p className="text-sm">{clienteNome}</p>
                {clienteContato && <p className="text-sm text-muted-foreground">{clienteContato}</p>}
                {clienteEndereco && <p className="text-sm text-muted-foreground">{clienteEndereco}</p>}
              </div>
              <div className="space-y-1 rounded-lg border p-3">
                <p className="text-sm font-semibold">Pedido</p>
                <p className="text-sm">{categoriaAtual?.nome}</p>
                <p className="text-sm text-muted-foreground">
                  {quantidadeItens} unidade(s) até{' '}
                  {formatDateBR(prazoEntrega)}
                </p>
              </div>
            </div>

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

            <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
              <div className="flex justify-between">
                <span>Custo dos materiais</span>
                <span>{formatCurrency(custoMateriaisTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Mão de obra</span>
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
                <span>Preço final</span>
                <span className="text-green-700">{formatCurrency(valorFinalArredondado)}</span>
              </div>
              <div className="flex justify-between">
                <span>Lucro estimado</span>
                <span className="text-green-700 font-medium">{formatCurrency(lucroEstimado)}</span>
              </div>
            </div>

            {observacoes && (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-semibold">Observações</p>
                <p className="text-sm text-muted-foreground">{observacoes}</p>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setShowResumo(false)} disabled={isPending}>
                Voltar
              </Button>
              <Button onClick={confirmarPedido} disabled={isPending} className="bg-green-600 hover:bg-green-700">
                {isPending ? 'Confirmando...' : 'Confirmar Pedido'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados do Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                <Label htmlFor="cliente-endereco">Endereço</Label>
                <Input
                  id="cliente-endereco"
                  value={clienteEndereco}
                  onChange={(event) => setClienteEndereco(event.target.value)}
                  placeholder="Rua, número, complemento"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tipo de Produto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
              <div className="space-y-2">
                <Label htmlFor="categoria">Produto *</Label>
                <Select value={categoriaSelecionada} onValueChange={handleCategoriaChange}>
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
              <div className="space-y-2">
                <Label htmlFor="quantidade">Quantidade *</Label>
                <Input
                  id="quantidade"
                  type="number"
                  min="1"
                  value={quantidadeItens}
                  onChange={(event) => setQuantidadeItens(Math.max(1, parseInt(event.target.value) || 1))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="margem">Margem (%) *</Label>
                <Input
                  id="margem"
                  type="number"
                  min="0"
                  step="5"
                  value={margemPercentual}
                  onChange={(event) => setMargemPercentual(Math.max(0, parseInt(event.target.value) || 0))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Margem aplicada sobre o custo base total (materiais + mão de obra). Padrão: 100%.
            </p>
          </CardContent>
        </Card>

        {categoriaSelecionada && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Componentes</CardTitle>
              <CardDescription>
                Primeiro escolha o tipo de componente; o material será filtrado pelo tipo cadastrado no estoque.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {gruposCat.length === 0 && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="line-clamp-none">Nenhum tipo de componente ativo</AlertTitle>
                  <AlertDescription>
                    Adicione os tipos em Configurações para montar pedidos deste produto.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <Label htmlFor="grupo-componente">Tipo de Componente</Label>
                  <Select value={grupoAtual} onValueChange={handleGrupoChange} disabled={gruposCat.length === 0}>
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

                <div className="space-y-2">
                  <Label htmlFor="material-componente">Material</Label>
                  <Select
                    value={materialAtual}
                    onValueChange={setMaterialAtual}
                    disabled={!grupoAtual || materiaisDoTipo.length === 0}
                  >
                    <SelectTrigger id="material-componente">
                      <SelectValue placeholder="Selecione o material" />
                    </SelectTrigger>
                    <SelectContent>
                      {materiaisDoTipo.map((material) => (
                        <SelectItem key={material.id} value={material.id}>
                          {material.nome} · {getEstoqueAtual(material)} {material.unidade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {grupoAtual && materiaisDoTipo.length === 0 && (
                    <p className="text-xs text-amber-700">
                      Nenhum material do tipo {grupoAtualObj?.nome}. Edite o material no estoque.
                    </p>
                  )}
                </div>
              </div>

              <Button onClick={adicionarComponente} disabled={!materialAtual} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Componente
              </Button>
            </CardContent>
          </Card>
        )}

        {componentesSelecionados.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Itens Selecionados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {componentesSelecionados.map((componente, index) => (
                <div
                  key={`${componente.grupo_id}-${componente.material_id}`}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{componente.material_nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {componente.grupo_nome} · estoque {componente.estoque_atual} {componente.unidade}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      onClick={() => alterarQuantidade(index, -1)}
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
                      onChange={(event) => definirQuantidade(index, event.target.value)}
                      className="h-8 w-20 text-center"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      onClick={() => alterarQuantidade(index, 1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <span className="w-24 text-right text-sm font-semibold">
                      {formatCurrency(componente.custo_unit * componente.quantidade)}
                    </span>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-9 w-9"
                      onClick={() => removerComponente(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {componentesSelecionados.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                placeholder="Adicione observações sobre este pedido..."
                rows={4}
              />
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="h-fit lg:sticky lg:top-4">
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
              <span>Mão de obra</span>
              <span>{formatCurrency(maodeobraTotal)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Custo base</span>
              <span>{formatCurrency(custoBase)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
              <span>Preço final ({margemAplicada}%)</span>
              <span className="text-green-700">{formatCurrency(valorFinalArredondado)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={salvarPedido}
              disabled={isPending || componentesSelecionados.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              {isPending ? 'Processando...' : 'Criar Pedido'}
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={isPending}>
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
