# Plano de Migração Front-end Global — Sistema de Gestão de Cobranças

## Resumo da Demanda

Aplicar uma linguagem visual única a todos os módulos do sistema, tomando como referência a combinação aprovada: cabeçalho executivo com métricas e ação principal evidente, somado a painéis laterais para ações contextuais. A migração deve melhorar clareza, consistência, responsividade e acessibilidade sem alterar regras financeiras, jurídicas, integrações, permissões, rotas, payloads tRPC ou cálculos existentes.

## Classificação

Melhoria estrutural de front-end e experiência do usuário, de prioridade alta e complexidade grande.

## Premissas

O sistema continuará em React, TypeScript, Tailwind, shadcn/Radix, Wouter e tRPC. A referência visual combina uma sidebar navy, superfícies claras e discretas, azul cobalto para ação primária, verde para sucesso, âmbar para atenção e vermelho para risco. Nenhuma mudança de banco, endpoint, credencial, integração ou regra de negócio faz parte desta migração. O modo claro e o modo escuro continuam suportados.

## Problema Atual

As cerca de 94 páginas foram desenvolvidas em diferentes momentos e têm cascas, cabeçalhos, filtros, tabelas, cards, badges, confirmações e estados de carregamento diferentes. Há também dois layouts concorrentes (`Layout` e `DashboardLayout`), além de componentes duplicados para prioridade, paginação, modal e indicadores de status.

O maior risco não é estético: as páginas combinam apresentação com consultas tRPC, invalidações, filtros por condomínio, controle RBAC, cálculos em centavos, emissão de boletos, CNAB, BTG, acordos, processos e integrações. Uma reformulação ampla em uma única entrega poderia alterar acidentalmente visibilidade de menus, escopo de dados ou uma ação financeira.

## Solução Proposta

Executar a migração em ondas pequenas e reversíveis. Cada onda introduz ou consome componentes de apresentação compartilhados, mantendo as chamadas tRPC, estados, callbacks, payloads, guards e rotas literalmente intactos. A nova identidade será consolidada primeiro na fundação visual e no shell autenticado; em seguida, aplicada às telas de menor risco; por último, aos módulos financeiros, jurídicos e de integração.

## Mapa de Capacidades

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `foundation` | Tokens, tipografia, superfícies, estados semânticos e primitivas compostas | — |
| `app-shell` | Layout autenticado, sidebar, topbar, navegação mobile e largura de conteúdo | `foundation` |
| `list-patterns` | Cabeçalhos, filtros, tabelas, paginação, KPIs e estados vazios | `foundation`, `app-shell` |
| `read-only` | Dashboards, relatórios, auditoria, históricos e monitoramentos | `list-patterns` |
| `cadastros` | Condomínios, usuários, perfis, importações e formulários comuns | `list-patterns` |
| `cobranca-operacional` | Devedores, cobrança ativa/passiva, tentativas e visão 360 | `list-patterns`, `cadastros` |
| `acordos-financeiro` | Acordos, parcelas, boletos, CNAB, retorno e BTG | `cobranca-operacional` |
| `juridico` | Demandas, processos, prazos, intimações, publicações e kanbans | `list-patterns`, `cadastros` |
| `integracoes-config` | E-mail, WhatsApp, MNI, fluxos, configuração de boleto e permissões | `foundation`, `cadastros` |
| `retirada-legado` | Remoção de layouts e componentes duplicados sem consumidores | Todos os módulos anteriores |

**Ordem de construção:** `foundation` → `app-shell` → `list-patterns` → `read-only` e `cadastros` → `cobranca-operacional` e `juridico` → `acordos-financeiro` e `integracoes-config` → `retirada-legado`.

## Linguagem Visual Alvo

A casca autenticada terá sidebar compacta em azul-marinho, área de conteúdo em superfícies claras, densidade operacional moderada e espaços consistentes. Todo módulo seguirá uma hierarquia fixa: contexto e breadcrumb, título e descrição, ações primária/secundária, métricas quando relevantes, filtros, conteúdo principal e estados de suporte.

