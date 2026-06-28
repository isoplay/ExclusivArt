import {
  QuotePreview,
  mapOrcamentoToPreview,
  type QuotePreviewData,
} from '@/components/orcamento-publico/quote-preview'

export { mapOrcamentoToPreview }
export type OrcamentoPreviewData = QuotePreviewData

export function OrcamentoPreview({
  orcamento,
  className,
}: {
  orcamento: QuotePreviewData
  className?: string
}) {
  return <QuotePreview quote={orcamento} className={className} />
}
