# Resumo da Demanda

A Central de Trabalho Jurídico reúne a execução individual e o acompanhamento pela gestão. Uma única tarefa, vinculada obrigatoriamente a uma demanda, aparece em Minhas Tarefas para o executor e em Equipe para a gestora autorizada. Esta evolução foi aprovada em 05/11/2026 e está implementada e validada tecnicamente no desenvolvimento, pronta para o piloto manual.

# Classificação

Melhoria funcional do jurídico, com reforço de autorização, cadastro explícito de equipes e preservação do histórico. Complexidade grande; segurança multi-condomínio é um critério de liberação.

# Problema Atual

A organização anterior privilegiava o caso/demanda e não oferecia uma visão conjunta clara das atividades dos advogados e estagiários. Compartilhar um condomínio não identifica quem gerencia quem. Uma lista filtrada na interface também não protege, sozinha, acessos diretos por ID.

# Solução Proposta

Manter a demanda como caso jurídico e utilizar tarefas como unidade de trabalho diário. O administrador configura equipe e gestores explicitamente, sem promover a advogada gerente a administradora global. Os mesmos registros de tarefa e histórico alimentam as visões individual, de equipe e da demanda.

# Escopo

Central na rota `/minhas-tarefas`, abas Minhas Tarefas e Equipe, lista e Kanban, filtros, painel lateral, execução, entrega, revisão opcional, impedimentos, cancelamento, comentários e histórico. Cadastro administrativo de equipes e vínculo explícito entre demanda e equipe.

# Fora do Escopo

Não há deploy na VPS nesta entrega. Não há importação ou integração com Trello, tarefas sem demanda, avisos externos, automações, mudança de prazos processuais ou alterações no BTG, cobranças e financeiro. Não foi definida nova política de bloqueio do encerramento da demanda quando existirem tarefas abertas.

# Módulos Impactados

`juridico-access` concentra a autorização por identidade atual, perfil, equipe e carteira. `juridico-work` concentra tarefa, comandos e histórico. `juridico-ui` apresenta as duas visões. `juridico-adoption` cobre configuração e piloto. Os módulos de processos, pagamentos e integrações não são alterados.

# Regras de Negócio

A demanda é obrigatória. Delegar para outro profissional exige equipe explícita e responsável elegível para o condomínio. Colaboradores jurídicos, inclusive estagiários, podem ser executores. Compartilhar carteira ou possuir um perfil chamado Gerente não concede gestão.

Revisão vem desabilitada por padrão e é configurada por tarefa. Quando habilitada, exige texto de entrega e aprovação/devolução pela gestão autorizada, nunca pelo próprio executor, mesmo que seja administrador. Devolução, cancelamento e impedimento exigem motivo. Cancelamento e ocultação de comentário preservam registros.

Concluir uma tarefa não encerra a demanda, o processo ou qualquer prazo judicial. Tarefas antigas não recebem aprovação retroativa fictícia.

# Fluxo da Funcionalidade

O administrador configura perfil, carteira e equipe; vincula a demanda à equipe; a gestora cria a tarefa e escolhe o responsável. O executor abre Minhas Tarefas, inicia o trabalho, registra comentários e entrega. A gestora acompanha o mesmo cartão na aba Equipe. Se houver revisão, aprova ou devolve com motivo. Reatribuição, mudanças e comandos ficam no histórico da mesma tarefa.

Para mudar o estado, abrir o cartão e usar os comandos do painel. O Kanban organiza os quatro estados visuais; não há arraste livre que dispense as validações de entrega e revisão.

# Telas e Experiência do Usuário

A Central de Trabalho Jurídico preserva a rota `/minhas-tarefas`, agora com o rótulo Central de Trabalho no menu. A aba Equipe só aparece com vínculo gerencial e RBAC adequado. O administrador acessa Configurar equipe na própria central.

Lista e Kanban usam os mesmos registros. Filtros incluem estado, prioridade, condomínio, demanda, responsável e busca, com atalhos de prazo interno. O painel mantém contexto mínimo, impedimento, entrega, comentários e histórico. Alterações invalidam as consultas relacionadas; consultas abertas são atualizadas a cada 30 segundos em primeiro plano.

A visão de equipe é paginada. Os rótulos distinguem os contadores e recortes da página dos totais do filtro no servidor; quantidade não mede esforço ou qualidade. A aba Tarefas da demanda reutiliza os componentes da central. Links da demanda usam `/admin/juridico/demanda/:id`.

# Dados e Banco de Dados

