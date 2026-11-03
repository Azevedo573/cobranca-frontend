# Plano — Origem resumida e demonstrativo completo

Proposta aprovada: `docs/specs/PROPOSTA-origem-divida-resumida-boleto-2026-11-03.md`.

## Sequência e limites

1. Criar fonte documental única: vínculo `acordoCobrancas.valorOriginal` para o principal, metadados das cobranças e snapshots agregados consistentes para encargos da formalização. Nunca recalcular juros na exportação; não usar `totalAmount` como origem pois pode conter o total negociado. Histórico incompleto ou divergente deve ser sinalizado, não rateado ou preenchido com zeros.
2. Decisão pura de layout: até cinco títulos e somente se a altura medida couber com a ficha. Demais casos recebem quadro consolidado. Boletos sem acordo preservam o comportamento existente.
3. Ampliar demonstrativo com resumo, origem integral (títulos e principal preservado; encargos agregados quando disponíveis) e todas as parcelas, com paginação independente e cabeçalhos repetidos.
4. Integrar a mesma fonte ao boleto individual, lote e exportação protegida. Atualizar rótulo do botão e metadados de auditoria.
5. Testar domínio, PDFs reais, valores bancários, permissão de exportação e isolamento condominial. Executar suíte serial, typecheck, build e revisar amostras visuais sintéticas.

Sem migration, dependências novas, atualização de registros financeiros, chamadas BTG, CNAB ou deploy. PDFs antigos permanecem inalterados. Descrição e vencimento vêm do cadastro vinculado atual, pois não têm snapshot histórico próprio; o principal usa o valor preservado no vínculo. A chave interna `totalFechamento` representa exclusivamente a base dos títulos na formalização, antes dos ajustes negociados; seu rótulo não é o total financeiro final do acordo.

## Tarefas concluídas

- [x] Fonte histórica compartilhada e testes de consistência, legado, duplicidade e dados indisponíveis.
- [x] Resumo adaptativo com medida real de altura e ficha preservada.
- [x] Origem integral e parcelas no demonstrativo com paginação segura e continuação de descrições extensas.
- [x] Integração individual/lote/exportação, novo rótulo e quantidade de dívidas na auditoria.
- [x] Testes de PDF e controles reais de RBAC/tenancy; suíte completa, typecheck e build.
- [x] Inspeção visual sintética e documentação de uso e limites históricos.

## Resultados comprovados — 03/11/2026

- `pnpm exec vitest run --no-file-parallelism --reporter=default`: **482 testes aprovados**, 61 arquivos aprovados, 1 arquivo/teste externo BTG opt-in ignorado deliberadamente (sem chamada externa de credenciais).
- `pnpm check`: aprovado após o reforço final de escopo na leitura dos metadados.
- `pnpm build`: aprovado. Permanece o aviso de chunks grandes da aplicação; ele não é erro de build e a otimização global está fora desta alteração.
- Novos testes: `server/origem-divida-acordo.test.ts`, `server/origem-documentos-pdf.test.ts`, `server/origem-documentos-access.test.ts`; ampliação de `server/plano-acordo-pdf.test.ts`.
- Cenário sintético: **80 dívidas e 65 etapas (entrada + 64 parcelas)**. Boleto resumido: **2 páginas**; demonstrativo completo: **10 páginas**, sem páginas vazias e com todas as dívidas/etapas. O demonstrativo cresce legitimamente com a quantidade de dados.
- Boleto curto com duas dívidas: composição integral e ficha na segunda página, sem sobreposição. Descrição extensa: boleto resumido e final do texto preservado no demonstrativo.
- Verificação de valor, vencimento, Pix, código/linha digitável e ausência de alteração das parcelas nas rotas individual e lote; origem carregada uma vez por lote.
- Exportação negada ao advogado sem permissão e ao síndico fora do condomínio vinculado; exportação permitida ao condomínio adicional autorizado.
- Não houve geração real de títulos, execução de remessa, alteração da VPS ou edição de dados financeiros.

## Validação manual seguinte

No detalhe de um acordo real, gerar **Demonstrativo completo (PDF)** e um PDF novo de parcela para conferir o layout com o cadastro específico. PDFs já armazenados não mudam automaticamente. A futura publicação na VPS permanece dependente da orientação do usuário, sem necessidade de migration para esta funcionalidade.
