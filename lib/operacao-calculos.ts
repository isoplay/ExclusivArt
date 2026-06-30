export type MaterialStockInput = {
  id: string
  nome: string
  tipo?: string | null
  unidade?: string | null
  quantidade?: number | null
  quantidade_atual?: number | null
  quantidade_minima?: number | null
  custo_unitario?: number | null
}

export type MaterialDemandInput = {
  material_id: string
  quantidade: number
}

export type OrderItemDemandInput = {
  quantidade: number
  materiais_personalizados?: MaterialDemandInput[]
  materiais_produto?: MaterialDemandInput[]
}

export type StockAlert = {
  material_id: string
  nome: string
  tipo: string
  unidade: string
  estoque_atual: number
  estoque_minimo: number
  demanda_aberta: number
  falta: number
  custo_reposicao: number
  nivel: 'critico' | 'atencao' | 'ok'
}

export type PricingInput = {
  materialCost: number
  laborCost: number
  packagingCost?: number
  marketplaceFeePercent?: number
  freightCost?: number
  marginPercent: number
  currentPrice?: number
}

export type PricingResult = {
  custo_base: number
  custo_total: number
  preco_sugerido: number
  preco_atual: number
  lucro_estimado: number
  margem_real: number
}

export function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function getEstoqueAtual(material: MaterialStockInput) {
  return toNumber(material.quantidade_atual ?? material.quantidade)
}

export function buildOrderMaterialDemand(itens: OrderItemDemandInput[]) {
  const demandaPorMaterial = new Map<string, number>()

  itens.forEach((item) => {
    const materiais = item.materiais_personalizados?.length
      ? item.materiais_personalizados
      : (item.materiais_produto ?? []).map((material) => ({
          material_id: material.material_id,
          quantidade: toNumber(material.quantidade) * toNumber(item.quantidade),
        }))

    materiais.forEach((material) => {
      if (!material.material_id) return
      demandaPorMaterial.set(
        material.material_id,
        (demandaPorMaterial.get(material.material_id) ?? 0) + toNumber(material.quantidade)
      )
    })
  })

  return Array.from(demandaPorMaterial, ([material_id, quantidade]) => ({
    material_id,
    quantidade,
  }))
}

export function normalizePercent(value: number) {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 95) return 95
  return value
}

export function calculatePricing(input: PricingInput): PricingResult {
  const materialCost = toNumber(input.materialCost)
  const laborCost = toNumber(input.laborCost)
  const packagingCost = toNumber(input.packagingCost)
  const freightCost = toNumber(input.freightCost)
  const marketplaceFeePercent = normalizePercent(toNumber(input.marketplaceFeePercent))
  const marginPercent = normalizePercent(toNumber(input.marginPercent))
  const custo_base = materialCost + laborCost + packagingCost + freightCost
  // Taxa de marketplace come parte do preco final, entao entra no divisor junto da margem.
  const divisor = 1 - marginPercent / 100 - marketplaceFeePercent / 100
  const preco_sugerido = divisor <= 0 ? custo_base : custo_base / divisor
  const preco_atual = toNumber(input.currentPrice) > 0 ? toNumber(input.currentPrice) : preco_sugerido
  const fee = preco_atual * (marketplaceFeePercent / 100)
  const custo_total = custo_base + fee
  const lucro_estimado = preco_atual - custo_total
  const margem_real = preco_atual > 0 ? (lucro_estimado / preco_atual) * 100 : 0

  return {
    custo_base,
    custo_total,
    preco_sugerido,
    preco_atual,
    lucro_estimado,
    margem_real,
  }
}

export function buildStockAlerts(
  materiais: MaterialStockInput[],
  demandas: MaterialDemandInput[] = []
) {
  const demandaPorMaterial = new Map<string, number>()

  demandas.forEach((item) => {
    if (!item.material_id) return
    demandaPorMaterial.set(
      item.material_id,
      (demandaPorMaterial.get(item.material_id) ?? 0) + toNumber(item.quantidade)
    )
  })

  return materiais
    .map<StockAlert>((material) => {
      const estoque_atual = getEstoqueAtual(material)
      const estoque_minimo = toNumber(material.quantidade_minima ?? 30)
      const demanda_aberta = demandaPorMaterial.get(material.id) ?? 0
      // Compra sugerida cobre primeiro pedido em aberto; se nao faltar para pedido,
      // cobre reposicao ate o minimo definido no cadastro.
      const faltaParaPedido = Math.max(0, demanda_aberta - estoque_atual)
      const faltaParaMinimo = Math.max(0, estoque_minimo - estoque_atual)
      const falta = Math.max(faltaParaPedido, faltaParaMinimo)
      const nivel: StockAlert['nivel'] =
        faltaParaPedido > 0 || estoque_atual <= 0
          ? 'critico'
          : falta > 0
            ? 'atencao'
            : 'ok'

      return {
        material_id: material.id,
        nome: material.nome,
        tipo: material.tipo ?? 'Sem tipo',
        unidade: material.unidade ?? 'un',
        estoque_atual,
        estoque_minimo,
        demanda_aberta,
        falta,
        custo_reposicao: falta * toNumber(material.custo_unitario),
        nivel,
      }
    })
    .filter((alerta) => alerta.nivel !== 'ok')
    .sort((a, b) => {
      const priority = { critico: 0, atencao: 1, ok: 2 }
      if (priority[a.nivel] !== priority[b.nivel]) return priority[a.nivel] - priority[b.nivel]
      return b.falta - a.falta
    })
}

export function getDaysUntil(dateValue?: string | null, now = new Date()) {
  if (!dateValue) return null
  const dateOnly = dateValue.split('T')[0]
  const [year, month, day] = dateOnly.split('-').map(Number)
  // Prazo salvo como YYYY-MM-DD deve ser tratado no horario local, nao como UTC.
  const date =
    year && month && day
      ? new Date(year, month - 1, day)
      : new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null

  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)

  return Math.ceil((date.getTime() - start.getTime()) / 86_400_000)
}
