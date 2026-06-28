'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Boxes,
  Calculator,
  Eye,
  Layers3,
  PackagePlus,
  Plus,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import { MaterialAvatar } from '@/components/material-avatar'
import {
  OrcamentoPreview,
  type OrcamentoPreviewData,
} from '@/components/orcamentos/orcamento-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import type {
  CategoriaProduto,
  ComponenteEstoque,
  GrupoComponente,
  Material,
  OrcamentoComItens,
  OrigemComponenteOrcamento,
} from '@/lib/types/database'
import { arredondarParaCimaMeioReal } from '@/lib/utils'
import {
  createOrcamento,
  updateOrcamento,
} from './actions'
import type { OrcamentoPayload } from '@/lib/orcamentos/validation'

type ComponenteCatalogo = ComponenteEstoque & { material?: Material }

type OrcamentoFormProps = {
  orcamento?: OrcamentoComItens | null
  materiais: Material[]
  categorias: CategoriaProduto[]
  grupos: GrupoComponente[]
  componentes: ComponenteCatalogo[]
  maodeobra: Record<string, number>
  onSuccess: () => void
}

type ComponentDraft = {
  key: string
  origem: OrigemComponenteOrcamento
  grupo_id: string
  grupo_nome: string
  material_id: string
  material_nome: string
  quantidade_por_item: string
  unidade: string
  custo_unitario_estimado: string
  cor_hex: string
  imagem_url: string
  observacao: string
}

type ItemDraft = {
  key: string
  categoria_id: string
  nome_produto: string
  quantidade: string
  mao_obra_unitaria: string
  componentes: ComponentDraft[]
}

let draftSequence = 0

function draftKey(prefix: string) {
  draftSequence += 1
  return `${prefix}-${draftSequence}`
}

function numberInput(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? String(parsed).replace('.', ',') : '0'
}

