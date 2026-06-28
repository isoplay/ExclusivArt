import { z } from 'zod'
import type {
  OrigemComponenteOrcamento,
  StatusOrcamento,
} from '@/lib/types/database'

export const MAX_ORCAMENTO_ITEMS = 25
export const MAX_COMPONENTS_PER_ITEM = 50
export const MAX_COMPONENTS_PER_QUOTE = 200

export const ORCAMENTO_UNITS = [
  'un',
  'g',
  'kg',
  'cm',
  'm',
  'pct',
  'par',
  'cx',
] as const

export const ORCAMENTO_STATUS_TRANSITIONS: Record<
  StatusOrcamento,
  readonly StatusOrcamento[]
> = {
  rascunho: ['enviado', 'cancelado'],
  enviado: ['rascunho', 'aprovado', 'recusado', 'cancelado'],
  aprovado: ['convertido', 'cancelado'],
  recusado: ['rascunho', 'cancelado'],
  cancelado: ['rascunho'],
  convertido: [],
}

export type OrcamentoComponenteInput = {
  grupo_id?: string | null
  grupo_nome: string
  material_id?: string | null
  material_nome: string
  quantidade_por_item: number
  unidade?: string
  custo_unitario_estimado: number
  cor_hex?: string | null
  imagem_url?: string | null
  origem: OrigemComponenteOrcamento
  observacao?: string | null
  ordem?: number
}

export type OrcamentoItemInput = {
  categoria_id?: string | null
  nome_produto: string
  quantidade: number
  mao_obra_unitaria: number
  ordem?: number
  componentes: OrcamentoComponenteInput[]
}

export type OrcamentoPayload = {
  cliente_nome: string
  cliente_contato?: string | null
  cliente_endereco?: string | null
  validade?: string | null
  prazo_estimado?: string | null
  margem_percentual?: number
  observacao_cliente?: string | null
  observacoes_internas?: string | null
  itens: OrcamentoItemInput[]
}

export type OrcamentoUpdatePayload =
  | OrcamentoPayload
  | {
      observacao_cliente?: string | null
      observacoes_internas?: string | null
      status?: StatusOrcamento
    }

function normalizeSingleLine(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function isValidCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.toISOString().slice(0, 10) === value
}

function optionalSingleLine(maxLength: number) {
  return z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z
      .string()
      .trim()
      .max(maxLength)
      .nullable()
      .transform((value) => (value ? normalizeSingleLine(value) : null))
  )
}

function optionalMultiline(maxLength: number) {
  return z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().max(maxLength).nullable()
  )
}

const optionalUuidSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.string().uuid().nullable()
)

const optionalDateSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.string().refine(isValidCalendarDate, 'Data inválida').nullable()
)

const optionalColorSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor hexadecimal inválida')
    .nullable()
)

const optionalImageUrlSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z
    .string()
    .trim()
    .max(1000)
    .refine((value) => {
      if (value.startsWith('/') && !value.startsWith('//')) return true
      try {
        const parsed = new URL(value)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      } catch {
        return false
      }
    }, 'URL de imagem inválida')
    .nullable()
)

const componentSchema = z
  .object({
    grupo_id: optionalUuidSchema,
    grupo_nome: z.string().trim().min(1).max(120).transform(normalizeSingleLine),
    material_id: optionalUuidSchema,
    material_nome: z.string().trim().min(1).max(160).transform(normalizeSingleLine),
    quantidade_por_item: z.coerce.number().finite().positive().max(999_999_999),
    unidade: z.enum(ORCAMENTO_UNITS).default('un'),
    custo_unitario_estimado: z.coerce.number().finite().min(0).max(9_999_999_999),
    cor_hex: optionalColorSchema,
    imagem_url: optionalImageUrlSchema,
    origem: z.enum(['estoque', 'manual']),
    observacao: optionalMultiline(500),
    ordem: z.coerce.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((component, context) => {
    if (component.origem === 'estoque' && !component.material_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['material_id'],
        message: 'Material do estoque é obrigatório',
      })
    }
  })

