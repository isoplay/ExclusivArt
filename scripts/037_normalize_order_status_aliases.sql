BEGIN;

-- Compatibilidade de rollout: versões antigas do app ainda podem enviar
-- "confirmado" ou "separando_materiais". O banco guarda sempre o valor novo.
CREATE OR REPLACE FUNCTION public.normalizar_status_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_status_key TEXT;
BEGIN
  v_status_key := lower(regexp_replace(btrim(COALESCE(NEW.status, '')), '\s+', '_', 'g'));

  NEW.status := CASE v_status_key
    WHEN 'pendente' THEN 'orcamento'
    WHEN 'em_orcamento' THEN 'orcamento'
    WHEN 'orçamento' THEN 'orcamento'
    WHEN 'orcamento' THEN 'orcamento'
    WHEN 'confirmado' THEN 'separando_material'
    WHEN 'aguardando_material' THEN 'separando_material'
    WHEN 'separando_materiais' THEN 'separando_material'
    WHEN 'separando_material' THEN 'separando_material'
    WHEN 'em_produção' THEN 'em_producao'
    WHEN 'em_producao' THEN 'em_producao'
    WHEN 'pronto' THEN 'pronto'
    WHEN 'pago' THEN 'pago'
    WHEN 'pago_entregue' THEN 'pago_entregue'
    WHEN 'entregue' THEN 'entregue'
    WHEN 'finalizado' THEN 'entregue'
    WHEN 'cancelado' THEN 'cancelado'
    ELSE NEW.status
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_normalizar_status_pedido ON public.pedidos;

CREATE TRIGGER trigger_normalizar_status_pedido
  BEFORE INSERT OR UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.normalizar_status_pedido();

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
