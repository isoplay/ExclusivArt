BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_movimentacao_material(
  p_material_id UUID,
  p_tipo TEXT,
  p_quantidade NUMERIC,
  p_motivo TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  estoque_atual NUMERIC;
  novo_estoque NUMERIC;
BEGIN
  IF p_tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Tipo de movimentacao invalido'
      USING ERRCODE = '22023';
  END IF;

  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade da movimentacao deve ser maior que zero'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(material.quantidade_atual, material.quantidade, 0)
  INTO estoque_atual
  FROM public.materiais AS material
  WHERE material.id = p_material_id
    AND material.ativo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material nao encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  novo_estoque := CASE
    WHEN p_tipo = 'entrada' THEN estoque_atual + p_quantidade
    ELSE estoque_atual - p_quantidade
  END;

  IF novo_estoque < 0 THEN
    RAISE EXCEPTION 'Quantidade insuficiente em estoque'
      USING ERRCODE = '22003';
  END IF;

  INSERT INTO public.movimentacoes_estoque (
    material_id,
    tipo,
    quantidade,
    motivo
  )
  VALUES (
    p_material_id,
    p_tipo,
    p_quantidade,
    NULLIF(btrim(p_motivo), '')
  );

  UPDATE public.materiais
  SET quantidade_atual = novo_estoque
  WHERE id = p_material_id;

  RETURN novo_estoque;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ajustar_estoque_material(
  p_material_id UUID,
  p_nova_quantidade NUMERIC,
  p_motivo TEXT DEFAULT NULL
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
  motivo_movimentacao TEXT;
BEGIN
  IF p_nova_quantidade IS NULL OR p_nova_quantidade < 0 THEN
    RAISE EXCEPTION 'Estoque atual invalido'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(material.quantidade_atual, material.quantidade, 0)
  INTO estoque_atual
  FROM public.materiais AS material
  WHERE material.id = p_material_id
    AND material.ativo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material nao encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  diferenca := p_nova_quantidade - estoque_atual;

  IF diferenca = 0 THEN
    RETURN 'sem_alteracao';
  END IF;

  tipo_movimentacao := CASE WHEN diferenca > 0 THEN 'entrada' ELSE 'saida' END;
  motivo_movimentacao := COALESCE(
    NULLIF(btrim(p_motivo), ''),
    format(
      'Ajuste pela edicao do material: %s -> %s',
      estoque_atual,
      p_nova_quantidade
    )
  );

  PERFORM public.registrar_movimentacao_material(
    p_material_id,
    tipo_movimentacao,
    abs(diferenca),
    motivo_movimentacao
  );

  RETURN tipo_movimentacao;
END;
$function$;

COMMENT ON FUNCTION public.registrar_movimentacao_material(UUID, TEXT, NUMERIC, TEXT) IS
  'Registra entrada ou saida e atualiza o saldo do material na mesma transacao.';

COMMENT ON FUNCTION public.ajustar_estoque_material(UUID, NUMERIC, TEXT) IS
  'Compara o saldo atual com o novo valor e registra automaticamente entrada ou saida.';

REVOKE ALL ON FUNCTION public.registrar_movimentacao_material(UUID, TEXT, NUMERIC, TEXT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ajustar_estoque_material(UUID, NUMERIC, TEXT)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.registrar_movimentacao_material(UUID, TEXT, NUMERIC, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque_material(UUID, NUMERIC, TEXT)
  TO authenticated;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
