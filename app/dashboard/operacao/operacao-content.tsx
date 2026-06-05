'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Download,
  Factory,
  History,
  PackageSearch,
  ReceiptText,
  ShoppingBasket,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { calculatePricing, toNumber } from '@/lib/operacao-calculos'
import type { OperacaoData } from './actions'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(toNumber(value))
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    confirmado: 'Confirmado',
    separando_materiais: 'Separando',
    em_producao: 'Em producao',
    pronto: 'Pronto',
  }

  return labels[status] ?? status.replace(/_/g, ' ')
}

function deadlineLabel(days: number | null) {
  if (days === null) return 'Sem prazo'
  if (days < 0) return `${Math.abs(days)} dia(s) atrasado`
  if (days === 0) return 'Entrega hoje'
  if (days === 1) return 'Amanha'
  return `${days} dias`
}

function downloadCsv(data: OperacaoData) {
  const rows = [
    ['tipo', 'nome', 'valor_1', 'valor_2', 'observacao'],
    ...data.alertasEstoque.map((alerta) => [
      'alerta_estoque',
      alerta.nome,
      String(alerta.falta),
      String(alerta.custo_reposicao.toFixed(2)),
      alerta.nivel,
    ]),
    ...data.precificacao.map((produto) => [
      'precificacao',
      produto.nome,
      String(produto.preco_venda.toFixed(2)),
      String(produto.lucro_estimado.toFixed(2)),
      `${produto.margem_real.toFixed(1)}%`,
    ]),
  ]
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')
    )
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'exclusiv-art-operacao.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string
  value: string
  description: string
  icon: typeof AlertTriangle
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-medium text-[#706b82]">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-[#15142a]">{value}</p>
          <p className="mt-1 text-xs text-[#706b82]">{description}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f3edf8] text-[#8d68bc]">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

export function OperacaoContent({ data }: { data: OperacaoData }) {
  const [selectedProductId, setSelectedProductId] = useState(data.precificacao[0]?.id ?? '')
  const [packagingCost, setPackagingCost] = useState('0')
  const [freightCost, setFreightCost] = useState('0')
  const [marketplaceFee, setMarketplaceFee] = useState('0')
  const [targetMargin, setTargetMargin] = useState('45')

  const selectedProduct = data.precificacao.find((produto) => produto.id === selectedProductId)
  const simulator = useMemo(() => {
    if (!selectedProduct) return null

    return calculatePricing({
      materialCost: selectedProduct.custo_materiais,
      laborCost: selectedProduct.mao_de_obra,
      packagingCost: Number(packagingCost.replace(',', '.')) || 0,
      freightCost: Number(freightCost.replace(',', '.')) || 0,
      marketplaceFeePercent: Number(marketplaceFee.replace(',', '.')) || 0,
      marginPercent: Number(targetMargin.replace(',', '.')) || 0,
      currentPrice: selectedProduct.preco_venda,
    })
  }, [freightCost, marketplaceFee, packagingCost, selectedProduct, targetMargin])

  const maxDespesa = Math.max(1, ...Object.values(data.financeiro.despesasPorCategoria))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#15142a]">
            Central de Operacao
          </h1>
          <p className="text-sm text-[#706b82]">
            Previa interna para auditoria, alertas, producao, precos e relatorios.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/pedidos">Abrir pedidos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/estoque">Abrir estoque</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Pedidos ativos"
          value={String(data.resumo.pedidosAtivos)}
          description="confirmados ate prontos"
          icon={ClipboardList}
        />
        <SummaryCard
          title="Alertas criticos"
          value={String(data.resumo.alertasCriticos)}
          description="estoque insuficiente ou zerado"
          icon={AlertTriangle}
        />
        <SummaryCard
          title="Receita do mes"
          value={formatCurrency(data.resumo.receitaMes)}
          description="pedidos nao cancelados"
          icon={ReceiptText}
        />
        <SummaryCard
          title="Lucro estimado"
          value={formatCurrency(data.resumo.lucroMes)}
          description="receita menos despesas"
          icon={BarChart3}
        />
      </div>

      <Tabs defaultValue="alertas" className="gap-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-lg bg-white p-1">
          <TabsTrigger value="alertas">Alertas</TabsTrigger>
          <TabsTrigger value="producao">Producao</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
          <TabsTrigger value="precos">Precos</TabsTrigger>
          <TabsTrigger value="relatorios">Relatorios</TabsTrigger>
        </TabsList>

        <TabsContent value="alertas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBasket className="h-5 w-5" />
                Lista de compra inteligente
              </CardTitle>
              <CardDescription>
                Materiais abaixo do minimo ou insuficientes para pedidos em aberto.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.alertasEstoque.length === 0 ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  Nenhum alerta encontrado com os dados atuais.
                </div>
              ) : (
                data.alertasEstoque.slice(0, 12).map((alerta) => (
                  <div
                    key={alerta.material_id}
                    className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-[1fr_140px_140px_150px]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-[#15142a]">{alerta.nome}</p>
                        <Badge
                          className={
                            alerta.nivel === 'critico'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }
                        >
                          {alerta.nivel === 'critico' ? 'Critico' : 'Atencao'}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#706b82]">
                        {alerta.tipo} | demanda aberta: {alerta.demanda_aberta}{' '}
                        {alerta.unidade}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="text-[#706b82]">Estoque</p>
                      <p className="font-semibold">
                        {alerta.estoque_atual} / min {alerta.estoque_minimo}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="text-[#706b82]">Comprar</p>
                      <p className="font-semibold">
                        {alerta.falta} {alerta.unidade}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="text-[#706b82]">Custo previsto</p>
                      <p className="font-semibold">{formatCurrency(alerta.custo_reposicao)}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="producao" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-4">
            {data.kanban.map((coluna) => (
              <Card key={coluna.status} className="min-h-[320px]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    {statusLabel(coluna.status)}
                    <Badge variant="secondary">{coluna.pedidos.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {coluna.pedidos.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-[#706b82]">
                      Nenhum pedido nesta etapa.
                    </p>
                  ) : (
                    coluna.pedidos.map((pedido) => (
                      <div key={pedido.id} className="rounded-lg border bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[#15142a]">
                              {pedido.cliente_nome}
                            </p>
                            <p className="text-xs text-[#706b82]">
                              {pedido.itens} item(ns) | {formatCurrency(pedido.valor_total)}
                            </p>
                          </div>
                          <Badge
                            className={
                              pedido.dias_para_entrega !== null && pedido.dias_para_entrega <= 1
                                ? 'bg-red-100 text-red-800'
                                : 'bg-purple-100 text-purple-800'
                            }
                          >
                            {deadlineLabel(pedido.dias_para_entrega)}
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-4 gap-1 text-[10px] text-[#706b82]">
                          {['Material', 'Montagem', 'Revisao', 'Entrega'].map((step, index) => (
                            <div key={step} className="flex flex-col items-center gap-1">
                              <span
                                className={
                                  index <= data.kanban.findIndex((item) => item.status === coluna.status)
                                    ? 'h-2 w-full rounded-full bg-[#9c6ed0]'
                                    : 'h-2 w-full rounded-full bg-[#eee6f5]'
                                }
                              />
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="auditoria" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Historico de estoque
              </CardTitle>
              <CardDescription>
                Baseado nas movimentacoes ja registradas pelo banco.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.auditoria.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-[#706b82]">
                  Nenhuma movimentacao encontrada.
                </p>
              ) : (
                data.auditoria.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-[150px_1fr_120px_120px]"
                  >
                    <div>
                      <p className="text-xs text-[#706b82]">{formatDate(item.created_at)}</p>
                      <Badge
                        className={
                          item.tipo === 'entrada'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }
                      >
                        {item.tipo}
                      </Badge>
                    </div>
                    <div>
                      <p className="font-medium text-[#15142a]">{item.material_nome}</p>
                      <p className="text-xs text-[#706b82]">
                        {item.motivo || 'Movimentacao manual ou automatica'}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="text-[#706b82]">Quantidade</p>
                      <p className="font-semibold">
                        {item.quantidade} {item.material_unidade}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="text-[#706b82]">Origem</p>
                      <p className="font-semibold">
                        {item.pedido_id ? `Pedido ${item.pedido_id.slice(0, 8)}` : item.usuario}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="precos" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PackageSearch className="h-5 w-5" />
                  Margem por produto
                </CardTitle>
                <CardDescription>
                  Compara preco atual, custo e lucro estimado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.precificacao.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-[#706b82]">
                    Cadastre produtos com composicao para visualizar precificacao.
                  </p>
                ) : (
                  data.precificacao.map((produto) => (
                    <button
                      key={produto.id}
                      type="button"
                      onClick={() => setSelectedProductId(produto.id)}
                      className="grid w-full gap-3 rounded-lg border bg-white p-4 text-left transition hover:border-[#c8adeb] md:grid-cols-[1fr_120px_120px_120px]"
                    >
                      <div>
                        <p className="font-medium text-[#15142a]">{produto.nome}</p>
                        <p className="text-xs text-[#706b82]">
                          Custo: {formatCurrency(produto.custo_total)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#706b82]">Preco</p>
                        <p className="font-semibold">{formatCurrency(produto.preco_venda)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#706b82]">Lucro</p>
                        <p className="font-semibold">{formatCurrency(produto.lucro_estimado)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#706b82]">Margem real</p>
                        <p className="font-semibold">{produto.margem_real.toFixed(1)}%</p>
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Simulador rapido</CardTitle>
                <CardDescription>
                  Previa local. Nao altera o produto salvo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Embalagem</label>
                  <Input value={packagingCost} onChange={(event) => setPackagingCost(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Frete</label>
                  <Input value={freightCost} onChange={(event) => setFreightCost(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Taxa marketplace (%)</label>
                  <Input value={marketplaceFee} onChange={(event) => setMarketplaceFee(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Margem desejada (%)</label>
                  <Input value={targetMargin} onChange={(event) => setTargetMargin(event.target.value)} />
                </div>
                {selectedProduct && simulator ? (
                  <div className="rounded-lg bg-[#f7f1fb] p-4">
                    <p className="text-sm text-[#706b82]">{selectedProduct.nome}</p>
                    <p className="mt-2 text-2xl font-semibold text-[#15142a]">
                      {formatCurrency(simulator.preco_sugerido)}
                    </p>
                    <p className="mt-1 text-xs text-[#706b82]">
                      Custo total {formatCurrency(simulator.custo_total)} | margem real{' '}
                      {simulator.margem_real.toFixed(1)}%
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-[#706b82]">Selecione um produto.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="relatorios" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Receita recebida</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatCurrency(data.financeiro.receitaRecebida)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>A receber</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatCurrency(data.financeiro.receitaAberta)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Despesas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatCurrency(data.financeiro.totalDespesas)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Factory className="h-5 w-5" />
                  Relatorio mensal
                </CardTitle>
                <CardDescription>Resumo exportavel para acompanhamento interno.</CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={() => downloadCsv(data)}>
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(data.financeiro.despesasPorCategoria).length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-[#706b82]">
                  Sem despesas no mes atual.
                </p>
              ) : (
                Object.entries(data.financeiro.despesasPorCategoria).map(([categoria, valor]) => (
                  <div key={categoria} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium capitalize">{categoria}</span>
                      <span>{formatCurrency(valor)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#eee6f5]">
                      <div
                        className="h-full rounded-full bg-[#9c6ed0]"
                        style={{ width: `${Math.max(4, (valor / maxDespesa) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="flex gap-3 p-4 text-sm text-emerald-950">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Esta previa nao cria tabelas novas. Para registrar usuario real na auditoria e
                checklist persistente por pedido, a proxima etapa seria uma migration pequena.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
