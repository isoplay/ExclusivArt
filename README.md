# ✨ Exclusiva Fé - Sistema ERP para Artesanato

Um sistema web de gestão especializado para pequenas empresas de artesanato que produzem terços, pulseiras, chaveiros e outros produtos religiosos.

> ⚠️ **Sistema para uso pessoal:** Desenvolvido para 1 único usuário (artesão). Sem acesso de clientes.

---

## 🎯 O que é?

Um **painel administrativo completo** para gerenciar toda a produção e vendas:
- 📦 **Estoque**: Controle de materiais (miçangas, fios, arandelas, etc)
- 🛍️ **Produtos**: Cadastro e preços dos produtos finais
- 📋 **Pedidos**: Recebe pedidos de clientes, acompa produção
- 💳 **Financeiro**: Controla receitas, despesas e lucro
- 📅 **Calendário**: Visualiza datas de entrega
- 📊 **Dashboard**: Resumo geral do negócio

---

## ⚙️ Como Funciona

### Fluxo Básico:

```
1. CADASTRAR PRODUTOS
   ↓
   (Terço Rosa R$ 35,00 | Pulseira Azul R$ 25,00 | etc)
   
2. CADASTRAR MATERIAIS
   ↓
   (Miçangas: 500 un | Fio: 50m | Arandelas: 100 un | etc)

3. RECEBER PEDIDO DE CLIENTE
   ↓
   (Cliente: Maria Silva | Terço Rosa x2 | Valor: R$ 70,00)
   
4. MARCAR MATERIAIS UTILIZADOS
   ↓
   (Seleciona: 100 miçangas, 2m fio, 2 arandelas)
   
5. FINALIZAR PEDIDO
   ↓
   (Status: ENTREGUE)
   ↓
   ✅ MATERIAIS AUTOMATICAMENTE DESCONTADOS DO ESTOQUE
   
6. VER RESULTADOS NO DASHBOARD
   ↓
   (Receita, Lucro, Estoque atualizado em tempo real)
```

---

## 🚀 Funcionalidades Principais

| Feature | Descrição |
|---------|-----------|
| **Dashboard** | Visão geral: receita mês, pedidos, estoque baixo, lucro |
| **Pedidos** | Criar, editar, acompanhar status, marcar materiais |
| **Estoque** | Ver materiais, quantidades, histórico de movimentações |
| **Produtos** | Criar produtos, definir preço de venda, custo |
| **Financeiro** | Registrar despesas, calcular lucro |
| **Calendário** | Ver datas de entrega dos pedidos |
| **Desconto Automático** | Ao entregar pedido → materiais descontados automaticamente |

---

## 🛠️ Stack de Tecnologias

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **Styling**: Tailwind CSS v4 + Radix UI
- **Database**: Supabase (PostgreSQL)
- **Forms**: React Hook Form + Zod
- **Icons**: Lucide React
- **PWA**: Instalável como app mobile

---

## 📱 Como Usar

### 1️⃣ Rodar Localmente

```bash
# Instalar dependências
pnpm install

# Iniciar servidor
pnpm dev
```

Acesse: `http://localhost:3000`

### 2️⃣ Configurar Banco de Dados

Crie um arquivo `.env.local` com:
```
NEXT_PUBLIC_SUPABASE_URL=seu_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave
NEXT_PUBLIC_SITE_URL=https://seu-dominio.com.br
```

O aplicativo não utiliza `SUPABASE_SERVICE_ROLE_KEY`. Não configure nem exponha
essa chave no frontend.

### 3️⃣ Começar a Usar

1. Vá para **Estoque** → Cadastre seus materiais
2. Vá para **Produtos** → Cadastre seus produtos
3. Vá para **Pedidos** → Comece a receber pedidos!

---

## 📊 Dashboard - O Que Você Vê

```
┌─────────────────────────────────┐
│  PEDIDOS DO MÊS: 3              │
│  RECEITA: R$ 125,00             │
│  PEDIDOS PENDENTES: 1           │
│  ESTOQUE BAIXO: 2 materiais     │
├─────────────────────────────────┤
│  RECEITA: R$ 125,00             │
│  DESPESAS: R$ 0,00              │
│  LUCRO: R$ 125,00               │
└─────────────────────────────────┘
```

---

## 📦 Estrutura do Projeto

```
app/
├── dashboard/          # Dashboard principal
├── pedidos/           # Gerenciador de pedidos
├── estoque/           # Controle de estoque
├── produtos/          # Cadastro de produtos
├── financeiro/        # Relatórios financeiros
└── calendario/        # Calendário de entregas

components/
├── ui/               # Componentes Radix UI
└── production-checker.tsx

lib/
├── supabase/         # Integração Supabase
├── types/            # Types TypeScript
└── utils.ts
```

---

## 🎯 Features Principais

✅ **Desconto Automático de Materiais**
- Ao marcar pedido como "Entregue", materiais são automaticamente descontados

✅ **Controle de Estoque**
- Acompanhe quantidade de cada material em tempo real

✅ **Histórico de Movimentações**
- Veja quando e por que cada material foi descontado/adicionado

✅ **Responsivo**
- Funciona em desktop, tablet e mobile

✅ **PWA (Progressive Web App)**
- Instale como app no seu celular
- Funciona offline

---

## 💡 Dicas de Uso

- **Primeiro, cadastre materiais**: Sem materiais, não consegue marcar em pedidos
- **Depois, cadastre produtos**: Com produtos, consegue criar pedidos
- **Ao receber pedido**: Sempre marque os materiais utilizados (botão 📦)
- **Finalize em "Entregue"**: Assim materializa são descontados automaticamente
- **Verifique o estoque**: Dashboard mostra materiais com estoque baixo

---

## 📞 Suporte

Se algo não funcionou:
1. Verifique se o `.env.local` está correto
2. Verifique se tem materiais cadastrados
3. Tente fazer um `pnpm build` para validar o código
4. Limpe o cache: delete a pasta `.next` e rode `pnpm dev` novamente

---

**Desenvolvido com ❤️ para artesãs e artesãos**  
v1.0 - Abril 2026