const itemSchema = z
  .object({
    categoria_id: optionalUuidSchema,
    nome_produto: z.string().trim().min(1).max(160).transform(normalizeSingleLine),
    quantidade: z.coerce.number().int().positive().max(100_000),
    mao_obra_unitaria: z.coerce.number().finite().min(0).max(9_999_999_999),
    ordem: z.coerce.number().int().min(0).optional(),
    componentes: z.array(componentSchema).max(MAX_COMPONENTS_PER_ITEM),
  })
  .strict()

const orcamentoPayloadSchema = z
  .object({
    cliente_nome: z.string().trim().min(1).max(120).transform(normalizeSingleLine),
    cliente_contato: optionalSingleLine(80),
    cliente_endereco: optionalSingleLine(500),
    validade: optionalDateSchema,
    prazo_estimado: optionalDateSchema,
    margem_percentual: z.coerce.number().finite().min(0).max(100_000).default(100),
    observacao_cliente: optionalMultiline(1200),
    observacoes_internas: optionalMultiline(3000),
    itens: z.array(itemSchema).min(1).max(MAX_ORCAMENTO_ITEMS),
  })
  .strict()
  .superRefine((payload, context) => {
    const totalComponents = payload.itens.reduce(
      (total, item) => total + item.componentes.length,
      0
    )
    if (totalComponents > MAX_COMPONENTS_PER_QUOTE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['itens'],
        message: `O orçamento aceita no máximo ${MAX_COMPONENTS_PER_QUOTE} componentes`,
      })
    }
  })

export type NormalizedOrcamentoPayload = z.output<typeof orcamentoPayloadSchema>

export function parseOrcamentoPayload(input: unknown):
  | { success: true; data: NormalizedOrcamentoPayload }
  | { success: false; error: string } {
  const parsed = orcamentoPayloadSchema.safeParse(input)
  if (parsed.success) return { success: true, data: parsed.data }

  const firstIssue = parsed.error.issues[0]
  return {
    success: false,
    error: firstIssue?.message || 'Dados do orçamento inválidos',
  }
}

export function canTransitionOrcamentoStatus(
  current: StatusOrcamento,
  next: StatusOrcamento
) {
  return ORCAMENTO_STATUS_TRANSITIONS[current].includes(next)
}

const publicComponentSchema = z
  .object({
    grupo_nome: z.string(),
    material_nome: z.string(),
    quantidade_por_item: z.coerce.number().finite().min(0),
    unidade: z.string(),
    cor_hex: z.string().nullable(),
    origem: z.enum(['estoque', 'manual']),
  })
  .strict()

const publicItemSchema = z
  .object({
    nome_produto: z.string(),
    quantidade: z.coerce.number().int().min(0),
    valor_total: z.coerce.number().finite().min(0),
    componentes: z.array(publicComponentSchema).max(MAX_COMPONENTS_PER_ITEM),
  })
  .strict()

const publicOrcamentoSchema = z
  .object({
    cliente_nome: z.string(),
    orcamento_codigo: z.string(),
    status: z.enum([
      'rascunho',
      'enviado',
      'aprovado',
      'recusado',
      'convertido',
      'cancelado',
    ]),
    validade: z.string().nullable(),
    prazo_estimado: z.string().nullable(),
    quantidade_total: z.coerce.number().int().min(0),
    valor_total: z.coerce.number().finite().min(0),
    observacao_cliente: z.string().nullable(),
    created_at: z.string(),
    itens: z.array(publicItemSchema).max(MAX_ORCAMENTO_ITEMS),
  })
  .strict()

export function parsePublicOrcamento(input: unknown) {
  const parsed = publicOrcamentoSchema.safeParse(input)
  return parsed.success ? parsed.data : null
}
