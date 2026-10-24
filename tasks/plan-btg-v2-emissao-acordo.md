# Plano Técnico — Emissão BolePix BTG v2 por Acordo

## Decisão aprovada

A emissão BolePix será disponibilizada apenas no contexto de um acordo ativo. O administrador seleciona parcelas pendentes/atrasadas, pré-selecionadas por padrão, e confirma a simulação Sandbox em lote. Dívidas avulsas deixam de ser origem válida no frontend e no backend.

## Ordem de implementação

1. **Contratos e proteção de domínio**
   - Extrair regras puras de elegibilidade de parcela do acordo.
   - Restringir a emissão canônica à origem `parcela_acordo`.
   - Criar preparação de lote que valida acordo ativo e pertencimento de todas as parcelas antes de qualquer POST.

2. **Procedure e auditoria de lote**
   - Expor `prepararEmissaoAcordo` e `emitirParcelasAcordo` com `adminProcedure`.
   - Processar as parcelas selecionadas sequencialmente; devolver resultado por parcela e auditoria agregada.
   - Preservar as emissões históricas, inclusive a simulação avulsa existente.

3. **Experiência de seleção**
   - Criar modal reutilizável de revisão com tabela de parcelas, pré-seleção, razões de bloqueio, resumo financeiro, confirmação e resultado por item.
   - Exibir aviso persistente de que Sandbox retorna resposta simulada.

4. **Integração nas telas de acordo**
   - Adicionar ação no detalhe do acordo ativo.
   - Oferecer a ação depois da criação bem-sucedida do acordo.
   - Retirar a emissão avulsa do detalhe do devedor e botões individuais de emissão nas telas de acordo, sem alterar informações CNAB existentes.

5. **Validação e reversão**
   - Cobrir elegibilidade, pertencimento, idempotência, parcialidade e RBAC.
   - Executar suíte completa, TypeScript e build.
   - Reversão de código restaura apenas a interface anterior; não remove registros de emissão nem acordos.

## Riscos e mitigação

- **Duplicidade:** reserva canônica e chave idempotente por parcela permanecem a fonte de verdade.
- **Envio parcial:** retorno estruturado por parcela torna o resultado auditável e não permite reenvio automático de estado incerto.
- **Confusão Sandbox/Produção:** confirmação e resultado usam a palavra `simulação`; não há alteração de variáveis ou ambiente.
- **Vínculo indevido:** toda seleção é conferida contra o acordo antes da primeira emissão.

## Marcos de verificação

- Contratos de domínio e testes unitários aprovados.
- Router protegido e testes RBAC aprovados.
- Modal compila e estados vazio/bloqueado/resultado funcionam.
- Regressão completa: `pnpm exec vitest run --no-file-parallelism --reporter=default`, `pnpm check` e `pnpm build`.
