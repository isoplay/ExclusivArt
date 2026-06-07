BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.pedido_acompanhamento_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  CONSTRAINT pedido_acompanhamento_links_pedido_unique UNIQUE (pedido_id),
  CONSTRAINT pedido_acompanhamento_links_token_hash_len CHECK (char_length(token_hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_pedido_acompanhamento_links_token_hash
  ON public.pedido_acompanhamento_links(token_hash);

CREATE INDEX IF NOT EXISTS idx_pedido_acompanhamento_links_pedido_id
  ON public.pedido_acompanhamento_links(pedido_id);

CREATE OR REPLACE FUNCTION public.update_pedido_acompanhamento_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_pedido_acompanhamento_links_updated_at
  ON public.pedido_acompanhamento_links;

CREATE TRIGGER update_pedido_acompanhamento_links_updated_at
  BEFORE UPDATE ON public.pedido_acompanhamento_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_pedido_acompanhamento_links_updated_at();

ALTER TABLE public.pedido_acompanhamento_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_full_access ON public.pedido_acompanhamento_links;
CREATE POLICY authenticated_full_access
  ON public.pedido_acompanhamento_links
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_acompanhamento_links TO authenticated;

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
