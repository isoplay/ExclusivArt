import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { logServerError } from '@/lib/server-log'
import { parsePublicOrcamento } from '@/lib/orcamentos/validation'
import { isValidPublicSlug } from '@/lib/public-tracking-validation'
import {
  QuotePreview,
  QuoteUnavailable,
} from '@/components/orcamento-publico/quote-preview'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Seu orçamento personalizado | Exclusiv ART',
  description: 'Orçamento personalizado preparado pela Exclusiv ART.',
  robots: {
    index: false,
    follow: false,
  },
}

type OrcamentoPublicoPageProps = {
  params: Promise<{ slug: string }>
}

async function getPublicQuote(slug: string) {
  if (!isValidPublicSlug(slug)) return null

  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase.rpc('get_public_orcamento_by_slug', {
      p_slug: slug,
    })

    if (error) {
      logServerError('public_quote_rpc_failed', error, { route: '/o/[slug]' })
      return null
    }

    if (!data) return null

    const parsed = parsePublicOrcamento(data)
    if (!parsed) {
      logServerError(
        'public_quote_payload_invalid',
        new Error('Public quote payload does not match the expected schema'),
        { route: '/o/[slug]' }
      )
      return null
    }

    return parsed
  } catch (error) {
    logServerError('public_quote_exception', error, { route: '/o/[slug]' })
    return null
  }
}

export default async function OrcamentoPublicoPage({ params }: OrcamentoPublicoPageProps) {
  const { slug } = await params
  const quote = await getPublicQuote(slug)

  if (!quote) return <QuoteUnavailable />

  return <QuotePreview quote={quote} standalone />
}
