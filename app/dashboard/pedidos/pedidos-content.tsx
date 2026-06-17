'use client'

import { useState, useTransition, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Copy, MoreHorizontal, Search, Eye, Send, Trash2, Clock } from 'lucide-react'
import type { Material, PedidoComItens, StatusPedido } from '@/lib/types/database'
import {
  deletePedido,
  gerarLinkAcompanhamentoPedido,
  updatePedidoObservacaoCliente,
  updatePedidoStatus,
} from './actions'
import { PedidoForm } from './pedido-form'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatDateBR } from '@/lib/utils'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatDate(date: string | null) {
  return formatDateBR(date)
}

function openExternalUrl(url: string) {
  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    return Boolean(opened)
  } catch {
    return false
  }
}

const STATUS_COLORS: { [key: string]: string } = {
  orcamento: 'bg-gray-100 text-gray-800',
  confirmado: 'bg-blue-100 text-blue-800',
  separando_materiais: 'bg-purple-100 text-purple-800',
  em_producao: 'bg-yellow-100 text-yellow-800',
  pronto: 'bg-green-100 text-green-800',
  entregue: 'bg-emerald-100 text-emerald-800',
  cancelado: 'bg-red-100 text-red-800',
}

const STATUS_OPTIONS: StatusPedido[] = [
  'orcamento',
  'confirmado',
  'separando_materiais',
  'em_producao',
  'pronto',
  'entregue',
  'cancelado',
]

