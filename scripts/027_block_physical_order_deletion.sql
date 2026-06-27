BEGIN;

CREATE OR REPLACE FUNCTION public.bloquear_exclusao_fisica_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION 'Pedidos nao podem ser excluidos fisicamente; use arquivar_pedido'
    USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS trigger_bloquear_exclusao_fisica_pedido
  ON public.pedidos;

CREATE TRIGGER trigger_bloquear_exclusao_fisica_pedido
  BEFORE DELETE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.bloquear_exclusao_fisica_pedido();

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
