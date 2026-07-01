BEGIN;

-- O mes comercial da Exclusiva Fe segue o horario de Sao Paulo.
-- Isso faz a virada mensal acontecer no dia 1 as 00:00 locais, sem mover,
-- fechar ou excluir registros dos meses anteriores.
ALTER FUNCTION public.get_dashboard_metrics()
  SET timezone TO 'America/Sao_Paulo';

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
