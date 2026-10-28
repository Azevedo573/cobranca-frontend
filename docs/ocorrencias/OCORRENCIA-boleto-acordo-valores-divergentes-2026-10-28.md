# Resumo da Ocorrência

Em 28/10/2026 foi identificada divergência visual no PDF de boleto de parcelas de acordo. O caso analisado é o acordo `#1410001`, cuja entrada (`parcela 0`, nosso número `1000000017`) é de R$ 50,00. O PDF deste título também apresenta R$ 113,01, valor que corresponde ao saldo consolidado do acordo na data de fechamento e não ao valor exigível no documento.

# Classificação e Prioridade

- **Tipo:** inconsistência financeira de apresentação em documento PDF.
- **Prioridade:** alta.
- **Impacto:** financeiro, operacional e de comunicação com o pagador.
- **Área impactada:** acordos, boletos CNAB/PDF e detalhe de devedor.

# Módulo Impactado

- `client/src/components/RealizarAcordoModal.tsx`
- `client/src/pages/DevedorDetalhes.tsx`
- `client/src/pages/AcordoDetalhes.tsx`
- `server/routers.ts` — `acordos.gerarBoletoPDFParcela` e `acordos.gerarBoletosLoteAcordo`
- `server/boleto-pdf.ts`

# Comportamento Atual

1. O campo `parcelasAcordo.amount` contém corretamente o valor exigível de cada título.
2. O código de barras, a linha digitável, o Pix estático e o campo “Valor do Documento” recebem `parcela.amount`.
3. Na geração do PDF de parcela, o servidor também consulta todas as cobranças originais vinculadas ao acordo e as envia como `itensCobranca`.
4. A tabela “Composição da cobrança” imprime o total consolidado original dessas cobranças dentro de um PDF que corresponde a uma única parcela.
5. Os snapshots de breakdown são gravados em cada parcela. A repetição do snapshot completo gerava dúvida porque ele era rotulado como valor atualizado da própria parcela.

# Comportamento Esperado

- Todo campo financeiro bancário do boleto individual deve corresponder ao valor exigível daquele título.
- A composição das cobranças originais deve ser preservada como memória e transparência da origem do acordo.
- O PDF deve separar visualmente, sem concorrência entre valores: **origem da dívida**, **plano negociado do acordo** e **valor exigível neste documento**.
- A entrada deve ser identificada como “Entrada”, e não apenas como “Parcela 0”.

# Como Reproduzir

1. Abrir o devedor ou o acordo `#1410001`.
2. Selecionar a linha `Parcela 0/1 — Acordo #1410001`.
3. Observar o valor exigível de R$ 50,00 na linha da parcela.
4. Expandir o snapshot e observar R$ 113,01 como “Valor Atualizado”.
5. Gerar/abrir o PDF do título de nosso número `1000000017`.
6. Observar R$ 50,00 no valor do documento e R$ 113,01 na composição proveniente das cobranças originais do acordo.

# Diagnóstico Inicial

Consulta somente leitura confirmou a composição do acordo:

| Registro | Valor |
|---|---:|
| Valor total / valor acordado | R$ 113,01 |
| Entrada — parcela `0` — nosso número `1000000017` | R$ 50,00 |
| Parcela regular `1/1` — nosso número `1000000018` | R$ 63,01 |
| Soma das parcelas | R$ 113,01 |

Portanto, o acordo não é de R$ 50,00. O acordo é de R$ 113,01, liquidável em duas obrigações: R$ 50,00 de entrada e R$ 63,01 na parcela regular. O boleto `1000000017` é exclusivamente o título de R$ 50,00.

# Causa Provável

A causa é confirmada no fluxo de geração de PDF de acordo:

- `dados.valor` recebe `parcela.amount` e está correto.
- `itensCobranca` recebe `getCobrancasComCalculosPorAcordo(acordo.id)`, que retorna as cobranças originais consolidadas e seu valor atualizado de R$ 113,01.
- O gerador de PDF exibe esses itens em uma tabela visual, embora eles não componham o valor específico daquela parcela.

Havia também uma inconsistência de modelagem visual: o comentário do frontend sugeria que o snapshot seria distribuído proporcionalmente. A regra aprovada é diferente: o snapshot é a memória integral e histórica da composição do acordo, exibida em qualquer parcela apenas como contexto, nunca como valor exigível do título.

# Impactos Identificados

