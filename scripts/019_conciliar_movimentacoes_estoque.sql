-- Concilia ajustes antigos de estoque que alteraram quantidade_atual sem
-- registrar uma linha correspondente em movimentacoes_estoque.
--
-- Esta migration nao altera materiais.quantidade nem materiais.quantidade_atual.
-- Ela apenas registra entradas/saidas tecnicas para que o historico explique
-- o estado atual do estoque. A selecao recalcula o saldo no momento da execucao,
-- portanto rodar novamente depois de conciliado nao insere novas linhas.

WITH mov_sum AS (
  SELECT
    material_id,
    COALESCE(
      SUM(CASE WHEN tipo = 'entrada' THEN quantidade ELSE -quantidade END),
      0
    ) AS saldo_movimentado
  FROM public.movimentacoes_estoque
  GROUP BY material_id
),
ajustes AS (
  SELECT
    m.id AS material_id,
    (m.quantidade_atual - m.quantidade) - COALESCE(ms.saldo_movimentado, 0) AS diferenca_sem_movimento
  FROM public.materiais m
  LEFT JOIN mov_sum ms ON ms.material_id = m.id
  WHERE ABS((m.quantidade_atual - m.quantidade) - COALESCE(ms.saldo_movimentado, 0)) > 0.0001
),
inserted AS (
  INSERT INTO public.movimentacoes_estoque (
    material_id,
    tipo,
    quantidade,
    motivo,
    pedido_id
  )
  SELECT
    material_id,
    CASE WHEN diferenca_sem_movimento > 0 THEN 'entrada' ELSE 'saida' END,
    ABS(diferenca_sem_movimento),
    'Ajuste tecnico de auditoria: conciliacao entre estoque atual e historico de movimentacoes',
    NULL
  FROM ajustes
  RETURNING id
)
SELECT COUNT(*) AS movimentacoes_conciliadas
FROM inserted;
