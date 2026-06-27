BEGIN;

-- Mantem materiais historicos referenciaveis sem expo-los nas listagens operacionais.
ALTER TABLE public.materiais
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE public.materiais
SET ativo = true
WHERE ativo IS NULL;

ALTER TABLE public.materiais
  ALTER COLUMN ativo SET DEFAULT true,
  ALTER COLUMN ativo SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_materiais_ativos_nome
  ON public.materiais (nome)
  WHERE ativo = true;

CREATE OR REPLACE FUNCTION public.excluir_ou_arquivar_material(p_material_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  material_bloqueado UUID;
  material_em_uso BOOLEAN;
BEGIN
  -- O lock evita que um pedido passe a referenciar o material entre a verificacao e a exclusao.
  SELECT material.id
  INTO material_bloqueado
  FROM public.materiais AS material
  WHERE material.id = p_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material nao encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM public.pedido_itens_materiais AS pedido_material
      WHERE pedido_material.material_id = p_material_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.produto_materiais AS produto_material
      WHERE produto_material.material_id = p_material_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.movimentacoes_estoque AS movimentacao
      WHERE movimentacao.material_id = p_material_id
    )
  INTO material_em_uso;

  IF material_em_uso THEN
    UPDATE public.materiais
    SET
      ativo = false,
      deleted_at = now()
    WHERE id = p_material_id;

    RETURN 'arquivado';
  END IF;

  DELETE FROM public.materiais
  WHERE id = p_material_id;

  RETURN 'excluido';
EXCEPTION
  WHEN foreign_key_violation THEN
    -- Protege contra novas referencias RESTRICT adicionadas no futuro.
    UPDATE public.materiais
    SET
      ativo = false,
      deleted_at = now()
    WHERE id = p_material_id;

    RETURN 'arquivado';
END;
$function$;

COMMENT ON FUNCTION public.excluir_ou_arquivar_material(UUID) IS
  'Exclui materiais sem uso e arquiva materiais com historico ou referencias protegidas.';

REVOKE ALL ON FUNCTION public.excluir_ou_arquivar_material(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_ou_arquivar_material(UUID) TO authenticated;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
