'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
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
import {
  Plus,
  MoreHorizontal,
  Wallet,
  TrendingUp,
  TrendingDown,
  Pencil,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import type { Despesa, CategoriaDespesa, Pedido } from '@/lib/types/database'
import { createDespesa, updateDespesa, deleteDespesa } from './actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatDateBR, getTodayDateString, toDateInputValue } from '@/lib/utils'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

const categorias: { value: CategoriaDespesa; label: string }[] = [
  { value: 'material', label: 'Material' },
  { value: 'ferramenta', label: 'Ferramenta' },
  { value: 'embalagem', label: 'Embalagem' },
  { value: 'frete', label: 'Frete' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'outro', label: 'Outro' },
]

function getCategoriaLabel(value: string) {
  return categorias.find((c) => c.value === value)?.label || value
}

function getCategoriaColor(value: string) {
  switch (value) {
    case 'material':
      return 'bg-blue-100 text-blue-800'
    case 'ferramenta':
      return 'bg-purple-100 text-purple-800'
    case 'embalagem':
      return 'bg-pink-100 text-pink-800'
    case 'frete':
      return 'bg-orange-100 text-orange-800'
    case 'marketing':
      return 'bg-green-100 text-green-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

type FinanceiroResumo = {
  receita: number
  totalDespesas: number
  lucro: number
  totalPedidos: number
  pedidosPorStatus: Record<string, number>
  despesasPorCategoria: Record<string, number>
  pedidos: Pedido[]
  despesas: Despesa[]
}

export function FinanceiroContent({
  resumo,
  despesas,
  mesAtual,
  anoAtual,
}: {
  resumo: FinanceiroResumo
  despesas: Despesa[]
  mesAtual: number
  anoAtual: number
}) {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [selectedDespesa, setSelectedDespesa] = useState<Despesa | null>(null)
  const [addCategoria, setAddCategoria] = useState<CategoriaDespesa>('material')
  const [editCategoria, setEditCategoria] = useState<CategoriaDespesa>('material')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const mesNome = format(new Date(anoAtual, mesAtual), 'MMMM yyyy', { locale: ptBR })

  function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set('categoria', addCategoria)
    startTransition(async () => {
      const result = await createDespesa(formData)
      if (result.success) {
        toast.success('Despesa cadastrada com sucesso!')
        setIsAddOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao cadastrar despesa')
      }
    })
  }

  function handleUpdateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedDespesa) return
    const formData = new FormData(e.currentTarget)
    formData.set('categoria', editCategoria)
    startTransition(async () => {
      const result = await updateDespesa(selectedDespesa.id, formData)
      if (result.success) {
        toast.success('Despesa atualizada com sucesso!')
        setIsEditOpen(false)
        setSelectedDespesa(null)
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao atualizar despesa')
      }
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta despesa?')) return
    startTransition(async () => {
      const result = await deleteDespesa(id)
      if (result.success) {
        toast.success('Despesa excluida com sucesso!')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao excluir despesa')
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Financeiro</h1>
          <p className="text-muted-foreground">
            Resumo financeiro de {mesNome}
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova Despesa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cadastrar Despesa</DialogTitle>
              <DialogDescription>Registre uma nova despesa do negocio</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="descricao">Descricao *</Label>
                <Input
                  id="descricao"
                  name="descricao"
                  required
                  placeholder="Ex: Compra de contas de cristal"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="valor">Valor *</Label>
                  <Input
                    id="valor"
                    name="valor"
                    type="number"
                    step="0.01"
                    required
                    placeholder="R$ 0,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="categoria">Categoria *</Label>
                  <Select
                    value={addCategoria}
                    onValueChange={(v) => setAddCategoria(v as CategoriaDespesa)}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="categoria" value={addCategoria} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="data">Data *</Label>
                <Input
                  id="data"
                  name="data"
                  type="date"
                  required
                  defaultValue={getTodayDateString()}
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-800 flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Receita Confirmada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">
              {formatCurrency(resumo.receita)}
            </div>
            <p className="text-xs text-green-600 mt-1">
              {resumo.totalPedidos} pedido(s) no mes
            </p>
          </CardContent>
        </Card>

        <Card className="bg-red-50 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-800 flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4" />
              Despesas Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">
              {formatCurrency(resumo.totalDespesas)}
            </div>
            <p className="text-xs text-red-600 mt-1">
              {despesas.length} despesa(s) registrada(s)
            </p>
          </CardContent>
        </Card>

        <Card className={resumo.lucro >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm font-medium flex items-center gap-2 ${resumo.lucro >= 0 ? 'text-blue-800' : 'text-orange-800'}`}>
              <Wallet className="h-4 w-4" />
              Resultado do Mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${resumo.lucro >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
              {formatCurrency(resumo.lucro)}
            </div>
            <p className={`text-xs mt-1 ${resumo.lucro >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              {resumo.lucro >= 0 ? 'Resultado positivo' : 'Resultado negativo'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Expenses by Category */}
      {Object.keys(resumo.despesasPorCategoria).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              Despesas por Categoria
            </CardTitle>
            <CardDescription>Distribuicao das despesas do mes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(resumo.despesasPorCategoria).map(([categoria, valor]) => (
                <div
                  key={categoria}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={getCategoriaColor(categoria)}>
                      {getCategoriaLabel(categoria)}
                    </Badge>
                  </div>
                  <span className="font-medium">{formatCurrency(valor)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orders Summary */}
      {resumo.totalPedidos > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Pedidos do Mes
            </CardTitle>
            <CardDescription>Resumo dos pedidos por status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {Object.entries(resumo.pedidosPorStatus).map(([status, count]) => {
                const statusLabels: Record<string, { label: string; className: string }> = {
                  orcamento: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800' },
                  confirmado: { label: 'Confirmado', className: 'bg-amber-100 text-amber-800' },
                  em_producao: { label: 'Em Produção', className: 'bg-blue-100 text-blue-800' },
                  pronto: { label: 'Pronto para Entrega', className: 'bg-emerald-100 text-emerald-800' },
                  entregue: { label: 'Entregue', className: 'bg-green-100 text-green-800' },
                  cancelado: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
                }
                const info = statusLabels[status] || { label: status, className: '' }
                return (
                  <div
                    key={status}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <Badge variant="secondary" className={info.className}>
                      {info.label}
                    </Badge>
                    <span className="font-bold text-lg">{count}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expenses List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Despesas ({despesas.length})
          </CardTitle>
          <CardDescription>Lista de todas as despesas do mes</CardDescription>
        </CardHeader>
        <CardContent>
          {despesas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wallet className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">Nenhuma despesa registrada neste mes</p>
              <Button variant="link" onClick={() => setIsAddOpen(true)} className="mt-2">
                Registrar primeira despesa
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descricao</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {despesas.map((despesa) => (
                    <TableRow key={despesa.id}>
                      <TableCell>
                        <span className="font-medium">{despesa.descricao}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={getCategoriaColor(despesa.categoria)}>
                          {getCategoriaLabel(despesa.categoria)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatDateBR(despesa.data, 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="text-right font-medium text-red-600">
                        -{formatCurrency(despesa.valor)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedDespesa(despesa)
                                setEditCategoria(despesa.categoria)
                                setIsEditOpen(true)
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(despesa.id)}
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

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Despesa</DialogTitle>
            <DialogDescription>Atualize as informacoes da despesa</DialogDescription>
          </DialogHeader>
          {selectedDespesa && (
            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-descricao">Descricao *</Label>
                <Input
                  id="edit-descricao"
                  name="descricao"
                  required
                  defaultValue={selectedDespesa.descricao}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-valor">Valor *</Label>
                  <Input
                    id="edit-valor"
                    name="valor"
                    type="number"
                    step="0.01"
                    required
                    defaultValue={selectedDespesa.valor}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-categoria">Categoria *</Label>
                  <Select
                    value={editCategoria}
                    onValueChange={(v) => setEditCategoria(v as CategoriaDespesa)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="categoria" value={editCategoria} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-data">Data *</Label>
                <Input
                  id="edit-data"
                  name="data"
                  type="date"
                  required
                  defaultValue={toDateInputValue(selectedDespesa.data)}
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
