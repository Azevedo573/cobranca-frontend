# Spec: usuarios-escopo-condominios

## Objective e aprovação

Usuário aprovou em 10/11/2026 às 11:41: **Advogado e Colaborador interno** podem ter acesso a todos os condomínios ativos atuais/futuros ou somente aos selecionados. Implementação e migration aditiva autorizadas somente no desenvolvimento. Síndico/Cobrador mantêm regras atuais, admin mantém global administrativo. Usuários existentes não recebem concessão/revogação automática. Proposta revisada em `/home/ubuntu/entregas/PROPOSTA-acesso-usuarios-condominios-2026-11-10.md`.

Perfil determina ações; escopo determina condomínios. Global não concede role admin, RBAC, perfil personalizado, gestão de equipes/tarefas alheias nem funções bancárias administrativas. Não tocar VPS, Nginx, segredos, BTG/emissão/cancelamento/baixa, dívidas/valores/snapshots ou migration Jurídica0098.

## Tech Stack e Commands

React19/TypeScript/tRPC/DrizzleMySQL/Vitest existentes; nenhuma dependência nova. Preservar estilo visual e componentes shadcn do cadastro atual, sem redesign geral.

- Gerar SQL: `pnpm exec drizzle-kit generate`, ler SQL e aplicar exclusivamente a alteração aprovada usando ferramenta SQL do projeto de desenvolvimento; nunca migrations gerais.
- Específicos: `pnpm exec vitest run server/tenant-guard.test.ts server/tenant-escopo-condominios.test.ts server/user-management-security.test.ts server/user-primary-admin-contract.test.ts server/usuarios-escopo-condominios.test.ts --no-file-parallelism`, mais testes novos de UI/rotas consumidores.
- Completa: `BTG_SANDBOX_CREDENTIAL_CHECK=false pnpm exec vitest run --no-file-parallelism`.
- Tipos/build/integridade: `pnpm check`; `pnpm build`; `git diff --check`.
- SQL somente aditivo: acrescentar em `users` uma coluna enum nullable `escopoCondominios ('selecionados','todos')` sem default não nulo. Registros existentes ficam NULL. Não inserir dados fictícios pela ferramenta SQL; testes por mocks/fixtures, inspeção visual com callbacks fictícios sem mutations reais.

## Project Structure e responsabilidades

- Parent: `drizzle/schema.ts`, migration0104/meta, provisionador seletivo, `server/tenant-guard.ts`/helper puro de escopo e regressões, filtros/guards consumidores fora do CRUD users, integração/check/docs/checkpoint.
- Backend cadastro: novo helper/serviço transacional para `users.create/update/list/getById/listByCondominio` e testes; apenas seção `users` de `server/routers.ts` se necessário, não editar outros blocos.
- Frontend: `client/src/pages/admin/UserForm.tsx`, `Users.tsx` e helper/testes de estado/payload; não editar backend/schema/rotas globais.

## Contrato persistido e API

`users.escopoCondominios: 'selecionados' | 'todos' | null`.

- NULL = legado; não inferir global nem reclassificar em nome/senha/status. Compatibilidade explícita de filtros anteriores; nenhuma atribuição em lote.
- Novos cadastros elegíveis gravam escolha explícita (ausência pode cair no padrão conservador selecionados com vínculos válidos para clientes legados). Não usar escolha implícita todos.
- `users.create/update` aceitam campo `escopoCondominios` opcional enum; só advogado/colaborador podem gravar escopo explícito; outros roles rejeitam payload indevido. Mudança de role de elegível para outro deve limpar escopo global e validar carteira antes da gravação, sem manter concessão escondida.
- Principal `condominioId` nullable opcional apenas como preferência. No global, permitir null ou ID ativo válido; não exigir vínculo individual. Em selecionados, deve estar entre os IDs autorizados; pode escolher primeiro ID como preferência quando não informado.
- `condominioIds` é a carteira explícita do restrito, válida/ativa/sem duplicidades. Array vazio nunca é global. Global com IDs não vazios exige contrato coerente: interface envia [] e backend rejeita mistura para evitar concessão ambígua. Principal global não representa autorização.
- Em update, omitir escopo e vínculos preserva todos esses campos. Nome/email/senha/status não reclassificam antigos. Limpeza/role/escopo/lista e auditoria gravados atomicamente com rollback. Não apagar usuário histórico para compensar falha.
- Nunca aceitar o ator como admin por alcance global; reconfirmar admin ativo do solicitante em mutation quando cabível. Auditoria sem senhas/tokens e com old/new scope/IDs.

