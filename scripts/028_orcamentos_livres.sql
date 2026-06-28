BEGIN;

CREATE TABLE IF NOT EXISTS public.orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nome TEXT NOT NULL,
  cliente_contato TEXT,
  cliente_endereco TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'enviado', 'aprovado', 'recusado', 'convertido', 'cancelado')),
  slug_publico TEXT UNIQUE,
  validade DATE,
  prazo_estimado DATE,
  quantidade_total INTEGER NOT NULL DEFAULT 1 CHECK (quantidade_total > 0),
  valor_total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
  custo_total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (custo_total >= 0),
  margem_percentual NUMERIC(8, 2) NOT NULL DEFAULT 100 CHECK (margem_percentual >= 0),
  observacao_cliente TEXT,
  observacoes_internas TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orcamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES public.categorias_produtos(id),
  nome_produto TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  custo_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (custo_unitario >= 0),
  mao_obra_unitaria NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (mao_obra_unitaria >= 0),
  valor_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  valor_total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orcamento_componentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_item_id UUID NOT NULL REFERENCES public.orcamento_itens(id) ON DELETE CASCADE,
  grupo_id UUID REFERENCES public.grupos_componentes(id),
  grupo_nome TEXT NOT NULL,
  material_id UUID REFERENCES public.materiais(id),
  material_nome TEXT NOT NULL,
  quantidade_por_item NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (quantidade_por_item > 0),
  unidade TEXT NOT NULL DEFAULT 'un',
  custo_unitario_estimado NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (custo_unitario_estimado >= 0),
  cor_hex TEXT,
  imagem_url TEXT,
  origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('estoque', 'manual')),
  observacao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (origem <> 'estoque' OR material_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_ativos_created_at
  ON public.orcamentos (created_at DESC)
  WHERE ativo = TRUE;

CREATE INDEX IF NOT EXISTS idx_orcamentos_slug_publico
  ON public.orcamentos (slug_publico);

CREATE INDEX IF NOT EXISTS idx_orcamento_itens_orcamento_id
  ON public.orcamento_itens (orcamento_id);

CREATE INDEX IF NOT EXISTS idx_orcamento_componentes_item_id
  ON public.orcamento_componentes (orcamento_item_id);

DROP TRIGGER IF EXISTS update_orcamentos_updated_at ON public.orcamentos;
CREATE TRIGGER update_orcamentos_updated_at
  BEFORE UPDATE ON public.orcamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_orcamento_itens_updated_at ON public.orcamento_itens;
CREATE TRIGGER update_orcamento_itens_updated_at
  BEFORE UPDATE ON public.orcamento_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_orcamento_componentes_updated_at ON public.orcamento_componentes;
CREATE TRIGGER update_orcamento_componentes_updated_at
  BEFORE UPDATE ON public.orcamento_componentes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_componentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_full_access ON public.orcamentos;
CREATE POLICY owner_full_access
  ON public.orcamentos
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM app_private.usuarios_sistema AS usuario
      WHERE usuario.user_id = (SELECT auth.uid())
        AND usuario.ativo = TRUE
        AND usuario.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM app_private.usuarios_sistema AS usuario
      WHERE usuario.user_id = (SELECT auth.uid())
        AND usuario.ativo = TRUE
        AND usuario.role = 'owner'
    )
  );

DROP POLICY IF EXISTS owner_full_access ON public.orcamento_itens;
CREATE POLICY owner_full_access
  ON public.orcamento_itens
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM app_private.usuarios_sistema AS usuario
      WHERE usuario.user_id = (SELECT auth.uid())
        AND usuario.ativo = TRUE
        AND usuario.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM app_private.usuarios_sistema AS usuario
      WHERE usuario.user_id = (SELECT auth.uid())
        AND usuario.ativo = TRUE
        AND usuario.role = 'owner'
    )
  );