A migração `drizzle/0098_clumsy_sleepwalker.sql` acrescenta equipes, membros, eventos, notificações internas, vínculo demanda-equipe e dados de revisão/bloqueio/datas/versão. O enum preserva os valores antigos e acrescenta revisão e cancelamento. Não contém DROP ou DELETE. Foi aplicada exclusivamente ao banco de desenvolvimento.

O inventário inicial encontrou 25 demandas, todas com condomínio, e nenhuma tarefa. Equipes não são inferidas ou criadas automaticamente. Nenhum dado de piloto foi inserido pelo SQL de validação.

# Permissões

## Configuração inicial pelo administrador

1. Em Perfis e Permissões, editar ou criar o perfil da gestora. Conceder as ações necessárias em Central de Demandas (`juridico_demandas`). Em Gestão da Equipe Jurídica (`juridico_equipe`), conceder Visualizar, Criar, Editar e Aprovar conforme a função. Não conceder financeiro, usuários ou configurações apenas para gerir tarefas.
2. No cadastro dos profissionais, vincular cada pessoa à carteira de condomínios autorizada. Para estagiário, usar papel Colaborador e perfil jurídico com Visualizar e Editar em Central de Demandas; Criar somente se autorizado a criar atividade própria em um caso ao qual já tem acesso.
3. Na central, clicar Configurar equipe. Selecionar profissionais jurídicos ativos e pelo menos um gestor explícito. O perfil do gestor deve ter Visualizar em Gestão da Equipe Jurídica antes de salvar a equipe. Ser membro não equivale a ser gestor.
4. Em Configurar equipe, abrir a aba Vincular demanda; escolher o caso e a equipe, e clicar Confirmar vínculo. A operação verifica o responsável do caso e os executores atuais; se um deles for incompatível, o vínculo inteiro é recusado. Corrigir perfil/carteira/membros antes de tentar novamente.
5. Na aba Equipe, criar uma tarefa com demanda obrigatória. O nome do executor é obtido no servidor, não aceito como identidade livre do navegador.

Nenhum perfil existente recebeu o novo módulo automaticamente. A carteira é verificada mesmo para tarefa própria. Permissões e vínculos são consultados novamente em cada requisição. Contexto herdado de tarefa não concede anexos, financeiro nem edição da demanda. Reatribuição remove o acesso do executor anterior, salvo outro vínculo atual independente.

## Credenciais de login e permissões de trabalho

Em 05/11/2026, o usuário optou por ajustar as credenciais dos profissionais posteriormente. A implementação não depende de escolher uma pessoa ou de fixar seus dados no código. Login e senha autenticam a conta; perfil, equipe e carteira autorizam cada operação. A identidade persistente utilizada nas tarefas é o ID do usuário.

| Configuração | Efeito |
| --- | --- |
| Login, e-mail ou senha | Identifica/autentica a conta; não concede gestão ou carteira |
| Perfil jurídico de execução | Permite as ações configuradas sobre tarefas autorizadas |
| Permissões de gestão + vínculo como gestor | Permite acompanhar e delegar atividades da equipe, dentro da carteira |
| Carteira de condomínios | Restringe os casos acessíveis, inclusive tarefas próprias |
| Conta inativa/excluída ou permissão revogada | Recusa o acesso na próxima verificação do servidor |

Para trocar nome/e-mail/senha de um profissional, utilizar a mesma conta existente quando for a mesma pessoa. Criar outra conta gera outra identidade; não transfere tarefas nem deve ser usado para dar a outra pessoa acesso ao histórico de um profissional. Trocar de responsável exige reatribuição auditada. Nomes nos eventos antigos permanecem como snapshots do momento do evento.

Sem um gestor e carteiras configurados, o sistema não inventa uma equipe para viabilizar testes. Nenhuma senha, perfil, papel, carteira ou responsabilidade de usuário real foi alterada por esta validação. O piloto humano segue pendente, mas não bloqueia a implementação genérica por permissões.

Validação adicional de 05/11/2026: três regressões novas demonstram independência de nome/e-mail/credencial, recusa de papel administrativo desatualizado na sessão e distinção de gestor/membro mesmo com perfil idêntico. 90 testes específicos aprovados; suíte completa com 711 aprovados e um externo BTG opt-in ignorado. TypeScript e build aprovados. As únicas alterações adicionais são testes e documentação; sem mudanças de banco, autenticação ou concessões reais de acesso.

# Integrações e Automações

Notificações são registros internos gerados junto da atribuição, entrega e devolução. A consulta aplica a autorização atual da tarefa e não amplia os direitos de quem recebeu o aviso. Não há e-mail, WhatsApp, timers ou chamadas externas nesta evolução.

