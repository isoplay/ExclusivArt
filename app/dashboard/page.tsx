import { getDashboardMetrics } from './actions'
import { DashboardContent } from './dashboard-content'
import { getAuthenticatedUser, getUserDisplayName } from '@/lib/auth'

type DashboardPageProps = {
  searchParams?: Promise<{ welcome?: string }>
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams
  const user = await getAuthenticatedUser()
  const metrics = await getDashboardMetrics()

  return (
    <DashboardContent
      metrics={metrics}
      usuarioNome={getUserDisplayName(user)}
      mostrarBoasVindas={params?.welcome === '1'}
    />
  )
}