- O código de barras e a linha digitável permanecem corretos, pois usam R$ 50,00 para o título `1000000017`.
- O Pix gerado localmente também recebe R$ 50,00.
- Não há evidência de alteração indevida de valor no banco, no CNAB ou no título bancário.
- O PDF pode induzir o pagador a interpretar R$ 113,01 como valor devido naquele documento.
- PDFs já baixados ou compartilhados devem ser tratados como documentos visualmente ambíguos; não devem ser apagados nem substituídos automaticamente.

# Correção Proposta

## Hierarquia visual recomendada para o recibo do pagador

1. **Destaque principal — valor deste boleto.** No topo do recibo, um cartão destacado deverá mostrar: `Você pagará neste boleto: R$ 50,00`, o vencimento e o rótulo `Entrada do Acordo #1410001`. Este é o único valor apresentado como exigível no documento.
2. **Resumo do acordo.** Abaixo, três cartões informativos, com pesos visuais menores:
   - `Dívida de origem na formalização: R$ 113,01`;
   - `Total negociado no acordo: R$ 113,01`;
   - `Saldo após este pagamento: R$ 63,01`.
   Se houver desconto, o PDF deverá mostrar explicitamente `Desconto concedido`, sem misturá-lo ao valor do título.
3. **Plano de pagamento do acordo.** Nova tabela visual, construída a partir da tabela já existente `parcelasAcordo`, sem nova tabela no banco. Colunas: `Etapa`, `Vencimento`, `Valor negociado`, `Situação` e `Documento atual`. A linha do boleto aberto recebe destaque e a etiqueta `Este boleto`.
4. **Composição das cobranças originais.** A tabela atual será mantida, mas renomeada para `Origem da dívida na data de formalização do acordo`. Ela terá um texto fixo acima: `Esta composição explica a origem do acordo e não altera o valor deste boleto.` Seu total será rotulado como `Saldo de origem`, e não como valor do documento.
5. **Ficha de compensação.** Permanecerá bancária e enxuta: somente o valor de `parcela.amount` será exibido em `Valor do Documento` e `Valor Cobrado`.

## Ajustes de dados e interface

1. **Valor do título:** manter `parcela.amount` como fonte única para código de barras, linha digitável, Pix, cabeçalho do recibo e ficha de compensação.
2. **Interface:** identificar `installmentNumber = 0` como `Entrada`, por exemplo `Entrada (0/1) — Acordo #1410001`.
3. **Snapshot informativo:** mover a leitura do snapshot para um bloco de contexto do acordo e rotulá-lo como `Base consolidada na data de formalização`; ele não poderá ser apresentado como `Valor Atualizado` da parcela.
4. **Novos acordos:** gravar a mesma base consolidada histórica do acordo nas parcelas, inclusive na entrada, e apresentá-la sempre como contexto histórico, sem rateio nem interpretação como valor da parcela.

# Regra Atual e Regra Corrigida

| Tema | Regra atual | Regra corrigida |
|---|---|---|
| Valor bancário do boleto | `parcela.amount` | Mantido como fonte única do título |
| Composição no PDF de parcela | Cobranças originais parecem compor o título individual | Mantida como `Origem da dívida`, separada do plano e do valor deste boleto |
| Parcela 0 | Exibida como “Parcela 0” | Exibida como “Entrada” |
| Snapshot por parcela | Rótulo sugere valor atualizado da própria parcela | Base histórica integral do acordo, com rótulo explícito e sem efeito no título |
| Dados existentes | PDF ambíguo pode ser regenerado manualmente | Sem reescrita automática de parcelas, acordos ou títulos |

# Alterações Técnicas Necessárias

## Front-end

- Ajustar rótulos da entrada nas telas de acordo e devedor.
- Exibir o plano de pagamento do acordo com a linha da parcela atual identificada como `Este boleto`.
- Tornar o snapshot explicitamente histórico e consolidado; não apresentar R$ 113,01 como “Valor Atualizado” da parcela de R$ 50,00.
- Exibir sempre “Valor desta parcela” com destaque na expansão de detalhes.

## Back-end

- Extrair um construtor de dados de PDF para parcela de acordo.
- Manter `getCobrancasComCalculosPorAcordo` somente como composição histórica, com total e rótulos semânticos próprios.
- Carregar o plano completo de `parcelasAcordo` para imprimir a tabela `Plano de pagamento do acordo` e marcar a parcela atual.
- Incluir resumo textual do acordo/parcela sem criar um segundo valor exigível.
- Padronizar o snapshot de novos acordos como base histórica integral, inclusive para a entrada.

