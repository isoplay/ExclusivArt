'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  WalletCards,
  XCircle,
} from 'lucide-react'
import {
  mapOrcamentoToPreview,
  OrcamentoPreview,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  CategoriaProduto,
  ComponenteEstoque,
  GrupoComponente,
  Material,
  OrcamentoComItens,
  StatusOrcamento,
} from '@/lib/types/database'
import { formatDateBR, getTodayDateString } from '@/lib/utils'
import {
  deleteOrcamento,
  gerarLinkOrcamento,
  updateOrcamentoStatus,
} from './actions'
import { OrcamentoForm } from './orcamento-form'

type ComponenteCatalogo = ComponenteEstoque & { material?: Material }

type OrcamentosContentProps = {
  orcamentos: OrcamentoComItens[]
  materiais: Material[]
  categorias: CategoriaProduto[]
  grupos: GrupoComponente[]
  componentes: ComponenteCatalogo[]
  maodeobra: Record<string, number>
}

const STATUS_FILTERS: Array<{ value: StatusOrcamento; label: string }> = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'recusado', label: 'Recusado' },
  { value: 'convertido', label: 'Convertido' },
  { value: 'cancelado', label: 'Cancelado' },
]

const STATUS_LABELS = Object.fromEntries(
  STATUS_FILTERS.map((status) => [status.value, status.label])
) as Record<StatusOrcamento, string>

