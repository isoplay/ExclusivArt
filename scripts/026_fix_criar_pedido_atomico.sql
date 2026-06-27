BEGIN;

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

REVOKE ALL ON FUNCTION public.criar_pedido_atomico(JSONB, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_pedido_atomico(JSONB, JSONB)
  TO authenticated;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
