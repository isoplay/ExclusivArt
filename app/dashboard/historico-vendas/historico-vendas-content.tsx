'use client'

import type { ComponentType } from 'react'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  CalendarDays,
  FileUp,
  History,
  Plus,
  Search,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatDateBR } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  createVendaHistorica,
  importVendasHistoricasCsv,
  type HistoricoVendasChartItem,
  type HistoricoVendasData,
  type HistoricoVendasFilters,
  type HistoricoVendaOrigem,
} from './actions'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatDate(value: string | null) {
  return value ? formatDateBR(value, 'dd/MM/yyyy') : '-'
}

function getTodayDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getOrigemConfig(origem: HistoricoVendaOrigem) {
  const configs: Record<HistoricoVendaOrigem, { label: string; className: string }> = {
    papel: {
      label: 'Papel',
      className: 'border-[#E3DAF4] bg-[#F5F3FA] text-[#6B5A93]',
    },
    pedido_pronto: {
      label: 'Pedido pronto',
      className: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    },
    pedido_entregue: {
      label: 'Pedido entregue',
      className: 'border-green-100 bg-green-50 text-green-700',
    },
  }

  return configs[origem]
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string
  value: string | number
  description: string
  icon: ComponentType<{ className?: string }>
  tone: 'lilac' | 'green' | 'blue' | 'amber'
}) {
  const toneClasses = {
    lilac: 'bg-[#E3DAF4] text-[#6B5A93]',
    green: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-sky-100 text-sky-700',
    amber: 'bg-amber-100 text-amber-700',
  }[tone]

  return (
    <Card className="rounded-[22px] border-[#E3DAF4] bg-white shadow-[0_16px_45px_rgba(83,48,122,0.06)]">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle className="text-sm font-semibold text-[#666666]">{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', toneClasses)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-3xl font-semibold tracking-tight text-[#333333]">{value}</div>
      </CardContent>
    </Card>
  )
}

function SimpleBarChart({
  data,
  emptyText,
}: {
  data: HistoricoVendasChartItem[]
  emptyText: string
}) {
  const maxValue = Math.max(...data.map((item) => item.valor), 1)

  if (data.length === 0) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-[#E3DAF4] bg-[#F5F3FA] px-4 text-center text-sm text-[#666666]">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="flex min-h-64 items-end gap-3 overflow-x-auto rounded-2xl bg-[#F5F3FA] px-4 pb-4 pt-8">
      {data.map((item) => {
        const height = Math.max((item.valor / maxValue) * 100, 8)

        return (
          <div key={item.label} className="flex min-w-20 flex-1 flex-col items-center gap-3">
            <div className="flex h-40 w-full items-end">
              <div
                className="w-full rounded-t-2xl bg-gradient-to-t from-[#A98BDC] to-[#C8BDE9] shadow-[0_12px_28px_rgba(83,48,122,0.14)]"
                style={{ height: `${height}%` }}
                aria-label={`${item.label}: ${formatCurrency(item.valor)}`}
              />
            </div>
            <div className="min-h-14 text-center">
              <p className="text-xs font-semibold text-[#333333]">{item.label}</p>
              <p className="mt-1 text-xs text-[#666666]">{formatCurrency(item.valor)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function HistoricoVendasContent({
  historico,
  filters,
}: {
  historico: HistoricoVendasData
  filters: HistoricoVendasFilters
}) {
  const router = useRouter()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [inicio, setInicio] = useState(filters.inicio ?? '')
  const [fim, setFim] = useState(filters.fim ?? '')
  const [busca, setBusca] = useState(filters.busca ?? '')
  const [ordem, setOrdem] = useState<'asc' | 'desc'>(filters.ordem ?? 'asc')
  const [isPending, startTransition] = useTransition()

  const hasYearChart = historico.vendasPorAno.length > 1
  const filterSummary = useMemo(() => {
    const parts = []

    if (inicio) parts.push(`de ${formatDate(inicio)}`)
    if (fim) parts.push(`ate ${formatDate(fim)}`)
    if (busca) parts.push(`busca "${busca}"`)

    return parts.length > 0 ? parts.join(' · ') : 'Todas as vendas e pedidos finalizados'
  }, [busca, fim, inicio])

  function applyFilters() {
    const params = new URLSearchParams()

    if (inicio) params.set('inicio', inicio)
    if (fim) params.set('fim', fim)
    if (busca.trim()) params.set('busca', busca.trim())
    if (ordem !== 'asc') params.set('ordem', ordem)

    const query = params.toString()
    router.push(`/dashboard/historico-vendas${query ? `?${query}` : ''}`)
  }

  function clearFilters() {
    setInicio('')
    setFim('')
    setBusca('')
    setOrdem('asc')
    router.push('/dashboard/historico-vendas')
  }

  function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    startTransition(async () => {
      const result = await createVendaHistorica(formData)

      if (result.success) {
        toast.success('Venda antiga cadastrada.')
        form.reset()
        setIsCreateOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || 'Nao foi possivel cadastrar a venda.')
      }
    })
  }

  function handleImportSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    startTransition(async () => {
      const result = await importVendasHistoricasCsv(formData)

      if (result.success) {
        toast.success(`${result.count ?? 0} venda(s) importada(s).`)
        form.reset()
        setIsImportOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || 'Nao foi possivel importar o CSV.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#15142a]">
            Vendas Históricas
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#666666]">
            Registre vendas antigas anotadas em papel e veja pedidos atuais sincronizados
            automaticamente quando estiverem como pronto ou entregue. Nada aqui baixa estoque,
            cria pedido novo ou muda o fluxo de produção.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="min-h-11 rounded-2xl border-[#E3DAF4]">
                <FileUp className="mr-2 h-4 w-4" />
                Importar CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl rounded-2xl">
              <DialogHeader>
                <DialogTitle>Importar vendas antigas por CSV</DialogTitle>
                <DialogDescription>
                  Colunas esperadas: data_venda, cliente_nome, descricao, quantidade, valor_total, observacoes.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleImportSubmit} className="space-y-4">
                <div className="rounded-2xl bg-[#F5F3FA] p-4 text-sm leading-6 text-[#666666]">
                  Use datas em <strong>AAAA-MM-DD</strong> ou <strong>DD/MM/AAAA</strong>. Para valores com vírgula, use CSV separado por ponto e vírgula ou coloque o valor entre aspas.
                </div>
                <div className="space-y-2">
                  <Label htmlFor="arquivo">Arquivo CSV</Label>
                  <Input id="arquivo" name="arquivo" type="file" accept=".csv,text/csv" required />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? 'Importando...' : 'Importar'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="min-h-11 rounded-2xl">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar venda antiga
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl rounded-2xl">
              <DialogHeader>
                <DialogTitle>Adicionar venda antiga</DialogTitle>
                <DialogDescription>
                  Este registro nao altera estoque, pedidos ou producao.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="data_venda">Data da venda *</Label>
                    <Input
                      id="data_venda"
                      name="data_venda"
                      type="date"
                      required
                      defaultValue={getTodayDate()}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cliente_nome">Cliente</Label>
                    <Input id="cliente_nome" name="cliente_nome" placeholder="Opcional" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição do produto/venda *</Label>
                  <Input
                    id="descricao"
                    name="descricao"
                    required
                    placeholder="Ex: Terço personalizado azul"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quantidade">Quantidade *</Label>
                    <Input
                      id="quantidade"
                      name="quantidade"
                      type="number"
                      min={1}
                      step={1}
                      required
                      defaultValue={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="valor_total">Valor total *</Label>
                    <Input
                      id="valor_total"
                      name="valor_total"
                      inputMode="decimal"
                      required
                      placeholder="Ex: 45,50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    name="observacoes"
                    placeholder="Detalhes anotados no papel, se houver"
                  />
                </div>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? 'Salvando...' : 'Salvar venda antiga'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total histórico"
          value={formatCurrency(historico.resumo.totalVendido)}
          description={filterSummary}
          icon={Wallet}
          tone="lilac"
        />
        <MetricCard
          title="Vendas no histórico"
          value={historico.resumo.quantidadeVendas}
          description={`${historico.resumo.vendasPapel} antigas + ${historico.resumo.pedidosSincronizados} pedidos finalizados`}
          icon={History}
          tone="blue"
        />
        <MetricCard
          title="Primeira venda"
          value={formatDate(historico.resumo.primeiraVenda)}
          description="Registro mais antigo"
          icon={CalendarDays}
          tone="green"
        />
        <MetricCard
          title="Última venda"
          value={formatDate(historico.resumo.ultimaVenda)}
          description="Registro mais recente"
          icon={TrendingUp}
          tone="amber"
        />
      </section>

      <Card className="rounded-[22px] border-[#E3DAF4] bg-white shadow-[0_16px_45px_rgba(83,48,122,0.06)]">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Filtre por período, cliente, descrição ou ordem da tabela.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr_220px_auto_auto]">
            <div className="space-y-2">
              <Label htmlFor="inicio">Início</Label>
              <Input id="inicio" type="date" value={inicio} onChange={(event) => setInicio(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fim">Fim</Label>
              <Input id="fim" type="date" value={fim} onChange={(event) => setFim(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="busca">Busca</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8F7DB9]" />
                <Input
                  id="busca"
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  className="pl-9"
                  placeholder="Cliente ou descrição"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ordenação</Label>
              <Select value={ordem} onValueChange={(value) => setOrdem(value as 'asc' | 'desc')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Mais antiga primeiro</SelectItem>
                  <SelectItem value="desc">Mais recente primeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="min-h-10 w-full rounded-xl" onClick={applyFilters}>
                Aplicar
              </Button>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="min-h-10 w-full rounded-xl" onClick={clearFilters}>
                Limpar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className={cn('grid gap-4', hasYearChart && 'xl:grid-cols-2')}>
        <Card className="rounded-[22px] border-[#E3DAF4] bg-white shadow-[0_16px_45px_rgba(83,48,122,0.06)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#8F7DB9]" />
              Vendas por mês
            </CardTitle>
            <CardDescription>Soma das vendas antigas e pedidos finalizados agrupados por mês.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={historico.vendasPorMes} emptyText="Nenhuma venda ou pedido finalizado encontrado para montar o gráfico." />
          </CardContent>
        </Card>

        {hasYearChart && (
          <Card className="rounded-[22px] border-[#E3DAF4] bg-white shadow-[0_16px_45px_rgba(83,48,122,0.06)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-[#8F7DB9]" />
                Vendas por ano
              </CardTitle>
              <CardDescription>Comparativo anual quando houver mais de um ano registrado.</CardDescription>
            </CardHeader>
            <CardContent>
              <SimpleBarChart data={historico.vendasPorAno} emptyText="Ainda nao ha anos suficientes para comparar." />
            </CardContent>
          </Card>
        )}
      </section>

      <Card className="rounded-[22px] border-[#E3DAF4] bg-white shadow-[0_16px_45px_rgba(83,48,122,0.06)]">
        <CardHeader>
          <CardTitle>Histórico completo ({historico.vendas.length})</CardTitle>
          <CardDescription>
            Vendas antigas ficam cadastradas aqui. Pedidos prontos ou entregues aparecem automaticamente como origem sincronizada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historico.vendas.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-[#E3DAF4] bg-[#F5F3FA] px-4 text-center">
              <History className="mb-3 h-10 w-10 text-[#A792D8]" />
              <p className="text-sm font-medium text-[#333333]">Nenhuma venda encontrada.</p>
              <p className="mt-1 text-sm text-[#666666]">Adicione vendas antigas ou finalize pedidos atuais.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Valor total</TableHead>
                    <TableHead>Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.vendas.map((venda) => (
                    <TableRow key={venda.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {formatDate(venda.data_venda)}
                      </TableCell>
                      <TableCell>{venda.cliente_nome || '-'}</TableCell>
                      <TableCell>
                        <div className="max-w-sm">
                          <p className="font-medium text-[#333333]">{venda.descricao}</p>
                          {venda.observacoes ? (
                            <p className="mt-1 line-clamp-2 text-xs text-[#666666]">
                              {venda.observacoes}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{venda.quantidade}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700">
                        {formatCurrency(Number(venda.valor_total))}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                            getOrigemConfig(venda.origem).className
                          )}
                        >
                          {getOrigemConfig(venda.origem).label}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
