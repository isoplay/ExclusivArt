import { getFinanceiroResumo, getDespesas } from './actions'
import { FinanceiroContent } from './financeiro-content'
import { getBusinessYearMonth } from '@/lib/business-time'

export default async function FinanceiroPage() {
  const { mes, ano } = getBusinessYearMonth()

  const [resumo, despesas] = await Promise.all([
    getFinanceiroResumo(mes, ano),
    getDespesas(mes, ano),
  ])

  return <FinanceiroContent resumo={resumo} despesas={despesas} mesAtual={mes} anoAtual={ano} />
}
