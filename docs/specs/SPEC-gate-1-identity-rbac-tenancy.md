# Spec: Gate 1 — Identidade, RBAC e Tenancy Multi-Condomínio

## Objetivo

Fechar as falhas de acesso no servidor sem mudar regras financeiras ou jurídicas. Cada usuário deve manter identidade individual na sessão, possuir uma lista auditável de condomínios autorizados e só acessar recursos desses vínculos. Somente `admin` terá visão global. `colaborador` e `advogado` precisam obedecer ao perfil RBAC no backend.

## Decisões Aprovadas

- Síndico, cobrador, colaborador e advogado podem ter vínculo ativo com múltiplos condomínios.
- O acesso a um condomínio depende de vínculo persistido ativo, não de filtro enviado pelo navegador.
- `users.condominioId` permanece como condomínio principal para compatibilidade; novos vínculos adicionais ficam em tabela própria.
- `admin` tem acesso global. Os demais papéis não têm bypass global.
- O login condominial deve recuperar a pessoa da tabela `users`; credenciais legadas compartilhadas de condomínio não podem criar nem assumir identidade coletiva.

## Comandos

```bash
cd /home/ubuntu/cobranca-frontend
pnpm exec vitest run server/rbac.test.ts server/tenant-guard.test.ts server/auth-custom.test.ts --no-file-parallelism --reporter=verbose
pnpm check
pnpm build
```

## Estrutura do Projeto

- `drizzle/schema.ts` — definição de `userCondominios`.
- `drizzle/0094_*.sql` — migration aditiva e backfill do vínculo principal existente.
- `server/tenant-guard.ts` — resolução de escopo, associação e ownership por recurso.
- `server/rbac.ts` — autorização por perfil, incluindo advogado.
- `server/auth-custom.ts` e `server/_core/auth-helper.ts` — sessão individual e condomínio ativo.
- `server/routers.ts` — CRUD de usuário e, nas fatias posteriores, routers que consomem a guarda.
- `server/*.test.ts` — testes unitários e de caller tRPC.

## Estilo de Código

```ts
const condominioId = await resolveCondominioEfetivo(ctx.user, input.condominioId);
await assertDevedorNoCondominio(ctx.user, input.devedorId, condominioId);

await db.insert(cobrancas).values({
  ...input,
  condominioId,
});
```

Handlers não devem confiar em `input.condominioId` para usuários locais. O guard retorna o escopo efetivo ou lança `FORBIDDEN`; leitura de recurso fora do vínculo retorna `NOT_FOUND` sem revelar se o ID existe.

## Estratégia de Testes

1. Unitário: admin global, usuário sem vínculo, um vínculo, múltiplos vínculos, vínculo inativo e condomínio inativo.
2. Unitário: advogado sem perfil é bloqueado; advogado com perfil permitido é autorizado pelo RBAC.
3. Autenticação: token customizado de usuário recupera o mesmo `users.id`; usuário/condomínio inativo é recusado; token legado sem `userId` é recusado.
4. Router: criação/edição de usuário persiste o vínculo principal e os adicionais, remove vínculos desmarcados e registra auditoria.
5. Regressão: usuário com apenas `users.condominioId` continua autorizado após o backfill da migration.

## Limites

### Sempre

- Derivar o escopo no servidor.
- Validar vínculo ativo e condomínio ativo.
- Manter `admin` como exceção global explícita.
- Registrar alterações de vínculos em auditoria sem dados sensíveis.
- Executar os testes novos, typecheck e build antes de avançar para routers financeiros/jurídicos.

### Perguntar Antes

- Remover ou alterar vínculo já usado por administrador principal de condomínio.
- Mudar schema adicional além da tabela de vínculo.
- Criar dependência externa, alterar CI ou alterar regras comerciais de permissão.

### Nunca

- Permitir que role local tenha acesso global por omissão de filtro.
- Reintroduzir identidade compartilhada por credencial de condomínio.
- Expor lista de vínculos, token ou credencial a usuário sem alçada administrativa.
- Remover testes de segurança para fazer a suíte passar.

## Critérios de Sucesso

1. Dado usuário associado aos condomínios A e B, quando solicitar A ou B, então o guard aceita; ao solicitar C, retorna `FORBIDDEN`.
2. Dado um recurso de C consultado por ID por usuário de A/B, quando o handler usar a guarda, então retorna `NOT_FOUND` e não expõe dados.
3. Dado advogado sem perfil, quando chamar `requirePermission`, então recebe `FORBIDDEN`; com perfil permitido, passa apenas para o módulo/ação autorizado.
4. Dado login de usuário individual, quando o token é validado, então o mesmo usuário é retornado; se usuário ou condomínio principal estiver inativo, a sessão é recusada.
5. Dado uma atualização administrativa de vínculos, quando salvar condomínio principal e adicionais, então todos os vínculos ativos são persistidos e auditados.

## Questões em Aberto

Nenhuma para esta fatia: a política multi-condomínio e a visão global exclusiva de admin foram aprovadas pelo usuário em 24/10/2026.
