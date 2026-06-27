BEGIN;

-- Pedidos nunca devem ser removidos fisicamente: o histórico financeiro,
-- a composição e as movimentações de estoque precisam continuar auditáveis.
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE public.pedidos
SET ativo = true
WHERE ativo IS NULL;

ALTER TABLE public.pedidos
  ALTER COLUMN ativo SET DEFAULT true,
  ALTER COLUMN ativo SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_ativos_data
  ON public.pedidos (data_pedido DESC)
  WHERE ativo = true;

-- Índices das FKs mais consultadas por pedidos, triggers e rotinas de arquivo.
CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido_id
  ON public.pedido_itens (pedido_id);

CREATE INDEX IF NOT EXISTS idx_pedido_itens_materiais_material_id
  ON public.pedido_itens_materiais (material_id);

CREATE INDEX IF NOT EXISTS idx_produto_materiais_material_id
  ON public.produto_materiais (material_id);

CREATE INDEX IF NOT EXISTS idx_movimentacoes_estoque_pedido_id
  ON public.movimentacoes_estoque (pedido_id);

CREATE OR REPLACE FUNCTION public.bloquear_exclusao_fisica_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION 'Pedidos nao podem ser excluidos fisicamente; use arquivar_pedido'
    USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS trigger_bloquear_exclusao_fisica_pedido
  ON public.pedidos;

CREATE TRIGGER trigger_bloquear_exclusao_fisica_pedido
  BEFORE DELETE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.bloquear_exclusao_fisica_pedido();

-- Impede novos saldos negativos sem apagar ou reescrever dados existentes.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'materiais_quantidade_atual_nonnegative'
      AND conrelid = 'public.materiais'::regclass
  ) THEN
    ALTER TABLE public.materiais
      ADD CONSTRAINT materiais_quantidade_atual_nonnegative
      CHECK (quantidade_atual IS NULL OR quantidade_atual >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.materiais
    WHERE quantidade_atual < 0
  ) THEN
    ALTER TABLE public.materiais
      VALIDATE CONSTRAINT materiais_quantidade_atual_nonnegative;
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'despesas_categoria_valida'
      AND conrelid = 'public.despesas'::regclass
  ) THEN
    ALTER TABLE public.despesas
      ADD CONSTRAINT despesas_categoria_valida
      CHECK (
        categoria IS NULL
        OR categoria IN ('material', 'ferramenta', 'embalagem', 'frete', 'marketing', 'outro', 'outros')
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'despesas_valor_nonnegative'
      AND conrelid = 'public.despesas'::regclass
  ) THEN
    ALTER TABLE public.despesas
      ADD CONSTRAINT despesas_valor_nonnegative
      CHECK (valor >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pedido_itens_valores_validos'
      AND conrelid = 'public.pedido_itens'::regclass
  ) THEN
    ALTER TABLE public.pedido_itens
      ADD CONSTRAINT pedido_itens_valores_validos
      CHECK (quantidade > 0 AND valor_unitario >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pedido_itens_materiais_quantidade_positiva'
      AND conrelid = 'public.pedido_itens_materiais'::regclass
  ) THEN
    ALTER TABLE public.pedido_itens_materiais
      ADD CONSTRAINT pedido_itens_materiais_quantidade_positiva
      CHECK (quantidade > 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'produto_materiais_quantidade_positiva'
      AND conrelid = 'public.produto_materiais'::regclass
  ) THEN
    ALTER TABLE public.produto_materiais
      ADD CONSTRAINT produto_materiais_quantidade_positiva
      CHECK (quantidade_usada > 0)
      NOT VALID;
  END IF;
END;
$do$;

