# Roadmap de simplificação

Análise atualizada em 30/06/2026. O objetivo é reduzir complexidade sem perder
dados, compatibilidade de links públicos ou regras de estoque.

## Resumo executivo

O sistema está funcional, mas cresceu por adição de funcionalidades dentro dos
mesmos arquivos. A prioridade não deve ser remover telas: deve ser estabilizar
o contrato com o banco, dividir módulos grandes e eliminar duplicações seguras.

Ponto de partida recomendado:

1. estabilizar CI e contrato do banco;
2. criar testes de integração dos fluxos críticos;
3. extrair funções compartilhadas;
4. dividir os maiores módulos;
5. somente depois remover código e rotas antigas.

## Retrato atual

- 207 arquivos e aproximadamente 111 mil palavras no grafo do projeto;
- 178 arquivos TypeScript, TSX ou SQL analisados;
- 34 scripts SQL incrementais;
- 13 arquivos de Server Actions;
- 23 testes unitários e 1 arquivo de smoke test E2E;
- 56 componentes em `components/ui`;
- 33 componentes visuais são candidatos a não utilizados;
- 16 implementações locais de `formatCurrency`;
- 3 implementações locais de `cleanOptionalText`.

Arquivos com maior concentração:

| Arquivo | Linhas aproximadas |
| --- | ---: |
| `app/dashboard/pedidos/actions.ts` | 1.254 |
| `app/dashboard/estoque/estoque-content.tsx` | 1.227 |
| `app/dashboard/orcamentos/orcamento-form.tsx` | 1.054 |
| `app/dashboard/pedidos/pedido-form.tsx` | 990 |
| `app/dashboard/orcamentos/orcamentos-content.tsx` | 774 |
| `app/dashboard/orcamentos/actions.ts` | 742 |
| `app/dashboard/dashboard-content.tsx` | 626 |
| `app/dashboard/pedidos/item-builder.tsx` | 615 |

## Prioridades

| Prioridade | Problema | Impacto | Primeira correção |
| --- | --- | --- | --- |
| P0 | Tipos TypeScript escritos manualmente podem divergir do Supabase | Erros em produção, como a coluna inexistente de despesas | Gerar tipos do schema e usar esses tipos nas consultas |
| P0 | GitHub Actions não inicia por bloqueio de cobrança | Alterações chegam sem validação remota | Regularizar a conta e manter typecheck, testes e build obrigatórios |
| P0 | Poucos testes cobrem banco e RPCs | Migrações podem compilar e quebrar no uso real | Criar testes de contrato para despesas, materiais, pedidos e links públicos |
| P1 | Arquivos de 700 a 1.250 linhas | Mudanças pequenas afetam módulos inteiros | Dividir por leitura, escrita, validação e componentes visuais |
| P1 | Funções utilitárias duplicadas | Formatação e validação ficam inconsistentes | Centralizar moeda, texto, datas e chaves normalizadas em `lib/` |
| P1 | Material e grupo são ligados pelo texto do tipo | Renomear exige atualizar vários lugares | Introduzir `tipo_componente_id` gradualmente, mantendo o nome para exibição |
| P1 | Consultas usam `select('*')` e limites altos | Mais tráfego e respostas maiores | Selecionar colunas explícitas e paginar listas grandes |
| P1 | Funções SQL são redefinidas em vários scripts | Difícil saber qual versão está ativa | Criar inventário das RPCs atuais e uma migration por alteração futura |
| P2 | Rotas públicas de pedido repetem quase toda a lógica | Correções precisam ser duplicadas | Extrair carregamento e mapeamento para um módulo compartilhado |
| P2 | Muitos componentes UI parecem não utilizados | Mais arquivos e dependências para manter | Remover em lotes pequenos, sempre com typecheck e build |

## O que pode ser enxugado com baixo risco

### 1. Utilitários duplicados

Criar módulos compartilhados:

- `lib/format/currency.ts`;
- `lib/format/date.ts`;
- `lib/text/normalize.ts`;
- `lib/domain/pedidos/validation.ts`.

Migrar um módulo por vez. Não fazer substituição global sem testes.

### 2. Componentes visuais candidatos a remoção

Uma busca estática encontrou 33 candidatos sem importação fora do próprio
arquivo, incluindo `accordion`, `carousel`, `menubar`, `navigation-menu`,
`pagination`, `slider` e `resizable`.

Essa lista é apenas candidata: antes de excluir cada lote, confirmar imports
dinâmicos e executar:

```bash
pnpm typecheck
pnpm test:unit
pnpm build
```