## Política de servidor

Resolver identidade/escopo atuais pelo usuário, não JWT/localStorage. Manter role/estado, contexto e carteira como conceitos distintos. Projeções antigas podem omitir o campo, portanto fonte central precisa conseguir consultar escopo por userId; detectar/atender revogação na próxima requisição.

Todos: consultar IDs dos condomínios ativos, incluindo novos automaticamente, sem criar vínculos artificiais. Selecionados: vínculos ativos unidos a condomínio ativo. Zero carteira nega acesso, exceto papel admin conforme contrato anterior. Admin continua com sentinela/fluxo próprios; nunca fabricar sentinela administrativa para global profissional.

`resolveCondominioEfetivo` permanece resolução de contexto único para handlers que precisam de um condomínio; listagens abrangentes usam lista explícita segura. Condominio solicitado/entidade por ID sempre validado. Preferência inativa não deve bloquear um global com outros ativos; selecionar primeiro ativo válido ou exigir contexto, sem valor inventado.

Listagens de usuários/condomínios, devedores/acordos/processos/jurídico/tickets/relatórios/documentos podem possuir filtros legados por principal. Identificar e ajustar consumidores necessários; não ampliar permissão de função ou transformar visão pessoal em coletiva. Global inclui apenas carteira operacional ativa, sem mudar tratamento especial de registros sem condomínio ou arquivos históricos.

Exceções antigas para advogado em exportação/CNAB/arquivos exigem ramo compatível legado. Novos escopos explícitos devem validar acesso por ID/condomínio, inclusive modo selecionados. Não aplicar revogação retroativa a NULL nem reformular a política de URLs já compartilhadas sem autorização adicional. Links antigos públicos podem não ser revogáveis pela carteira; documentar a limitação.

## Telas e estado

Manter layout, estilos e navegação existentes. Campo “Acesso aos condomínios” apenas para advogado/colaborador com duas escolhas, ajuda global incluindo futuros ativos e nota que não é administrador. Novos elegíveis exibem escolha recomendada todos de forma visível; concessão depende do submit administrativo. Principal opcional no global. Selecionados mostra multiselect com >=1 obrigatório. Cobrador/Síndico não exibem global.

Editar legado mostra aviso de acesso atual preservado; alterar somente dados não troca o alcance. Mudança explícita de alcance/role/IDs exige confirmação visual apropriada e payload direcionado. Evitar rehidratar estado sujo quando queries de usuário/vínculos chegam em ordens diferentes. Desabilitar submit duplicado/erro/aguardando dados. Listagem mostra badge global/selecionados/legado, não “Nenhum” para global. Invalidação direcionada users/list/byId/vínculos/auth/carteira conforme mudanças, sem guardar permissões sensíveis em localStorage.

## Code Style

```ts
const escopo = usuarioAtual.escopoCondominios; // null mantém contrato legado
if (escopo === 'todos' && !['advogado', 'colaborador'].includes(usuarioAtual.role)) {
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Escopo incompatível com o perfil.' });
}
// nunca: actor.role = 'admin'; nunca: []/null significa todos
```

## Testing Strategy e Success Criteria

