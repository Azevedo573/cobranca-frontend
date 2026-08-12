# Correção de Dados — Movimentações TJRJ Legadas

## Ocorrência e impacto

Algumas movimentações antigas foram salvas com `tjrjOrdem` diferente do campo `ordem` preservado no JSON bruto. Isso podia associar o título exibido a detalhes de outro evento judicial. A correção não exclui linhas, não muda processos ou prazos e não altera dados financeiros.

## Regra corrigida

Durante a sincronização, o sistema identifica o registro pelo campo `mov.ordem` retornado pelo TJRJ. Um registro existente é atualizado apenas quando não possui JSON completo, quando a ordem do JSON é diferente, quando o título diverge ou quando a data do evento diverge. Registros coerentes são preservados sem alteração.

## Reprocessamento e auditoria

O reparo é idempotente: cada nova sincronização pode ser executada novamente sem criar duplicatas. O histórico operacional registra o total de inserções e atualizações da execução. A correção de dados ocorre somente após a resposta atual do próprio TJRJ para o processo selecionado.

## Testes e reversão

Os testes cobrem JSON ausente, ordem divergente e registro consistente. Em caso de reversão, basta restaurar a versão anterior do aplicativo; os registros históricos permanecem no banco. Antes de qualquer ajuste manual excepcional, deve-se exportar a lista de IDs, ordens e JSONs afetados para auditoria.
