BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.vendas_historicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_venda DATE NOT NULL,
  cliente_nome TEXT,
  descricao TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_total NUMERIC NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
  origem TEXT NOT NULL DEFAULT 'papel',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendas_historicas_data_venda
  ON public.vendas_historicas(data_venda);

CREATE INDEX IF NOT EXISTS idx_vendas_historicas_cliente_nome
  ON public.vendas_historicas(cliente_nome);

CREATE INDEX IF NOT EXISTS idx_vendas_historicas_created_at
  ON public.vendas_historicas(created_at);

ALTER TABLE public.vendas_historicas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_full_access ON public.vendas_historicas;
CREATE POLICY authenticated_full_access
  ON public.vendas_historicas
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_historicas TO authenticated;

COMMIT;
