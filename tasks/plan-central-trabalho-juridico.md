# Plano — Central de Trabalho Jurídico

Plano aprovado pelo usuário em 05/11/2026; especificação: `docs/specs/SPEC-central-trabalho-juridico.md`. Execução somente no desenvolvimento.

- [x] Access: inventário de legados, modelagem aditiva de equipe/revisão/histórico e migração revisada no desenvolvimento.
- [x] Access: guards frescos de perfil, equipe e condomínios; testes positivos/negativos com dois condomínios e carteiras revogadas.
- [x] Work: proteger contratos antigos; criação/delegação/execução/entrega/revisão/cancelamento atômicos e histórico/notificações.
- [x] Work: proteger demandas, contexto mínimo, comentários, anexos e lotes sem efeitos parciais de seleção inválida.
- [x] UI: central Minhas/Equipe, filtros e lista/Kanban compartilhados; painel lateral e criação rápida.
- [x] UI: configuração administrativa de equipe, vínculos e gerentes, sem promoção a admin; compatibilidade da aba Tarefas da demanda.
- [x] Tests: específicos, suíte completa em série, TypeScript e build.
- [x] Docs: manual e rollback seguro em `docs/central-trabalho-juridico-piloto.md`; riscos/pendências e versão de entrega preparada para checkpoint.
- [ ] Piloto manual do usuário: gerente, advogado e estagiário — homologação externa, não marcar por testes mockados.

Validação de 05/11/2026: 708 testes aprovados / 1 externo BTG opt-in ignorado; 74 suítes aprovadas / 1 ignorada. TypeScript e build aprovados; diff sem problemas de whitespace. Inventário inicial: 25 demandas, nenhuma sem condomínio, zero tarefas. Migração 0098 aplicada somente no desenvolvimento. Consulta real somente leitura confirmou guard e listas/contador com zero tarefas. Componentes reais do Kanban inspecionados com quatro cartões fictícios, sem dados de teste no banco. Redirecionamento sem sessão para login-admin confirmado. Não houve homologação autenticada com três profissionais.

Limites deliberados: filtros de prazo/busca/sem responsável e indicadores da equipe consideram a página carregada, conforme rótulos na interface; seletores vêm dos registros autorizados carregados. Mudança de estado usa comandos acessíveis no painel, sem arraste livre. Revisão opcional desabilitada por padrão. Não se alterou a política de encerramento de demanda com tarefas abertas.

Frentes paralelas concluídas: tarefas backend, proteção de demandas e UI em arquivos distintos. Integração final incluiu tipagem do lote, catálogo RBAC atualizado, testes de acesso/equipe e validação serial. Sem novas dependências, sem deploy, sem modificar financeiro/BTG.
