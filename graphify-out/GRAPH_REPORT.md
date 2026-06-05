# Graph Report - v0-erp-para-artesanato-main  (2026-06-05)

## Corpus Check
- 145 files · ~81,100 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1265 nodes · 2374 edges · 75 communities (71 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1e5839f8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 278 edges
2. `createAuthenticatedClient()` - 66 edges
3. `logServerError()` - 29 edges
4. `Button()` - 23 edges
5. `🎨 ERP Artesanato - Next.js 16 + Supabase` - 18 edges
6. `compilerOptions` - 16 edges
7. `/graphify` - 14 edges
8. `What You Must Do When Invoked` - 14 edges
9. `Badge()` - 13 edges
10. `Card()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `formatShortDate()` --calls--> `formatDateBR()`  [EXTRACTED]
  app/dashboard/dashboard-content.tsx → lib/utils.ts
- `MetricCard()` --calls--> `cn()`  [EXTRACTED]
  app/dashboard/dashboard-content.tsx → lib/utils.ts
- `getPedido()` --calls--> `createAuthenticatedClient()`  [EXTRACTED]
  app/dashboard/pedidos/actions.ts → lib/auth.ts
- `getProdutosAtivos()` --calls--> `createAuthenticatedClient()`  [EXTRACTED]
  app/dashboard/pedidos/actions.ts → lib/auth.ts
- `getMateriaisBaixaPedido()` --calls--> `createAuthenticatedClient()`  [EXTRACTED]
  app/dashboard/pedidos/actions.ts → lib/auth.ts

## Communities (75 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (79): statusLabels, statusStyles, BeforeInstallPromptEvent, ComponentesConfigProps, MaodebraConfigProps, canvasToBlob(), EstoqueContent(), formatFileSize() (+71 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (32): cn(), Avatar(), AvatarFallback(), AvatarImage(), BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList() (+24 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (52): dependencies, autoprefixer, class-variance-authority, clsx, cmdk, date-fns, embla-carousel-react, @hookform/resolvers (+44 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (47): 1. Autenticação, 2. Buscar Dados, 3. Criar/Editar, 4. PWA Installation, Adicionar Nova Coluna no Banco, code:block1 (v0-erp-para-artesanato-main/), code:block10 (1. Local development), code:sql (-- Usuários podem ver/editar apenas seus dados) (+39 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (43): 1. AMBIENTE LOCAL, 2. PROJETO LOCAL, 3. SUPABASE SETUP, 4. ARQUIVO .env.local, 5. MIGRATIONS SQL, 6. STORAGE BUCKET, 7. DEPENDÊNCIAS, Android (Chrome) (+35 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (42): Adicionar Feature, 🎓 Aprender Mais, 🎯 Arquitetura (3 Camadas), Atualizar Banco, Client Components with Forms, code:block1 (Frontend:), code:bash (# 1. Clonar/extrair projeto), code:block3 (/dashboard/[modulo]/) (+34 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (24): code:bash (mkdir -p graphify-out), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:bash (# Detect the correct Python interpreter (handles pipx, venv,), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c ") (+16 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (36): Action, ActionType, actionTypes, addToRemoveQueue(), dispatch(), genId(), listeners, memoryState (+28 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (16): code:block1 (/graphify                                             # full), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:bash (python3 -m graphify.watch INPUT_PATH --debounce 3), code:bash (graphify hook install    # install), code:bash (graphify claude install), code:bash (graphify claude uninstall  # remove the section), For --cluster-only (+8 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (33): 1️⃣ **Pré-requisitos**, 2️⃣ **Instalação Local**, 3️⃣ **Configurar Supabase**, 4️⃣ **Rodar Aplicação**, 5️⃣ **Produção (Build)**, a) Criar Projeto Supabase, Android (Chrome/Samsung Internet), b) Executar Migrations (+25 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (22): getPedidosComEntrega(), PedidoCalendario, CalendarioContent(), CalendarioPage(), searchGlobal(), SearchResult, CategoriaCompleta, ComponenteDisponivel (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (28): 10. **Testes de Performance**, 1. **Testes de Autenticação**, 2. **Testes de Estoque**, 3. **Testes de Produtos**, 4. **Testes de Pedidos**, 5. **Testes de Movimentação de Estoque**, 6. **Testes de Financeiro**, 7. **Testes de PWA (Celular)** (+20 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (28): ClienteAutocompleteProps, ProductionCheckerProps, addMateriaisAoPedidoItem(), ClienteHistorico, createPedido(), deletePedido(), getCategoriasComComponentes(), getMateriaisBaixaPedido() (+20 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (18): AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay(), AlertDialogTitle() (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (18): calcularCustoProduto(), ComposicaoInput, createProduto(), CustoProdutoCalculado, deleteProduto(), duplicateProduto(), getComposicaoProduto(), getMateriais() (+10 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (20): Causa: Aliases TypeScript não funcionando, Causa Possível 1: `.env.local` faltando, Causa Possível 2: Banco de dados sem migrations, Causa Possível 3: Erro no console em tempo real, code:bash (# Verificar se existe:), code:sql (-- Executar em Supabase > SQL Editor:), code:bash (# No terminal onde rodou pnpm dev:), code:bash (# Verificar tsconfig.json linha ~26:) (+12 more)

### Community 16 - "Community 16"
Cohesion: 0.10
Nodes (20): 1️⃣ Rodar Localmente, 2️⃣ Configurar Banco de Dados, 3️⃣ Começar a Usar, code:block1 (1. CADASTRAR PRODUTOS), code:bash (# Instalar dependências), code:block3 (NEXT_PUBLIC_SUPABASE_URL=seu_url), code:block4 (┌─────────────────────────────────┐), code:block5 (app/) (+12 more)

### Community 17 - "Community 17"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (16): ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Field(), FieldContent(), FieldDescription(), FieldError() (+8 more)

### Community 19 - "Community 19"
Cohesion: 0.06
Nodes (42): AppSidebar(), menuItems, FloatingActionButton(), useIsMobile(), Sheet(), SheetContent(), SheetDescription(), SheetFooter() (+34 more)

### Community 20 - "Community 20"
Cohesion: 0.24
Nodes (12): createDespesa(), deleteDespesa(), EMPTY_FINANCEIRO_RESUMO, getDespesas(), getFinanceiroResumo(), getMonthRange(), updateDespesa(), FinanceiroPage() (+4 more)

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 22 - "Community 22"
Cohesion: 0.13
Nodes (16): asNumber(), buildPath(), buildResumoMensagem(), DashboardContent(), DashboardMetrics, FinanceiroDia, FinancialCard(), formatCurrency() (+8 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (11): Menubar(), MenubarCheckboxItem(), MenubarContent(), MenubarItem(), MenubarLabel(), MenubarRadioItem(), MenubarSeparator(), MenubarShortcut() (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.15
Nodes (13): code:block10 (You are a graphify extraction subagent. Read the files liste), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:block8 (spawn_agent(agent_type="worker", message="Your task is to pe) (+5 more)

### Community 25 - "Community 25"
Cohesion: 0.19
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.32
Nodes (10): alternarTipoComponente(), criarTipoComponente(), getTiposComponentesConfig(), normalizeKey(), normalizeText(), renomearTipoComponente(), revalidateConfiguracoesDependentes(), ConfiguracoesPage() (+2 more)

### Community 27 - "Community 27"
Cohesion: 0.14
Nodes (13): background_color, categories, description, display, icons, lang, name, orientation (+5 more)

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (12): Item(), ItemActions(), ItemContent(), ItemDescription(), ItemFooter(), ItemGroup(), ItemHeader(), ItemMedia() (+4 more)

### Community 29 - "Community 29"
Cohesion: 0.10
Nodes (11): FinanceiroContent(), formatCurrency(), getTodayDateString(), toDateInputValue(), Checkbox(), HoverCardContent(), Progress(), ResizableHandle() (+3 more)

### Community 30 - "Community 30"
Cohesion: 0.14
Nodes (13): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartLegendContentProps, ChartTooltipContent(), ChartTooltipContentProps (+5 more)

### Community 32 - "Community 32"
Cohesion: 0.27
Nodes (15): createMaterial(), deleteMaterial(), getImageContentType(), getMateriais(), getMaterial(), getMovimentacoes(), getSafeImageExtension(), getSafeImageUrl() (+7 more)

### Community 33 - "Community 33"
Cohesion: 0.23
Nodes (10): FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItem(), FormItemContext, FormItemContextValue, FormLabel() (+2 more)

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (9): ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut(), ContextMenuSubContent() (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.17
Nodes (7): DropdownMenuCheckboxItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent(), DropdownMenuSubTrigger()

### Community 36 - "Community 36"
Cohesion: 0.32
Nodes (12): createAuthenticatedClient(), arredondarParaCimaMeioReal(), createPedidoCustomizado(), atualizarMaodeobra(), calcularPrecoItemMontado(), criarPedidoComMontagem(), getCategorias(), getComponentesPorCategoria() (+4 more)

### Community 37 - "Community 37"
Cohesion: 0.29
Nodes (9): Command(), CommandDialog(), CommandEmpty(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator() (+1 more)

### Community 38 - "Community 38"
Cohesion: 0.18
Nodes (11): 6️⃣ DOCUMENTAÇÃO, `CHECKLIST.md` ✨ NOVO (Criado nesta sessão), code:markdown (# v0 ERP para Artesanato – Developer Guidelines), code:block14 (1. Pré-requisitos), code:block15 (✓ Código TypeScript compilável), code:block16 (10 seções de testes:), code:block17 (Erros comuns:), `.github/copilot-instructions.md` ✨ NOVO (+3 more)

### Community 39 - "Community 39"
Cohesion: 0.18
Nodes (10): Architecture – Server/Client Separation, Build & Test, Code Style & Conventions, code:block1 ([module]/), code:bash (pnpm install         # Use pnpm (not npm/yarn)), Common Gotchas, Database & Types, Key Files to Understand the Pattern (+2 more)

### Community 40 - "Community 40"
Cohesion: 0.18
Nodes (6): DrawerContent(), DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerTitle()

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (9): NavigationMenu(), NavigationMenuContent(), NavigationMenuIndicator(), NavigationMenuItem(), NavigationMenuLink(), NavigationMenuList(), NavigationMenuTrigger(), navigationMenuTriggerStyle (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.20
Nodes (9): Causas raiz identificadas e corrigidas, 📱 CORREÇÕES DE DISPOSITIVOS E RESPONSIVIDADE (continuação da sessão), 📊 ESTATÍSTICAS, 📈 IMPACTO NOS USUÁRIOS, Mudanças realizadas, 🎯 Objetivo Alcançado, ✨ PRÓXIMAS IDEIAS (Futuro), 📋 Resumo de Mudanças Realizadas (+1 more)

### Community 43 - "Community 43"
Cohesion: 0.20
Nodes (10): devDependencies, @playwright/test, postcss, tailwindcss, @tailwindcss/postcss, tw-animate-css, @types/node, @types/react (+2 more)

### Community 44 - "Community 44"
Cohesion: 0.17
Nodes (11): name, overrides, postcss, private, scripts, build, dev, lint (+3 more)

### Community 45 - "Community 45"
Cohesion: 0.28
Nodes (5): metadata, poppins, viewport, ServiceWorkerRegistration(), ThemeProvider()

### Community 46 - "Community 46"
Cohesion: 0.43
Nodes (5): ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle(), toggleVariants

### Community 47 - "Community 47"
Cohesion: 0.28
Nodes (8): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea()

### Community 48 - "Community 48"
Cohesion: 0.08
Nodes (35): GlobalSearch(), PWAInstallPrompt(), EMPTY_DASHBOARD_METRICS, getDashboardMetrics(), getEstoqueAtual(), toNumber(), DashboardLayout(), DashboardPage() (+27 more)

### Community 49 - "Community 49"
Cohesion: 0.22
Nodes (9): 5️⃣ PWA E SERVICE WORKER, code:javascript (// ✅ Cache minimalista), code:typescript (// ❌ Só registrava em produção), code:typescript (// ✅ Registra em todos ambientes), code:json ({), code:javascript (// ❌ Cache agressivo demais), `components/service-worker-registration.tsx` 🔄 ATUALIZADO, `public/manifest.json` 🔄 CORRIGIDO (+1 more)

### Community 50 - "Community 50"
Cohesion: 0.22
Nodes (5): isKnownPublicAsset, isStaticAsset, PRECACHE_ASSETS, requests, url

### Community 51 - "Community 51"
Cohesion: 0.46
Nodes (7): FallbackIcon(), getSafeImageUrl(), isColorDrivenType(), isValidHexColor(), MaterialAvatar(), MaterialAvatarProps, normalizeKey()

### Community 52 - "Community 52"
Cohesion: 0.29
Nodes (7): Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle()

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (6): code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:bash (if [ ! -f graphify-out/.graphify_extract.json ]; then), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), For --update (incremental re-extraction)

### Community 54 - "Community 54"
Cohesion: 0.40
Nodes (3): AccordionContent(), AccordionItem(), AccordionTrigger()

### Community 55 - "Community 55"
Cohesion: 0.29
Nodes (7): 3️⃣ FUNÇÕES DE SERVIDOR (ACTIONS), `app/dashboard/estoque/actions.ts` 🔄 ATUALIZADO, `app/dashboard/pedidos/actions.ts` 🔄 EXPANDIDO, `app/dashboard/produtos/actions.ts` 🔄 SIMPLIFICADO, code:typescript (// Nova função: Upload de imagem), code:typescript (// ❌ Não mais: materiais fixos em produtos), code:typescript (// Nova função: Adicionar materiais a um item do pedido)

### Community 56 - "Community 56"
Cohesion: 0.29
Nodes (7): 1️⃣ BANCO DE DADOS, 2️⃣ TIPOS E INTERFACES, code:sql (-- Adicionado:), code:typescript (// Novo tipo:), `lib/types/database.ts` 🔄 ATUALIZADO, 📊 MUDANÇAS POR ARQUIVO, `scripts/002_add_image_and_order_materials.sql` ✨ NOVO

### Community 58 - "Community 58"
Cohesion: 0.50
Nodes (4): code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -m graphify save-result --question "), For /graphify query

### Community 59 - "Community 59"
Cohesion: 0.50
Nodes (4): code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -m graphify save-result --question "), For /graphify path

### Community 60 - "Community 60"
Cohesion: 0.50
Nodes (4): code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -c "), code:bash ($(cat .graphify_python) -m graphify save-result --question "), For /graphify explain

### Community 61 - "Community 61"
Cohesion: 0.67
Nodes (3): code:bash ($(cat .graphify_python) -c "), code:block27 (Graph complete. Outputs in PATH_TO_DIR/graphify-out/), Step 9 - Save manifest, update cost tracker, clean up, and report

### Community 62 - "Community 62"
Cohesion: 0.40
Nodes (5): Antes ❌, code:block18 (Estoque (materiais)), code:block19 (Estoque (materiais)), Depois ✅, 🎨 RESUMO VISUAL DAS MUDANÇAS

### Community 63 - "Community 63"
Cohesion: 0.40
Nodes (5): 4️⃣ COMPONENTES CLIENT, `app/dashboard/estoque/estoque-content.tsx` 🔄 ATUALIZADO, `app/dashboard/produtos/produtos-content.tsx` 🔄 SIMPLIFICADO, code:typescript (// Input de arquivo para imagem:), code:typescript (// ❌ Não existe mais: Diálogo de seleção de materiais)

### Community 64 - "Community 64"
Cohesion: 0.67
Nodes (3): code:bash ($(cat .graphify_python) -c "), code:block4 (Corpus: X files · ~Y words), Step 2 - Detect files

### Community 67 - "Community 67"
Cohesion: 0.50
Nodes (3): Indice de documentacao, Leitura recomendada, Observacoes

### Community 69 - "Community 69"
Cohesion: 0.33
Nodes (5): code:bash (graphify query "<question>"), code:bash (graphify update .), graphify, Rules, Token-saving workflow

## Knowledge Gaps
- **418 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+413 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 1` to `Community 0`, `Community 7`, `Community 13`, `Community 18`, `Community 19`, `Community 22`, `Community 23`, `Community 25`, `Community 28`, `Community 29`, `Community 30`, `Community 33`, `Community 34`, `Community 35`, `Community 37`, `Community 40`, `Community 41`, `Community 46`, `Community 47`, `Community 48`, `Community 51`, `Community 52`, `Community 54`, `Community 57`?**
  _High betweenness centrality (0.198) - this node is a cross-community bridge._
- **Why does `createAuthenticatedClient()` connect `Community 36` to `Community 32`, `Community 10`, `Community 12`, `Community 14`, `Community 48`, `Community 20`, `Community 26`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `Button()` connect `Community 0` to `Community 1`, `Community 37`, `Community 13`, `Community 47`, `Community 48`, `Community 19`, `Community 25`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _418 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05794582065768506 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07560975609756097 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.038461538461538464 - nodes in this community are weakly interconnected._