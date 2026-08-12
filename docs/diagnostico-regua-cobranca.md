# Diagnóstico de Automação — Régua de Cobrança

## Resumo da ocorrência

O log da aplicação registrou uma execução com uma régua ativa, sem disparos e com um erro. Antes desta correção, o console exibia apenas a contagem total de erros, sem preservar de forma estruturada a régua afetada e sua mensagem no histórico operacional.

## Impacto e causa provável

O impacto é operacional: o responsável não conseguia identificar rapidamente qual régua falhou ou se outras réguas continuaram sendo avaliadas. A causa provável era a ausência de persistência do resultado detalhado por régua, associada ao agendamento em memória do processo web.

## Regra corrigida

Cada execução da régua cria um registro operacional com quantidade de réguas processadas, disparos, ignorados e falhas. Para cada régua, são registrados seu identificador, nome e erros normalizados. Uma falha de uma régua não interrompe a avaliação das demais. Os jobs são acionados na VPS por `systemd`, não pelo servidor web nem pelo ambiente de desenvolvimento.

## Testes e reversão

Os testes verificam a normalização e o limite de mensagens de erro. O registro operacional é observacional e não modifica títulos, cobranças, acordos ou mensagens. Caso seja necessário reverter, desabilite o timer `luminus-regua.timer` na VPS e restaure o checkpoint anterior; os históricos já gravados permanecem para auditoria.