export function PedidosContent({
  pedidos,
  materiais,
  categorias,
  grupos,
  componentes,
  maodeobra,
}: {
  pedidos: PedidoComItens[]
  materiais: Material[]
  categorias: any[]
  grupos: any[]
  componentes: any[]
  maodeobra: { [key: string]: number }
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [selectedPedido, setSelectedPedido] = useState<PedidoComItens | null>(null)
  const [observacaoClienteEdit, setObservacaoClienteEdit] = useState('')
  const [trackingLink, setTrackingLink] = useState<string | null>(null)
  const [trackingWhatsAppUrl, setTrackingWhatsAppUrl] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Suporte a ?novo=1 (usado pelo FAB mobile para abrir direto o formulário de novo pedido)
  useEffect(() => {
    if (searchParams.get('novo') === '1') {
      setIsAddOpen(true)
    }
  }, [searchParams])

  const filteredPedidos = pedidos.filter((p) => {
    const matchesSearch =
      p.cliente_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir este pedido?')) return
    startTransition(async () => {
      const result = await deletePedido(id)
      if (result.success) {
        toast.success('Pedido excluído com sucesso!')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao excluir pedido')
      }
    })
  }

  async function handleStatusChange(pedidoId: string, newStatus: StatusPedido) {
    startTransition(async () => {
      const result = await updatePedidoStatus(pedidoId, newStatus)
      if (result.success) {
        toast.success('Status atualizado com sucesso!')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao atualizar status')
      }
    })
  }

  function openView(pedido: PedidoComItens) {
    setSelectedPedido(pedido)
    setObservacaoClienteEdit(pedido.observacao_cliente || '')
    setTrackingLink(null)
    setTrackingWhatsAppUrl(null)
    setIsViewOpen(true)
  }

  async function copyTrackingLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copiado.')
    } catch {
      toast.info('Link gerado. Copie manualmente se necessario.')
    }
  }

  async function handleSendTrackingLink() {
    if (!selectedPedido) return

    startTransition(async () => {
      const result = await gerarLinkAcompanhamentoPedido(selectedPedido.id)

      if (!result.success) {
        toast.error(result.error || 'Erro ao gerar link de acompanhamento')
        return
      }

      setTrackingLink(result.trackingUrl)
      setTrackingWhatsAppUrl(result.whatsappUrl)
      await copyTrackingLink(result.trackingUrl)

      const openedWhatsApp = openExternalUrl(result.whatsappUrl)

      if (openedWhatsApp) {
        toast.success(
          result.hasClientPhone
            ? 'Link gerado. Abrindo WhatsApp da cliente.'
            : 'Link gerado. WhatsApp aberto sem telefone vinculado.'
        )
      } else {
        toast.info('Link gerado e copiado. Use o botao Abrir WhatsApp se o navegador bloquear.')
      }
    })
  }

  async function handleSaveObservacaoCliente() {
    if (!selectedPedido) return

    startTransition(async () => {
      const result = await updatePedidoObservacaoCliente(
        selectedPedido.id,
        observacaoClienteEdit
      )

      if (result.success) {
        toast.success('Observação para o cliente salva.')
        setSelectedPedido({
          ...selectedPedido,
          observacao_cliente: observacaoClienteEdit.trim() || null,
        })
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao salvar observação')
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pedidos</h1>
          <p className="text-muted-foreground">
            Gerencie pedidos de clientes
          </p>
        </div>

        {/* Dialog: Novo Pedido */}
        <Dialog
          open={isAddOpen}
          onOpenChange={(open) => {
            setIsAddOpen(open)
            // Limpa o ?novo da URL ao fechar (para não reabrir em refresh/back)
            if (!open && searchParams.get('novo') === '1') {
              router.replace('/dashboard/pedidos', { scroll: false })
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Pedido
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-6xl">
            <DialogHeader>
              <DialogTitle>Criar Novo Pedido</DialogTitle>
              <DialogDescription>
                Preencha os dados do cliente e selecione os componentes
              </DialogDescription>
            </DialogHeader>
            <PedidoForm
              categorias={categorias}
              grupos={grupos}
              componentes={componentes}
              materiais={materiais}
              maodeobra={maodeobra}
              onSuccess={() => {
                setIsAddOpen(false)
                router.refresh()
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente ou ID do pedido..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="orcamento">Orçamento</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="separando_materiais">Separando Materiais</SelectItem>
                <SelectItem value="em_producao">Em Produção</SelectItem>
                <SelectItem value="pronto">Pronto</SelectItem>
                <SelectItem value="entregue">Entregue</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Pedidos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pedidos ({filteredPedidos.length})
          </CardTitle>
          <CardDescription>Lista de pedidos no sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredPedidos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all'
                  ? 'Nenhum pedido encontrado'
                  : 'Nenhum pedido cadastrado ainda'}
              </p>
              {!searchTerm && statusFilter === 'all' && (
                <Button
                  variant="link"
                  onClick={() => setIsAddOpen(true)}
                  className="mt-2"
                >
                  Criar primeiro pedido
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>ID Pedido</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPedidos.map((pedido) => (
                    <TableRow key={pedido.id}>
                      <TableCell>
                        <span className="font-medium">{pedido.cliente_nome}</span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {pedido.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[pedido.status] || 'bg-gray-100'}>
                          {pedido.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(pedido.valor_total ?? 0)}
                      </TableCell>
                      <TableCell>{formatDate(pedido.prazo_entrega)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openView(pedido)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Ver detalhes
                            </DropdownMenuItem>
                            {/* Submenu para status */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted">
                                  Mudar Status
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent side="left" align="start">
                                {STATUS_OPTIONS.map((s) => (
                                  <DropdownMenuItem
                                    key={s}
                                    onClick={() => handleStatusChange(pedido.id, s)}
                                    disabled={s === pedido.status}
                                  >
                                    {s.replace(/_/g, ' ')}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <DropdownMenuItem
                              onClick={() => handleDelete(pedido.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Ver Detalhes */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-h-[92svh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Pedido</DialogTitle>
            <DialogDescription>
              ID: {selectedPedido?.id.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>
          {selectedPedido && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Cliente</p>
                <p className="font-medium">{selectedPedido.cliente_nome}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Contato</p>
                <p className="text-sm">{selectedPedido.cliente_contato || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Endereço</p>
                <p className="text-sm">{selectedPedido.cliente_endereco || '-'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={STATUS_COLORS[selectedPedido.status]}>
                    {selectedPedido.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="font-medium">{formatCurrency(selectedPedido.valor_total ?? 0)}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Prazo de Entrega</p>
                <p className="text-sm">{formatDate(selectedPedido.prazo_entrega)}</p>
              </div>
              {selectedPedido.observacoes && (
                <div>
                  <p className="text-sm text-muted-foreground">Observações</p>
                  <p className="text-sm">{selectedPedido.observacoes}</p>
                </div>
              )}

              <div className="rounded-2xl border border-[#E3DAF4] bg-white p-4">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-[#333333]">
                    Observação para o cliente
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Aparece nos detalhes do pedido e no link público de acompanhamento.
                  </p>
                </div>
                <Textarea
                  value={observacaoClienteEdit}
                  onChange={(event) => setObservacaoClienteEdit(event.target.value)}
                  placeholder="Ex: Terço personalizado com o nome Kiliane, entremeio e crucifixo resinados"
                  rows={4}
                  maxLength={1200}
                />
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSaveObservacaoCliente}
                    disabled={isPending}
                  >
                    {isPending ? 'Salvando...' : 'Salvar observação'}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E3DAF4] bg-[#F5F3FA] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#333333]">
                      Acompanhamento da cliente
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Gera um token protegido e envia apenas dados publicos do pedido.
                    </p>
                  </div>
                  <Send className="mt-1 h-4 w-4 shrink-0 text-[#8F7DB9]" />
                </div>

                <Button
                  type="button"
                  className="mt-4 min-h-11 w-full rounded-xl"
                  onClick={handleSendTrackingLink}
                  disabled={isPending}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {isPending ? 'Gerando link...' : 'Enviar link de acompanhamento'}
                </Button>

                {trackingLink ? (
                  <div className="mt-3 rounded-xl border border-[#E3DAF4] bg-white p-3">
                    <p className="break-all text-xs text-[#666666]">{trackingLink}</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => copyTrackingLink(trackingLink)}
                      >
                        <Copy className="mr-2 h-3.5 w-3.5" />
                        Copiar link
                      </Button>

                      {trackingWhatsAppUrl ? (
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => {
                            const opened = openExternalUrl(trackingWhatsAppUrl)
                            if (!opened) {
                              toast.info('Copie o link e envie pelo WhatsApp manualmente.')
                            }
                          }}
                        >
                          <Send className="mr-2 h-3.5 w-3.5" />
                          Abrir WhatsApp
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