const STATUS_STYLES: Record<StatusOrcamento, string> = {
  rascunho: 'border-slate-200 bg-slate-100 text-slate-700',
  enviado: 'border-blue-200 bg-blue-50 text-blue-700',
  aprovado: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  recusado: 'border-rose-200 bg-rose-50 text-rose-700',
  convertido: 'border-violet-200 bg-violet-50 text-violet-700',
  cancelado: 'border-amber-200 bg-amber-50 text-amber-800',
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

function productSummary(orcamento: OrcamentoComItens) {
  const names = orcamento.orcamento_itens?.map((item) => item.nome_produto).filter(Boolean) || []
  if (names.length === 0) return 'Sem itens'
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

function StatusBadge({ status }: { status: StatusOrcamento }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function matchesValidity(orcamento: OrcamentoComItens, filter: string, today: string) {
  const validade = orcamento.validade?.slice(0, 10) || null
  if (filter === 'all') return true
  if (filter === 'without') return validade === null
  if (!validade) return false
  if (filter === 'expired') return validade < today
  if (filter === 'valid') return validade >= today
  if (filter === 'next7') {
    const limit = new Date(`${today}T12:00:00`)
    limit.setDate(limit.getDate() + 7)
    const limitString = limit.toISOString().slice(0, 10)
    return validade >= today && validade <= limitString
  }
  return true
}

export function OrcamentosContent({
  orcamentos,
  materiais,
  categorias,
  grupos,
  componentes,
  maodeobra,
}: OrcamentosContentProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [validity, setValidity] = useState('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editing, setEditing] = useState<OrcamentoComItens | null>(null)
  const [viewing, setViewing] = useState<OrcamentoComItens | null>(null)
  const [previewing, setPreviewing] = useState<OrcamentoComItens | null>(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    const today = getTodayDateString()
    return orcamentos.filter((orcamento) => {
      const matchesStatus = status === 'all' || orcamento.status === status
      const matchesSearch =
        !term ||
        orcamento.cliente_nome.toLocaleLowerCase('pt-BR').includes(term) ||
        productSummary(orcamento).toLocaleLowerCase('pt-BR').includes(term)
      return (
        matchesStatus &&
        matchesSearch &&
        matchesValidity(orcamento, validity, today)
      )
    })
  }, [orcamentos, search, status, validity])

  const metrics = useMemo(() => {
    const aguardando = orcamentos.filter((orcamento) =>
      ['rascunho', 'enviado'].includes(orcamento.status)
    )
    const aprovados = orcamentos.filter((orcamento) => orcamento.status === 'aprovado')
    return {
      total: orcamentos.length,
      aguardando: aguardando.length,
      aprovados: aprovados.length,
      valorAberto: aguardando.reduce(
        (total, orcamento) => total + Number(orcamento.valor_total || 0),
        0
      ),
    }
  }, [orcamentos])

  function handleStatus(id: string, nextStatus: StatusOrcamento, successMessage: string) {
    startTransition(async () => {
      const result = await updateOrcamentoStatus(id, nextStatus)
      if (!result.success) {
        toast.error(result.error || 'Não foi possível atualizar o status')
        return
      }
      toast.success(successMessage)
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    if (!window.confirm('Excluir este orçamento? Ele será arquivado e sairá da listagem.')) return
    startTransition(async () => {
      const result = await deleteOrcamento(id)
      if (!result.success) {
        toast.error(result.error || 'Não foi possível excluir o orçamento')
        return
      }
      toast.success('Orçamento excluído')
      router.refresh()
    })
  }

  function handleCopyLink(orcamento: OrcamentoComItens) {
    startTransition(async () => {
      const result = await gerarLinkOrcamento(orcamento.id)
      if (!result.success) {
        toast.error(result.error || 'Não foi possível gerar o link')
        return
      }
      try {
        await navigator.clipboard.writeText(result.quoteUrl)
        toast.success('Link público copiado')
      } catch {
        toast.info(`Link gerado: ${result.quoteUrl}`)
      }
      router.refresh()
    })
  }

  function handleWhatsApp(orcamento: OrcamentoComItens) {
    startTransition(async () => {
      const result = await gerarLinkOrcamento(orcamento.id)
      if (!result.success) {
        toast.error(result.error || 'Não foi possível preparar o WhatsApp')
        return
      }
      const opened = window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer')
      toast.success(
        opened
          ? result.hasClientPhone
            ? 'Abrindo conversa da cliente'
            : 'Abrindo WhatsApp sem telefone vinculado'
          : 'O navegador bloqueou a abertura do WhatsApp'
      )
      router.refresh()
    })
  }

  const catalogProps = { materiais, categorias, grupos, componentes, maodeobra }

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#8060a8]">
            <FileText className="h-4 w-4" />
            Propostas comerciais
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#282138] sm:text-3xl">
            Orçamentos
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Monte orçamentos livres sem depender do estoque
          </p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="h-11 cursor-pointer bg-[#8060a8] px-5 text-white shadow-[0_12px_26px_-16px_rgba(91,58,130,0.75)] hover:bg-[#6e5096]"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo orçamento
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Orçamentos ativos',
            value: metrics.total,
            icon: FileText,
            tone: 'bg-[#eee5f7] text-[#6e5096]',
          },
          {
            label: 'Aguardando retorno',
            value: metrics.aguardando,
            icon: CalendarClock,
            tone: 'bg-blue-50 text-blue-700',
          },
          {
            label: 'Aprovados',
            value: metrics.aprovados,
            icon: CheckCircle2,
            tone: 'bg-emerald-50 text-emerald-700',
          },
          {
            label: 'Valor em aberto',
            value: formatCurrency(metrics.valorAberto),
            icon: WalletCards,
            tone: 'bg-amber-50 text-amber-800',
          },
        ].map((metric) => (
          <Card key={metric.label} className="border-[#ebe3f2] bg-white/90 shadow-sm">
            <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {metric.label}
                </p>
                <p className="mt-1 truncate text-2xl font-semibold text-[#282138]">
                  {metric.value}
                </p>
              </div>
              <div className={`rounded-xl p-2.5 ${metric.tone}`}>
                <metric.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-[#ebe3f2] bg-white/95 shadow-sm">
        <CardHeader className="gap-4 border-b border-[#f0eaf5] pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <CardTitle className="text-lg text-[#282138]">Propostas</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? 'orçamento encontrado' : 'orçamentos encontrados'}
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-auto">
            <div className="relative min-w-0 sm:min-w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente"
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full cursor-pointer sm:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {STATUS_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={validity} onValueChange={setValidity}>
              <SelectTrigger className="w-full cursor-pointer sm:w-44">
                <SelectValue placeholder="Validade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as validades</SelectItem>
                <SelectItem value="valid">Válidos</SelectItem>
                <SelectItem value="next7">Vence em 7 dias</SelectItem>
                <SelectItem value="expired">Vencidos</SelectItem>
                <SelectItem value="without">Sem validade</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              hasQuotes={orcamentos.length > 0}
              onCreate={() => setIsCreateOpen(true)}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#fbf9fd] hover:bg-[#fbf9fd]">
                      <TableHead>Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Validade</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead className="w-14 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((orcamento) => (
                      <TableRow key={orcamento.id} className="group">
                        <TableCell className="min-w-64">
                          <button
                            type="button"
                            onClick={() => setViewing(orcamento)}
                            className="cursor-pointer text-left"
                          >
                            <span className="block font-semibold text-[#332a43] group-hover:text-[#6e5096]">
                              {orcamento.cliente_nome}
                            </span>
                            <span className="mt-0.5 block max-w-80 truncate text-xs text-muted-foreground">
                              {productSummary(orcamento)}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={orcamento.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold">
                          {formatCurrency(orcamento.valor_total)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateBR(orcamento.validade)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateBR(orcamento.prazo_estimado)}
                        </TableCell>
                        <TableCell className="text-right">
                          <QuoteMenu
                            orcamento={orcamento}
                            disabled={isPending}
                            onView={() => setViewing(orcamento)}
                            onEdit={() => setEditing(orcamento)}
                            onPreview={() => setPreviewing(orcamento)}
                            onCopy={() => handleCopyLink(orcamento)}
                            onWhatsApp={() => handleWhatsApp(orcamento)}
                            onSent={() =>
                              handleStatus(orcamento.id, 'enviado', 'Orçamento marcado como enviado')
                            }
                            onApproved={() =>
                              handleStatus(
                                orcamento.id,
                                'aprovado',
                                'Orçamento marcado como aprovado'
                              )
                            }
                            onCancel={() =>
                              handleStatus(orcamento.id, 'cancelado', 'Orçamento cancelado')
                            }
                            onDelete={() => handleDelete(orcamento.id)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="divide-y divide-[#f0eaf5] md:hidden">
                {filtered.map((orcamento) => (
                  <div key={orcamento.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setViewing(orcamento)}
                        className="min-w-0 cursor-pointer text-left"
                      >
                        <span className="block truncate font-semibold text-[#332a43]">
                          {orcamento.cliente_nome}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {productSummary(orcamento)}
                        </span>
                      </button>
                      <QuoteMenu
                        orcamento={orcamento}
                        disabled={isPending}
                        onView={() => setViewing(orcamento)}
                        onEdit={() => setEditing(orcamento)}
                        onPreview={() => setPreviewing(orcamento)}
                        onCopy={() => handleCopyLink(orcamento)}
                        onWhatsApp={() => handleWhatsApp(orcamento)}
                        onSent={() =>
                          handleStatus(orcamento.id, 'enviado', 'Orçamento marcado como enviado')
                        }
                        onApproved={() =>
                          handleStatus(
                            orcamento.id,
                            'aprovado',
                            'Orçamento marcado como aprovado'
                          )
                        }
                        onCancel={() =>
                          handleStatus(orcamento.id, 'cancelado', 'Orçamento cancelado')
                        }
                        onDelete={() => handleDelete(orcamento.id)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <StatusBadge status={orcamento.status} />
                      <strong className="text-sm text-[#332a43]">
                        {formatCurrency(orcamento.valor_total)}
                      </strong>
                    </div>
                    <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#faf7fc] p-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Validade</p>
                        <p className="mt-0.5 font-medium">{formatDateBR(orcamento.validade)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Prazo</p>
                        <p className="mt-0.5 font-medium">
                          {formatDateBR(orcamento.prazo_estimado)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Novo orçamento</DialogTitle>
            <DialogDescription>
              Monte uma proposta livre. O estoque será mostrado apenas como referência.
            </DialogDescription>
          </DialogHeader>
          <OrcamentoForm {...catalogProps} onSuccess={() => setIsCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Editar orçamento</DialogTitle>
            <DialogDescription>Revise composição, custos e dados da cliente.</DialogDescription>
          </DialogHeader>
          {editing && (
            <OrcamentoForm
              key={editing.id}
              {...catalogProps}
              orcamento={editing}
              onSuccess={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {viewing && <QuoteDetails orcamento={viewing} />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewing)} onOpenChange={(open) => !open && setPreviewing(null)}>
        <DialogContent className="max-h-[94vh] overflow-y-auto border-0 bg-[#f7f2fb] p-3 sm:max-w-4xl sm:p-6">
          <DialogHeader className="sr-only">
            <DialogTitle>Pré-visualização como cliente</DialogTitle>
            <DialogDescription>
              Visualização do orçamento como será exibido no link público.
            </DialogDescription>
          </DialogHeader>
          {previewing && (
            <OrcamentoPreview
              orcamento={mapOrcamentoToPreview(previewing)}
              className="mx-auto w-full max-w-3xl"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QuoteMenu({
  orcamento,
  disabled,
  onView,
  onEdit,
  onPreview,
  onCopy,
  onWhatsApp,
  onSent,
  onApproved,
  onCancel,
  onDelete,
}: {
  orcamento: OrcamentoComItens
  disabled: boolean
  onView: () => void
  onEdit: () => void
  onPreview: () => void
  onCopy: () => void
  onWhatsApp: () => void
  onSent: () => void
  onApproved: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="h-9 w-9 cursor-pointer"
          aria-label={`Ações do orçamento de ${orcamento.cliente_nome}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Ações</DropdownMenuLabel>
        <DropdownMenuItem onClick={onView} className="cursor-pointer">
          <Eye className="mr-2 h-4 w-4" />
          Ver detalhes
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onEdit}
          disabled={orcamento.status === 'convertido'}
          className="cursor-pointer"
        >
          <Pencil className="mr-2 h-4 w-4" />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPreview} className="cursor-pointer">
          <FileText className="mr-2 h-4 w-4" />
          Pré-visualizar como cliente
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCopy} className="cursor-pointer">
          <Copy className="mr-2 h-4 w-4" />
          Gerar/copiar link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onWhatsApp} className="cursor-pointer">
          <MessageCircle className="mr-2 h-4 w-4" />
          Abrir WhatsApp
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onSent}
          disabled={orcamento.status === 'enviado'}
          className="cursor-pointer"
        >
          <Send className="mr-2 h-4 w-4" />
          Marcar como enviado
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onApproved}
          disabled={orcamento.status === 'aprovado'}
          className="cursor-pointer"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Marcar como aprovado
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onCancel}
          disabled={orcamento.status === 'cancelado'}
          className="cursor-pointer"
        >
          <XCircle className="mr-2 h-4 w-4" />
          Cancelar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function QuoteDetails({ orcamento }: { orcamento: OrcamentoComItens }) {
  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>Orçamento de {orcamento.cliente_nome}</DialogTitle>
          <StatusBadge status={orcamento.status} />
        </div>
        <DialogDescription>
          Criado em {formatDateBR(orcamento.created_at)} · {orcamento.quantidade_total}{' '}
          {orcamento.quantidade_total === 1 ? 'unidade' : 'unidades'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-3 rounded-xl bg-[#f7f1fb] p-4 sm:grid-cols-3">
          <DetailMetric label="Custo estimado" value={formatCurrency(orcamento.custo_total)} />
          <DetailMetric label="Margem" value={`${Number(orcamento.margem_percentual)}%`} />
          <DetailMetric
            label="Valor final"
            value={formatCurrency(orcamento.valor_total)}
            highlight
          />
        </div>

        <div className="space-y-3">
          {orcamento.orcamento_itens.map((item) => (
            <div key={item.id} className="rounded-xl border border-[#ebe3f2] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#332a43]">{item.nome_produto}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantidade} un. · mão de obra {formatCurrency(item.mao_obra_unitaria)}
                  </p>
                </div>
                <strong className="whitespace-nowrap text-sm">
                  {formatCurrency(item.valor_total)}
                </strong>
              </div>
              {item.orcamento_componentes.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-[#f0eaf5] pt-3">
                  {item.orcamento_componentes.map((componente) => (
                    <div
                      key={componente.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <span className="text-muted-foreground">{componente.grupo_nome}:</span>{' '}
                        {componente.material_nome}
                        {componente.origem === 'manual' && (
                          <Badge className="ml-2 border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">
                            Sob encomenda
                          </Badge>
                        )}
                      </span>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {Number(componente.quantidade_por_item)} {componente.unidade}/item
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <DetailMetric label="Contato" value={orcamento.cliente_contato || 'Não informado'} />
          <DetailMetric label="Validade" value={formatDateBR(orcamento.validade)} />
          <DetailMetric label="Prazo estimado" value={formatDateBR(orcamento.prazo_estimado)} />
        </div>

        {orcamento.observacao_cliente && (
          <div className="rounded-xl border border-[#ebe3f2] bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Observação para a cliente
            </p>
            <p className="mt-1 text-sm leading-relaxed">{orcamento.observacao_cliente}</p>
          </div>
        )}
        {orcamento.observacoes_internas && (
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
              Observações internas
            </p>
            <p className="mt-1 text-sm leading-relaxed">{orcamento.observacoes_internas}</p>
          </div>
        )}
      </div>
    </>
  )
}

function DetailMetric({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={highlight ? 'font-semibold text-[#6e5096]' : 'font-semibold'}>{value}</p>
    </div>
  )
}

function EmptyState({ hasQuotes, onCreate }: { hasQuotes: boolean; onCreate: () => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 rounded-2xl bg-[#f1e8f8] p-4 text-[#8060a8]">
        <FileText className="h-7 w-7" />
      </div>
      <h3 className="font-semibold text-[#282138]">
        {hasQuotes ? 'Nenhum resultado' : 'Nenhum orçamento criado'}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {hasQuotes
          ? 'Ajuste a busca ou os filtros para encontrar outra proposta.'
          : 'Crie a primeira proposta sem depender dos materiais disponíveis no estoque.'}
      </p>
      {!hasQuotes && (
        <Button onClick={onCreate} variant="outline" className="mt-5 cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          Criar primeiro orçamento
        </Button>
      )}
    </div>
  )
}
