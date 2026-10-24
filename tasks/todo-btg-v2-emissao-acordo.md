# Tarefas — Emissão BolePix BTG v2 por Acordo

- [x] Task: Restringir o domínio de emissão BolePix a parcelas de acordo e implementar validação/preparação do lote.
  - Acceptance: cobrança avulsa é recusada; acordo inativo, parcelas de outro acordo, pagas, canceladas ou legadas são bloqueadas antes da emissão.
  - Verify: `pnpm exec vitest run server/btg-v2-acordo-emissao.test.ts --no-file-parallelism --reporter=verbose`
  - Files: `server/btg-v2/issuance.ts`, `server/btg-v2-acordo-emissao.test.ts`

- [x] Task: Expor procedures administrativas de prévia e envio sequencial por acordo, com auditoria agregada.
  - Acceptance: retorno possui resultado individual, respeita idempotência e exige administrador.
  - Verify: `pnpm exec vitest run server/btg-v2-acordo-emissao.test.ts server/btg-oauth-permissions.test.ts --no-file-parallelism --reporter=verbose`
  - Files: `server/routers/btg-v2.ts`, `server/btg-oauth-permissions.test.ts`

- [x] Task: Criar modal de seleção de parcelas pendentes/atrasadas do acordo.
  - Acceptance: todas elegíveis ficam pré-selecionadas, bloqueadas exibem motivo e confirmação exige seleção.
  - Verify: `pnpm check`
  - Files: `client/src/components/BTGEnviarParcelasAcordoModal.tsx`, `client/src/components/ui/*`

- [x] Task: Integrar o seletor na criação e no detalhe do acordo e remover emissão por dívida avulsa.
  - Acceptance: ação disponível após criar e no detalhe de acordo ativo; não há ação BolePix para cobrança avulsa.
  - Verify: `pnpm check` e revisão manual autenticada no Sandbox.
  - Files: `client/src/components/RealizarAcordoModal.tsx`, `client/src/pages/AcordoDetalhes.tsx`, `client/src/pages/Acordos.tsx`, `client/src/pages/DevedorDetalhes.tsx`, `client/src/components/BTGEmitirBoletoModal.tsx`

- [x] Task: Validar regressão e atualizar documentação da homologação.
  - Acceptance: testes, TypeScript e build aprovados; documentação deixa claro o lote e o caráter simulado do Sandbox.
  - Verify: `pnpm exec vitest run --no-file-parallelism --reporter=default && pnpm check && pnpm build`
  - Files: `docs/btg-v2-homologacao-sandbox.md`, `tasks/todo-btg-v2-emissao-acordo.md`
