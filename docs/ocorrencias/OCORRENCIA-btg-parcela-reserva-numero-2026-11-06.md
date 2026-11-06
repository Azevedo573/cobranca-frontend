# Resumo da Ocorrência

Em 06/11/2026 às 14:54:45, o usuário informou que criou uma dívida nova e não encontrou parcela elegível para enviar na tela Nova remessa BTG da VPS. O print mostra zero elegíveis, acordo #1 bloqueado por não estar ativo e acordos #2, #3 e #4 bloqueados por vínculo com remessa CNAB, boleto legado ou BolePix. Versão de referência de Produção: `4d47413a`, cuja ativação foi relatada pelo usuário às 14:33:26. O relato não confirma emissão de cobrança nesta tentativa.

# Classificação e Prioridade

Inconsistência de elegibilidade e possível conflito entre reserva local de número e vinculação bancária, prioridade alta por afetar a primeira cobrança real. Não é falha comprovada do BTG, do OAuth ou do webhook: o bloqueio ocorre antes do envio.

# Módulo Impactado

Criação de acordos/parcelas em `server/routers.ts`, persistência em `server/db-acordos.ts`, elegibilidade/prévia/reserva em `server/btg-v2/issuance.ts`, fila de remessas em `server/btg-v2/remessas.ts` e helper visual `client/src/lib/btgV2Eligibility.ts`.

# Comportamento Atual

O sistema atribui `nossoNumero` automaticamente ao criar um acordo quando existe configuração de boleto, deixando `statusRemessa = nao_enviado`. A rotina de elegibilidade BTG recusa qualquer parcela com `nossoNumero`, mesmo que não existam `remessaId`, `btgCollectionId` ou emissão canônica v2. A criação pode assim produzir uma parcela imediatamente bloqueada para API.

Dívida avulsa nova não é origem de emissão BTG v2: o fluxo aprovado continua sendo dívida → acordo ativo → parcela → revisão/envio. Criar uma dívida, sem formalizar um acordo, não a faz aparecer nesta fila. O usuário identificou o caso como acordo #5/parcela #19, portanto a falta de acordo não é a causa deste bloqueio.

# Comportamento Esperado

O acordo ativo deve permitir revisão das parcelas ainda não encaminhadas a nenhum canal bancário, preservando a exclusividade e idempotência. Uma reserva local de número não pode ser apresentada como prova de envio ao banco. Entretanto, número presente também não pode ser desconsiderado sem verificar sua origem e possível boleto legado já distribuído/registrado.

# Como Reproduzir

No código atual, usar a função `avaliarElegibilidadeParcelaAcordoBtgV2` com uma fixture pendente, `nossoNumero = 1000000999`, `statusRemessa = nao_enviado`, `remessaId = null`, `btgCollectionId = null` e `btgEmissaoV2Existente = false`. Resultado: inelegível por suposto vínculo legado. Reproduzido no desenvolvimento em 06/11/2026 às 14:56, sem banco ou chamadas bancárias.

# Diagnóstico Inicial

A inspeção confirmou um conflito geral entre criação e elegibilidade. Em 06/11/2026 às 15:06:32, o usuário trouxe o resultado da consulta somente leitura da VPS: acordo #5, condomínio #1, ativo, criado em `2026-11-06T17:48:33.000Z`; parcela #19 (parcela 1), pendente, `nossoNumero = 1000000018`, `statusRemessa = nao_enviado`, `remessaId = null`, sem Collection legado, Pix CNAB ou outros dados API legado e sem registros BTG v2. Nesse estado, a presença do número é a condição de bloqueio identificada no código.

Isso demonstra ausência desses vínculos no banco consultado, não uma consulta ao portal bancário ou prova de que nenhum PDF foi distribuído externamente. O acordo #1 inativo continua fora do caso novo e deve permanecer bloqueado.

# Causa Provável

A regra conservadora usa presença de `nossoNumero` como indicador de título legado, enquanto a criação de acordo usa esse campo também para reservar a numeração antes da remessa. Duas fases distintas compartilham o mesmo campo sem evidência explícita da origem. A hipótese de falta de acordo foi descartada para o caso #5, que está ativo na consulta fornecida.

# Impactos Identificados

Possível bloqueio indevido de acordos novos com configuração CNAB. Por outro lado, remover a trava genericamente pode emitir API sobre boleto legado/CNAB já registrado, criando duplicidade. Pode afetar fila, seleção pós-acordo, prévia e reserva final. A numeração pode ter sido usada em PDF/linha digitável/Pix; seu histórico deve ser preservado.