-- A baixa de estoque bloqueia todos os materiais em ordem estável antes de
-- validar. Assim dois pedidos simultâneos não conseguem consumir o mesmo saldo.
CREATE OR REPLACE FUNCTION public.descontar_estoque_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uso RECORD;
  estoque_atual NUMERIC;
  faltas TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NEW.status IN ('em_producao', 'pronto', 'entregue')
     AND NOT COALESCE(NEW.estoque_baixado, false) THEN

    FOR uso IN
      SELECT
        COALESCE(pim.material_id, pm.material_id) AS material_id,
        SUM(COALESCE(pim.quantidade, pm.quantidade_usada * pi.quantidade)) AS total_usado
      FROM public.pedido_itens pi
      LEFT JOIN public.pedido_itens_materiais pim
        ON pim.pedido_item_id = pi.id
      LEFT JOIN public.produto_materiais pm
        ON pm.produto_id = pi.produto_id
       AND pim.material_id IS NULL
      WHERE pi.pedido_id = NEW.id
        AND (pim.material_id IS NOT NULL OR pm.material_id IS NOT NULL)
      GROUP BY COALESCE(pim.material_id, pm.material_id)
      ORDER BY COALESCE(pim.material_id, pm.material_id)
    LOOP
      SELECT COALESCE(material.quantidade_atual, material.quantidade, 0)
      INTO estoque_atual
      FROM public.materiais AS material
      WHERE material.id = uso.material_id
        AND material.ativo = true
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Material ativo nao encontrado ao baixar estoque: %', uso.material_id
          USING ERRCODE = 'P0002';
      END IF;

      IF estoque_atual < uso.total_usado THEN
        faltas := array_append(
          faltas,
          format(
            '%s (faltam %s)',
            (
              SELECT material.nome
              FROM public.materiais AS material
              WHERE material.id = uso.material_id
            ),
            uso.total_usado - estoque_atual
          )
        );
      END IF;
    END LOOP;

    IF cardinality(faltas) > 0 THEN
      RAISE EXCEPTION 'Estoque insuficiente ao baixar materiais: %', array_to_string(faltas, ', ')
        USING ERRCODE = '22003';
    END IF;

    WITH uso_total AS (
      SELECT
        COALESCE(pim.material_id, pm.material_id) AS material_id,
        SUM(COALESCE(pim.quantidade, pm.quantidade_usada * pi.quantidade)) AS total_usado
      FROM public.pedido_itens pi
      LEFT JOIN public.pedido_itens_materiais pim
        ON pim.pedido_item_id = pi.id
      LEFT JOIN public.produto_materiais pm
        ON pm.produto_id = pi.produto_id
       AND pim.material_id IS NULL
      WHERE pi.pedido_id = NEW.id
        AND (pim.material_id IS NOT NULL OR pm.material_id IS NOT NULL)
      GROUP BY COALESCE(pim.material_id, pm.material_id)
    )
    INSERT INTO public.movimentacoes_estoque (
      material_id,
      tipo,
      quantidade,
      motivo,
      pedido_id
    )
    SELECT
      uso_total.material_id,
      'saida',
      uso_total.total_usado,
      CASE
        WHEN NEW.status = 'em_producao' THEN 'Pedido em producao: ' || NEW.cliente_nome
        WHEN NEW.status = 'pronto' THEN 'Pedido pronto: ' || NEW.cliente_nome
        ELSE 'Pedido entregue: ' || NEW.cliente_nome
      END,
      NEW.id
    FROM uso_total;

    WITH uso_total AS (
      SELECT
        COALESCE(pim.material_id, pm.material_id) AS material_id,
        SUM(COALESCE(pim.quantidade, pm.quantidade_usada * pi.quantidade)) AS total_usado
      FROM public.pedido_itens pi
      LEFT JOIN public.pedido_itens_materiais pim
        ON pim.pedido_item_id = pi.id
      LEFT JOIN public.produto_materiais pm
        ON pm.produto_id = pi.produto_id
       AND pim.material_id IS NULL
      WHERE pi.pedido_id = NEW.id
        AND (pim.material_id IS NOT NULL OR pm.material_id IS NOT NULL)
      GROUP BY COALESCE(pim.material_id, pm.material_id)
    )
    UPDATE public.materiais AS material
    SET quantidade_atual =
      COALESCE(material.quantidade_atual, material.quantidade, 0) - uso_total.total_usado
    FROM uso_total
    WHERE material.id = uso_total.material_id;

    NEW.estoque_baixado := true;

  ELSIF NEW.status = 'cancelado'
        AND COALESCE(OLD.estoque_baixado, false) THEN

    -- Também serializa devoluções para não concorrer com ajustes manuais.
    FOR uso IN
      SELECT
        COALESCE(pim.material_id, pm.material_id) AS material_id,
        SUM(COALESCE(pim.quantidade, pm.quantidade_usada * pi.quantidade)) AS total_usado
      FROM public.pedido_itens pi
      LEFT JOIN public.pedido_itens_materiais pim
        ON pim.pedido_item_id = pi.id
      LEFT JOIN public.produto_materiais pm
        ON pm.produto_id = pi.produto_id
       AND pim.material_id IS NULL
      WHERE pi.pedido_id = NEW.id
        AND (pim.material_id IS NOT NULL OR pm.material_id IS NOT NULL)
      GROUP BY COALESCE(pim.material_id, pm.material_id)
      ORDER BY COALESCE(pim.material_id, pm.material_id)
    LOOP
      PERFORM 1
      FROM public.materiais AS material
      WHERE material.id = uso.material_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Material nao encontrado ao devolver estoque: %', uso.material_id
          USING ERRCODE = 'P0002';
      END IF;
    END LOOP;

    WITH uso_total AS (
      SELECT
        COALESCE(pim.material_id, pm.material_id) AS material_id,
        SUM(COALESCE(pim.quantidade, pm.quantidade_usada * pi.quantidade)) AS total_usado
      FROM public.pedido_itens pi
      LEFT JOIN public.pedido_itens_materiais pim
        ON pim.pedido_item_id = pi.id
      LEFT JOIN public.produto_materiais pm
        ON pm.produto_id = pi.produto_id
       AND pim.material_id IS NULL
      WHERE pi.pedido_id = NEW.id
        AND (pim.material_id IS NOT NULL OR pm.material_id IS NOT NULL)
      GROUP BY COALESCE(pim.material_id, pm.material_id)
    )
    INSERT INTO public.movimentacoes_estoque (
      material_id,
      tipo,
      quantidade,
      motivo,
      pedido_id
    )
    SELECT
      uso_total.material_id,
      'entrada',
      uso_total.total_usado,
      'Cancelamento - Pedido: ' || NEW.cliente_nome,
      NEW.id
    FROM uso_total;

    WITH uso_total AS (
      SELECT
        COALESCE(pim.material_id, pm.material_id) AS material_id,
        SUM(COALESCE(pim.quantidade, pm.quantidade_usada * pi.quantidade)) AS total_usado
      FROM public.pedido_itens pi
      LEFT JOIN public.pedido_itens_materiais pim
        ON pim.pedido_item_id = pi.id
      LEFT JOIN public.produto_materiais pm
        ON pm.produto_id = pi.produto_id
       AND pim.material_id IS NULL
      WHERE pi.pedido_id = NEW.id
        AND (pim.material_id IS NOT NULL OR pm.material_id IS NOT NULL)
      GROUP BY COALESCE(pim.material_id, pm.material_id)
    )
    UPDATE public.materiais AS material
    SET quantidade_atual =
      COALESCE(material.quantidade_atual, material.quantidade, 0) + uso_total.total_usado
    FROM uso_total
    WHERE material.id = uso_total.material_id;

    NEW.estoque_baixado := false;
  END IF;

  RETURN NEW;
