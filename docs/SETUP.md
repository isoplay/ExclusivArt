# 🚀 Setup Completo - v0 ERP para Artesanato

Guia passo-a-passo para rodar a aplicação corretamente.

## 1️⃣ **Pré-requisitos**

- Node.js 18+ (https://nodejs.org/)
- pnpm 8+ ou npm 10+ (instale com: `npm install -g pnpm`)
- Git
- Conta Supabase (https://supabase.com/)

---

## 2️⃣ **Instalação Local**

```bash
# Clonar/entrar no projeto
cd v0-erp-para-artesanato-main

# Instalar dependências
pnpm install
# ou
npm install

# Criar arquivo .env.local com as variáveis
```

---

## 3️⃣ **Configurar Supabase**

### a) Criar Projeto Supabase
1. Ir para https://supabase.com/
2. Criar novo projeto
3. Aguardar inicialização (2-5 min)

### b) Executar Migrations
1. No Supabase, ir para **SQL Editor**
2. Criar nova query
3. Copiar e executar: `scripts/001_create_tables.sql`
4. Copiar e executar: `scripts/002_add_image_and_order_materials.sql`

### c) Criar Storage Bucket
1. Supabase → **Storage**
2. Clique em **New Bucket**
3. Nome: `imagens-estoque`
4. Marcar: **Public bucket** ✓
5. Criar ✓

### d) Copiar Credenciais
1. Supabase → **Project Settings** → **API**
2. Copiar:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### e) Criar `.env.local`
```bash
# Criar arquivo na raiz do projeto
```

**Conteúdo (.env.local):**
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=seu-anon-key-aqui
```

---

## 4️⃣ **Rodar Aplicação**

```bash
# Desenvolvimento (com hot-reload)
pnpm dev
# ou
npm run dev

# Acesso: http://localhost:3000
```

**Primeira vez?** 
- Será redirecionado para `/dashboard`
- Será solicitado criar conta ou login

---

## 5️⃣ **Produção (Build)**

```bash
# Build
pnpm build

# Iniciar
pnpm start
```

---

## 📱 **Instalar como App no Celular**

### Android (Chrome/Samsung Internet)
1. Abra http://localhost:3000 (use ngrok para HTTPS)
2. Menu (⋮) → **Instalar app** ou **Adicionar à tela inicial**
3. Pronto! 🎉

### iOS (Safari)
1. Abra no Safari
2. Compartilhar (↗) → **Adicionar à Tela Inicial**
3. Nomear e confirmar ✓

**Nota:** Requer HTTPS. Para dev local, use [ngrok](https://ngrok.com/):
```bash
ngrok http 3000  # Gera URL HTTPS
# Exemplo: https://abc123.ngrok.io/dashboard
```

---

## ✅ **Checklist de Verificação**

- [ ] Node.js instalado: `node --version`
- [ ] pnpm instalado: `pnpm --version`
- [ ] `.env.local` criado com credenciais Supabase
- [ ] Migrations executadas (tabelas criadas no Supabase)
- [ ] Storage bucket `imagens-estoque` criado e público
- [ ] `pnpm install` executado sem erros
- [ ] `pnpm dev` inicia em http://localhost:3000
- [ ] Login/Registro funcionando
- [ ] Dashboard carrega sem erros

---

## 🆘 **Troubleshooting**

### ❌ "Cannot find module '@/lib/supabase'"
```bash
# Deletar node_modules e reinstalar
rm -r node_modules pnpm-lock.yaml
pnpm install
```

### ❌ "Service Worker registration failed"
- Checa console do navegador: DevTools → Console
- Pode ignorar em desenvolvimento
- Em produção, requer HTTPS

### ❌ "Cannot upload image"
- Verificar Supabase Storage bucket `imagens-estoque` existe
- Verificar bucket está **Public**
- Verificar `.env.local` correto

### ❌ "Erro ao criar pedido/material"
- Verificar migrations executadas (SQL no Supabase)
- Verificar `.env.local` com credenciais corretas
- Verificar conexão internet

---

## 📚 **Recursos Importantes**

- **Arquivo instruções**: `.github/copilot-instructions.md`
- **Tipos banco dados**: `lib/types/database.ts`
- **Exemplo de padrão**: `app/dashboard/produtos/` (page + actions + content)
- **Componentes UI**: `components/ui/`

---

## 🎯 **Funcionalidades Implementadas**

✅ **Estoque**
- Gerenciar materiais com foto
- Registrar entrada/saída/ajuste
- Controle de quantidade mínima

✅ **Produtos**
- Criar/editar/deletar produtos
- Categorias (terço, pulseira, chaveiro)
- Cálculo de margem de lucro

✅ **Pedidos**
- Criar pedidos com itemização
- Status (pendente, em produção, pronto, entregue)
- Histórico de clientes
- Verificação de materiais em estoque

✅ **Financeiro**
- Registro de despesas
- Categorias de despesa
- Relatório mensal

✅ **PWA (App Móvel)**
- Instalar como app no celular
- Funciona offline (parcialmente)
- Sincroniza ao reconectar

---

## 🔧 **Variáveis de Ambiente Adicionais** (Opcional)

```env
# Já estão configuradas por padrão, mas pode customizar:

# Analytics (Vercel)
# NEXT_PUBLIC_VERCEL_ENV=production

# PWA
# NEXT_PUBLIC_APP_NAME=Exclusiva Fé
```

---

## 📞 **Suporte**

Se tiver problemas:
1. Verificar `.env.local` está preenchido
2. Verificar console do navegador: F12 → Console
3. Verificar logs no terminal: `pnpm dev`
4. Verificar Supabase status: https://status.supabase.com/

---

**Pronto para usar! 🎉**

```bash
pnpm dev
# Acesse: http://localhost:3000/dashboard
```
