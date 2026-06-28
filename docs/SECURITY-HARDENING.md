# Security hardening

## Controles aplicados

- Toda Server Action privada cria um cliente autenticado e permanece protegida
  pelas policies RLS de owner.
- IDs recebidos pelo cliente são validados como UUID antes de chegar ao banco
  nas operações destrutivas ou de atualização auditadas.
- Textos, datas, números, listas e enums têm limites explícitos.
- Custos e totais de pedidos e orçamentos são recalculados no servidor.
- Erros detalhados ficam nos logs do servidor; o cliente recebe mensagens
  genéricas.
- Slugs novos usam 144 bits de aleatoriedade. Tokens legados continuam
  armazenados somente como SHA-256.
- RPCs públicas validam entrada, são somente leitura e retornam payload mínimo.
  Códigos exibidos ao cliente não derivam mais do UUID interno.
- Links por slug de pedido respeitam o mesmo estado e expiração do registro de
  acompanhamento. Orçamentos vencidos deixam de ser retornados pela RPC.
- Despesas usam soft delete.
- O bucket público entrega imagens por URL sem permitir listagem anônima; upload
  e alterações exigem owner.

## Variáveis de ambiente

Somente estas variáveis públicas são esperadas:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
```

A anon key é pública por definição e depende de RLS. O projeto não usa
`SUPABASE_SERVICE_ROLE_KEY`; essa chave nunca deve receber o prefixo
`NEXT_PUBLIC_`.

## Configuração externa necessária

1. No Supabase Auth, habilitar proteção contra senhas vazadas.
2. No Vercel Firewall, configurar rate limit por IP para:
   - `/p/*`
   - `/acompanhar/*`
   - `/o/*`
3. Usar limite inicial de 60 leituras por minuto por IP e observar falsos
   positivos antes de reduzir.
4. Criar alerta para crescimento anormal de chamadas às três RPCs públicas.

Rate limiting distribuído não foi implementado em memória dentro do Next.js,
pois instâncias serverless não compartilham estado. O controle deve ficar no
edge/firewall ou em armazenamento externo atômico.

## Auditoria periódica

```bash
pnpm audit --audit-level high
pnpm typecheck
pnpm test:unit
pnpm build
pnpm test:e2e
```

Revisar também o Security Advisor do Supabase após qualquer migration. Os
alertas de função `SECURITY DEFINER` pública são esperados exclusivamente para
as três RPCs públicas documentadas acima.
