BEGIN;

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE IF NOT EXISTS app_private.usuarios_sistema (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_private.usuarios_sistema (user_id, email, ativo, role)
SELECT id, email, true, 'owner'
FROM auth.users
WHERE deleted_at IS NULL
ON CONFLICT (user_id) DO UPDATE
SET
  email = EXCLUDED.email,
  ativo = true,
  updated_at = NOW();

GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT SELECT ON app_private.usuarios_sistema TO authenticated;

ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public, extensions;
ALTER FUNCTION public.atualizar_valor_pedido()
  SET search_path = public, extensions;
ALTER FUNCTION public.calcular_custo_producao(uuid)
  SET search_path = public, extensions;
ALTER FUNCTION public.update_pedido_acompanhamento_links_updated_at()
  SET search_path = public, extensions;
ALTER FUNCTION public.descontar_estoque_pedido()
  SET search_path = public, extensions;
ALTER FUNCTION public.get_public_pedido_acompanhamento(text)
  SET search_path = public, extensions;

DO $$
DECLARE
  table_name text;
  allowed_check text := 'EXISTS (
    SELECT 1
    FROM app_private.usuarios_sistema usuarios
    WHERE usuarios.user_id = (SELECT auth.uid())
      AND usuarios.ativo = true
  )';
  tables text[] := ARRAY[
    'categorias_produtos',
    'componentes_estoque',
    'configuracao_maodeobra',
    'despesas',
    'grupos_componentes',
    'materiais',
    'movimentacoes_estoque',
    'pedido_acompanhamento_links',
    'pedido_itens',
    'pedido_itens_materiais',
    'pedidos',
    'produto_materiais',
    'produtos',
    'variacoes_tipo',
    'vendas_historicas'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_app_user_access ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY authenticated_app_user_access ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      table_name,
      allowed_check,
      allowed_check
    );
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_public_pedido_acompanhamento(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_pedido_acompanhamento(text) TO anon;

COMMIT;
