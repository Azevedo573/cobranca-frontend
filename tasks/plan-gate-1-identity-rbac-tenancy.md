# Plano Técnico — Gate 1: Identidade, RBAC e Tenancy Multi-Condomínio

## Ordem de Implementação

1. Criar testes de caracterização para RBAC de advogado, associação multi-condomínio e sessão customizada.
2. Adicionar tabela `userCondominios`, migration aditiva e backfill a partir de `users.condominioId`.
3. Criar `tenant-guard.ts` com resolução de escopo e resolvedores de condomínio autorizado.
4. Ajustar RBAC para aplicar perfil a colaborador e advogado.
5. Corrigir login customizado e validação de sessão para manter identidade individual/condomínio ativo.
6. Incluir gestão administrativa de vínculos de usuário e seleção múltipla no formulário.
7. Aplicar guardas primeiro ao router financeiro, depois aos routers jurídicos vinculados e, por fim, aos dados jurídicos hoje globais.

## Dependências

- Etapas 1–5 devem ser concluídas antes de alterar routers de domínio.
- Migration deve ser revisada e aplicada somente no banco Sandbox antes de testar a UI.
- A restrição de PJe/DOERJ/publicações sem condomínio depende de migration adicional posterior e não será simulada por filtros de frontend.

## Riscos e Mitigações

- **Login legado:** será recusado quando não tiver `userId`; a migração exige contas individuais em `users`.
- **Dados históricos:** o backfill cria vínculo principal sem apagar registros.
- **Formulário de usuários:** mantém campo de condomínio principal para compatibilidade e acrescenta seleção de adicionais.
- **Regressão por escopo:** testes usarão condomínios A/B/C, vínculo múltiplo e usuário admin global.

## Verificação por Etapa

Cada etapa executa o teste focal correspondente; ao final da fundação, executar `pnpm check`, a suíte completa em série e `pnpm build`.
