# Orçamentos livres

## Escopo

O módulo cria propostas comerciais sem reservar ou baixar estoque.

- Área interna: `/dashboard/orcamentos`
- Página pública: `/o/[slug]`
- Compatibilidade: `/orcamento/[slug]` redireciona para a rota pública atual
- Migração de referência: `scripts/028_orcamentos_livres.sql`

## Regras de segurança

- Toda gravação passa por validação Zod e pela RPC transacional
  `salvar_orcamento_atomico`.
- Componentes de estoque têm nome, custo, unidade, cor e imagem relidos de
  `materiais`; a quantidade disponível é apenas informativa.
- As RPCs de gravação são `SECURITY INVOKER`, exigem usuário autenticado e
  continuam submetidas às políticas RLS de owner.
- `convertido` é um estado terminal. Nesse estado, somente as observações podem
  ser editadas.
- A RPC pública aceita apenas slugs no formato permitido e retorna somente os
  dados necessários à proposta. Custos, margem, lucro e observações internas não
  fazem parte do JSON público.
- Orçamentos não atualizam `materiais` nem inserem movimentações de estoque.

## Persistência

A criação e a edição do orçamento, seus itens e seus componentes acontecem na
mesma transação. Os limites são 25 itens, 50 componentes por item e 200
componentes no total. Se qualquer etapa falhar, nenhuma alteração parcial é
mantida.

As transições de status também são validadas no cliente servidor e na RPC
`atualizar_status_orcamento`.

## Aplicação no Supabase

Em uma instalação nova, execute `scripts/028_orcamentos_livres.sql`. Em ambientes
que já receberam a estrutura inicial, aplique as funções atualizadas e os grants
como uma nova migração, sem reaproveitar uma versão de migration existente.

A leitura pública usa `get_public_orcamento_by_slug`. O uso de
`SECURITY DEFINER` nessa função é intencional para atravessar a RLS somente com o
payload restrito definido na própria função.

## Validação

```bash
pnpm typecheck
pnpm test:unit
pnpm build
pnpm test:e2e
```

O smoke E2E preserva `/dashboard/pedidos`, `/p/[slug]` e
`/acompanhar/[token]`, além de cobrir as duas novas rotas.