# Histórico e Auditoria

Comandos e alterações de tarefa registram evento com autor atual, valores anterior/novo e data, na mesma transação da alteração. Controle de versão evita sobrescrever uma edição antiga. Configuração da equipe e vínculo da demanda também registram auditoria. Comentário ocultado não é apagado fisicamente. Demanda com tarefas não pode ser excluída fisicamente por esse fluxo.

# Critérios de Aceite

Dado um executor autorizado, quando abre Minhas Tarefas, então vê apenas suas atividades dentro da carteira atual. Dado um colega ou ex-executor, quando tenta um ID alheio, comentários ou contadores, então não recebe dados fora de escopo.

Dada uma gestora explícita, quando abre Equipe, então vê os casos da equipe nas carteiras autorizadas, sem precisar de papel administrador. Dado um membro sem gestão, então a visão gerencial é recusada.

Dada uma tarefa com revisão, quando o executor entrega, então o estado é Em revisão e o texto é preservado. Quando tenta aprovar a própria entrega, então a ação é recusada. Quando a gestora devolve sem motivo, então a operação é recusada sem alteração parcial.

Dada uma seleção de demandas contendo um item fora de escopo, quando tenta uma operação em lote, então nenhuma demanda é modificada. Dado um vínculo de equipe com responsável incompatível, então nenhuma mudança ou timeline de sucesso é persistida.

Dado um filtro sem resultados ou acesso revogado, então cartões antigos não permanecem como resultado válido. Dada a mesma tarefa nas três entradas, então ID, estado e histórico são compartilhados.

# Tarefas Técnicas

A especificação viva está em `docs/specs/SPEC-central-trabalho-juridico.md`; o checklist verificável está em `tasks/plan-central-trabalho-juridico.md`. Testes de autorização, equipe, demanda/anexos/lotes e transições ficam em `server/**/*.test.ts`. A validação final usa `pnpm exec vitest run --no-file-parallelism --reporter=default`, `pnpm check` e `pnpm build`.

Validação final em 05/11/2026: 708 testes aprovados e um teste externo BTG opt-in ignorado; 74 suítes aprovadas e uma ignorada. TypeScript e build aprovados; `git diff --check` limpo. Leitura no banco de desenvolvimento confirmou guard, lista pessoal, lista gerencial e contador com zero tarefas, sem gravação de dados de teste. O Kanban real foi inspecionado no navegador com quatro cartões fictícios, um por estado, incluindo impedimento. A entrada sem sessão foi confirmada com redirecionamento para `/login-admin`. Isso não equivale à homologação autenticada com gerente e executores.

# Riscos e Dependências

A configuração de perfis, carteiras, membros e vínculo de caso é obrigatória; sem ela a central não distribui casos automaticamente. Testes unitários e transacionais usam cenários sintéticos e não substituem o piloto com os profissionais. A revisão deve ser habilitada somente onde a gestora desejar.

## Retorno seguro no desenvolvimento

O código pode ser restaurado ao checkpoint anterior `85a610a6`, sem apagar tabelas/colunas aditivas. Não executar migration reversa destrutiva nem excluir tarefas/históricos criados no piloto. Fazer backup antes de qualquer restauração futura. Retornar ao código anterior também retira as novas proteções de tarefas/demandas; não manter esse código disponível a usuários de piloto. Preferir interromper o piloto e corrigir a nova versão.

A produção permanece separada. Uma implantação futura precisa de autorização específica, backup do banco/aplicação, inventário de schema da VPS, revisão isolada da migração 0098 e roteiro de verificação. Não executar `drizzle-kit migrate` ou `db:push` global na VPS.

# Pendências para Validação

O piloto com gestora, advogado e estagiário ainda depende da validação do usuário. Preparar dois condomínios de teste e casos fictícios, sem dados financeiros reais.

Verificar a mesma tarefa nas visões, entrega sem revisão, entrega com revisão, devolução com motivo, negativa de autoaprovação, reatribuição e perda de acesso antigo. Revogar carteira/permissão e verificar a próxima requisição. Testar um membro não gestor, outro condomínio e outra equipe. Conferir comentários, impedimento, histórico, filtros vazios e atualização entre duas sessões.

A política de encerramento da demanda com tarefas abertas continua pendente de decisão funcional, não de implementação desta central.

# Próximos Passos

Iniciar o piloto manual no desenvolvimento seguindo a configuração acima. A implementação e a validação técnica foram concluídas; configuração de profissionais e homologação humana permanecem explicitamente pendentes. Nenhuma publicação ou mudança na VPS é autorizada por este roteiro.
