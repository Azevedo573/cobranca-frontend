# Especificação — telefone brasileiro do pagador BTG

Status: implementação aprovada pelo usuário em 09/11/2026 às 10:13 e concluída no desenvolvimento; 2.072 testes aprovados / 1 externo opt-in ignorado, TypeScript e build aprovados. Sem deploy ou operação bancária real.

## Objetivo

Corrigir o adaptador BolePix: o formulário armazena telefone nacional com DDD, mas o payload atual acrescenta somente `+`, deixando de incluir o DDI brasileiro 55. A evidência do acordo #7 aponta invalidParams.name=phoneNumber. Não copiar CPF, telefone real ou corpos completos para documentos/logs.

## Regras aprovadas e casos concretos

1. Normalização exclusiva na representação enviada ao BTG, sem UPDATE do cadastro.
2. `null`, `undefined`, vazio e apenas espaços: telefone ausente; omitir phoneNumber, mantendo o campo opcional. Não substituir por número fictício.
3. Entrada nacional de 10 dígitos: DDD válido + fixo de 8 dígitos iniciado por 2, 3, 4 ou 5. Entrada nacional de 11: DDD válido + celular de 9 dígitos iniciado por 9. Acrescentar apenas o DDI 55 e o sinal `+`.
4. Entrada internacional brasileira de 12/13 dígitos, começando por 55, com ou sem `+`: remover o DDI para validar a parte nacional e produzir exatamente um `+55`.
5. `+` explícito exige entrada internacional brasileira completa: `+21...` não é reinterpretado como nacional, e `+1...` não é convertido em brasileiro.
6. Aceitar dígitos ASCII e pontuação usual: espaços, parênteses, pontos e hífens. Não aceitar letras/ramais, símbolos estranhos, múltiplos sinais de mais ou controles embutidos; não truncar nem acrescentar nono dígito, DDD ou prefixo de operadora.
7. Prefixos de discagem 0/CSP/00, telefones estrangeiros, números especiais sem DDD, comprimentos indevidos e DDD inexistente são bloqueados com orientação segura, sem incluir o telefone na mensagem.
8. DDD nacional 55: decidir por comprimento e presença explícita de `+`, não apenas por startsWith('55'). `(55) 4000-0000` é nacional e vira `+555540000000`.
9. DDD permitidos: 11–19; 21,22,24,27,28; 31–35,37,38; 41–49; 51,53,54,55; 61–69; 71,73,74,75,77,79; 81–89; 91–99. Relação conferida na publicação Anatel de 2026 [2].
10. Validação estrutural não comprova existência, titularidade, funcionamento ou aprovação bancária. Não consultar operadoras nem mandar SMS.

## Exemplos sintéticos

`(21) 4000-0000` → `+552140000000`.

`(11) 98765-4321` → `+5511987654321`.

`+55 (21) 4000-0000` e `552140000000` → `+552140000000`, sem duplicar DDI.

## Contratos e arquivos

Adicionar `normalizarTelefonePagadorBtgV2(phone: string | null | undefined): string | undefined` em server/btg-v2/bolepix.ts. Erro de validação: BtgV2BolePixError, com texto estático/localizado sem dados pessoais. montarPayloadBolePixV2 utiliza o helper uma única vez.

No emissor, erro de domínio antes de invocar o cliente mantém a mensagem segura e a política de reserva/falha anterior ao POST. Não alterar estados, algoritmo de revisão, critério bancário, captura, idempotência ou número de tentativas. Mensagens desconhecidas continuam protegidas.

Sem nova interface, API, dependência, migração ou alteração de máscara global. As telas existentes mostram a mensagem do resultado; manter cadastro nacional, sem pedir DDI em campo limitado a 11 dígitos.

## Stack, estilo e comandos

TypeScript/Vitest, funções puras, erros de domínio existentes e fixtures transacionais em memória. Não escrever ou conectar ao banco real nos testes.

```ts
const telefone = normalizarTelefonePagadorBtgV2(input.payer.phone);
// Omitir campo ausente, sem serializar undefined.
```

Testes específicos: `pnpm exec vitest run server/btg-v2-telefone.test.ts server/btg-v2-bolepix.test.ts server/btg-canais-api.test.ts --no-file-parallelism --reporter=default`.

Validação final: `pnpm exec vitest run --no-file-parallelism --reporter=default`; `pnpm check`; `pnpm build`; `git diff --check`.

## Critérios de aceite e testes

Cobrir fixo/móvel nacional com/sem máscara, internacional brasileiro com/sem sinal, DDD 55, todos os DDD válidos e inválidos, ausência, número incompleto, prefixo estrangeiro, CSP/00, pontuação/controles/ramais e não truncamento. Saída idempotente e formato canônico sem duplicar DDI.

Integração do emissor com mocks: telefone válido chega normalizado ao cliente sem alterar valor, datas, externalId/documentNumber/correlationId ou cadastro. Inválido não invoca cliente nem fetch; registra apenas a política existente de falha local e não libera canal/retry. Reutilização de tentativa incerta não modifica nem reenvia a canônica antiga. Verificar acordo/remessa e regressões da captura, recuperação e RBAC existentes.

## Limites e reversão

Sempre: preservar registros, segredos, canais, documentos e critérios de recuperação; executar testes antes do checkpoint. Nunca: corrigir em massa cadastros, copiar payload pessoal nos documentos, fazer POST bancário real, liberar tentativa histórica por HTTP400, criar acordo substituto para contornar trava ou fazer deploy nesta autorização.

Reversão: retornar apenas helper/adaptador ao checkpoint anterior, após análise de regressão. Nenhum restore do banco, expurgo da captura ou reset financeiro. VPS continua na versão informada 1c70e62d até nova autorização específica.

## Referências

[1]: https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/criar-cobranca "BTG — Criar Cobrança; exemplo de payer.phoneNumber com +55"
[2]: https://www.gov.br/anatel/pt-br/assuntos/noticias/implementacao-das-novas-areas-locais-da-telefonia-fixa-comeca-em-janeiro-com-reducao-de-4-118-para-67-areas "Anatel — cronograma 2026 e relação dos 67 DDD nacionais"
[3]: https://www.itu.int/dms_pub/itu-t/oth/02/02/T020200001D0003PDFE.pdf "Anatel/UIT — plano brasileiro, prefixos de fixos e nono dígito móvel"

O exemplo de +55 está no contrato BTG [1]; a lista de DDD vem da relação atual da Anatel [2], e os prefixos/quantidades de dígitos do plano comunicado à UIT [3]. Usar [2], e não intervalos imprecisos da tabela histórica de [3], para os DDD.