Ações que exigem revisão sem perder o contexto — como selecionar parcelas, filtrar uma remessa, revisar exceções ou tratar publicações — usarão `Sheet` lateral. Confirmações de impacto usarão `AlertDialog`; operações simples continuarão com feedback por toast. Tabelas conservarão as colunas e dados existentes, mas receberão toolbar, densidade, alinhamento monetário, overflow e ações padronizados.

## Escopo

A migração inclui tokens globais, componentes compostos de apresentação, navegação, responsividade, telas autenticadas, formulários, tabelas, dashboards, jurídico, operação de cobrança e configurações. Inclui padronização de estados de carregamento, vazio, erro, status, prioridade, confirmação e ações pendentes.

## Fora do Escopo

Não inclui redesenhar regras de negócio, consolidar entidades, mudar schema, trocar endpoints, introduzir dependências sem aprovação, alterar RBAC, corrigir rotas funcionais por efeito colateral, remover telas legadas em uso, trocar o cliente tRPC ou alterar fórmulas financeiras. Alertas de rota e permissão encontrados na auditoria serão documentados e tratados em demandas funcionais separadas.

## Módulos Impactados

A fundação afeta `client/src/index.css`, `App.tsx`, `Layout.tsx`, `Sidebar.tsx`, `DashboardLayout.tsx`, `DashboardLayoutSkeleton.tsx` e os primitivos em `client/src/components/ui/`. Os módulos de operação incluem Devedores, Cobranças, Operações, Tentativas, Acordos, CNAB, BTG e dashboards. O jurídico inclui Demandas, Processos, Prazos, Intimações, Publicações, Kanbans e configurações MNI. A administração inclui Condomínios, Usuários, Perfis, Auditoria, Importações, Régua, E-mail, WhatsApp e fluxos de atendimento.

## Regras de Migração

1. Nenhuma tela pode trocar ou encapsular uma `query` ou `mutation` tRPC no mesmo lote em que sua aparência é migrada. Entradas, `enabled`, `refetch`, `invalidate`, callbacks de sucesso/erro e payloads devem ser preservados.
2. URLs, parâmetros, query strings, ordem das rotas, `ProtectedRoute`, `PermissionRoute`, `allowedRoles` e `requiredModulo` são contratos congelados durante a migração visual.
3. Componentes novos recebem dados e callbacks por props. Eles não criam regras de domínio, cálculos de valores, seleção de IDs ou permissões próprias.
4. Valores financeiros continuarão usando o formato já definido por cada fluxo. A migração não deve assumir que todos os campos estão em reais ou em centavos; componentes reutilizáveis receberão formatadores ou tipos explícitos.
5. O menu continuará obedecendo simultaneamente role, RBAC e módulos ativos por condomínio. Visibilidade de navegação não substitui autorização de rota.
6. Operações destrutivas, financeiras e externas preservam suas confirmações, textos obrigatórios e prevenção de clique duplo.
7. Remoção de componentes legados só ocorrerá depois de busca estática, regressão visual e confirmação de zero consumidores.

## Ondas de Migração

