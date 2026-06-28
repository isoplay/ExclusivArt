BEGIN;

-- Registros financeiros precisam preservar histórico e auditoria.
ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_despesas_ativas_data
  ON public.despesas (data DESC)
  WHERE ativo = TRUE AND deleted_at IS NULL;

-- Buckets públicos entregam objetos pela URL sem uma policy SELECT ampla.
-- Upload, alteração e exclusão continuam restritos ao owner cadastrado.
DROP POLICY IF EXISTS imagens_estoque_select ON storage.objects;
DROP POLICY IF EXISTS imagens_estoque_insert ON storage.objects;
DROP POLICY IF EXISTS imagens_estoque_update ON storage.objects;
DROP POLICY IF EXISTS imagens_estoque_delete ON storage.objects;

CREATE POLICY imagens_estoque_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'imagens-estoque'
  AND EXISTS (
    SELECT 1
    FROM app_private.usuarios_sistema AS usuario
    WHERE usuario.user_id = (SELECT auth.uid())
      AND usuario.ativo = TRUE
      AND usuario.role = 'owner'
  )
);

CREATE POLICY imagens_estoque_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'imagens-estoque'
  AND EXISTS (
    SELECT 1
    FROM app_private.usuarios_sistema AS usuario
    WHERE usuario.user_id = (SELECT auth.uid())
      AND usuario.ativo = TRUE
      AND usuario.role = 'owner'
  )
)
WITH CHECK (
  bucket_id = 'imagens-estoque'
  AND EXISTS (
    SELECT 1
    FROM app_private.usuarios_sistema AS usuario
    WHERE usuario.user_id = (SELECT auth.uid())
      AND usuario.ativo = TRUE
      AND usuario.role = 'owner'
  )
);

CREATE POLICY imagens_estoque_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'imagens-estoque'
  AND EXISTS (
    SELECT 1
    FROM app_private.usuarios_sistema AS usuario
    WHERE usuario.user_id = (SELECT auth.uid())
      AND usuario.ativo = TRUE
      AND usuario.role = 'owner'
  )
);

-- A leitura por token é deliberadamente SECURITY DEFINER para atravessar a RLS,
-- mas permanece somente leitura e retorna um JSON explicitamente público.
CREATE OR REPLACE FUNCTION public.get_public_pedido_acompanhamento(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
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

  SELECT link.pedido_id, link.token_hash
  INTO v_link
  FROM public.pedido_acompanhamento_links AS link
  JOIN public.pedidos AS pedido
    ON pedido.id = link.pedido_id
   AND pedido.ativo = TRUE
  WHERE link.token_hash = v_token_hash
    AND link.ativo = TRUE
    AND (link.expires_at IS NULL OR link.expires_at > now())
  LIMIT 1;

  IF v_link.pedido_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'cliente_nome', pedido.cliente_nome,
    'pedido_codigo', 'EXA-' || to_char(COALESCE(pedido.data_pedido, now()), 'YYYY')
      || '-' || upper(substr(encode(extensions.digest(v_link.token_hash, 'sha256'), 'hex'), 1, 8)),
    'status', pedido.status,
    'prazo_entrega', pedido.prazo_entrega,
    'produto_resumo', COALESCE(NULLIF(item.produto_resumo, ''), 'Pedido personalizado'),
    'quantidade_total', COALESCE(item.quantidade_total, 0),
    'valor_total', pedido.valor_total,
    'observacao_cliente', NULLIF(btrim(pedido.observacao_cliente), ''),
    'data_pedido', pedido.data_pedido
  )
  INTO v_payload
  FROM public.pedidos AS pedido
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(pedido_item.quantidade), 0)::INTEGER AS quantidade_total,
      string_agg(
        DISTINCT COALESCE(produto.nome, 'Produto personalizado'),
        ', '
        ORDER BY COALESCE(produto.nome, 'Produto personalizado')
      ) AS produto_resumo
    FROM (
      SELECT produto_id, quantidade
      FROM public.pedido_itens
      WHERE pedido_id = pedido.id
      ORDER BY id
      LIMIT 50
    ) AS pedido_item
    LEFT JOIN public.produtos AS produto
      ON produto.id = pedido_item.produto_id
  ) AS item ON TRUE
  WHERE pedido.id = v_link.pedido_id
    AND pedido.ativo = TRUE;

  RETURN v_payload;
END;
$function$;