function parseNumber(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

function newComponent(origem: OrigemComponenteOrcamento = 'manual'): ComponentDraft {
  return {
    key: draftKey('componente'),
    origem,
    grupo_id: '',
    grupo_nome: '',
    material_id: '',
    material_nome: '',
    quantidade_por_item: '1',
    unidade: 'un',
    custo_unitario_estimado: '0',
    cor_hex: '',
    imagem_url: '',
    observacao: '',
  }
}

function newItem(): ItemDraft {
  return {
    key: draftKey('item'),
    categoria_id: '',
    nome_produto: 'Terço',
    quantidade: '1',
    mao_obra_unitaria: '0',
    componentes: [newComponent()],
  }
}

function initialItems(orcamento?: OrcamentoComItens | null): ItemDraft[] {
  if (!orcamento?.orcamento_itens?.length) return [newItem()]

  return [...orcamento.orcamento_itens]
    .sort((left, right) => left.ordem - right.ordem)
    .map((item) => ({
      key: draftKey('item'),
      categoria_id: item.categoria_id || '',
      nome_produto: item.nome_produto,
      quantidade: numberInput(item.quantidade),
      mao_obra_unitaria: numberInput(item.mao_obra_unitaria),
      componentes: [...(item.orcamento_componentes || [])]
        .sort((left, right) => left.ordem - right.ordem)
        .map((componente) => ({
          key: draftKey('componente'),
          origem: componente.origem,
          grupo_id: componente.grupo_id || '',
          grupo_nome: componente.grupo_nome,
          material_id: componente.material_id || '',
          material_nome: componente.material_nome,
          quantidade_por_item: numberInput(componente.quantidade_por_item),
          unidade: componente.unidade,
          custo_unitario_estimado: numberInput(componente.custo_unitario_estimado),
          cor_hex: componente.cor_hex || '',
          imagem_url: componente.imagem_url || '',
          observacao: componente.observacao || '',
        })),
    }))
}

export function OrcamentoForm({
  orcamento,
  materiais,
  categorias,
  grupos,
  componentes,
  maodeobra,
  onSuccess,
}: OrcamentoFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [clienteNome, setClienteNome] = useState(orcamento?.cliente_nome || '')
  const [clienteContato, setClienteContato] = useState(orcamento?.cliente_contato || '')
  const [clienteEndereco, setClienteEndereco] = useState(orcamento?.cliente_endereco || '')
  const [validade, setValidade] = useState(orcamento?.validade || '')
  const [prazoEstimado, setPrazoEstimado] = useState(orcamento?.prazo_estimado || '')
  const [margem, setMargem] = useState(numberInput(orcamento?.margem_percentual ?? 100))
  const [observacaoCliente, setObservacaoCliente] = useState(
    orcamento?.observacao_cliente || ''
  )
  const [observacoesInternas, setObservacoesInternas] = useState(
    orcamento?.observacoes_internas || ''
  )
  const [itens, setItens] = useState<ItemDraft[]>(() => initialItems(orcamento))

  const calculo = useMemo(() => {
    const itensCalculados = itens.map((item) => {
      const quantidade = Math.max(0, Math.trunc(parseNumber(item.quantidade)))
      const componentesUnitario = item.componentes.reduce(
        (total, componente) =>
          total +
          parseNumber(componente.quantidade_por_item) *
            parseNumber(componente.custo_unitario_estimado),
        0
      )
      const componentesTotal = componentesUnitario * quantidade
      const maoObraTotal = parseNumber(item.mao_obra_unitaria) * quantidade
      const custoBase = componentesTotal + maoObraTotal
      return { quantidade, componentesUnitario, componentesTotal, maoObraTotal, custoBase }
    })

    const custoComponentes = itensCalculados.reduce(
      (total, item) => total + item.componentesTotal,
      0
    )
    const maoObra = itensCalculados.reduce((total, item) => total + item.maoObraTotal, 0)
    const custoBase = custoComponentes + maoObra
    const margemPercentual = Math.max(0, parseNumber(margem))
    const margemValor = custoBase * (margemPercentual / 100)
    const valorComMargem = custoBase + margemValor
    const valorFinal = arredondarParaCimaMeioReal(valorComMargem)
    const arredondamento = valorFinal - valorComMargem
    const lucroEstimado = valorFinal - custoBase
    const quantidadeTotal = itensCalculados.reduce(
      (total, item) => total + item.quantidade,
      0
    )

    let distribuido = 0
    const valoresItens = itensCalculados.map((item, index) => {
      if (index === itensCalculados.length - 1) return Math.max(0, valorFinal - distribuido)
      const proporcional =
        custoBase > 0 ? Math.floor(((item.custoBase / custoBase) * valorFinal + 1e-8) * 100) / 100 : 0
      distribuido += proporcional
      return proporcional
    })

    return {
      itensCalculados,
      valoresItens,
      custoComponentes,
      maoObra,
      custoBase,
      margemPercentual,
      margemValor,
      valorComMargem,
      arredondamento,
      valorFinal,
      lucroEstimado,
      quantidadeTotal,
    }
  }, [itens, margem])

  const previewData = useMemo<OrcamentoPreviewData>(
    () => ({
      cliente_nome: clienteNome || 'Cliente',
      orcamento_codigo: orcamento
        ? `EXO-${orcamento.id.slice(0, 8).toUpperCase()}`
        : 'PRÉVIA',
      status: 'previa',
      validade: validade || null,
      prazo_estimado: prazoEstimado || null,
      quantidade_total: calculo.quantidadeTotal,
      valor_total: calculo.valorFinal,
      observacao_cliente: observacaoCliente || null,
      itens: itens.map((item, index) => ({
        nome_produto: item.nome_produto || 'Produto personalizado',
        quantidade: calculo.itensCalculados[index]?.quantidade || 0,
        valor_total: calculo.valoresItens[index] || 0,
        componentes: item.componentes.map((componente) => ({
          grupo_nome: componente.grupo_nome || 'Componente',
          material_nome: componente.material_nome || 'Material personalizado',
          quantidade_por_item: parseNumber(componente.quantidade_por_item),
          unidade: componente.unidade || 'un',
          cor_hex: componente.cor_hex || null,
          origem: componente.origem,
        })),
      })),
    }),
    [
      clienteNome,
      orcamento,
      validade,
      prazoEstimado,
      calculo,
      observacaoCliente,
      itens,
    ]
  )

  function updateItem(itemKey: string, patch: Partial<ItemDraft>) {
    setItens((current) =>
      current.map((item) => (item.key === itemKey ? { ...item, ...patch } : item))
    )
  }

  function updateComponent(
    itemKey: string,
    componentKey: string,
    patch: Partial<ComponentDraft>
  ) {
    setItens((current) =>
      current.map((item) =>
        item.key === itemKey
          ? {
              ...item,
              componentes: item.componentes.map((componente) =>
                componente.key === componentKey ? { ...componente, ...patch } : componente
              ),
            }
          : item
      )
    )
  }

  function handleCategory(item: ItemDraft, categoriaId: string) {
    if (categoriaId === 'none') {
      updateItem(item.key, { categoria_id: '' })
      return
    }

    const categoria = categorias.find((entry) => entry.id === categoriaId)
    updateItem(item.key, {
      categoria_id: categoriaId,
      nome_produto:
        !item.nome_produto.trim() || ['Terço', 'Pulseira', 'Chaveiro'].includes(item.nome_produto)
          ? categoria?.nome || item.nome_produto
          : item.nome_produto,
      mao_obra_unitaria:
        maodeobra[categoriaId] !== undefined
          ? numberInput(maodeobra[categoriaId])
          : item.mao_obra_unitaria,
    })
  }

  function groupsForItem(item: ItemDraft) {
    const filtered = item.categoria_id
      ? grupos.filter((grupo) => grupo.categoria_id === item.categoria_id)
      : grupos
    return filtered.length > 0 ? filtered : grupos
  }

  function materialsForGroup(groupId: string) {
    if (!groupId) return materiais
    const linkedIds = new Set(
      componentes
        .filter((componente) => componente.grupo_id === groupId)
        .map((componente) => componente.material_id)
    )
    if (linkedIds.size === 0) return materiais
    return materiais.filter((material) => linkedIds.has(material.id))
  }

  function selectStockGroup(itemKey: string, componentKey: string, groupId: string) {
    const grupo = grupos.find((entry) => entry.id === groupId)
    updateComponent(itemKey, componentKey, {
      grupo_id: groupId,
      grupo_nome: grupo?.nome || '',
      material_id: '',
      material_nome: '',
      custo_unitario_estimado: '0',
      unidade: 'un',
      cor_hex: '',
      imagem_url: '',
    })
  }

  function selectStockMaterial(itemKey: string, componentKey: string, materialId: string) {
    const material = materiais.find((entry) => entry.id === materialId)
    if (!material) return
    updateComponent(itemKey, componentKey, {
      material_id: material.id,
      material_nome: material.nome,
      custo_unitario_estimado: numberInput(material.custo_unitario),
      unidade: material.unidade || 'un',
      cor_hex: material.cor || '',
      imagem_url: material.imagem_url || '',
    })
  }

  function addComponent(itemKey: string) {
    setItens((current) =>
      current.map((item) =>
        item.key === itemKey
          ? { ...item, componentes: [...item.componentes, newComponent()] }
          : item
      )
    )
  }

  function removeComponent(itemKey: string, componentKey: string) {
    setItens((current) =>
      current.map((item) =>
        item.key === itemKey
          ? {
              ...item,
              componentes: item.componentes.filter(
                (componente) => componente.key !== componentKey
              ),
            }
          : item
      )
    )
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const payload: OrcamentoPayload = {
      cliente_nome: clienteNome,
      cliente_contato: clienteContato || null,
      cliente_endereco: clienteEndereco || null,
      validade: validade || null,
      prazo_estimado: prazoEstimado || null,
      margem_percentual: parseNumber(margem),
      observacao_cliente: observacaoCliente || null,
      observacoes_internas: observacoesInternas || null,
      itens: itens.map((item) => ({
        categoria_id: item.categoria_id || null,
        nome_produto: item.nome_produto,
        quantidade: Math.trunc(parseNumber(item.quantidade)),
        mao_obra_unitaria: parseNumber(item.mao_obra_unitaria),
        componentes: item.componentes.map((componente) => ({
          grupo_id: componente.grupo_id || null,
          grupo_nome: componente.grupo_nome,
          material_id: componente.material_id || null,
          material_nome: componente.material_nome,
          quantidade_por_item: parseNumber(componente.quantidade_por_item),
          unidade: componente.unidade,
          custo_unitario_estimado: parseNumber(componente.custo_unitario_estimado),
          cor_hex: componente.cor_hex || null,
          imagem_url: componente.imagem_url || null,
          origem: componente.origem,
          observacao: componente.observacao || null,
        })),
      })),
    }

    startTransition(async () => {
      const result = orcamento
        ? await updateOrcamento(orcamento.id, payload)
        : await createOrcamento(payload)

      if (!result.success) {
        toast.error(result.error || 'Não foi possível salvar o orçamento')
        return
      }

      toast.success(orcamento ? 'Orçamento atualizado' : 'Orçamento criado')
      router.refresh()
      onSuccess()
    })
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Cliente *" htmlFor="orcamento-cliente">
            <Input
              id="orcamento-cliente"
              value={clienteNome}
              onChange={(event) => setClienteNome(event.target.value)}
              placeholder="Nome da cliente"
              required
              disabled={isPending}
            />
          </Field>
          <Field label="WhatsApp ou telefone" htmlFor="orcamento-contato">
            <Input
              id="orcamento-contato"
              value={clienteContato}
              onChange={(event) => setClienteContato(event.target.value)}
              placeholder="(00) 00000-0000"
              disabled={isPending}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Endereço" htmlFor="orcamento-endereco">
              <Input
                id="orcamento-endereco"
                value={clienteEndereco}
                onChange={(event) => setClienteEndereco(event.target.value)}
                placeholder="Opcional"
                disabled={isPending}
              />
            </Field>
          </div>
          <Field label="Validade do orçamento" htmlFor="orcamento-validade">
            <Input
              id="orcamento-validade"
              type="date"
              value={validade}
              onChange={(event) => setValidade(event.target.value)}
              disabled={isPending}
            />
          </Field>
          <Field label="Prazo estimado" htmlFor="orcamento-prazo">
            <Input
              id="orcamento-prazo"
              type="date"
              value={prazoEstimado}
              onChange={(event) => setPrazoEstimado(event.target.value)}
              disabled={isPending}
            />
          </Field>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-[#282138]">Itens do orçamento</h3>
              <p className="text-sm text-muted-foreground">
                Use materiais do catálogo ou descreva opções sob encomenda.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setItens((current) => [...current, newItem()])}
              disabled={isPending}
              className="cursor-pointer"
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar item
            </Button>
          </div>

          {itens.map((item, itemIndex) => (
            <Card key={item.key} className="border-[#e5d9f2] bg-[#fdfbff] shadow-none">
              <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
                <CardTitle className="text-base">Item {itemIndex + 1}</CardTitle>
                {itens.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setItens((current) => current.filter((entry) => entry.key !== item.key))
                    }
                    disabled={isPending}
                    aria-label={`Remover item ${itemIndex + 1}`}
                    className="cursor-pointer text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_110px_150px]">
                  <Field label="Categoria existente" htmlFor={`categoria-${item.key}`}>
                    <Select
                      value={item.categoria_id || 'none'}
                      onValueChange={(value) => handleCategory(item, value)}
                      disabled={isPending}
                    >
                      <SelectTrigger id={`categoria-${item.key}`} className="w-full cursor-pointer">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem categoria</SelectItem>
                        {categorias.map((categoria) => (
                          <SelectItem key={categoria.id} value={categoria.id}>
                            {categoria.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Nome do produto *" htmlFor={`produto-${item.key}`}>
                    <Input
                      id={`produto-${item.key}`}
                      value={item.nome_produto}
                      onChange={(event) =>
                        updateItem(item.key, { nome_produto: event.target.value })
                      }
                      placeholder="Ex: Terço personalizado"
                      required
                      disabled={isPending}
                    />
                  </Field>
                  <Field label="Quantidade" htmlFor={`quantidade-${item.key}`}>
                    <Input
                      id={`quantidade-${item.key}`}
                      type="number"
                      min="1"
                      step="1"
                      value={item.quantidade}
                      onChange={(event) =>
                        updateItem(item.key, { quantidade: event.target.value })
                      }
                      required
                      disabled={isPending}
                    />
                  </Field>
                  <Field label="Mão de obra/un." htmlFor={`mao-obra-${item.key}`}>
                    <Input
                      id={`mao-obra-${item.key}`}
                      inputMode="decimal"
                      value={item.mao_obra_unitaria}
                      onChange={(event) =>
                        updateItem(item.key, { mao_obra_unitaria: event.target.value })
                      }
                      placeholder="0,00"
                      disabled={isPending}
                    />
                  </Field>
                </div>

                <div className="space-y-3 rounded-xl border border-[#eee5f6] bg-white p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#5f5072]">
                      <Layers3 className="h-4 w-4" />
                      Componentes
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => addComponent(item.key)}
                      disabled={isPending}
                      className="cursor-pointer"
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Componente
                    </Button>
                  </div>

                  {item.componentes.length === 0 ? (
                    <p className="rounded-lg bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">
                      Nenhum componente informado. O item pode conter apenas mão de obra.
                    </p>
                  ) : (
                    item.componentes.map((componente, componentIndex) => (
                      <ComponentEditor
                        key={componente.key}
                        item={item}
                        componente={componente}
                        componentIndex={componentIndex}
                        grupos={groupsForItem(item)}
                        materiais={materialsForGroup(componente.grupo_id)}
                        disabled={isPending}
                        onModeChange={(origem) =>
                          updateComponent(item.key, componente.key, {
                            ...newComponent(origem),
                            key: componente.key,
                            origem,
                          })
                        }
                        onChange={(patch) =>
                          updateComponent(item.key, componente.key, patch)
                        }
                        onGroupChange={(groupId) =>
                          selectStockGroup(item.key, componente.key, groupId)
                        }
                        onMaterialChange={(materialId) =>
                          selectStockMaterial(item.key, componente.key, materialId)
                        }
                        onRemove={() => removeComponent(item.key, componente.key)}
                      />
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Field label="Observação para a cliente" htmlFor="observacao-cliente">
              <Textarea
                id="observacao-cliente"
                value={observacaoCliente}
                onChange={(event) => setObservacaoCliente(event.target.value)}
                placeholder="Mensagem exibida no orçamento público"
                rows={4}
                disabled={isPending}
              />
            </Field>
            <Field label="Observações internas" htmlFor="observacao-interna">
              <Textarea
                id="observacao-interna"
                value={observacoesInternas}
                onChange={(event) => setObservacoesInternas(event.target.value)}
                placeholder="Informações visíveis apenas na gestão"
                rows={4}
                disabled={isPending}
              />
            </Field>
          </div>

          <FinancialSummary
            margem={margem}
            onMargemChange={setMargem}
            calculo={calculo}
            disabled={isPending}
          />
        </div>

        <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t bg-white/95 py-4 backdrop-blur sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsPreviewOpen(true)}
            className="cursor-pointer"
          >
            <Eye className="mr-2 h-4 w-4" />
            Pré-visualizar como cliente
          </Button>
          <Button
            type="submit"
            disabled={isPending || !clienteNome.trim() || itens.length === 0}
            className="min-w-40 cursor-pointer bg-[#8060a8] text-white hover:bg-[#6e5096]"
          >
            {isPending ? 'Salvando...' : orcamento ? 'Salvar alterações' : 'Criar orçamento'}
          </Button>
        </div>
      </form>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-h-[94vh] overflow-y-auto border-0 bg-[#f7f2fb] p-3 sm:max-w-4xl sm:p-6">
          <DialogHeader className="sr-only">
            <DialogTitle>Pré-visualização como cliente</DialogTitle>
            <DialogDescription>
              Prévia do orçamento antes de salvar ou gerar o link.
            </DialogDescription>
          </DialogHeader>
          <OrcamentoPreview orcamento={previewData} className="mx-auto w-full max-w-3xl" />
        </DialogContent>
      </Dialog>

      <datalist id="orcamento-grupos-manuais">
        {Array.from(new Set(grupos.map((grupo) => grupo.nome))).map((nome) => (
          <option key={nome} value={nome} />
        ))}
      </datalist>
    </>
  )
}

function ComponentEditor({
  componente,
  componentIndex,
  grupos,
  materiais,
  disabled,
  onModeChange,
  onChange,
  onGroupChange,
  onMaterialChange,
  onRemove,
}: {
  item: ItemDraft
  componente: ComponentDraft
  componentIndex: number
  grupos: GrupoComponente[]
  materiais: Material[]
  disabled: boolean
  onModeChange: (origem: OrigemComponenteOrcamento) => void
  onChange: (patch: Partial<ComponentDraft>) => void
  onGroupChange: (groupId: string) => void
  onMaterialChange: (materialId: string) => void
  onRemove: () => void
}) {
  const selectedMaterial = materiais.find((material) => material.id === componente.material_id)
  const estoqueAtual = selectedMaterial
    ? selectedMaterial.quantidade_atual ?? selectedMaterial.quantidade ?? 0
    : 0

  return (
    <div className="space-y-4 rounded-xl border border-[#ebe3f2] bg-[#fdfbff] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#eee5f7] text-xs font-semibold text-[#6e5096]">
            {componentIndex + 1}
          </span>
          <Select
            value={componente.origem}
            onValueChange={(value) => onModeChange(value as OrigemComponenteOrcamento)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 w-44 cursor-pointer bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="estoque">
                <span className="flex items-center gap-2">
                  <Boxes className="h-4 w-4" />
                  Usar estoque
                </span>
              </SelectItem>
              <SelectItem value="manual">
                <span className="flex items-center gap-2">
                  <PackagePlus className="h-4 w-4" />
                  Sob encomenda
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          {componente.origem === 'manual' && (
            <Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">
              Sob encomenda
            </Badge>
          )}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remover componente ${componentIndex + 1}`}
          className="cursor-pointer text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {componente.origem === 'estoque' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Grupo do componente" htmlFor={`grupo-${componente.key}`}>
            <Select
              value={componente.grupo_id || undefined}
              onValueChange={onGroupChange}
              disabled={disabled}
            >
              <SelectTrigger id={`grupo-${componente.key}`} className="w-full cursor-pointer bg-white">
                <SelectValue placeholder="Escolha o grupo" />
              </SelectTrigger>
              <SelectContent>
                {grupos.map((grupo) => (
                  <SelectItem key={grupo.id} value={grupo.id}>
                    {grupo.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Material existente" htmlFor={`material-${componente.key}`}>
            <Select
              value={componente.material_id || undefined}
              onValueChange={onMaterialChange}
              disabled={disabled || !componente.grupo_id}
            >
              <SelectTrigger
                id={`material-${componente.key}`}
                className="w-full cursor-pointer bg-white"
              >
                <SelectValue placeholder="Escolha o material" />
              </SelectTrigger>
              <SelectContent>
                {materiais.map((material) => (
                  <SelectItem key={material.id} value={material.id}>
                    {material.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {selectedMaterial && (
            <div className="md:col-span-2">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                <MaterialAvatar
                  imageUrl={componente.imagem_url}
                  color={componente.cor_hex}
                  tipo={selectedMaterial.tipo}
                  nome={componente.material_nome}
                  className="h-10 w-10"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{componente.material_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    Custo {formatCurrency(parseNumber(componente.custo_unitario_estimado))} por{' '}
                    {componente.unidade}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    estoqueAtual <= Number(selectedMaterial.quantidade_minima || 0)
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-blue-200 bg-white text-blue-700'
                  }
                >
                  Estoque: {Number(estoqueAtual)} {selectedMaterial.unidade}
                </Badge>
                <p className="w-full text-xs text-blue-700">
                  Estoque apenas informativo — este orçamento não reserva nem baixa materiais.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Grupo" htmlFor={`grupo-manual-${componente.key}`}>
            <Input
              id={`grupo-manual-${componente.key}`}
              list="orcamento-grupos-manuais"
              value={componente.grupo_nome}
              onChange={(event) =>
                onChange({ grupo_id: '', grupo_nome: event.target.value })
              }
              placeholder="Escolha ou digite um grupo"
              required
              disabled={disabled}
            />
          </Field>
          <Field label="Material" htmlFor={`material-manual-${componente.key}`}>
            <Input
              id={`material-manual-${componente.key}`}
              value={componente.material_nome}
              onChange={(event) =>
                onChange({ material_id: '', material_nome: event.target.value })
              }
              placeholder="Ex: Conta azul 8 mm"
              required
              disabled={disabled}
            />
          </Field>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Quantidade/item" htmlFor={`qtd-${componente.key}`}>
          <Input
            id={`qtd-${componente.key}`}
            inputMode="decimal"
            value={componente.quantidade_por_item}
            onChange={(event) => onChange({ quantidade_por_item: event.target.value })}
            required
            disabled={disabled}
          />
        </Field>
        <Field label="Unidade" htmlFor={`unidade-${componente.key}`}>
          <Select
            value={componente.unidade}
            onValueChange={(value) => onChange({ unidade: value })}
            disabled={disabled || componente.origem === 'estoque'}
          >
            <SelectTrigger id={`unidade-${componente.key}`} className="w-full cursor-pointer bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['un', 'g', 'kg', 'cm', 'm', 'pct', 'par'].map((unidade) => (
                <SelectItem key={unidade} value={unidade}>
                  {unidade}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Custo unitário" htmlFor={`custo-${componente.key}`}>
          <Input
            id={`custo-${componente.key}`}
            inputMode="decimal"
            value={componente.custo_unitario_estimado}
            onChange={(event) => onChange({ custo_unitario_estimado: event.target.value })}
            placeholder="0,00"
            disabled={disabled || componente.origem === 'estoque'}
          />
        </Field>
        <Field label="Cor (opcional)" htmlFor={`cor-${componente.key}`}>
          <div className="flex gap-2">
            <Input
              id={`cor-${componente.key}`}
              value={componente.cor_hex}
              onChange={(event) => onChange({ cor_hex: event.target.value })}
              placeholder="#C8BDE9"
              disabled={disabled || componente.origem === 'estoque'}
            />
            {/^#[0-9a-f]{6}$/i.test(componente.cor_hex) && (
              <span
                className="h-10 w-10 shrink-0 rounded-md border"
                style={{ backgroundColor: componente.cor_hex }}
                aria-label={`Cor ${componente.cor_hex}`}
              />
            )}
          </div>
        </Field>
      </div>

      <Field label="Observação do componente" htmlFor={`obs-${componente.key}`}>
        <Input
          id={`obs-${componente.key}`}
          value={componente.observacao}
          onChange={(event) => onChange({ observacao: event.target.value })}
          placeholder="Detalhes de compra, acabamento ou fornecedor"
          disabled={disabled}
        />
      </Field>
    </div>
  )
}

function FinancialSummary({
  margem,
  onMargemChange,
  calculo,
  disabled,
}: {
  margem: string
  onMargemChange: (value: string) => void
  calculo: {
    custoComponentes: number
    maoObra: number
    custoBase: number
    margemPercentual: number
    margemValor: number
    valorComMargem: number
    arredondamento: number
    valorFinal: number
    lucroEstimado: number
    quantidadeTotal: number
  }
  disabled: boolean
}) {
  return (
    <Card className="border-[#dccbea] bg-[#f6effc] shadow-none xl:sticky xl:top-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-[#4f4261]">
          <Calculator className="h-5 w-5" />
          Resumo financeiro
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="Margem aplicada (%)" htmlFor="orcamento-margem">
          <Input
            id="orcamento-margem"
            inputMode="decimal"
            value={margem}
            onChange={(event) => onMargemChange(event.target.value)}
            disabled={disabled}
            className="bg-white"
          />
        </Field>
        <Separator className="bg-[#dccbea]" />
        <SummaryRow label="Quantidade total" value={`${calculo.quantidadeTotal} un.`} />
        <SummaryRow label="Custo dos componentes" value={formatCurrency(calculo.custoComponentes)} />
        <SummaryRow label="Mão de obra" value={formatCurrency(calculo.maoObra)} />
        <SummaryRow label="Custo base" value={formatCurrency(calculo.custoBase)} strong />
        <SummaryRow
          label={`Margem (${calculo.margemPercentual}%)`}
          value={formatCurrency(calculo.margemValor)}
        />
        <SummaryRow label="Valor com margem" value={formatCurrency(calculo.valorComMargem)} />
        <SummaryRow label="Arredondamento" value={formatCurrency(calculo.arredondamento)} />
        <Separator className="bg-[#dccbea]" />
        <div className="flex items-end justify-between gap-3">
          <span className="text-sm font-semibold text-[#5f5072]">Valor final</span>
          <strong className="text-2xl text-[#4f4261]">
            {formatCurrency(calculo.valorFinal)}
          </strong>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm">
          <span className="text-emerald-700">Lucro estimado</span>
          <strong className="text-emerald-800">{formatCurrency(calculo.lucroEstimado)}</strong>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          O servidor recalcula os valores ao salvar. Nenhum estoque será reservado ou baixado.
        </p>
      </CardContent>
    </Card>
  )
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold text-[#4f4261]' : 'font-medium'}>{value}</span>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