| Onda | Entrega | Escopo | Risco | Critério de saída |
|---|---|---|---:|---|
| 0 | Baseline e congelamento | Matriz de rotas, roles, módulos, query strings, screenshots e casos críticos | Baixo | Cada rota terá comportamento esperado documentado por perfil e viewport. |
| 1 | Fundação visual | Tokens semânticos, fonte, foco, densidade, `PageShell`, `PageHeader`, `MetricCard`, `StatusBadge`, `EmptyState`, `LoadingState`, `ConfirmDialog` | Alto alcance / baixo funcional | Claro/escuro, teclado e componentes básicos aprovados sem alteração de contratos. |
| 2 | Casca e navegação | `Layout`, `Sidebar`, cabeçalho responsivo, scroll único e adaptação gradual do `DashboardLayout` | Médio | Desktop, tablet e mobile funcionam sem sidebar duplicada, scroll duplo ou perda de menu por role. |
| 3 | Consulta e leitura | Dashboards, relatórios, auditoria, históricos, monitoramentos, vencimentos e alertas em leitura | Baixo | KPIs, filtros, exportações e links apresentam os mesmos resultados antes e depois. |
| 4 | Cadastros e gestão comum | Condomínios, usuários, perfis, importações, listagens administrativas e formulários simples | Médio | Salvamento, edição, upload, paginação e retorno às listas preservados. |
| 5 | Cobrança operacional | Devedores, cobranças, processos de cobrança, operações, tentativas e Devedor 360 | Médio-alto | Busca, escopo de condomínio, ações de contato, timeline e seleção em lote sem regressão. |
| 6 | Acordos e financeiro | Acordos, acompanhamento, detalhes, simuladores, boletos/Pix, configuração bancária, CNAB, retorno e BTG | Crítico | Simulações, baixas, remessas, retorno, conciliação e confirmações financeiras validados em homologação. |
| 7 | Jurídico | Dashboards, demandas, processos, prazos, intimações, publicações, kanbans, assembleias e MNI | Alto | Links, permissões granulares, DnD, anexos, timelines e query strings preservados. |
| 8 | Integrações e configurações críticas | E-mail, WhatsApp, fila, fluxos, régua de cobrança, RBAC e segredos | Crítico | Máscaras, confirmações, testes de conexão e execução controlada funcionam como antes. |
| 9 | Retirada de legado | `DashboardLayout`, badges, paginações, modais e CSS duplicados | Médio | Não há consumidores, regressões nem divergência de tema. |

## Plano de Execução por Onda

### Onda 0 — Baseline e caracterização

Criar uma matriz de rotas com URL, componente, layout, roles, módulo RBAC, item de menu, query strings e estados relevantes. Capturar telas de referência por perfil nos viewports 360 px, 768 px, 1024 px e desktop largo; cobrir modo claro e escuro. Para fluxos financeiros e jurídicos, registrar dados de homologação e resultados esperados antes da primeira mudança visual.

### Onda 1 — Fundação visual

Evoluir `index.css` com tokens semânticos para superfície, texto, borda, informação, sucesso, aviso, perigo e prioridade. Criar contratos de apresentação para página, cabeçalho, seção, métrica, badge, toolbar, tabela, vazio, erro, carregamento e confirmação. Os primitivos shadcn/Radix existentes permanecem a base; não haverá troca de framework ou biblioteca.

### Onda 2 — Casca e navegação

Definir `Layout + Sidebar` como casca canônica, pois já concentra navegação real, módulos ativos e RBAC. As quatro telas que hoje usam `DashboardLayout` devem ser migradas uma por vez para uma versão neutra de `PageShell`, eliminando sidebars aninhadas sem remover o layout legado no mesmo lote. Normalizar scroll, cabeçalho e experiência mobile por drawer, preservando URLs, menus e localStorage.

### Onda 3 — Leitura e relatórios

Aplicar a linguagem visual aos dashboards, relatórios, auditoria, histórico de disparos/importações, monitoramentos, vencimentos e buscas. Esta onda valida `MetricCard`, `FilterBar`, `DataTable` e estados transversais em páginas de baixo risco de escrita. Exportação, filtros de período e contexto de condomínio terão regressão manual obrigatória.

### Onda 4 — Cadastros e gestão comum

Migrar listas e formulários de condomínios, usuários, perfis, importações e telas administrativas simples. Cada página será tratada como uma fatia: toolbar, tabela, formulário e diálogos sem mudar mutations. Formulários com tabs, uploads e permissões serão testados com dados de homologação após cada fatia.

### Onda 5 — Cobrança operacional

Migrar Devedores, Processos de Cobrança, Operações, Tentativas e o Devedor 360. Antes de alterar o hub devedor, extrair blocos puramente visuais para métricas, timeline, ações rápidas, cartões de título e seções de acordo. Busca, paginação, alteração em lote, WhatsApp, documentos, custas e redirecionamento jurídico serão preservados em sublotes independentes.

### Onda 6 — Acordos e financeiro

