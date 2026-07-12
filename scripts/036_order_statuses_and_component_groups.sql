BEGIN;

-- Normaliza valores antigos antes de trocar o CHECK do banco.
UPDATE public.pedidos
SET status = 'orcamento'
WHERE status IN ('pendente', 'em_orcamento');

UPDATE public.pedidos
SET status = 'separando_material'
WHERE status IN ('confirmado', 'separando_materiais', 'aguardando_material');

UPDATE public.pedidos
SET status = 'entregue'
WHERE status = 'finalizado';

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;

ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (
    status IN (
      'orcamento',
      'separando_material',
      'em_producao',
      'pronto',
      'pago',
      'pago_entregue',
      'entregue',
      'cancelado'
    )
  );

ALTER TABLE public.pedidos ALTER COLUMN status SET DEFAULT 'orcamento';

-- Garante que todo produto cadastrado exista como categoria de pedido.
DO $sync_products$
DECLARE
  produto_record RECORD;
  v_categoria_id UUID;
  next_ordem INTEGER;
BEGIN
  FOR produto_record IN
    SELECT id, nome, valor_maodeobra, ativo
    FROM public.produtos
  LOOP
    SELECT id INTO v_categoria_id
    FROM public.categorias_produtos
    WHERE lower(btrim(nome)) = lower(btrim(produto_record.nome))
    LIMIT 1;

    IF v_categoria_id IS NULL THEN
      SELECT COALESCE(MAX(ordem), 0) + 1
      INTO next_ordem
      FROM public.categorias_produtos;

      INSERT INTO public.categorias_produtos (nome, descricao, ativo, ordem)
      VALUES (
        btrim(produto_record.nome),
        'Produto ' || btrim(produto_record.nome),
        COALESCE(produto_record.ativo, true),
        next_ordem
      )
      RETURNING id INTO v_categoria_id;
    ELSE
      UPDATE public.categorias_produtos
      SET
        nome = btrim(produto_record.nome),
        descricao = COALESCE(descricao, 'Produto ' || btrim(produto_record.nome)),
        ativo = COALESCE(produto_record.ativo, true)
      WHERE id = v_categoria_id;
    END IF;

    INSERT INTO public.configuracao_maodeobra (categoria_id, valor_maodeobra, descricao)
    VALUES (
      v_categoria_id,
      COALESCE(produto_record.valor_maodeobra, 0),
      'Valor definido no cadastro de produtos'
    )
    ON CONFLICT (categoria_id)
    DO UPDATE SET
      valor_maodeobra = EXCLUDED.valor_maodeobra,
      descricao = EXCLUDED.descricao,
      updated_at = NOW();
  END LOOP;
END;
$sync_products$;

-- Cada produto/categoria ativa passa a receber todos os tipos de componentes cadastrados.
WITH tipos_raw(nome, ordem) AS (
  VALUES
    ('Contas', 1),
    ('Entremeio', 2),
    ('Cruz', 3),
    ('Letras', 4),
    ('Linhas', 5),
    ('Embalagem', 6)
  UNION ALL
  SELECT
    regexp_replace(btrim(grupo.nome), '\s+', ' ', 'g') AS nome,
    MIN(COALESCE(grupo.ordem, 999)) AS ordem
  FROM public.grupos_componentes AS grupo
  WHERE grupo.ativo = TRUE
    AND btrim(COALESCE(grupo.nome, '')) <> ''
  GROUP BY lower(regexp_replace(btrim(grupo.nome), '\s+', ' ', 'g')),
           regexp_replace(btrim(grupo.nome), '\s+', ' ', 'g')
  UNION ALL
  SELECT
    regexp_replace(btrim(material.tipo), '\s+', ' ', 'g') AS nome,
    999 AS ordem
  FROM public.materiais AS material
  WHERE material.ativo = TRUE
    AND btrim(COALESCE(material.tipo, '')) <> ''
),
tipos AS (
  SELECT
    nome,
    MIN(ordem) AS ordem
  FROM tipos_raw
  WHERE char_length(nome) BETWEEN 1 AND 60
  GROUP BY lower(nome), nome
),
tipos_reativados AS (
  UPDATE public.grupos_componentes AS grupo
  SET
    ativo = TRUE,
    ordem = LEAST(COALESCE(grupo.ordem, tipo.ordem), tipo.ordem)
  FROM tipos AS tipo
  WHERE lower(btrim(grupo.nome)) = lower(tipo.nome)
    AND EXISTS (
      SELECT 1
      FROM public.categorias_produtos AS categoria
      WHERE categoria.id = grupo.categoria_id
        AND categoria.ativo = TRUE
    )
  RETURNING grupo.id
)
INSERT INTO public.grupos_componentes (
  categoria_id,
  nome,
  descricao,
  obrigatorio,
  permite_multipla_selecao,
  ordem,
  ativo
)
SELECT
  categoria.id,
  tipo.nome,
  NULL,
  FALSE,
  FALSE,
  tipo.ordem,
  TRUE
FROM public.categorias_produtos AS categoria
CROSS JOIN tipos AS tipo
WHERE categoria.ativo = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.grupos_componentes AS grupo
    WHERE grupo.categoria_id = categoria.id
      AND lower(btrim(grupo.nome)) = lower(tipo.nome)
  );

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
  IF NEW.status IN ('em_producao', 'pronto', 'pago', 'pago_entregue', 'entregue')
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
        WHEN NEW.status = 'pago' THEN 'Pedido pago: ' || NEW.cliente_nome
        WHEN NEW.status = 'pago_entregue' THEN 'Pedido pago e entregue: ' || NEW.cliente_nome
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

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
SET timezone TO 'America/Sao_Paulo'
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
          AND pedido.status IN ('pronto', 'pago', 'pago_entregue', 'entregue')
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
        WHERE pedido.status IN ('pronto', 'pago', 'pago_entregue', 'entregue')
      ), 0),
    'receita_pedidos_sistema',
      COALESCE((
        SELECT SUM(pedido.valor_total)
        FROM public.pedidos AS pedido
        WHERE pedido.ativo = TRUE
          AND pedido.status IN ('pronto', 'pago', 'pago_entregue', 'entregue')
      ), 0),
    'receita_historica',
      COALESCE((SELECT SUM(venda.valor_total) FROM public.vendas_historicas AS venda), 0),
    'pedidos_pendentes',
      (
        SELECT COUNT(*)
        FROM public.pedidos AS pedido
        WHERE pedido.ativo = TRUE
          AND pedido.status IN ('orcamento', 'separando_material', 'em_producao', 'pronto', 'pago')
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
            AND pedido.status IN ('orcamento', 'separando_material', 'em_producao', 'pronto', 'pago')
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
