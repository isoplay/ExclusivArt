BEGIN;

ALTER TABLE public.pedido_itens
  ADD COLUMN IF NOT EXISTS valor_calculado_total NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS preco_manual BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ajuste_manual_valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ajuste_manual_percentual NUMERIC(9, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_ajuste_preco TEXT;

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
      valor_unitario,
      valor_calculado_total,
      preco_manual,
      ajuste_manual_valor,
      ajuste_manual_percentual,
      motivo_ajuste_preco
    )
    VALUES (
      p_pedido_id,
      produto_id,
      quantidade_item,
      valor_unitario_item,
      NULLIF(item->>'valor_calculado_total', '')::NUMERIC,
      COALESCE(NULLIF(item->>'preco_manual', '')::BOOLEAN, FALSE),
      COALESCE(NULLIF(item->>'ajuste_manual_valor', '')::NUMERIC, 0),
      COALESCE(NULLIF(item->>'ajuste_manual_percentual', '')::NUMERIC, 0),
      NULLIF(btrim(item->>'motivo_ajuste_preco'), '')
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

REVOKE ALL ON FUNCTION public.inserir_itens_pedido_atomico(UUID, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inserir_itens_pedido_atomico(UUID, JSONB)
  TO authenticated;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
