-- Preserva o custo unitario gerado de materiais.
-- quantidade fica como base de custo; quantidade_atual representa o estoque operacional.

ALTER TABLE public.materiais
  ADD COLUMN IF NOT EXISTS quantidade_atual numeric DEFAULT 0;

UPDATE public.materiais
SET quantidade_atual = quantidade
WHERE quantidade_atual IS NULL;

CREATE OR REPLACE FUNCTION public.descontar_estoque_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  shortages_msg TEXT;
BEGIN
  IF NEW.status IN ('em_producao', 'pronto', 'entregue')
     AND NOT COALESCE(NEW.estoque_baixado, false) THEN

    WITH usage AS (
      SELECT
        COALESCE(pim.material_id, pm.material_id) AS material_id,
        SUM(COALESCE(pim.quantidade, pm.quantidade_usada * pi.quantidade)) AS total_usado
      FROM pedido_itens pi
      LEFT JOIN pedido_itens_materiais pim ON pim.pedido_item_id = pi.id
      LEFT JOIN produto_materiais pm ON pm.produto_id = pi.produto_id AND pim.material_id IS NULL
      WHERE pi.pedido_id = NEW.id
        AND (pim.material_id IS NOT NULL OR pm.material_id IS NOT NULL)
      GROUP BY COALESCE(pim.material_id, pm.material_id)
    ), shortages AS (
      SELECT
        m.nome,
        (u.total_usado - COALESCE(m.quantidade_atual, m.quantidade)) AS faltando
      FROM usage u
      JOIN materiais m ON m.id = u.material_id
      WHERE COALESCE(m.quantidade_atual, m.quantidade) < u.total_usado
    )
    SELECT string_agg(format('%s (faltam %s)', nome, faltando::text), ', ')
    INTO shortages_msg
    FROM shortages;

    IF shortages_msg IS NOT NULL AND shortages_msg <> '' THEN
      RAISE EXCEPTION 'Estoque insuficiente ao baixar materiais: %', shortages_msg;
    END IF;

    WITH usage AS (
      SELECT
        COALESCE(pim.material_id, pm.material_id) AS material_id,
        SUM(COALESCE(pim.quantidade, pm.quantidade_usada * pi.quantidade)) AS total_usado
      FROM pedido_itens pi
      LEFT JOIN pedido_itens_materiais pim ON pim.pedido_item_id = pi.id
      LEFT JOIN produto_materiais pm ON pm.produto_id = pi.produto_id AND pim.material_id IS NULL
      WHERE pi.pedido_id = NEW.id
        AND (pim.material_id IS NOT NULL OR pm.material_id IS NOT NULL)
      GROUP BY COALESCE(pim.material_id, pm.material_id)
    )
    INSERT INTO movimentacoes_estoque (material_id, tipo, quantidade, motivo, pedido_id)
    SELECT
      u.material_id,
      'saida',
      u.total_usado,
      CASE
        WHEN NEW.status = 'em_producao' THEN 'Pedido em producao: ' || NEW.cliente_nome
        WHEN NEW.status = 'pronto' THEN 'Pedido pronto: ' || NEW.cliente_nome
        ELSE 'Pedido entregue: ' || NEW.cliente_nome
      END,
      NEW.id
    FROM usage u;

    WITH usage AS (
      SELECT
        COALESCE(pim.material_id, pm.material_id) AS material_id,
        SUM(COALESCE(pim.quantidade, pm.quantidade_usada * pi.quantidade)) AS total_usado
      FROM pedido_itens pi
      LEFT JOIN pedido_itens_materiais pim ON pim.pedido_item_id = pi.id
      LEFT JOIN produto_materiais pm ON pm.produto_id = pi.produto_id AND pim.material_id IS NULL
      WHERE pi.pedido_id = NEW.id
        AND (pim.material_id IS NOT NULL OR pm.material_id IS NOT NULL)
      GROUP BY COALESCE(pim.material_id, pm.material_id)
    )
    UPDATE materiais m
    SET quantidade_atual = COALESCE(m.quantidade_atual, m.quantidade) - u.total_usado
    FROM usage u
    WHERE m.id = u.material_id;

    NEW.estoque_baixado := true;
  ELSIF NEW.status = 'cancelado'
        AND COALESCE(OLD.estoque_baixado, false) THEN

    WITH usage AS (
      SELECT
        COALESCE(pim.material_id, pm.material_id) AS material_id,
        SUM(COALESCE(pim.quantidade, pm.quantidade_usada * pi.quantidade)) AS total_usado
      FROM pedido_itens pi
      LEFT JOIN pedido_itens_materiais pim ON pim.pedido_item_id = pi.id
      LEFT JOIN produto_materiais pm ON pm.produto_id = pi.produto_id AND pim.material_id IS NULL
      WHERE pi.pedido_id = NEW.id
        AND (pim.material_id IS NOT NULL OR pm.material_id IS NOT NULL)
      GROUP BY COALESCE(pim.material_id, pm.material_id)
    )
    INSERT INTO movimentacoes_estoque (material_id, tipo, quantidade, motivo, pedido_id)
    SELECT
      u.material_id,
      'entrada',
      u.total_usado,
      'Cancelamento - Pedido: ' || NEW.cliente_nome,
      NEW.id
    FROM usage u;

    WITH usage AS (
      SELECT
        COALESCE(pim.material_id, pm.material_id) AS material_id,
        SUM(COALESCE(pim.quantidade, pm.quantidade_usada * pi.quantidade)) AS total_usado
      FROM pedido_itens pi
      LEFT JOIN pedido_itens_materiais pim ON pim.pedido_item_id = pi.id
      LEFT JOIN produto_materiais pm ON pm.produto_id = pi.produto_id AND pim.material_id IS NULL
      WHERE pi.pedido_id = NEW.id
        AND (pim.material_id IS NOT NULL OR pm.material_id IS NOT NULL)
      GROUP BY COALESCE(pim.material_id, pm.material_id)
    )
    UPDATE materiais m
    SET quantidade_atual = COALESCE(m.quantidade_atual, m.quantidade) + u.total_usado
    FROM usage u
    WHERE m.id = u.material_id;

    NEW.estoque_baixado := false;
  END IF;

  RETURN NEW;
END;
$$;