Migrar primeiro listagens e acompanhamento de acordos; em seguida detalhes e visualização de parcelas; depois simuladores e modal de criação; por último baixa, quebra, boleto/Pix, configuração CNAB, remessa, retorno, exceções, BTG e conciliação. Cálculos em `shared/calculos` e regras de elegibilidade permanecem fora dos componentes visuais. Nenhuma alteração desse lote segue para Produção sem homologação financeira.

### Onda 7 — Jurídico

Migrar por subdomínio: dashboards e consultas; demandas; processos; prazos; intimações; publicações; kanbans; assembleias; configuração MNI. Kanban, editor rico, anexos, timelines e tratamentos de publicação serão preservados como comportamentos existentes. Links singulares/plurais e ordem de rotas de publicações serão apenas validados e registrados; eventuais correções entram em especificação funcional própria.

### Onda 8 — Integrações e configurações críticas

Migrar E-mail, WhatsApp, Fila, Fluxos, Régua, RBAC, BTG, MNI e Configuração de Boleto. Segredos continuam mascarados; texto de confirmação, sandbox, ações irreversíveis e estados de conexão não podem mudar de sentido. Operações externas serão testadas somente em homologação ou sandbox autorizado.

### Onda 9 — Retirada de legado

Somente depois de todas as telas consumirem a fundação nova, retirar layouts duplicados, `ManusDialog`, badges de prioridade duplicados, paginações redundantes e CSS sem consumidor. Cada exclusão terá busca estática, typecheck, build e navegação manual das páginas antes dependentes.

## Telas e Experiência do Usuário

Cada tela deverá usar a mesma estrutura: breadcrumb ou voltar quando houver hierarquia, título e descrição contextual, ações de maior importância no canto direito, cards de métricas quando ajudarem a decisão, filtros explicitando o contexto de condomínio, área principal de dados e estados claros de vazio, erro e carregamento.

Listagens usarão uma toolbar responsiva, busca, filtros em chips, opção de limpar filtros, tabela com ações agrupadas e overflow horizontal controlado. Formulários terão rótulos consistentes, obrigatoriedade visível, mensagem de ajuda e rodapé de ação com estado pendente. Ações contextuais de múltiplas etapas usarão drawer lateral, e ações irreversíveis usarão confirmação explícita.

## Dados e Banco de Dados

Não há alteração de banco, migration ou schema. Os dados atuais, histórico, auditoria e registros financeiros/jurídicos serão preservados. A mudança é exclusivamente de composição e estilo no cliente.

## Permissões

`ProtectedRoute`, `PermissionRoute`, `usePermissions`, regras da Sidebar e os módulos habilitados por condomínio permanecem inalterados. Cada onda terá uma matriz de validação por admin, síndico, cobrador, colaborador com perfil amplo/restrito e advogado com permissões parciais.

## Integrações e Automações

Não há alteração de contrato em BTG, CNAB, e-mail, WhatsApp, MNI, TJRJ, PJe, importações ou jobs. No máximo, a interface consumirá os mesmos estados existentes em novo envelope visual. Todos os segredos continuarão mascarados e fora de logs.

## Histórico e Auditoria

Nenhum log financeiro, jurídico ou de integração será apagado. Como a migração é visual, não será criado log funcional para cada ajuste de CSS. Mudanças que porventura alterem comportamento serão separadas em demandas com auditoria própria.

## Estratégia de Testes

A validação técnica mínima de cada fatia será:

```bash
cd /home/ubuntu/cobranca-frontend
pnpm check
pnpm exec vitest run --no-file-parallelism --reporter=default
pnpm build
```

A validação manual seguirá uma matriz com rotas diretas e navegação por menu, os seis perfis relevantes, tema claro/escuro, viewports 360/768/1024/desktop, teclado, foco, modais, drawers, tabelas, carregamento, vazio, erro e overflow. Para módulos financeiros, a validação inclui valores em centavos, filtros por condomínio, confirmação de baixa, CNAB, retorno e BTG Sandbox. Para jurídico, inclui RBAC granular, DnD, anexos, timelines, query strings e links entre demanda/processo/publicação.

