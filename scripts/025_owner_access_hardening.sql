BEGIN;

-- Cada usuário autenticado pode consultar apenas o próprio cadastro.
-- As políticas públicas continuam conseguindo verificar ativo/role pela mesma linha.
ALTER TABLE app_private.usuarios_sistema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usuarios_sistema_self_read
  ON app_private.usuarios_sistema;

CREATE POLICY usuarios_sistema_self_read
  ON app_private.usuarios_sistema
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON app_private.usuarios_sistema FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON app_private.usuarios_sistema
  FROM authenticated;
GRANT SELECT ON app_private.usuarios_sistema TO authenticated;

DO $do$
DECLARE
  table_name TEXT;
  owner_check TEXT := 'EXISTS (
    SELECT 1
    FROM app_private.usuarios_sistema AS usuario
    WHERE usuario.user_id = (SELECT auth.uid())
      AND usuario.ativo = true
      AND usuario.role = ''owner''
  )';
  tables TEXT[] := ARRAY[
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
    EXECUTE format(
      'DROP POLICY IF EXISTS authenticated_app_user_access ON public.%I',
      table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS owner_full_access ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY owner_full_access ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      table_name,
      owner_check,
      owner_check
    );
  END LOOP;
END;
$do$;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
