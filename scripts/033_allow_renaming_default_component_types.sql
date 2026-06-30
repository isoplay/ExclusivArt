BEGIN;

-- Todos os tipos podem ser renomeados. Quando o destino já existe na mesma
-- categoria, os grupos antigos são apenas desativados para preservar histórico.
CREATE OR REPLACE FUNCTION public.renomear_tipo_componente(
  p_nome_atual TEXT,
  p_novo_nome TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_nome_atual TEXT := regexp_replace(btrim(p_nome_atual), '\s+', ' ', 'g');
  v_novo_nome TEXT := regexp_replace(btrim(p_novo_nome), '\s+', ' ', 'g');
BEGIN
  IF char_length(v_nome_atual) NOT BETWEEN 1 AND 60
    OR char_length(v_novo_nome) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'tipo_invalido';
  END IF;

  IF lower(v_nome_atual) = lower(v_novo_nome) THEN
    RETURN;
  END IF;

  UPDATE public.materiais
  SET tipo = v_novo_nome
  WHERE lower(btrim(tipo)) = lower(v_nome_atual);

  UPDATE public.grupos_componentes AS grupo
  SET ativo = FALSE
  WHERE lower(btrim(grupo.nome)) = lower(v_nome_atual)
    AND EXISTS (
      SELECT 1
      FROM public.grupos_componentes AS destino
      WHERE destino.categoria_id = grupo.categoria_id
        AND destino.id <> grupo.id
        AND lower(btrim(destino.nome)) = lower(v_novo_nome)
    );

  UPDATE public.grupos_componentes AS grupo
  SET nome = v_novo_nome
  WHERE lower(btrim(grupo.nome)) = lower(v_nome_atual)
    AND NOT EXISTS (
      SELECT 1
      FROM public.grupos_componentes AS destino
      WHERE destino.categoria_id = grupo.categoria_id
        AND destino.id <> grupo.id
        AND lower(btrim(destino.nome)) = lower(v_novo_nome)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.renomear_tipo_componente(TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renomear_tipo_componente(TEXT, TEXT)
  TO authenticated;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
