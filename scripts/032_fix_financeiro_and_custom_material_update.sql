BEGIN;

-- Mantém a atualização atômica do estoque, mas aceita os tipos personalizados
-- já permitidos pela restrição materiais_tipo_valido_check.
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
  tipo_normalizado TEXT := regexp_replace(btrim(p_tipo), '\s+', ' ', 'g');
BEGIN
  IF p_nome IS NULL OR btrim(p_nome) = '' OR char_length(btrim(p_nome)) > 120 THEN
    RAISE EXCEPTION 'Nome do material invalido' USING ERRCODE = '22023';
  END IF;

  IF p_tipo IS NULL
     OR tipo_normalizado = ''
     OR char_length(tipo_normalizado) > 60 THEN
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
    tipo = tipo_normalizado,
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

REVOKE ALL ON FUNCTION public.atualizar_material_com_estoque(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  TEXT,
  NUMERIC
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.atualizar_material_com_estoque(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  TEXT,
  NUMERIC
) TO authenticated;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
