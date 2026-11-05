# Central de Trabalho Jurídico — execução do plano aprovado

Aprovado pelo usuário em 05/11/2026: executar o estudo `estudo-gestao-demandas-juridicas-luminus-2026-11-05.md`. Implementação em desenvolvimento, sem deploy na VPS. React/TypeScript/tRPC/Drizzle/MySQL existentes; nenhuma nova dependência.

## Mapa de capacidades e ordem

| ID | Responsabilidade | Dependência |
| --- | --- | --- |
| juridico-access | Identidade ativa, RBAC fresco, equipe explícita e carteira multi-condomínio | — |
| juridico-work | Cadastro único de tarefa, delegação, execução, revisão e histórico | juridico-access |
| juridico-ui | Minhas Tarefas / Equipe, quadro e painel compartilhado | juridico-work |
| juridico-adoption | Configuração administrativa e roteiro de piloto | juridico-ui |

## Escopo e regras

Demanda continua sendo o caso; tarefa é a atividade diária. Contexto obrigatório: demanda existente. Equipes são cadastradas pelo administrador, com membros ativos e gestores explícitos. Advogados e colaboradores (inclusive estagiários com perfil jurídico) são elegíveis. Ninguém se torna gestor pelo nome do perfil ou por compartilhar condomínio. Gestor precisa do vínculo de gestão e das ações RBAC; não ganha financeiro/usuários/configurações. Administrador pode operar globalmente.

Cada demanda pode receber `equipeId` explicitamente. Legados sem equipe mantêm leitura pelo responsável/criador e acesso administrativo, nunca são distribuídos automaticamente. A delegação a outro usuário exige equipe explícita e vínculo ativo desse usuário ao condomínio. Casos internos sem condomínio somente para administrador nesta versão. Contexto mínimo da demanda pode ser lido pelo executor da tarefa, sem acesso automático a documentos e financeiro do caso. O antigo executor perde acesso quando a atribuição muda, salvo outro vínculo atual independente.

Permissões existentes `juridico_demandas` continuam necessárias. Nova capacidade RBAC `juridico_equipe` por ação para gestão (visualizar/criar/editar/aprovar). Configuração das equipes: somente admin. Verificação no servidor em toda lista, ID, comentário, contador e ação; vínculo e permissões consultados novamente a cada request, sem depender de cache de cinco minutos.

Quatro estados visuais: A fazer (`pendente`), Em andamento, Em revisão, Concluída. Cancelada fica no histórico. Revisão opcional por tarefa, desabilitada por padrão para não impor uma política ainda não definida pela gerente. Quando ativada, entrega exige texto; somente gestor autorizado aprova/devolve, nunca o próprio executor. Devolução e cancelamento exigem motivo. Bloqueio com motivo é marcador, não estado adicional. Início/entrega/conclusão/retorno, alterações, reatribuições e comentários ficam vinculados à mesma tarefa. Datas antigas não recebem aprovações fictícias. Exclusão de tarefa passa a cancelamento; comentários excluídos são preservados como ocultos. Demandas com tarefas não podem ser apagadas fisicamente nesta implementação.

Não alterar automaticamente demanda/processo/prazo quando tarefa é concluída. Política de conclusão da demanda com tarefas abertas: manter regra de estado existente nesta entrega, sinalizar pendências; bloqueio/exceção de fechamento exige decisão específica da gerente e não será inventado.

Notificações internas event-driven no mesmo banco para atribuição, entrega e devolução; consulta autorizada pela tarefa atual. Nenhum agendamento, email/WhatsApp ou Trello privado. Indicadores expressam quantidade, não qualidade ou esforço.

## Banco (aditivo)

`juridicoEquipes`, `juridicoEquipeMembros`, `tarefaEventos`, `tarefaNotificacoes`; `demandas.equipeId`; campos de revisão, bloqueio, datas e versão em `tarefasDemanda`; enum estendido preservando valores antigos; `tarefaComentarios.oculto`. Índices por equipe/usuário, responsável/status e tarefa/data. Não mudar valores financeiros. Inventário somente leitura de órfãos/inativos antes de migrar.

## Contratos centrais do servidor