-- O slug usa o mesmo registro de controle do token: desativação e expiração
-- invalidam as duas formas de link sem revelar se o pedido existiu.
CREATE OR REPLACE FUNCTION public.get_public_pedido_acompanhamento_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
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

  SELECT pedido.id
  INTO v_pedido_id
  FROM public.pedidos AS pedido
  JOIN public.pedido_acompanhamento_links AS link
    ON link.pedido_id = pedido.id
   AND link.ativo = TRUE
   AND (link.expires_at IS NULL OR link.expires_at > now())
  WHERE pedido.slug_acompanhamento = p_slug
    AND pedido.ativo = TRUE
  LIMIT 1;

  IF v_pedido_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'cliente_nome', pedido.cliente_nome,
    'pedido_codigo', 'EXA-' || to_char(COALESCE(pedido.data_pedido, now()), 'YYYY')
      || '-' || upper(substr(encode(extensions.digest(p_slug, 'sha256'), 'hex'), 1, 8)),
    'status', pedido.status,
    'prazo_entrega', pedido.prazo_entrega,
    'produto_resumo', COALESCE(NULLIF(item.produto_resumo, ''), 'Pedido personalizado'),
    'quantidade_total', COALESCE(item.quantidade_total, 0),
    'valor_total', pedido.valor_total,
    'observacao_cliente', NULLIF(btrim(pedido.observacao_cliente), ''),
    'data_pedido', pedido.data_pedido
  )
  INTO v_payload
  FROM public.pedidos AS pedido
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(pedido_item.quantidade), 0)::INTEGER AS quantidade_total,
      string_agg(
        DISTINCT COALESCE(produto.nome, 'Produto personalizado'),
        ', '
        ORDER BY COALESCE(produto.nome, 'Produto personalizado')
      ) AS produto_resumo
    FROM (
      SELECT produto_id, quantidade
      FROM public.pedido_itens
      WHERE pedido_id = pedido.id
      ORDER BY id
      LIMIT 50
    ) AS pedido_item
    LEFT JOIN public.produtos AS produto
      ON produto.id = pedido_item.produto_id
  ) AS item ON TRUE
  WHERE pedido.id = v_pedido_id
    AND pedido.ativo = TRUE;

  RETURN v_payload;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_orcamento_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE
  v_payload JSONB;
BEGIN
  IF p_slug IS NULL
    OR char_length(p_slug) < 8
    OR char_length(p_slug) > 64
    OR p_slug !~ '^[A-Za-z0-9_-]+$'
  THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'cliente_nome', orcamento.cliente_nome,
    'orcamento_codigo', 'EXO-' || to_char(orcamento.created_at, 'YYYY')
      || '-' || upper(substr(encode(extensions.digest(p_slug, 'sha256'), 'hex'), 1, 8)),
    'status', orcamento.status,
    'validade', orcamento.validade,
    'prazo_estimado', orcamento.prazo_estimado,
    'quantidade_total', orcamento.quantidade_total,
    'valor_total', orcamento.valor_total,
    'observacao_cliente', orcamento.observacao_cliente,
    'created_at', orcamento.created_at,
    'itens', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'nome_produto', item.nome_produto,
          'quantidade', item.quantidade,
          'valor_total', item.valor_total,
          'componentes', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'grupo_nome', componente.grupo_nome,
                'material_nome', componente.material_nome,
                'quantidade_por_item', componente.quantidade_por_item,
                'unidade', componente.unidade,
                'cor_hex', componente.cor_hex,
                'origem', componente.origem
              )
              ORDER BY componente.ordem, componente.created_at
            )
            FROM (
              SELECT
                grupo_nome,
                material_nome,
                quantidade_por_item,
                unidade,
                cor_hex,
                origem,
                ordem,
                created_at
              FROM public.orcamento_componentes
              WHERE orcamento_item_id = item.id
              ORDER BY ordem, created_at
              LIMIT 50
            ) AS componente
          ), '[]'::JSONB)
        )
        ORDER BY item.ordem, item.created_at
      )
      FROM (
        SELECT id, nome_produto, quantidade, valor_total, ordem, created_at
        FROM public.orcamento_itens
        WHERE orcamento_id = orcamento.id
        ORDER BY ordem, created_at
        LIMIT 25
      ) AS item
    ), '[]'::JSONB)
  )
  INTO v_payload
  FROM public.orcamentos AS orcamento
  WHERE orcamento.slug_publico = p_slug
    AND orcamento.ativo = TRUE
    AND orcamento.deleted_at IS NULL
    AND (orcamento.validade IS NULL OR orcamento.validade >= CURRENT_DATE)
  LIMIT 1;

  RETURN v_payload;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_pedido_acompanhamento(TEXT)
  FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.get_public_pedido_acompanhamento_by_slug(TEXT)
  FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.get_public_orcamento_by_slug(TEXT)
  FROM PUBLIC, authenticated;

-- Funções auxiliares e de trigger não são endpoints públicos. O privilégio
-- EXECUTE concedido implicitamente a PUBLIC permitiria chamadas RPC indevidas.
REVOKE ALL ON FUNCTION public.atualizar_valor_pedido() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bloquear_exclusao_fisica_pedido()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.descontar_estoque_pedido()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_pedido_acompanhamento_links_updated_at()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calcular_custo_producao(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.calcular_custo_producao(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_pedido_acompanhamento(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_pedido_acompanhamento_by_slug(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_orcamento_by_slug(TEXT) TO anon;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