Não serão adicionadas dependências de teste visual ou end-to-end sem aprovação prévia. A Onda 0 deve avaliar se o projeto deve adotar testes de screenshot no futuro.

## Critérios de Aceite

1. **Dado** qualquer usuário autorizado, **quando** abrir uma rota migrada por URL ou Sidebar, **então** verá a mesma tela funcional, os mesmos dados e as mesmas ações autorizadas, com o novo padrão visual.
2. **Dado** um usuário sem acesso, **quando** tentar uma rota migrada, **então** receberá o mesmo redirecionamento ou bloqueio atual.
3. **Dado** uma tabela financeira ou jurídica migrada, **quando** aplicar os filtros existentes, **então** os registros, totais, paginação e exportações serão idênticos ao baseline.
4. **Dado** uma ação de baixa, emissão, remessa, conciliação, cancelamento ou integração, **quando** o usuário abrir a interface migrada, **então** a confirmação, os bloqueios e a mutation original serão preservados.
5. **Dado** uma página migrada, **quando** acessada em desktop e mobile, **então** não apresentará sidebar duplicada, scroll duplo, conteúdo oculto ou ação inacessível.
6. **Dado** claro ou escuro, **quando** um estado semântico for exibido, **então** manterá contraste e significado visual coerente.

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Regressão em permissões e rotas | Congelar guards/URLs, validar matriz por role e evitar refatorar `App.tsx` junto com CSS. |
| Mudança acidental de valores ou cálculos | Não migrar cálculos; formatadores e valores atuais são recebidos por props. |
| Perda de escopo por condomínio | Preservar `enabled`, filtros e seletores; testar troca/limpeza de contexto. |
| Duplicidade de layouts e scroll | Migrar `DashboardLayout` gradualmente e validar uma tela por vez. |
| Contraste e tema inconsistentes | Introduzir tokens semânticos e revisar claro/escuro nos viewports definidos. |
| Ação crítica sem confirmação | Centralizar apenas a apresentação, preservando handlers, texto obrigatório e `isPending`. |
| Escopo excessivo | Uma onda por vez, checkpoints e aprovação antes de iniciar a seguinte. |

## Tarefas Técnicas de Alto Nível

| Sequência | Frente | Entrega verificável |
|---:|---|---|
| 1 | Baseline | Matriz de rotas/perfis/estados e checklist de regressão aprovado. |
| 2 | Fundação | Tokens e componentes visuais transversais sem consumidores críticos alterados. |
| 3 | Navegação | Casca canônica e páginas com layout duplicado migradas de forma compatível. |
| 4 | Leitura | Dashboards, relatórios e históricos visualmente padronizados. |
| 5 | Gestão | Cadastros e importações migrados por fatias. |
| 6 | Operação | Cobrança e Devedor 360 migrados com paridade funcional. |
| 7 | Financeiro | Acordos, CNAB, retorno e BTG homologados após migração visual. |
| 8 | Jurídico | Fluxos jurídicos e kanbans migrados com RBAC e links preservados. |
| 9 | Integrações | Configurações críticas migradas em ambiente seguro. |
| 10 | Legado | Componentes duplicados removidos após zero consumidores. |

## Pendências para Validação

1. Aprovar o mapa de capacidades e a ordem de ondas.
2. Confirmar que o `Layout + Sidebar` atual será a casca canônica, substituindo gradualmente os usos de `DashboardLayout`.
3. Definir se a migração inclui a mesma prioridade para modo escuro já na Onda 1 ou se o modo claro será homologado primeiro.
4. Decidir se a Onda 0 pode introduzir ferramenta de screenshot/e2e, o que exigirá nova dependência e aprovação específica.
5. Manter alertas funcionais já identificados — links jurídicos e ordem de rotas de publicações — fora desta migração visual, salvo autorização expressa para tratá-los como correções separadas.

## Próximos Passos

Após sua aprovação, inicio a Onda 0 com a matriz de rotas e baseline visual, sem alterar interface nem lógica. Em seguida, apresento uma especificação curta da fundação visual para aprovação antes de editar `index.css`, `Layout` e `Sidebar`.