## Banco de Dados

- Nenhuma migration é necessária.
- Nenhuma atualização em massa deve ser executada.
- A correção de dados históricos é opcional, manual e somente após relatório de impacto; não faz parte da correção inicial.

## Integrações

- CNAB, nosso número, código de barras e Pix não devem ser recalculados com outro valor.
- Nenhuma remessa será reenviada.
- Nenhum título existente será cancelado ou recriado automaticamente.

# Correção de Dados Existentes

Não alterar valores, status, nosso número, acordo ou parcela existentes.

Para o acordo `#1410001`, a medida segura é gerar manualmente um novo PDF corrigido para cada título que precise ser compartilhado, preservando o mesmo valor bancário e o mesmo nosso número. PDFs anteriores permanecem no armazenamento como histórico; não serão apagados automaticamente.

# Histórico e Auditoria

- Registrar a alteração como correção de apresentação de boleto de acordo.
- O payload de geração poderá registrar `valorDocumento` e `referenciaAcordo`, sem armazenar dados sensíveis adicionais.
- Não registrar ou alterar eventos financeiros para regeneração de PDF.

# Plano de Testes

1. **Cenário relatado:** acordo de R$ 113,01 com entrada R$ 50,00 e uma parcela R$ 63,01.
   - Boleto da entrada: todos os valores bancários do documento devem ser R$ 50,00; o plano deve identificar a entrada como `Este boleto` e o saldo posterior como R$ 63,01.
   - Boleto da parcela regular: todos os valores bancários do documento devem ser R$ 63,01; o plano deve identificar a parcela regular como `Este boleto`.
   - Composição histórica: deve mostrar R$ 113,01 somente como saldo de origem, com aviso explícito de que não altera o valor do documento.
2. **Código de barras e linha digitável:** validar que incorporam exatamente o valor da respectiva parcela.
3. **Pix:** validar que usa o valor da respectiva parcela.
4. **Geração individual e em lote:** ambas devem usar a mesma referência e não incluir total original concorrente.
5. **Acordo sem entrada:** validar parcelamento regular e referência `Parcela X/Y`.
6. **Novo acordo com entrada:** validar que entrada e parcelas conservam a mesma base histórica integral, apresentada somente como contexto.
7. **Dados antigos:** abrir acordo com snapshot repetido sem alterar dados e com rótulo histórico não ambíguo.
8. **Permissão:** manter as permissões atuais para gerar boleto de acordo.
9. **Regressão:** executar testes existentes de CNAB, boleto e acordo, TypeScript e build.

# Plano de Reversão

- Reverter somente as mudanças de apresentação e o construtor de payload do PDF.
- Não reverter por meio de atualização de valores financeiros ou exclusão de PDFs.
- Acionar a reversão se o código de barras, linha digitável ou Pix de uma nova geração divergirem de `parcela.amount`.
- A reversão exige aprovação do responsável funcional/financeiro.

# Critérios de Aceite

- O boleto `1000000017` apresenta somente R$ 50,00 como valor financeiro do documento.
- O boleto `1000000018` apresenta somente R$ 63,01 como valor financeiro do documento.
- A referência do acordo não produz total monetário concorrente.
- A soma das parcelas continua R$ 113,01.
- Código de barras, linha digitável e Pix continuam coerentes com `parcela.amount`.
- Nenhum acordo, parcela, status ou nosso número é alterado automaticamente.

# Riscos e Dependências

- PDFs já compartilhados podem continuar acessíveis por URLs históricas; a correção não revoga arquivos automaticamente.
- A alteração exige validação humana do PDF corrigido antes de compartilhamento com cliente.
- O fluxo BTG API é separado do PDF CNAB local, mas a regra de “valor da parcela como valor do título” deve permanecer comum.

# Pendências para Validação

- Aprovar a composição em três níveis: valor deste boleto, plano do acordo e origem da dívida.
- Aprovar a nova apresentação de `Entrada` e do snapshot histórico nas telas.
- Após implementação, validar visualmente um PDF corrigido da entrada e outro da parcela regular.

# Próximos Passos

Implementar a correção de PDF e UX sem migration e sem alterar dados existentes, criar testes dos dois títulos do acordo e apresentar os PDFs corrigidos para validação manual antes de qualquer deploy.