`server/juridico-access.ts` expõe:
- `getJuridicoScope(actor, acao='visualizar')`: `{ actor, admin, condominioIds, equipeIds, gestorEquipeIds, canManage, canCreate, canEdit, canApprove }`.
- `assertDemandaAccess(actor, demandaId, acao='visualizar', contextoTarefa=false)`: `{ demanda, scope, acessoCompleto, gerencia }`. NOT_FOUND fora de escopo.
- `assertTarefaAccess(actor, tarefaId, acao='visualizar')`: `{ tarefa, demanda, scope, gerencia }`. Executor atual ou gestor da equipe explicitamente atribuída ao caso, sempre com carteira.
- `assertResponsavelElegivel(actor, demanda, responsavelId)`: usuário ativo, perfil jurídico de visualização, membro da equipe e condomínio autorizado. Nome vem do servidor.
- `demandaScopeCondition(scope, incluirContextoTarefa=false)` e `tarefaScopeCondition(scope, somenteMinhas=false)` produzem predicados SQL autorizados.

Todas as mutations críticas usam transação + controle de versão para evitar atualizar estado antigo; valores de identidade/nomes vêm do servidor.

## Interface

Preservar `/minhas-tarefas` como entrada da central, abas Minhas/Equipe e acesso à configuração de equipe somente admin. Lista/Kanban, atalhos Hoje/Atrasadas/7 dias/Todas, filtros de pessoa/carteira/demanda, painel lateral persistente com contexto, comentários, histórico, entrega/revisão e bloqueios. Caso sem equipe orienta configuração, sem ampliar acesso. Aba de tarefas da demanda usa a mesma camada. Rotas de demanda corrigidas para `/admin/juridico/demanda/:id`. Atualização de cache invalida todas as visões; atualizar periodicamente enquanto aberta para refletir alterações de outra sessão.

## Código e verificação

Exemplo: `await assertTarefaAccess(ctx.user, input.id, 'editar');` antes de ler comentários ou persistir; preferir funções testáveis, erros tRPC e transações. Arquivos em server/routers e server/juridico-access.ts; UI em client/src/components/juridico e páginas existentes. Vitest em server/*.test.ts, sem chamadas bancárias ou documentos reais.

Comandos: `pnpm exec vitest run --no-file-parallelism --reporter=default`, `pnpm check`, `pnpm build`. Migration: `pnpm exec drizzle-kit generate`, revisar SQL e aplicar somente no desenvolvimento via ferramenta WebDev. Nunca executar migrate/push global na VPS. Checkpoint somente após validação.

## Critérios de aceite

1. Executor só vê/altera suas atividades e perde acesso após reatribuição, inclusive comentários e contadores.
2. Gestora vê membros sob sua gestão dentro das carteiras autorizadas, sem role admin.
3. Colaborador jurídico aparece como executor elegível; inativo, excluído, perfil incompatível, outra equipe ou carteira revogada são recusados.
4. Revisão habilitada impede autoaprovação e exige entrega/motivo; estado e histórico são atômicos.
5. Nenhum encerramento de tarefa altera prazo processual, processo, cobrança ou responsabilidade do caso.
6. Legados mantidos; filtros vazios limpam quadros; rotas funcionam; mesmos dados em lista/equipe/demanda.
7. Equipes e permissões configuráveis por admin; sem migração automática de todos os usuários.

## Limites e piloto

Sempre: validar inputs/autorizações/testes, preservar histórico. Perguntar antes: liberar produção, importar Trello, ativar avisos externos, impor revisão por perfil ou mudar encerramento de demanda. Nunca: segredos em logs, bypass por perfil chamado Gerente, SQL destrutivo, mexer no BTG/financeiro. Piloto manual com gerente/advogado/estagiário e dois condomínios ficará pendente até validação do usuário.

## Registro da implementação e validação

Implementação técnica concluída em 05/11/2026 no desenvolvimento. Equipe paginada, com filtros de prazo/busca/sem responsável e indicadores explicitamente do recorte carregado; seletores derivam dos registros autorizados da página. Kanban usa comandos no painel, sem arraste livre. Histórico do painel paginado em blocos de 50, preservando consulta dos eventos antigos. Configuração e vínculo de demanda disponíveis em Configurar equipe, exclusivamente na central administrativa.

Resultado final: 708 testes aprovados e um externo BTG opt-in ignorado, TypeScript/build aprovados e diff limpo. Leitura real do banco confirmou guarda/listas/contador com zero tarefas; nenhum dado de teste foi inserido. Componentes reais do Kanban conferidos com quatro cartões sintéticos e entrada sem sessão redirecionando para login-admin. Migração 0098 aplicada exclusivamente no desenvolvimento. Manual: `docs/central-trabalho-juridico-piloto.md`. Piloto autenticado e implantação em produção não realizados.
