import { redirect } from 'next/navigation'

type LegacyOrcamentoPageProps = {
  params: Promise<{ slug: string }>
}

export default async function LegacyOrcamentoPage({ params }: LegacyOrcamentoPageProps) {
  const { slug } = await params
  redirect(`/o/${encodeURIComponent(slug)}`)
}