### 3. Rotas públicas duplicadas

`/p/[slug]` e `/acompanhar/[token]` diferem principalmente no identificador e
na RPC. Formatação, mensagem de status e mapeamento visual são duplicados.

Extrair para:

- `lib/pedidos/public-tracking.ts`;
- manter as duas rotas como adaptadores finos.

Não remover `/acompanhar/[token]`: links antigos de clientes dependem dela.
`/orcamento/[slug]` também deve permanecer como redirecionamento legado.

### 4. Documentação repetida

Manter `docs/00-indice.md` como entrada única. Depois revisar
`README-NOVO.md`, `ESTRUTURA.md`, `SETUP.md` e `PRE-REQUISITOS.md`, removendo
instruções antigas somente após confirmar que não são mais necessárias.

## Melhorias estruturais

### Contrato do banco

O arquivo `lib/types/database.ts` é manual. A correção prioritária é gerar tipos
do Supabase e deixar tipos de tela ou domínio em arquivos separados.

Estrutura sugerida:

```text
lib/
  supabase/
    database.generated.ts
  domain/
    materiais.ts
    pedidos.ts
    orcamentos.ts
```

Isso evita que uma coluna antiga continue sendo consultada depois que o schema
real mudou.

### Server Actions

`app/dashboard/pedidos/actions.ts` possui 19 actions exportadas. Separar sem
alterar as assinaturas públicas:

```text
app/dashboard/pedidos/actions/
  queries.ts
  commands.ts
  tracking.ts
  stock.ts
  validation.ts
```

Aplicar o mesmo padrão depois em orçamentos, produtos e estoque.

### Tipos de componente

Hoje diversos pontos comparam `material.tipo` com `grupo.nome`. O destino mais
seguro é um relacionamento por UUID:

```text
materiais.tipo_componente_id -> tipos_componentes.id
```

Fazer em etapas:

1. criar tabela/ID sem remover `tipo`;
2. preencher IDs a partir dos nomes atuais;
3. escrever nos dois campos durante a transição;
4. migrar consultas;
5. remover o vínculo por texto somente após auditoria.

### Consultas e paginação

Há consultas `select('*')` em pedidos, estoque, produtos, histórico e operação.
Trocar por seleções explícitas. Listas como materiais, pedidos e histórico
devem receber paginação antes de crescerem significativamente.

## Banco e Supabase

O Performance Advisor identificou quatro chaves estrangeiras sem índice:

- `orcamento_componentes.grupo_id`;
- `orcamento_componentes.material_id`;
- `orcamento_itens.categoria_id`;
- `pedido_itens.produto_id`.

Adicionar esses índices é uma melhoria pequena e reversível:
[documentação do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

Os índices marcados como não utilizados não devem ser removidos agora. O banco
tem pouco tráfego e o contador pode não representar uso futuro; observar antes.

O Security Advisor também informa que a proteção contra senhas vazadas está
desativada:
[configuração recomendada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

As três RPCs públicas `SECURITY DEFINER` são intencionais para abrir links sem
login. Elas devem continuar retornando payload mínimo e receber rate limit no
edge; não devem ser removidas apenas para silenciar o advisor.

## Cobertura de testes recomendada

Adicionar testes de integração para:

1. criar e editar material com tipo personalizado;
2. atualizar estoque sem perder custo ou quantidade;
3. criar, cancelar e concluir pedido;
4. criar e arquivar despesa;
5. gerar e abrir links `/p`, `/acompanhar` e `/o`;
6. garantir que páginas públicas nunca retornem custo, margem ou observações
   internas;
7. executar as migrations em um banco limpo.

## Primeiro ciclo de trabalho

### Semana 1 — estabilidade

1. regularizar o GitHub Actions;
2. gerar tipos do Supabase;
3. adicionar teste de contrato do schema;
4. criar os quatro índices ausentes;
5. extrair formatadores e normalizadores duplicados.

### Semana 2 — modularização

1. dividir `pedidos/actions.ts`;
2. dividir `estoque-content.tsx`;
3. compartilhar a lógica das duas rotas públicas de pedido;
4. adicionar paginação em pedidos e materiais.

### Depois

1. migrar tipos de componente de texto para UUID;
2. remover componentes UI comprovadamente sem uso;
3. consolidar documentação antiga;
4. avaliar índices não utilizados com métricas de produção.

## Regra de execução

Cada item deve ser um commit pequeno e reversível. Não misturar refatoração,
migration e mudança visual no mesmo commit. Para toda mudança:

```bash
pnpm typecheck
pnpm test:unit
pnpm build
graphify update .
```