DROP POLICY IF EXISTS owner_full_access ON public.orcamento_componentes;
CREATE POLICY owner_full_access
  ON public.orcamento_componentes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM app_private.usuarios_sistema AS usuario
      WHERE usuario.user_id = (SELECT auth.uid())
        AND usuario.ativo = TRUE
        AND usuario.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM app_private.usuarios_sistema AS usuario
      WHERE usuario.user_id = (SELECT auth.uid())
        AND usuario.ativo = TRUE
        AND usuario.role = 'owner'
    )
  );

REVOKE ALL ON TABLE public.orcamentos, public.orcamento_itens, public.orcamento_componentes
  FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.orcamentos, public.orcamento_itens, public.orcamento_componentes
  TO authenticated;

CREATE OR REPLACE FUNCTION public.salvar_orcamento_atomico(
  p_orcamento_id UUID,
  p_orcamento JSONB,
  p_itens JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_orcamento_id UUID;
  v_status_atual TEXT;
  v_item JSONB;
  v_componente JSONB;
  v_item_id UUID;
  v_item_count INTEGER;
  v_component_count INTEGER := 0;
  v_item_order INTEGER;
  v_component_order INTEGER;
  v_origem TEXT;
  v_grupo_id UUID;
  v_grupo_nome TEXT;
  v_material_id UUID;
  v_material_nome TEXT;
  v_unidade TEXT;
  v_custo_unitario NUMERIC;
  v_cor_hex TEXT;
  v_imagem_url TEXT;
BEGIN
  IF jsonb_typeof(p_orcamento) <> 'object'
    OR jsonb_typeof(p_itens) <> 'array'
  THEN
    RAISE EXCEPTION 'Payload de orçamento inválido';
  END IF;

  v_item_count := jsonb_array_length(p_itens);
  IF v_item_count < 1 OR v_item_count > 25 THEN
    RAISE EXCEPTION 'Quantidade de itens fora do limite';
  END IF;

  IF p_orcamento_id IS NULL THEN
    INSERT INTO public.orcamentos (
      cliente_nome,
      cliente_contato,
      cliente_endereco,
      status,
      validade,
      prazo_estimado,
      quantidade_total,
      valor_total,
      custo_total,
      margem_percentual,
      observacao_cliente,
      observacoes_internas
    )
    VALUES (
      p_orcamento->>'cliente_nome',
      NULLIF(p_orcamento->>'cliente_contato', ''),
      NULLIF(p_orcamento->>'cliente_endereco', ''),
      'rascunho',
      NULLIF(p_orcamento->>'validade', '')::DATE,
      NULLIF(p_orcamento->>'prazo_estimado', '')::DATE,
      (p_orcamento->>'quantidade_total')::INTEGER,
      (p_orcamento->>'valor_total')::NUMERIC,
      (p_orcamento->>'custo_total')::NUMERIC,
      (p_orcamento->>'margem_percentual')::NUMERIC,
      NULLIF(p_orcamento->>'observacao_cliente', ''),
      NULLIF(p_orcamento->>'observacoes_internas', '')
    )
    RETURNING id INTO v_orcamento_id;
  ELSE
    SELECT status
    INTO v_status_atual
    FROM public.orcamentos
    WHERE id = p_orcamento_id
      AND ativo = TRUE
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Orçamento não encontrado';
    END IF;
    IF v_status_atual = 'convertido' THEN
      RAISE EXCEPTION 'Orçamento convertido não pode ser regravado';
    END IF;

    UPDATE public.orcamentos
    SET
      cliente_nome = p_orcamento->>'cliente_nome',
      cliente_contato = NULLIF(p_orcamento->>'cliente_contato', ''),
      cliente_endereco = NULLIF(p_orcamento->>'cliente_endereco', ''),
      validade = NULLIF(p_orcamento->>'validade', '')::DATE,
      prazo_estimado = NULLIF(p_orcamento->>'prazo_estimado', '')::DATE,
      quantidade_total = (p_orcamento->>'quantidade_total')::INTEGER,
      valor_total = (p_orcamento->>'valor_total')::NUMERIC,
      custo_total = (p_orcamento->>'custo_total')::NUMERIC,
      margem_percentual = (p_orcamento->>'margem_percentual')::NUMERIC,
      observacao_cliente = NULLIF(p_orcamento->>'observacao_cliente', ''),
      observacoes_internas = NULLIF(p_orcamento->>'observacoes_internas', '')
    WHERE id = p_orcamento_id;

    v_orcamento_id := p_orcamento_id;
    DELETE FROM public.orcamento_itens WHERE orcamento_id = v_orcamento_id;
  END IF;

  FOR v_item, v_item_order IN
    SELECT value, (ordinality - 1)::INTEGER
    FROM jsonb_array_elements(p_itens) WITH ORDINALITY
  LOOP
    IF jsonb_typeof(COALESCE(v_item->'componentes', '[]'::JSONB)) <> 'array'
      OR jsonb_array_length(COALESCE(v_item->'componentes', '[]'::JSONB)) > 50
    THEN
      RAISE EXCEPTION 'Componentes do item fora do limite';
    END IF;

    v_component_count := v_component_count
      + jsonb_array_length(COALESCE(v_item->'componentes', '[]'::JSONB));
    IF v_component_count > 200 THEN
      RAISE EXCEPTION 'Total de componentes fora do limite';
    END IF;

    INSERT INTO public.orcamento_itens (
      orcamento_id,
      categoria_id,
      nome_produto,
      quantidade,
      custo_unitario,
      mao_obra_unitaria,
      valor_unitario,
      valor_total,
      ordem
    )
    VALUES (
      v_orcamento_id,
      NULLIF(v_item->>'categoria_id', '')::UUID,
      v_item->>'nome_produto',
      (v_item->>'quantidade')::INTEGER,
      (v_item->>'custo_unitario')::NUMERIC,
      (v_item->>'mao_obra_unitaria')::NUMERIC,
      (v_item->>'valor_unitario')::NUMERIC,
      (v_item->>'valor_total')::NUMERIC,
      v_item_order
    )
    RETURNING id INTO v_item_id;

    FOR v_componente, v_component_order IN
      SELECT value, (ordinality - 1)::INTEGER
      FROM jsonb_array_elements(COALESCE(v_item->'componentes', '[]'::JSONB))
        WITH ORDINALITY
    LOOP
      v_origem := v_componente->>'origem';
      IF v_origem NOT IN ('estoque', 'manual') THEN
        RAISE EXCEPTION 'Origem de componente inválida';
      END IF;

      v_grupo_id := NULLIF(v_componente->>'grupo_id', '')::UUID;
      v_grupo_nome := v_componente->>'grupo_nome';
      IF v_grupo_id IS NOT NULL THEN
        SELECT nome
        INTO v_grupo_nome
        FROM public.grupos_componentes
        WHERE id = v_grupo_id
          AND ativo = TRUE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Grupo de componente indisponível';
        END IF;
      END IF;

      IF v_origem = 'estoque' THEN
        v_material_id := NULLIF(v_componente->>'material_id', '')::UUID;
        SELECT nome, custo_unitario, unidade, cor, imagem_url
        INTO v_material_nome, v_custo_unitario, v_unidade, v_cor_hex, v_imagem_url
        FROM public.materiais
        WHERE id = v_material_id
          AND ativo = TRUE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Material de estoque indisponível';
        END IF;
      ELSE
        v_material_id := NULL;
        v_material_nome := v_componente->>'material_nome';
        v_custo_unitario := (v_componente->>'custo_unitario_estimado')::NUMERIC;
        v_unidade := v_componente->>'unidade';
        v_cor_hex := NULLIF(v_componente->>'cor_hex', '');
        v_imagem_url := NULL;
      END IF;

      INSERT INTO public.orcamento_componentes (
        orcamento_item_id,
        grupo_id,
        grupo_nome,
        material_id,
        material_nome,
        quantidade_por_item,
        unidade,
        custo_unitario_estimado,
        cor_hex,
        imagem_url,
        origem,
        observacao,
        ordem
      )
      VALUES (
        v_item_id,
        v_grupo_id,
        v_grupo_nome,
        v_material_id,
        v_material_nome,
        (v_componente->>'quantidade_por_item')::NUMERIC,
        v_unidade,
        v_custo_unitario,
        v_cor_hex,
        v_imagem_url,
        v_origem,
        NULLIF(v_componente->>'observacao', ''),
        v_component_order
      );
    END LOOP;
  END LOOP;

  RETURN v_orcamento_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_status_orcamento(
  p_orcamento_id UUID,
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_status_atual TEXT;
  v_transicao_valida BOOLEAN := FALSE;
BEGIN
  SELECT status
  INTO v_status_atual
  FROM public.orcamentos
  WHERE id = p_orcamento_id
    AND ativo = TRUE
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  IF v_status_atual = p_status THEN
    RETURN TRUE;
  END IF;

  v_transicao_valida := CASE v_status_atual
    WHEN 'rascunho' THEN p_status IN ('enviado', 'cancelado')
    WHEN 'enviado' THEN p_status IN ('rascunho', 'aprovado', 'recusado', 'cancelado')
    WHEN 'aprovado' THEN p_status IN ('convertido', 'cancelado')
    WHEN 'recusado' THEN p_status IN ('rascunho', 'cancelado')
    WHEN 'cancelado' THEN p_status = 'rascunho'
    ELSE FALSE
  END;

  IF NOT v_transicao_valida THEN
    RAISE EXCEPTION 'Transição de status inválida';
  END IF;

  UPDATE public.orcamentos
  SET status = p_status
  WHERE id = p_orcamento_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_orcamento_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    'cliente_nome', o.cliente_nome,
    'orcamento_codigo', 'EXO-' || to_char(o.created_at, 'YYYY') || '-' || upper(substr(o.id::text, 1, 8)),
    'status', o.status,
    'validade', o.validade,
    'prazo_estimado', o.prazo_estimado,
    'quantidade_total', o.quantidade_total,
    'valor_total', o.valor_total,
    'observacao_cliente', o.observacao_cliente,
    'created_at', o.created_at,
    'itens', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'nome_produto', oi.nome_produto,
          'quantidade', oi.quantidade,
          'valor_total', oi.valor_total,
          'componentes', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'grupo_nome', oc.grupo_nome,
                'material_nome', oc.material_nome,
                'quantidade_por_item', oc.quantidade_por_item,
                'unidade', oc.unidade,
                'cor_hex', oc.cor_hex,
                'origem', oc.origem
              )
              ORDER BY oc.ordem, oc.created_at
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
              WHERE orcamento_item_id = oi.id
              ORDER BY ordem, created_at
              LIMIT 50
            ) AS oc
          ), '[]'::JSONB)
        )
        ORDER BY oi.ordem, oi.created_at
      )
      FROM (
        SELECT
          id,
          nome_produto,
          quantidade,
          valor_total,
          ordem,
          created_at
        FROM public.orcamento_itens
        WHERE orcamento_id = o.id
        ORDER BY ordem, created_at
        LIMIT 25
      ) AS oi
    ), '[]'::JSONB)
  )
  INTO v_payload
  FROM public.orcamentos AS o
  WHERE o.slug_publico = p_slug
    AND o.ativo = TRUE
    AND o.deleted_at IS NULL
  LIMIT 1;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_orcamento_atomico(UUID, JSONB, JSONB)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atualizar_status_orcamento(UUID, TEXT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_public_orcamento_by_slug(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_orcamento_atomico(UUID, JSONB, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_status_orcamento(UUID, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_orcamento_by_slug(TEXT)
  TO anon, authenticated;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
