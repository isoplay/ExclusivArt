import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getPedido } from '../../actions'
import { atualizarValorPedidoManual } from './actions'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatMoneyInput(value: number) {
  return value.toFixed(2).replace('.', ',')
}

export default async function EditarValorPedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const [{ id }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ])
  const pedido = await getPedido(id)

  if (!pedido) {
    notFound()
  }

  const valorAtual = Number(pedido.valor_total ?? 0)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <Button asChild variant="ghost" className="w-fit px-2">
        <Link href="/dashboard/pedidos">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para pedidos
        </Link>
      </Button>

      {query?.error ? (
        <Alert className="border-red-200 bg-red-50 text-red-950">
          <AlertTitle>Nao foi possivel salvar</AlertTitle>
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Editar valor do pedido</CardTitle>
          <CardDescription>
            Ajuste manualmente o total cobrado sem alterar os componentes ou a baixa de estoque.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-5 rounded-lg bg-muted/50 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Cliente</span>
              <span className="text-right font-medium">{pedido.cliente_nome}</span>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <span className="text-muted-foreground">Valor atual</span>
              <span className="font-semibold text-green-700">{formatCurrency(valorAtual)}</span>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <span className="text-muted-foreground">ID</span>
              <span className="font-mono text-xs">{pedido.id.slice(0, 8)}...</span>
            </div>
          </div>

          <form action={atualizarValorPedidoManual} className="space-y-4">
            <input type="hidden" name="pedido_id" value={pedido.id} />

            <div className="space-y-2">
              <Label htmlFor="valor_total">Novo valor total *</Label>
              <Input
                id="valor_total"
                name="valor_total"
                inputMode="decimal"
                defaultValue={formatMoneyInput(valorAtual)}
                placeholder="Ex: 149,90"
                required
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Use virgula ou ponto. Exemplo: 149,90 ou 149.90.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button asChild type="button" variant="outline">
                <Link href="/dashboard/pedidos">Cancelar</Link>
              </Button>
              <Button type="submit" className="bg-green-600 hover:bg-green-700">
                <Save className="mr-2 h-4 w-4" />
                Salvar valor
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
