BEGIN;

-- Permite tipos personalizados sem alterar os materiais existentes.
ALTER TABLE public.materiais
  DROP CONSTRAINT IF EXISTS materiais_tipo_canonico_check;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'materiais_tipo_valido_check'
      AND conrelid = 'public.materiais'::regclass
  ) THEN
    ALTER TABLE public.materiais
      ADD CONSTRAINT materiais_tipo_valido_check
      CHECK (char_length(btrim(tipo)) BETWEEN 1 AND 60)
      NOT VALID;
  END IF;
END;
$constraint$;

ALTER TABLE public.materiais
  VALIDATE CONSTRAINT materiais_tipo_valido_check;

-- Renomeia o tipo e seus vínculos na mesma transação, sem perder materiais.
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

  IF lower(v_nome_atual) IN (
    'contas',
    'entremeio',
    'cruz',
    'letras',
    'linhas',
    'embalagem'
  ) THEN
    RAISE EXCEPTION 'tipo_padronizado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.grupos_componentes AS grupo
    WHERE lower(btrim(grupo.nome)) = lower(v_novo_nome)
      AND lower(btrim(grupo.nome)) <> lower(v_nome_atual)
  ) THEN
    RAISE EXCEPTION 'tipo_destino_existente';
  END IF;

  UPDATE public.grupos_componentes
  SET nome = v_novo_nome
  WHERE lower(btrim(nome)) = lower(v_nome_atual);

  UPDATE public.materiais
  SET tipo = v_novo_nome
  WHERE lower(btrim(tipo)) = lower(v_nome_atual);
END;
$function$;

REVOKE ALL ON FUNCTION public.renomear_tipo_componente(TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renomear_tipo_componente(TEXT, TEXT)
  TO authenticated;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