RED→GREEN com fixtures de pessoas/condomínios sintéticos. Positivo e negativo para ambos elegíveis, global sem principal/lista, novos ativos após cadastro, inativos/zero carteira, seleção A/B e ID C proibido, null legado preservado, Cobrador/Síndico não global, admin compatível, edição omitida, troca global→selecionados, role global→não elegível, revogação na sessão antiga, projectionmissing/metadatafresh, principal inativo/preferência, mixedpayload inválido, rollback da auditoria/vínculos e duplicidade email. Sem BTG real ou concessões a pessoas existentes.

Preservar guards BTG admin ativo, restrições RBAC/perfil e visão pessoal do Jurídico. Testar listagens/rotas diretas/exportação/arquivos com escopo explícito sem bypass; contraste com legado. Validar componente com payload e states, não apenas regex de código ou screenshots.

Migration/provisionador: aditivo apenas users/enum nullable/defaultNULL, tipos existentes conferidos, idempotência/erro estrutura parcial e sem backfill. Aplicar somente desenvolvimento; provisionador para futura VPS não executado.

Aceite: advogado/colaborador global cria sem condomínio; restrito mantém >=1 e acesso só selecionados; global inclui futuro ativo e não permite ação administrativa/tarefa alheia; cadastro antigo/legado e entidades financeiras não mudam; revogação aplicada em nova requisição; rollback consistente; UI clara e compatível; testes/check/build/diff aprovados; sem deploy.

## Plano, limites e reversão

Ordem: spec aprovada→contratos puros/schema/migration→guard central→CRUD transacional e UI em paralelo→consumidores/filtros e testes de integração→aplicar DDL aprovado desenvolvimento→suíte/check/build/inspeção fictícia→checkpoint/docs. Comunicar mudanças de contrato aos responsáveis para evitar conflitos de arquivos.

Se falhar, parar antes de concessões reais; reverter código/feature preservando enum/coluna nullable e vínculos/histórico. Não remover campo contendo escopos globais reais ou reativar acessos silenciosamente. Nenhuma reversão de banco/usuários existente na VPS, pois ela não é tocada. Implantação seletiva e eventual piloto real exigem nova autorização e análise de configuração/RBAC dos profissionais.

## Estado

Aprovação obtida para Advogado/Colaborador interno; Cobrador excluído. Implementação completa no desenvolvimento: migration0104 gerada/revisada/aplicada somente ao campo nullable em users; cadastro/edição/vínculos/auditoria transacionais, duas escolhas e confirmação no formulário/listagem; carteira e identidade frescas inclusive admin; filtros/preflights nos cinco grupos de consumidores e perfil atual antes de reaproveitar cache. Requisição OAuth existente atualiza somente lastSignedIn, sem restaurar role do owner; nenhuma mudança no provisionamento inicial.

Os 371 testes novos específicos passaram. TypeScript e build integrados aprovados. Inspeção do formulário real usou dados e callbacks fictícios; main restaurado byte a byte e fixture removida antes da compilação. Primeira regressão completa revelou mocks antigos sem identidade/estado/aliases; compatibilizados em oito arquivos, mantendo todas as expectativas e guards, sem atribuir admin a pessoas locais. Suíte final serial em 10/11 às 12:14: **134 arquivos/3.011 testes aprovados**, um externo BTG opt-in ignorado, sem erros não tratados. Tipos, integridade e sintaxe do provisionador aprovados novamente após as fixtures. Estado pronto para checkpoint restrito de desenvolvimento.

Nenhuma permissão real concedida, cadastro de pessoa real, emissão/cancelamento/baixa/reenvio, deploy ou configuração de VPS realizada. VPS permanece b1da399e confirmado e a homologação do PDF real anterior segue separada. Modos NULL preservam contratos/bypasses históricos deliberadamente; não se promete revogação de URLs públicas antigas. Concorrência de mocks não equivale a homologação InnoDB real, e preflights não reformulam transações financeiras legadas. Permissões do perfil continuam necessárias; global não atribui automaticamente ações.
