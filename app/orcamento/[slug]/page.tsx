import { redirect } from 'next/navigation'
import { isValidPublicSlug } from '@/lib/public-tracking-validation'

type LegacyOrcamentoPageProps = {
  params: Promise<{ slug: string }>
}

export default async function LegacyOrcamentoPage({ params }: LegacyOrcamentoPageProps) {
  const { slug } = await params
  if (!isValidPublicSlug(slug)) {
    redirect('/o/link-invalido')
  }
  redirect(`/o/${encodeURIComponent(slug)}`)
}
