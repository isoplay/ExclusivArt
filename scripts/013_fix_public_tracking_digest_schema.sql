BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_pedido_acompanhamento(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_hash TEXT;
  v_link RECORD;
  v_payload JSONB;
BEGIN
  IF p_token IS NULL
    OR char_length(p_token) < 32
    OR char_length(p_token) > 128
    OR p_token !~ '^[A-Za-z0-9_-]+$'
  THEN
    RETURN NULL;
  END IF;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT id, pedido_id
  INTO v_link
  FROM public.pedido_acompanhamento_links
  WHERE token_hash = v_token_hash
    AND ativo = true
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;

  IF v_link.pedido_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.pedido_acompanhamento_links
  SET last_accessed_at = NOW()
  WHERE id = v_link.id;

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
  WHERE p.id = v_link.pedido_id;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_pedido_acompanhamento(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_pedido_acompanhamento(TEXT) TO anon, authenticated;

COMMIT;
