import { getOperacaoData } from './actions'
import { OperacaoContent } from './operacao-content'

export default async function OperacaoPage() {
  const data = await getOperacaoData()

  return <OperacaoContent data={data} />
}
