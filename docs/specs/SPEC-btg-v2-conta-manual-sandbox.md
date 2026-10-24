# Spec: Cadastro manual de conta recebedora BTG v2 — Sandbox

## Objective

Permitir que um administrador cadastre manualmente uma conta recebedora do escritório exclusivamente para homologação BolePix no Sandbox quando o escopo Banking Accounts não estiver habilitado no portal BTG. O cadastro não substitui a consulta oficial da API Accounts e jamais pode ser usado em Produção.

## Tech Stack

React 19, TypeScript, tRPC 11, Express 4, Drizzle ORM/MySQL, Vitest e componentes shadcn/ui existentes.

## Commands

```bash
pnpm exec vitest run server/btg-v2-config.test.ts server/btg-v2-manual-account.test.ts --no-file-parallelism --reporter=verbose
pnpm check
pnpm build
```

## Project Structure

- `drizzle/schema.ts` e migration gerada: origem do cadastro da conta.
- `server/btg-v2/config.ts`: validação e normalização de campos manuais.
- `server/routers/btg-v2.ts`: mutation administrativa, auditoria e serialização segura.
- `client/src/pages/configuracoes/BTGConfig.tsx`: diálogo de cadastro e identificação visual da conta manual.
- `server/btg-v2-manual-account.test.ts`: regras de validação e bloqueio de ambiente.

## Code Style

A origem da conta é explícita, sem simular um `accountId` do BTG:

```ts
if (config.ambiente !== "sandbox") {
  throw new BtgV2ConfigurationError("O cadastro manual de conta é permitido apenas no Sandbox.");
}
```

IDs internos determinísticos servem apenas à unicidade no banco. Agência e conta preservam zeros à esquerda; são validadas como sequências numéricas, sem hífen ou formatação inventada.

## Testing Strategy

Vitest cobre normalização, validação de agência/conta, criação de identificador interno determinístico, o bloqueio em Produção e RBAC. A validação final executa typecheck, suíte completa e build.

## Boundaries

- Always: exigir administrador, ambiente Sandbox, confirmação literal `CADASTRAR`, auditoria e vínculo explícito condomínio→conta.
- Ask first: qualquer liberação em Produção, uso de conta manual fora do Sandbox ou alteração de título financeiro existente.
- Never: enviar dados bancários ao BTG durante o cadastro manual, gravar tokens/segredos, selecionar a conta automaticamente ou alterar registros CNAB/legados.

## Success Criteria

1. Dado o Sandbox conectado, quando um administrador confirma `CADASTRAR` com agência e conta válidas, então a conta é salva com origem `manual_sandbox`, identificada visualmente e auditada.
2. Dado Produção ou usuário não administrador, quando tenta registrar a conta, então a ação é bloqueada antes de persistir dados.
3. Dado uma conta manual, quando vinculada a um condomínio, então pode satisfazer a pré-condição de homologação, mantendo a emissão limitada ao Sandbox.
4. Dado um registro manual, quando a aplicação tenta sincronizar contas via API, então não há exclusão ou alteração automática desse registro manual.

## Open Questions

Nenhuma para a implementação Sandbox. A confirmação da conta pela API Banking Accounts permanece dependente de habilitação do BTG e é requisito separado para Produção.
