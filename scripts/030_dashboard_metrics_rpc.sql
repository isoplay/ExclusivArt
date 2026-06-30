BEGIN;

-- Consolida as leituras do dashboard em uma unica ida ao banco.
-- SECURITY INVOKER preserva as mesmas policies RLS das consultas diretas.
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  WITH limites AS (
    SELECT
      date_trunc('month', CURRENT_TIMESTAMP) AS inicio_mes,
      date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month' AS fim_mes,
      CURRENT_DATE AS hoje
  ),
  pedidos_mes AS (
    SELECT pedido.*
    FROM public.pedidos AS pedido
    CROSS JOIN limites
    WHERE pedido.ativo = TRUE
      AND pedido.data_pedido >= limites.inicio_mes
      AND pedido.data_pedido < limites.fim_mes
  ),
  financeiro_dias AS (
    SELECT
      dia::DATE AS dia,
      COALESCE((
        SELECT SUM(pedido.valor_total)
        FROM public.pedidos AS pedido
        WHERE pedido.ativo = TRUE
          AND pedido.status IN ('pronto', 'entregue')
          AND pedido.data_pedido >= dia
          AND pedido.data_pedido < dia + INTERVAL '1 day'
      ), 0) AS receita,
      COALESCE((
        SELECT SUM(despesa.valor)
        FROM public.despesas AS despesa
        WHERE despesa.ativo = TRUE
          AND despesa.deleted_at IS NULL
          AND despesa.data = dia::DATE
      ), 0) AS despesas
    FROM limites
    CROSS JOIN generate_series(
      limites.hoje - 6,
      limites.hoje,
      INTERVAL '1 day'
    ) AS dia
  )
  SELECT jsonb_build_object(
    'total_pedidos_mes',
      (SELECT COUNT(*) FROM pedidos_mes),
    'receita_mes',
      COALESCE((
        SELECT SUM(pedido.valor_total)
        FROM pedidos_mes AS pedido
        WHERE pedido.status IN ('pronto', 'entregue')
      ), 0),
    'receita_pedidos_sistema',
      COALESCE((
        SELECT SUM(pedido.valor_total)
        FROM public.pedidos AS pedido
        WHERE pedido.ativo = TRUE
          AND pedido.status IN ('pronto', 'entregue')
      ), 0),
    'receita_historica',
      COALESCE((SELECT SUM(venda.valor_total) FROM public.vendas_historicas AS venda), 0),
    'pedidos_pendentes',
      (
        SELECT COUNT(*)
        FROM public.pedidos AS pedido
        WHERE pedido.ativo = TRUE
          AND pedido.status IN ('orcamento', 'confirmado', 'em_producao', 'pronto')
      ),
    'materiais_sem_estoque',
      (
        SELECT COUNT(*)
        FROM public.materiais AS material
        WHERE material.ativo = TRUE
          AND COALESCE(material.quantidade_atual, material.quantidade, 0) <= 0
      ),
    'materiais_baixo_estoque',
      (
        SELECT COUNT(*)
        FROM public.materiais AS material
        WHERE material.ativo = TRUE
          AND COALESCE(material.quantidade_atual, material.quantidade, 0)
            <= COALESCE(material.quantidade_minima, 30)
      ),
    'despesas_total_mes',
      COALESCE((
        SELECT SUM(despesa.valor)
        FROM public.despesas AS despesa
        CROSS JOIN limites
        WHERE despesa.ativo = TRUE
          AND despesa.deleted_at IS NULL
          AND despesa.data >= limites.inicio_mes::DATE
          AND despesa.data < limites.fim_mes::DATE
      ), 0),
    'pedidos_por_status',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('status', resumo.status, 'total', resumo.total)
          ORDER BY resumo.status
        )
        FROM (
          SELECT pedido.status, COUNT(*) AS total
          FROM pedidos_mes AS pedido
          GROUP BY pedido.status
        ) AS resumo
      ), '[]'::JSONB),
    'financeiro_ultimos_dias',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'data', financeiro.dia,
            'receita', financeiro.receita,
            'despesas', financeiro.despesas
          )
          ORDER BY financeiro.dia
        )
        FROM financeiro_dias AS financeiro
      ), '[]'::JSONB),
    'pedidos_recentes',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(pedido_recente) ORDER BY pedido_recente.data_pedido DESC)
        FROM (
          SELECT pedido.*
          FROM public.pedidos AS pedido
          WHERE pedido.ativo = TRUE
          ORDER BY pedido.data_pedido DESC
          LIMIT 5
        ) AS pedido_recente
      ), '[]'::JSONB),
    'proximas_entregas',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(proxima_entrega) ORDER BY proxima_entrega.prazo_entrega)
        FROM (
          SELECT pedido.*
          FROM public.pedidos AS pedido
          CROSS JOIN limites
          WHERE pedido.ativo = TRUE
            AND pedido.status IN ('orcamento', 'confirmado', 'em_producao', 'pronto')
            AND pedido.prazo_entrega IS NOT NULL
            AND pedido.prazo_entrega >= limites.hoje
            AND pedido.prazo_entrega <= limites.hoje + 7
          ORDER BY pedido.prazo_entrega
          LIMIT 7
        ) AS proxima_entrega
      ), '[]'::JSONB),
    'materiais_low_stock',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(material_baixo))
        FROM (
          SELECT material.*
          FROM public.materiais AS material
          WHERE material.ativo = TRUE
            AND COALESCE(material.quantidade_atual, material.quantidade, 0)
              <= COALESCE(material.quantidade_minima, 30)
          LIMIT 5
        ) AS material_baixo
      ), '[]'::JSONB)
  );
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics() TO authenticated;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
