import { getHistoricoVendas, type HistoricoVendasFilters } from './actions'
import { HistoricoVendasContent } from './historico-vendas-content'

type HistoricoVendasPageProps = {
  searchParams?: Promise<{
    inicio?: string
    fim?: string
    busca?: string
    ordem?: string
  }>
}

export default async function HistoricoVendasPage({
  searchParams,
}: HistoricoVendasPageProps) {
  const params = await searchParams
  const filters: HistoricoVendasFilters = {
    inicio: params?.inicio,
    fim: params?.fim,
    busca: params?.busca,
    ordem: params?.ordem === 'desc' ? 'desc' : 'asc',
  }
  const historico = await getHistoricoVendas(filters)

  return <HistoricoVendasContent historico={historico} filters={filters} />
}
