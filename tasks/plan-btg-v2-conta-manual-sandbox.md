# Plano — Conta recebedora manual BTG v2 no Sandbox

## Ordem de implementação

1. Adicionar a origem de cadastro à conta recebedora em uma migration aditiva, com padrão `api` para preservar os registros existentes.
2. Criar helpers de validação e ID interno determinístico para contas manuais, sem consultar o BTG.
3. Adicionar mutation administrativa protegida que exige ambiente Sandbox, OAuth conectado e confirmação `CADASTRAR`; registrar auditoria sem dados bancários completos.
4. Atualizar o painel BTG com diálogo explícito, aviso de limitação e identificação visual de origem manual.
5. Cobrir regras unitárias e RBAC; gerar migration, aplicar apenas no Sandbox e executar validações completas.

## Riscos e mitigação

- Dado bancário digitado incorretamente: confirmar literal, exigir fonte BTG, mostrar aviso e manter emissão Sandbox.
- Uso acidental em Produção: bloqueio no router e no frontend; não existe mutation de override.
- Sobrescrita por sincronização futura: a sincronização atualiza somente contas retornadas com `accountId` oficial; a origem manual e o ID interno não são removidos.
- Duplicidade: unicidade por integração + identificador interno determinístico gerado a partir de agência e conta.
