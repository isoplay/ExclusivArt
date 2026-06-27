BEGIN;

-- Padroniza apenas a classificacao; ids, cores, estoque, custos e historicos permanecem intactos.
UPDATE public.materiais
SET tipo = CASE
  WHEN upper(btrim(tipo)) LIKE 'CONTA%' THEN 'Contas'
  WHEN upper(btrim(tipo)) IN ('ENTREMEIO', 'PINGENTE', 'MEDALHA', 'FECHO') THEN 'Entremeio'
  WHEN upper(btrim(tipo)) IN ('CRUZ', 'CRUCIFIXO') THEN 'Cruz'
  WHEN upper(btrim(tipo)) IN ('LETRA', 'LETRAS') THEN 'Letras'
  WHEN upper(btrim(tipo)) IN ('LINHA', 'LINHAS', 'FIO', 'FIOS') THEN 'Linhas'
  WHEN upper(btrim(tipo)) IN ('EMBALAGEM', 'EMBALAGENS') THEN 'Embalagem'
  ELSE tipo
END;

DO $validation$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.materiais
    WHERE tipo NOT IN ('Contas', 'Entremeio', 'Cruz', 'Letras', 'Linhas', 'Embalagem')
  ) THEN
    RAISE EXCEPTION 'Existem materiais com tipo fora da lista padronizada';
  END IF;
END;
$validation$;

-- Reutiliza um grupo existente por categoria para cada tipo canonico.
UPDATE public.grupos_componentes AS grupo
SET nome = 'Contas', ordem = 1, ativo = true
WHERE upper(btrim(grupo.nome)) IN ('CONTAS', 'CONTAS LEITOSAS')
  AND NOT EXISTS (
    SELECT 1
    FROM public.grupos_componentes AS existente
    WHERE existente.categoria_id = grupo.categoria_id
      AND existente.id <> grupo.id
      AND lower(btrim(existente.nome)) = 'contas'
  );

UPDATE public.grupos_componentes
SET nome = 'Entremeio', ordem = 2, ativo = true
WHERE upper(btrim(nome)) = 'ENTREMEIO';

UPDATE public.grupos_componentes
SET nome = 'Cruz', ordem = 3, ativo = true
WHERE upper(btrim(nome)) IN ('CRUZ', 'CRUCIFIXO');

UPDATE public.grupos_componentes
SET nome = 'Letras', ordem = 4, ativo = true
WHERE upper(btrim(nome)) IN ('LETRA', 'LETRAS');

UPDATE public.grupos_componentes
SET nome = 'Linhas', ordem = 5, ativo = true
WHERE upper(btrim(nome)) IN ('LINHA', 'LINHAS', 'FIO', 'FIOS');

UPDATE public.grupos_componentes
SET nome = 'Embalagem', ordem = 6, ativo = true
WHERE upper(btrim(nome)) IN ('EMBALAGEM', 'EMBALAGENS');

-- Garante os seis grupos em todas as categorias sem remover os registros antigos.
WITH tipos(nome, ordem) AS (
  VALUES
    ('Contas', 1),
    ('Entremeio', 2),
    ('Cruz', 3),
    ('Letras', 4),
    ('Linhas', 5),
    ('Embalagem', 6)
)
INSERT INTO public.grupos_componentes (
  categoria_id,
  nome,
  descricao,
  obrigatorio,
  permite_multipla_selecao,
  ordem,
  ativo
)
SELECT
  categoria.id,
  tipo.nome,
  NULL,
  false,
  false,
  tipo.ordem,
  true
FROM public.categorias_produtos AS categoria
CROSS JOIN tipos AS tipo
WHERE NOT EXISTS (
  SELECT 1
  FROM public.grupos_componentes AS grupo
  WHERE grupo.categoria_id = categoria.id
    AND lower(btrim(grupo.nome)) = lower(tipo.nome)
);

UPDATE public.grupos_componentes
SET ativo = false
WHERE lower(btrim(nome)) NOT IN (
  'contas',
  'entremeio',
  'cruz',
  'letras',
  'linhas',
  'embalagem'
);

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'materiais_tipo_canonico_check'
      AND conrelid = 'public.materiais'::regclass
  ) THEN
    ALTER TABLE public.materiais
      ADD CONSTRAINT materiais_tipo_canonico_check
      CHECK (tipo IN ('Contas', 'Entremeio', 'Cruz', 'Letras', 'Linhas', 'Embalagem'));
  END IF;
END;
$constraint$;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