# Correção Proposta

Primeiro identificar o acordo novo e conferir por leitura os estados, IDs de remessa/coleção, emissões v2 e origem da numeração. Depois especificar e aprovar a distinção entre reserva local e encaminhamento efetivo, ou seleção explícita de canal para novos acordos, mantendo registros antigos ambíguos bloqueados para revisão. Não liberar casos legados somente porque `statusRemessa` diz `nao_enviado`.

# Regra Atual e Regra Corrigida

Atual: número não vazio bloqueia API em qualquer caso. Proposta para validação: número reservado localmente não deve ser equiparado automaticamente a emissão, mas existência de remessa/registro/retorno/coleção/emissão ou origem legada incerta continua impedindo novo título. A origem de emissão continua obrigatoriamente sendo parcela de acordo ativo. A alteração desta regra exige aprovação do usuário após o diagnóstico do caso real.

# Alterações Técnicas Necessárias

Backend deve distinguir os motivos e usar uma política consistente na fila, prévia, seleção e reserva antes do POST. Frontend deve apresentar o motivo específico e nunca ser a única fronteira de segurança. Banco: nenhuma alteração autorizada nesta análise; se rastreabilidade adicional exigir schema ou reclassificação histórica, preparar especificação e migration aditiva para aprovação. Não modificar o fluxo CNAB como atalho.

# Correção de Dados Existentes

Não executar UPDATE/DELETE, limpar nossoNumero, remover remessa ou cancelar cobrança para forçar elegibilidade. Nenhuma mudança de valores, estados ou IDs foi feita. Dados existentes com canal incerto precisam de conferência e eventual tratamento auditado separado, não migração automática genérica.

# Histórico e Auditoria

Preservar numeração reservada, PDFs, vínculos, emissões e todos os registros bancários. Registrar qualquer decisão futura de canal/reclassificação com ator, motivo e estado anterior. Não consultar ou exibir tokens, segredo de webhook, CPF/CNPJ completo ou dados de pagador neste diagnóstico.

# Plano de Testes

Cobrir reserva local comprovada, legado ambíguo, remessa gerada/enviada/retornada, coleção legado/v2, reserva v2/incerta, títulos pagos/cancelados e acordo inativo. Confirmar que uma dívida sem acordo não pode ser emitida, que a fila/prévia/reserva usam a mesma política e que nenhum POST ocorre para item bloqueado. Revalidar concorrência entre CNAB/API e idempotência. Após implementação aprovada: específicos, suíte serial, TypeScript e build. O teste real será separado, com revisão do título pelo usuário.

# Plano de Reversão

O diagnóstico não muda código produtivo nem banco e não exige reversão. Uma correção futura deverá permitir rollback de código sem restaurar dump antigo sobre transações novas. Histórico de canal e números deve permanecer preservado; falha crítica exige interromper novas emissões, não apagar títulos.

# Critérios de Aceite

Identificar claramente a parcela nova e o motivo real. Bloqueios bancários verdadeiros e acordo inativo permanecem. Novas parcelas com reserva local comprovada não ficam falsamente marcadas como já emitidas. Nenhuma duplicidade, alteração financeira ou quebra da regra de acordo obrigatório é admitida. Aprovação e testes devem preceder novo deploy.

# Riscos e Dependências

O acordo e seus campos foram identificados pela consulta fornecida. Resta conferir eventual encaminhamento ou distribuição externa do título antes da confirmação de reserva. A presença/ausência de um campo isolado não prova disponibilidade para emissão. O webhook recém-configurado ainda precisa ter seu cadastro e entrega real confirmados; elegibilidade não substitui homologação bancária.

# Pendências para Validação

Caso e campos bancários identificados pela saída da VPS fornecida pelo usuário: acordo #5/parcela #19. Preparar e aprovar correção que registre a origem da numeração e mantenha casos legados ambíguos bloqueados. Uma eventual confirmação de reserva existente exige declaração administrativa de que o título não foi encaminhado/distribuído em outro canal. Não há acesso direto à VPS nesta análise, nem cobrança emitida ou liberação automática.

# Próximos Passos

Aprovar a especificação de correção segura, implementar/testar no desenvolvimento e entregar pelo GitHub. Preservar número e valores; não limpar dados de Produção nem criar outro acordo para contornar o bloqueio. Aplicação e confirmação da reserva na VPS serão etapas posteriores e explícitas.
