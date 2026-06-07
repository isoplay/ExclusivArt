export type Material = {
  id: string
  nome: string
  tipo: string | null
  preco_compra: number
  quantidade: number
  quantidade_atual?: number
  quantidade_minima: number
  unidade: string
  custo_unitario: number
  descricao?: string | null
  fornecedor?: string | null
  imagem_url?: string | null
  cor?: string
  created_at?: string
  data_pedido?: string
  updated_at: string
}

export type Produto = {
  id: string
  nome: string
  tipo: 'terco' | 'pulseira' | 'chaveiro' | 'outro'
  preco_venda: number
  margem_lucro: number
  valor_maodeobra: number
  ativo: boolean
  data_pedido: string
  updated_at: string
}

export type ProdutoMaterial = {
  id: string
  produto_id: string
  material_id: string
  quantidade_usada: number
  // Relacionamentos carregados apenas quando a query pede.
  material?: Material
  produto?: Produto
}

export type ProdutoComMateriais = Produto & {
  produto_materiais: (ProdutoMaterial & { material: Material })[]
}

export type StatusPedido =
  | 'orcamento'
  | 'confirmado'
  | 'separando_materiais'
  | 'em_producao'
  | 'pronto'
  | 'entregue'
  | 'cancelado'

export const STATUS_PEDIDO_OPTIONS: {
  value: StatusPedido
  label: string
  className: string
}[] = [
  { value: 'orcamento', label: 'Em Orçamento', className: 'bg-yellow-100 text-yellow-800' },
  { value: 'confirmado', label: 'Confirmado', className: 'bg-amber-100 text-amber-800' },
  { value: 'separando_materiais', label: 'Separando Materiais', className: 'bg-purple-100 text-purple-800' },
  { value: 'em_producao', label: 'Em Produção', className: 'bg-blue-100 text-blue-800' },
  { value: 'pronto', label: 'Pronto para Entrega', className: 'bg-emerald-100 text-emerald-800' },
  { value: 'entregue', label: 'Entregue', className: 'bg-green-100 text-green-800' },
  { value: 'cancelado', label: 'Cancelado', className: 'bg-red-100 text-red-800' },
]

export type Pedido = {
  id: string
  cliente_nome: string
  cliente_contato: string | null
  cliente_endereco?: string | null
  prazo_entrega: string | null
  status: StatusPedido
  prioridade: number
  observacoes: string | null
  valor_total: number
  estoque_baixado?: boolean
  data_pedido: string
  updated_at: string
}

export type PedidoItem = {
  id: string
  pedido_id: string
  produto_id: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  // Relacionamentos carregados apenas quando a query pede.
  produto?: Produto
}

export type PedidoComItens = Pedido & {
  pedido_itens: (PedidoItem & { produto: Produto })[]
}

export type PedidoAcompanhamentoLink = {
  id: string
  pedido_id: string
  token_hash: string
  ativo: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  last_sent_at: string | null
  last_accessed_at: string | null
  expires_at: string | null
}

export type PedidoAcompanhamentoPublico = {
  cliente_nome: string
  pedido_codigo: string
  status: StatusPedido
  prazo_entrega: string | null
  produto_resumo: string
  quantidade_total: number
  valor_total: number
  data_pedido: string
}

export type CategoriaDespesa =
  | 'material'
  | 'ferramenta'
  | 'embalagem'
  | 'frete'
  | 'marketing'
  | 'outro'

export type Despesa = {
  id: string
  descricao: string
  valor: number
  categoria: CategoriaDespesa
  data: string
  data_pedido: string
}

export type VendaHistorica = {
  id: string
  data_venda: string
  cliente_nome: string | null
  descricao: string
  quantidade: number
  valor_total: number
  origem: string
  observacoes: string | null
  created_at: string
}

export type TipoMovimentacao = 'entrada' | 'saida'

export type MovimentacaoEstoque = {
  id: string
  material_id: string
  tipo: TipoMovimentacao
  quantidade: number
  motivo: string | null
  pedido_id: string | null
  created_at: string
  // Relacionamentos carregados apenas quando a query pede.
  material?: Material
}

export type PedidoItemMaterial = {
  id: string
  pedido_item_id: string
  material_id: string
  quantidade: number
  // Relacionamentos carregados apenas quando a query pede.
  material?: Material
  pedido_item?: PedidoItem
}

export type PedidoItemComMateriais = PedidoItem & {
  pedido_itens_materiais?: PedidoItemMaterial[]
}

// Resultado usado em cards antigos do dashboard.
export type DashboardMetrics = {
  total_pedidos_mes: number
  receita_mes: number
  pedidos_pendentes: number
  materiais_baixo_estoque: number
}

// Tipos do montador de pedidos.

export type CategoriaProduto = {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  ordem: number
  data_pedido?: string
  updated_at: string
}

export type VariacaoTipo = {
  id: string
  categoria_id?: string
  nome: string
  descricao: string | null
  ativo: boolean
  ordem: number
  data_pedido?: string
  updated_at: string
  // Relacionamentos carregados apenas quando a query pede.
  categoria?: CategoriaProduto
}

export type GrupoComponente = {
  id: string
  categoria_id?: string
  nome: string
  descricao: string | null
  obrigatorio: boolean
  permite_multipla_selecao: boolean
  ordem: number
  ativo: boolean
  data_pedido?: string
  updated_at: string
  // Relacionamentos carregados apenas quando a query pede.
  categoria?: CategoriaProduto
  componentes?: ComponenteEstoque[]
}

export type ComponenteEstoque = {
  id: string
  grupo_id: string
  material_id: string
  margem_lucro: number
  ativo: boolean
  ordem: number
  data_pedido: string
  updated_at: string
  // Relacionamentos carregados apenas quando a query pede.
  grupo?: GrupoComponente
  material?: Material
}

export type ConfiguracaoMaodeobra = {
  id: string
  categoria_id: string
  valor_maodeobra: number
  descricao: string | null
  updated_at: string
  // Relacionamentos carregados apenas quando a query pede.
  categoria?: CategoriaProduto
}

export type TipoComponenteConfig = {
  nome: string
  ativo: boolean
  total_grupos: number
  categorias: string[]
  materiais_vinculados: number
  ordem: number
}

// Formato achatado usado pela tela do montador.
export type CategoriaCompleta = {
  categoria_id: string
  categoria_nome: string
  categoria_descricao: string | null
  categoria_ativo: boolean
  variacao_id: string | null
  variacao_nome: string | null
  variacao_descricao: string | null
  variacao_ativa: boolean | null
  grupo_id: string | null
  grupo_nome: string | null
  grupo_descricao: string | null
  grupo_obrigatorio: boolean | null
  permite_multipla_selecao: boolean | null
  material_id: string | null
  material_nome: string | null
  preco_compra: number | null
  custo_unitario: number | null
  margem_lucro: number | null
  preco_sugerido: number | null
  estoque_quantidade: number | null
  valor_maodeobra: number | null
}

export type ComponenteDisponivel = {
  grupo_id: string
  grupo_nome: string
  categoria_id: string
  material_id: string
  material_nome: string
  custo_unitario: number
  margem_lucro: number
  preco_venda: number
  estoque_atual: number
  imagem_url: string | null
}
