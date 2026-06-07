BEGIN;

-- Add short public tracking slug to pedidos.
-- Used for canonical short links of the form /p/EXA-XXXX-YYYYYYYY
-- Slugs are unique, short and non-predictable (generated with entropy).
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS slug_acompanhamento TEXT;

-- Uniqueness constraint for slugs (only non-null values matter for public access keys).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_slug_acompanhamento_unique
  ON public.pedidos (slug_acompanhamento)
  WHERE slug_acompanhamento IS NOT NULL;

-- Fast lookup index for the public slug route.
CREATE INDEX IF NOT EXISTS idx_pedidos_slug_acompanhamento
  ON public.pedidos (slug_acompanhamento);

-- Public RPC to fetch tracking payload using the slug (no token required,
-- the slug itself acts as the bearer for the public page, similar to the token flow).
-- Mirrors the payload and security posture of get_public_pedido_acompanhamento(text).
CREATE OR REPLACE FUNCTION public.get_public_pedido_acompanhamento_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido_id UUID;
  v_payload JSONB;
BEGIN
  IF p_slug IS NULL
    OR char_length(p_slug) < 8
    OR char_length(p_slug) > 64
    OR p_slug !~ '^[A-Za-z0-9_-]+$'
  THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_pedido_id
  FROM public.pedidos
  WHERE slug_acompanhamento = p_slug
  LIMIT 1;

  IF v_pedido_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build identical public payload shape used by the existing token-based RPC
  -- and the OrderTrackingData UI component.
  SELECT jsonb_build_object(
    'cliente_nome', p.cliente_nome,
    'pedido_codigo', 'EXA-' || to_char(COALESCE(p.data_pedido, NOW()), 'YYYY') || '-' || upper(substr(p.id::text, 1, 8)),
    'status', p.status,
    'prazo_entrega', p.prazo_entrega,
    'produto_resumo', COALESCE(NULLIF(item.produto_resumo, ''), 'Pedido personalizado'),
    'quantidade_total', COALESCE(item.quantidade_total, 0),
    'valor_total', p.valor_total,
    'data_pedido', p.data_pedido
  )
  INTO v_payload
  FROM public.pedidos p
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(pi.quantidade), 0)::INTEGER AS quantidade_total,
      string_agg(DISTINCT COALESCE(pr.nome, 'Produto personalizado'), ', ' ORDER BY COALESCE(pr.nome, 'Produto personalizado')) AS produto_resumo
    FROM public.pedido_itens pi
    LEFT JOIN public.produtos pr ON pr.id = pi.produto_id
    WHERE pi.pedido_id = p.id
  ) item ON true
  WHERE p.id = v_pedido_id;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_pedido_acompanhamento_by_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_pedido_acompanhamento_by_slug(TEXT) TO anon, authenticated;

COMMIT;
