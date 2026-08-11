# Visão 360º — Histórico de Atendimento

## Objetivo

Disponibilizar uma linha do tempo somente-leitura no detalhe do devedor para unir eventos já vinculados: tentativas de cobrança, promessas de pagamento, atualizações de conversa WhatsApp e atendimentos com protocolo.

## Regras e privacidade

A consulta não altera tentativas, conversas, mensagens, atendimentos, títulos ou acordos. Ela exibe somente os campos de contexto já registrados no Luminus, limita o histórico aos trinta eventos mais recentes e respeita a permissão existente de visualização de devedores. O conteúdo completo de mensagens, anexos e mídia não é copiado para a timeline.

## Limite conhecido

Os tickets jurídicos existentes são vinculados ao condomínio, mas não possuem um campo de vínculo direto com o devedor. Por isso, eles não são inferidos ou exibidos nesta entrega. A inclusão futura exige regra de negócio e vínculo explícito para evitar associação incorreta.

## Validação

Os testes cobrem ordenação por data, classificação de promessa de pagamento e exclusão de conversas sem data de atualização. A reversão consiste em restaurar a versão anterior do aplicativo; nenhum dado de atendimento é migrado ou apagado.