END;
$function$;

-- Atualiza metadados e saldo do material na mesma transação.
CREATE OR REPLACE FUNCTION public.atualizar_material_com_estoque(
  p_material_id UUID,
  p_nome TEXT,
  p_tipo TEXT,
  p_unidade TEXT,
  p_cor TEXT,
  p_quantidade_base NUMERIC,
  p_quantidade_minima NUMERIC,
  p_preco_compra NUMERIC,
  p_imagem_url TEXT,
  p_nova_quantidade NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  estoque_atual NUMERIC;
  diferenca NUMERIC;
  tipo_movimentacao TEXT;
BEGIN
  IF p_nome IS NULL OR btrim(p_nome) = '' OR char_length(btrim(p_nome)) > 120 THEN
    RAISE EXCEPTION 'Nome do material invalido' USING ERRCODE = '22023';
  END IF;

  IF p_tipo NOT IN ('Contas', 'Entremeio', 'Cruz', 'Letras', 'Linhas', 'Embalagem') THEN
    RAISE EXCEPTION 'Tipo de componente invalido' USING ERRCODE = '22023';
  END IF;

  IF p_quantidade_base IS NULL OR p_quantidade_base < 0
     OR p_quantidade_minima IS NULL OR p_quantidade_minima < 0
     OR p_preco_compra IS NULL OR p_preco_compra < 0
     OR p_nova_quantidade IS NULL OR p_nova_quantidade < 0 THEN
    RAISE EXCEPTION 'Valores do material invalidos' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(material.quantidade_atual, material.quantidade, 0)
  INTO estoque_atual
  FROM public.materiais AS material
  WHERE material.id = p_material_id
    AND material.ativo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.materiais
  SET
    nome = btrim(p_nome),
    tipo = p_tipo,
    unidade = COALESCE(NULLIF(btrim(p_unidade), ''), 'unidade'),
    cor = NULLIF(btrim(p_cor), ''),
    quantidade = p_quantidade_base,
    quantidade_minima = p_quantidade_minima,
    preco_compra = p_preco_compra,
    imagem_url = NULLIF(btrim(p_imagem_url), '')
  WHERE id = p_material_id;

  diferenca := p_nova_quantidade - estoque_atual;
  IF diferenca = 0 THEN
    RETURN 'sem_alteracao';
  END IF;

  tipo_movimentacao := CASE WHEN diferenca > 0 THEN 'entrada' ELSE 'saida' END;

  INSERT INTO public.movimentacoes_estoque (
    material_id,
    tipo,
    quantidade,
    motivo
  )
  VALUES (
    p_material_id,
    tipo_movimentacao,
    abs(diferenca),
    format(
      'Ajuste pela edicao do material: %s -> %s',
      estoque_atual,
      p_nova_quantidade
    )
  );

  UPDATE public.materiais
  SET quantidade_atual = p_nova_quantidade
  WHERE id = p_material_id;

  RETURN tipo_movimentacao;
END;
$function$;

-- Insere todos os itens e materiais de um pedido dentro da transação chamadora.
CREATE OR REPLACE FUNCTION public.inserir_itens_pedido_atomico(
  p_pedido_id UUID,
  p_itens JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  item JSONB;
  item_id UUID;
  produto_id UUID;
  quantidade_item INTEGER;
  valor_unitario_item NUMERIC;
  materiais JSONB;
  materiais_informados INTEGER;
  materiais_validos INTEGER;
BEGIN
  IF p_itens IS NULL
     OR jsonb_typeof(p_itens) <> 'array'
     OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos um item ao pedido' USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    produto_id := NULLIF(item->>'produto_id', '')::UUID;
    quantidade_item := (item->>'quantidade')::INTEGER;
    valor_unitario_item := (item->>'valor_unitario')::NUMERIC;
    materiais := COALESCE(item->'materiais', '[]'::JSONB);

    IF produto_id IS NULL
       OR quantidade_item <= 0
       OR quantidade_item > 10000
       OR valor_unitario_item < 0 THEN
      RAISE EXCEPTION 'Item do pedido invalido' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.produtos AS produto
      WHERE produto.id = produto_id
        AND COALESCE(produto.ativo, true)
    ) THEN
      RAISE EXCEPTION 'Produto ativo nao encontrado: %', produto_id
        USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.pedido_itens (
      pedido_id,
      produto_id,
      quantidade,
      valor_unitario
    )
    VALUES (
      p_pedido_id,
      produto_id,
      quantidade_item,
      valor_unitario_item
    )
    RETURNING id INTO item_id;

    IF jsonb_typeof(materiais) <> 'array' THEN
      RAISE EXCEPTION 'Materiais do item invalidos' USING ERRCODE = '22023';
    END IF;

    SELECT count(*)
    INTO materiais_informados
    FROM jsonb_to_recordset(materiais)
      AS material_json(material_id UUID, quantidade NUMERIC)
    WHERE material_json.material_id IS NOT NULL
      AND material_json.quantidade > 0
      AND material_json.quantidade <= 100000000;

    SELECT count(*)
    INTO materiais_validos
    FROM (
      SELECT material_json.material_id
      FROM jsonb_to_recordset(materiais)
        AS material_json(material_id UUID, quantidade NUMERIC)
      JOIN public.materiais AS material
        ON material.id = material_json.material_id
       AND material.ativo = true
      WHERE material_json.quantidade > 0
        AND material_json.quantidade <= 100000000
      GROUP BY material_json.material_id
    ) AS materiais_ativos;

    IF materiais_informados <> jsonb_array_length(materiais)
       OR materiais_validos <> (
         SELECT count(DISTINCT material_json.material_id)
         FROM jsonb_to_recordset(materiais)
           AS material_json(material_id UUID, quantidade NUMERIC)
       ) THEN
      RAISE EXCEPTION 'Um ou mais materiais do item sao invalidos ou estao arquivados'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.pedido_itens_materiais (
      pedido_item_id,
      material_id,
      quantidade
    )
    SELECT
      item_id,
      material_json.material_id,
      SUM(material_json.quantidade)
    FROM jsonb_to_recordset(materiais)
      AS material_json(material_id UUID, quantidade NUMERIC)
    GROUP BY material_json.material_id;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_pedido_atomico(
  p_pedido JSONB,
  p_itens JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_pedido_id UUID;
  cliente_nome TEXT;
  prioridade INTEGER;
BEGIN
  cliente_nome := btrim(COALESCE(p_pedido->>'cliente_nome', ''));
  prioridade := COALESCE(NULLIF(p_pedido->>'prioridade', '')::INTEGER, 1);

  IF cliente_nome = '' OR char_length(cliente_nome) > 160 THEN
    RAISE EXCEPTION 'Nome do cliente invalido' USING ERRCODE = '22023';
  END IF;

  IF prioridade < 1 OR prioridade > 5 THEN
    RAISE EXCEPTION 'Prioridade invalida' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pedidos (
    cliente_nome,
    cliente_contato,
    cliente_endereco,
    prazo_entrega,
    status,
    prioridade,
    valor_total,
    observacoes,
    observacao_cliente,
    tipo_produto_id,
    ativo
  )
  VALUES (
    cliente_nome,
    NULLIF(btrim(p_pedido->>'cliente_contato'), ''),
    NULLIF(btrim(p_pedido->>'cliente_endereco'), ''),
    NULLIF(p_pedido->>'prazo_entrega', '')::DATE,
    COALESCE(NULLIF(p_pedido->>'status', ''), 'orcamento'),
    prioridade,
    0,
    NULLIF(btrim(p_pedido->>'observacoes'), ''),
    NULLIF(btrim(p_pedido->>'observacao_cliente'), ''),
    NULLIF(p_pedido->>'tipo_produto_id', '')::UUID,
    true
  )
  RETURNING id INTO v_pedido_id;

  PERFORM public.inserir_itens_pedido_atomico(v_pedido_id, p_itens);

  UPDATE public.pedidos
  SET valor_total = COALESCE(
    (
      SELECT SUM(item.valor_total)
      FROM public.pedido_itens AS item
      WHERE item.pedido_id = v_pedido_id
    ),
    0
  )
  WHERE id = v_pedido_id;

  RETURN v_pedido_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_pedido_atomico(
  p_pedido_id UUID,
  p_pedido JSONB,
  p_itens JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  estoque_ja_baixado BOOLEAN;
  v_cliente_nome TEXT;
BEGIN
  v_cliente_nome := btrim(COALESCE(p_pedido->>'cliente_nome', ''));
  IF v_cliente_nome = '' OR char_length(v_cliente_nome) > 160 THEN
    RAISE EXCEPTION 'Nome do cliente invalido' USING ERRCODE = '22023';
  END IF;

  SELECT pedido.estoque_baixado
  INTO estoque_ja_baixado
  FROM public.pedidos AS pedido
  WHERE pedido.id = p_pedido_id
    AND pedido.ativo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.pedidos
  SET
    cliente_nome = v_cliente_nome,
    cliente_contato = NULLIF(btrim(p_pedido->>'cliente_contato'), ''),
    cliente_endereco = NULLIF(btrim(p_pedido->>'cliente_endereco'), ''),
    prazo_entrega = NULLIF(p_pedido->>'prazo_entrega', '')::DATE,
    prioridade = COALESCE(NULLIF(p_pedido->>'prioridade', '')::INTEGER, prioridade),
    observacoes = NULLIF(btrim(p_pedido->>'observacoes'), ''),
    observacao_cliente = NULLIF(btrim(p_pedido->>'observacao_cliente'), '')
  WHERE id = p_pedido_id;

  IF estoque_ja_baixado THEN
    RETURN 'materiais_bloqueados';
  END IF;

  DELETE FROM public.pedido_itens_materiais
  WHERE pedido_item_id IN (
    SELECT item.id
    FROM public.pedido_itens AS item
    WHERE item.pedido_id = p_pedido_id
  );

  DELETE FROM public.pedido_itens
  WHERE pedido_id = p_pedido_id;

  PERFORM public.inserir_itens_pedido_atomico(p_pedido_id, p_itens);

  UPDATE public.pedidos
  SET
    tipo_produto_id = NULLIF(p_pedido->>'tipo_produto_id', '')::UUID,
    valor_total = COALESCE(
      (
        SELECT SUM(item.valor_total)
        FROM public.pedido_itens AS item
        WHERE item.pedido_id = p_pedido_id
      ),
      0
    )
  WHERE id = p_pedido_id;

  RETURN 'atualizado';
END;
$function$;

-- Arquiva em vez de excluir. Se o estoque já foi baixado, o cancelamento
-- devolve os materiais pelo trigger antes do arquivamento.
CREATE OR REPLACE FUNCTION public.arquivar_pedido(p_pedido_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  pedido_atual RECORD;
BEGIN
  SELECT pedido.id, pedido.status, pedido.estoque_baixado, pedido.ativo
  INTO pedido_atual
  FROM public.pedidos AS pedido
  WHERE pedido.id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT pedido_atual.ativo THEN
    RETURN 'ja_arquivado';
  END IF;

  IF COALESCE(pedido_atual.estoque_baixado, false) THEN
    UPDATE public.pedidos
    SET status = 'cancelado'
    WHERE id = p_pedido_id;
  END IF;

  UPDATE public.pedidos
  SET
    ativo = false,
    deleted_at = now()
  WHERE id = p_pedido_id;

  UPDATE public.pedido_acompanhamento_links
  SET ativo = false
  WHERE pedido_id = p_pedido_id;

  RETURN 'arquivado';
END;
$function$;

CREATE OR REPLACE FUNCTION public.substituir_materiais_pedido_item(
  p_pedido_item_id UUID,
  p_materiais JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  itens_informados INTEGER;
  materiais_validos INTEGER;
BEGIN
  PERFORM 1
  FROM public.pedido_itens AS item
  JOIN public.pedidos AS pedido
    ON pedido.id = item.pedido_id
   AND pedido.ativo = true
  WHERE item.id = p_pedido_item_id
    AND NOT COALESCE(pedido.estoque_baixado, false)
  FOR UPDATE OF item, pedido;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item nao encontrado ou materiais ja baixados'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_materiais IS NULL OR jsonb_typeof(p_materiais) <> 'array' THEN
    RAISE EXCEPTION 'Materiais do item invalidos' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO itens_informados
  FROM jsonb_to_recordset(p_materiais)
    AS item(material_id UUID, quantidade NUMERIC)
  WHERE item.material_id IS NOT NULL
    AND item.quantidade > 0
    AND item.quantidade <= 100000000;

  SELECT count(*)
  INTO materiais_validos
  FROM (
    SELECT item.material_id
    FROM jsonb_to_recordset(p_materiais)
      AS item(material_id UUID, quantidade NUMERIC)
    JOIN public.materiais AS material
      ON material.id = item.material_id
     AND material.ativo = true
    WHERE item.quantidade > 0
      AND item.quantidade <= 100000000
    GROUP BY item.material_id
  ) AS materiais_ativos;

  IF itens_informados <> jsonb_array_length(p_materiais)
     OR materiais_validos <> (
       SELECT count(DISTINCT item.material_id)
       FROM jsonb_to_recordset(p_materiais)
         AS item(material_id UUID, quantidade NUMERIC)
     ) THEN
    RAISE EXCEPTION 'Um ou mais materiais do item sao invalidos ou estao arquivados'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.pedido_itens_materiais
  WHERE pedido_item_id = p_pedido_item_id;

  INSERT INTO public.pedido_itens_materiais (
    pedido_item_id,
    material_id,
    quantidade
  )
  SELECT
    p_pedido_item_id,
    item.material_id,
    SUM(item.quantidade)
  FROM jsonb_to_recordset(p_materiais)
    AS item(material_id UUID, quantidade NUMERIC)
  GROUP BY item.material_id;
END;
$function$;

-- A substituição da composição é atômica: se um material for inválido,
-- a composição anterior permanece intacta.
CREATE OR REPLACE FUNCTION public.substituir_composicao_produto(
  p_produto_id UUID,
  p_composicao JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  itens_informados INTEGER;
  materiais_validos INTEGER;
BEGIN
  PERFORM 1
  FROM public.produtos AS produto
  WHERE produto.id = p_produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF p_composicao IS NULL OR jsonb_typeof(p_composicao) <> 'array' THEN
    RAISE EXCEPTION 'Composicao invalida' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO itens_informados
  FROM jsonb_to_recordset(p_composicao)
    AS item(material_id UUID, quantidade_usada NUMERIC)
  WHERE item.material_id IS NOT NULL
    AND item.quantidade_usada > 0
    AND item.quantidade_usada <= 100000000;

  SELECT count(*)
  INTO materiais_validos
  FROM (
    SELECT item.material_id
    FROM jsonb_to_recordset(p_composicao)
      AS item(material_id UUID, quantidade_usada NUMERIC)
    JOIN public.materiais AS material
      ON material.id = item.material_id
     AND material.ativo = true
    WHERE item.quantidade_usada > 0
      AND item.quantidade_usada <= 100000000
    GROUP BY item.material_id
  ) AS materiais_ativos;

  IF itens_informados <> jsonb_array_length(p_composicao)
     OR materiais_validos <> (
       SELECT count(DISTINCT item.material_id)
       FROM jsonb_to_recordset(p_composicao)
         AS item(material_id UUID, quantidade_usada NUMERIC)
     ) THEN
    RAISE EXCEPTION 'Um ou mais materiais da composicao sao invalidos ou estao arquivados'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.produto_materiais
  WHERE produto_id = p_produto_id;

  INSERT INTO public.produto_materiais (
    produto_id,
    material_id,
    quantidade_usada
  )
  SELECT
    p_produto_id,
    item.material_id,
    SUM(item.quantidade_usada)
  FROM jsonb_to_recordset(p_composicao)
    AS item(material_id UUID, quantidade_usada NUMERIC)
  GROUP BY item.material_id;
END;
$function$;

-- Pedidos arquivados deixam de ser expostos pelos links públicos, mas todos
-- os dados e tokens permanecem armazenados para auditoria.
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

  SELECT link.id, link.pedido_id
  INTO v_link
  FROM public.pedido_acompanhamento_links AS link
  JOIN public.pedidos AS pedido
    ON pedido.id = link.pedido_id
   AND pedido.ativo = true
  WHERE link.token_hash = v_token_hash
    AND link.ativo = true
    AND (link.expires_at IS NULL OR link.expires_at > now())
  LIMIT 1;

  IF v_link.pedido_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.pedido_acompanhamento_links
  SET last_accessed_at = now()
  WHERE id = v_link.id;

  SELECT jsonb_build_object(
    'cliente_nome', pedido.cliente_nome,
    'pedido_codigo', 'EXA-' || to_char(COALESCE(pedido.data_pedido, now()), 'YYYY') || '-' || upper(substr(pedido.id::text, 1, 8)),
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
    FROM public.pedido_itens AS pedido_item
    LEFT JOIN public.produtos AS produto
      ON produto.id = pedido_item.produto_id
    WHERE pedido_item.pedido_id = pedido.id
  ) AS item ON true
  WHERE pedido.id = v_link.pedido_id
    AND pedido.ativo = true;

  RETURN v_payload;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_pedido_acompanhamento_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
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
  WHERE pedido.slug_acompanhamento = p_slug
    AND pedido.ativo = true
  LIMIT 1;

  IF v_pedido_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'cliente_nome', pedido.cliente_nome,
    'pedido_codigo', 'EXA-' || to_char(COALESCE(pedido.data_pedido, now()), 'YYYY') || '-' || upper(substr(pedido.id::text, 1, 8)),
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
    FROM public.pedido_itens AS pedido_item
    LEFT JOIN public.produtos AS produto
      ON produto.id = pedido_item.produto_id
    WHERE pedido_item.pedido_id = pedido.id
  ) AS item ON true
  WHERE pedido.id = v_pedido_id
    AND pedido.ativo = true;

  RETURN v_payload;
END;
$function$;

REVOKE ALL ON FUNCTION public.atualizar_material_com_estoque(
  UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inserir_itens_pedido_atomico(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.criar_pedido_atomico(JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atualizar_pedido_atomico(UUID, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arquivar_pedido(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.substituir_materiais_pedido_item(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.substituir_composicao_produto(UUID, JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.atualizar_material_com_estoque(
  UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inserir_itens_pedido_atomico(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_pedido_atomico(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_pedido_atomico(UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.arquivar_pedido(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.substituir_materiais_pedido_item(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.substituir_composicao_produto(UUID, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_pedido_acompanhamento(TEXT) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.get_public_pedido_acompanhamento_by_slug(TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_pedido_acompanhamento(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_pedido_acompanhamento_by_slug(TEXT) TO anon;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
