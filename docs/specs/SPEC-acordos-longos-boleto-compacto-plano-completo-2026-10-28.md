# Spec: Acordos longos — boleto compacto e plano completo

## Objective

Evitar que um boleto de parcela de acordo replique todas as etapas do plano e gere dezenas de páginas. O pagador deve receber um boleto conciso, com o valor exigível daquela parcela, e o usuário interno deve poder baixar um demonstrativo separado com todas as parcelas do acordo.

## Decisão aprovada

- **Boleto individual:** valor exigível, resumo do acordo, composição histórica da dívida e ficha de compensação. Não mostrará a tabela completa de parcelas.
- **Plano completo do acordo:** documento informativo separado, com todas as parcelas paginadas, acessível no detalhe do acordo.
- O documento separado não terá código de barras, Pix, nosso número ou efeito de cobrança.

## Comportamento atual e causa

No acordo #1500001, a entrada mais 64 parcelas eram desenhadas como uma tabela integral no boleto individual. Após o limite vertical da página, o PDFKit criou páginas extras por célula, produzindo 51 páginas.

## Regra corrigida

1. `parcela.amount` permanece fonte exclusiva do valor bancário do boleto, código de barras, linha digitável, Pix e ficha de compensação.
2. O plano no boleto será resumido por: quantidade de etapas, entrada quando houver, quantidade/valor ou faixa das parcelas regulares, período, progresso e referência do título atual.
3. A origem da dívida será mantida como contexto histórico, com seu aviso já aprovado.
4. O plano completo mostrará a tabela de todas as parcelas com cabeçalho repetido por página e rodapé informativo.
5. Nenhuma parcela, acordo, valor, vencimento, status, nosso número, remessa ou integração bancária será alterado.

## Tech Stack

React 19, TypeScript, Express/tRPC, PDFKit, Vitest e armazenamento existente via `storagePut`.

## Commands

```bash
pnpm exec vitest run server/boleto-acordo.test.ts server/plano-acordo-pdf.test.ts server/boleto-pdf.test.ts --no-file-parallelism --reporter=verbose
pnpm check
pnpm build
```

## Project Structure

- `server/boleto-acordo.ts` — resumo de plano reutilizável e testável.
- `server/boleto-pdf.ts` — recibo e boleto compacto.
- `server/plano-acordo-pdf.ts` — demonstrativo informativo com paginação explícita.
- `server/routers.ts` — procedure protegida de geração e auditoria.
- `client/src/pages/AcordoDetalhes.tsx` — ação de download no detalhe.
- `server/*test.ts` — contratos de resumo, paginação e preservação do valor bancário.

## Code Style

```ts
const resumo = montarResumoPlanoAcordo(contexto.parcelas);
// Resumo é informativo; nunca substitui dados.valor nem parcela.amount.
```

Funções puras para regras de resumo/paginação, nomes em português e valores sempre em centavos.

## Testing Strategy

- Plano de 65 etapas é resumido no boleto sem tabela integral.
- Páginas do demonstrativo não excedem o tamanho configurado e preservam ordem das parcelas.
- A tabela separada identifica entrada, situação, valor e vencimento.
- Código de barras e valor bancário continuam vinculados à parcela atual.
- Procedure exige permissão `acordos.visualizar` e valida acesso ao acordo.
- Teste manual pelo PDF de referência #1500001: o novo boleto deve ter no máximo duas páginas; o plano completo deve ser paginado em poucas páginas, sem páginas unitárias.

## Boundaries

- **Sempre:** preservar valores, títulos, links de Pix, auditoria e histórico; gerar novos arquivos sem substituir os anteriores.
- **Perguntar antes:** migration, alteração de parcelas/acordos, cancelamento ou reemissão bancária.
- **Nunca:** usar total do acordo como valor bancário de uma parcela; apagar PDF histórico; criar cobrança a partir do demonstrativo.

## Success Criteria

- Um acordo de entrada + 64 parcelas gera boleto individual com até duas páginas.
- O documento separado contém todas as 65 etapas, em ordem e paginadas corretamente.
- O usuário pode abrir o documento pelo detalhe do acordo.
- Nenhuma mutação financeira ocorre durante a geração.
- Geração é auditada com dados mínimos (acordo, quantidade de parcelas, tipo de documento).
