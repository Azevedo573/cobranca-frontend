# Spec: boleto-origem-completa-paginada

## Objective

Pedido de 09/11/2026: manter a origem completa da dívida no boleto, dividi-la entre páginas quando necessário e apresentar a parte bancária inteira no final da última página. Opção 1 explicitamente confirmada pelo usuário às 17:12. Não executar deploy nesta etapa.

História: como pagador, quero consultar todas as cobranças que originaram o acordo e encontrar a ficha de pagamento íntegra no fim do documento, sem páginas com apenas recibo quando existe espaço para a origem.

A regra aprovada substitui o limite adaptativo de cinco títulos e o resumo obrigatório de origens extensas. Não adotar a alternativa de retirar a origem do boleto. Preservar os três cartões existentes, os avisos históricos, a retirada do banner de valor e o demonstrativo separado; não adicionar um novo plano de parcelas ao boleto.

## Tech Stack

TypeScript, PDFKit, qrcode e Vitest existentes. PDF A4. Sem dependências novas.

## Commands

- Testes direcionados: `pnpm exec vitest run server/boleto-origem-paginada.test.ts server/origem-documentos-pdf.test.ts server/btg-boleto-pdf.test.ts server/boleto-sem-destaque-valor.test.ts server/boleto-pdf.test.ts server/boleto-acordo.test.ts server/plano-acordo-pdf.test.ts --no-file-parallelism`.
- Regressão completa: `pnpm exec vitest run --no-file-parallelism`.
- Tipos: `pnpm check`.
- Build: `pnpm build`.
- Integridade: `git diff --check`.

## Project Structure

- `server/boleto-pdf.ts`: fluxo compartilhado de PDF individual e lote, API/CNAB; apenas paginação/documentação visual.
- `server/boleto-origem-paginacao.ts`: planejamento puro de trechos com primeira página de capacidade variável e páginas seguintes completas, se necessário.
- `server/plano-acordo-pdf.ts`: reutilizar somente o helper de quebra de texto pela largura real; não modificar o demonstrativo.
- `server/boleto-origem-paginada.test.ts`: novas regressões de PDF real e dados sintéticos.
- Testes documentais existentes: adaptar somente expectativas invalidadas pela decisão explícita do usuário; manter proteções financeiras e bancárias.

## Code Style

```ts
const linhas = quebrarTextoOrigemEmLinhas(item.titulo, larguraDescricao, medirTexto);
// Descrições longas recebem trechos identificados; nenhum caractere é descartado.
// A ficha é reservada uma única vez, depois da origem e dos avisos.
```

## Regra e plano técnico

1. Manter fonte histórica `OrigemDividaDocumento`, valores em centavos, ordenação e avisos existentes. Não consultar banco ou BTG para ajustar o layout.
2. Imprimir todos os itens independentemente da quantidade. Cabeçalho de três colunas repetido nas páginas de continuação. Não deixar título/cabeçalho isolados sem pelo menos uma linha de conteúdo.
3. Aproveitar o espaço disponível após o resumo na primeira página. Não mover a origem inteira para outra página para mantê-la junto da ficha.
4. Medir e dividir descrições extensas por largura real da fonte. Manter uma linha curta inteira quando couber numa página nova; permitir que uma descrição maior que a página continue em vários trechos, identificando a cobrança e a continuação sem repetir o principal como um novo total.
5. Manter o resumo financeiro e todos os avisos após o último item; textos excepcionalmente longos também devem ser divididos sem truncamento ou auto-page-break descontrolado. Não gerar rodapé documental depois da ficha.
6. Calcular a altura da ficha e do Pix com as medidas usadas no desenho. Antes da ficha, fazer uma única quebra se não houver espaço para o bloco inteiro. Se couber, permanecer na página atual. Não obrigar página exclusiva, nem alinhar artificialmente ao rodapé criando vazio.
7. Se um bloco bancário extraordinário não couber sequer numa página A4, falhar explicitamente em vez de cortar campos, reduzir QR/barras ou separar a ficha. Não modificar a validação dos códigos ou gerar substitutos.

## Testing Strategy

RED→GREEN com PDFKit e QR reais, Poppler para conteúdo/bounding boxes e inspeção dos streams para I25 e Pix. Dados fictícios, sem rede bancária, banco real, storage ou uploads públicos.

Cenários: origem com 0/1/5/6/80 itens, primeira página parcial, limite de página, origem com descrição multipágina e palavra longa, avisos multipágina, dados históricos ausentes, entrada/parcela única/plano longo, API/CNAB, sem Pix e Pix longo/minúsculo, input imutável. Validar a mesma política em API sem contexto original quando a origem congelada estiver disponível. O tamanho do documento passa a depender da origem; não conservar a expectativa antiga de até duas páginas para 80 dívidas.

## Boundaries

- Sempre: preservar valores, vencimentos, identificação, snapshots, avisos, todas as linhas, auditoria/RBAC e arquivos históricos. Códigos bancários, QR, barras e bytes Pix permanecem íntegros.
- Pedir antes: schema, dependência, infraestrutura/deploy e qualquer operação financeira real.
- Nunca: alterar banco/contas/títulos/juros, recalcular/reenviar/cancelar/pagar/baixar cobranças, reduzir códigos para caber, usar dados pessoais reais em fixtures, reintroduzir o banner ou adicionar plano completo de parcelas ao boleto.
- Fora do escopo: Central Jurídica, migrations, UX de telas, acesso a VPS e refatoração do demonstrativo completo.

## Success Criteria

- Dado boleto de acordo com cinco dívidas, quando gerar o PDF, então a origem começa após o resumo na primeira página, em vez de deslocar a lista inteira e deixar o recibo isolado.
- Dado acordo com 80 dívidas, quando gerar, então cada título aparece completo e em ordem, com cabeçalhos repetidos e sem limite artificial de duas páginas.
- Dada descrição ou aviso maior que a página, quando gerar, então todos os caracteres/linhas aparecem nos trechos sem sobreposição, truncamento ou página vazia.
- Dado qualquer cenário validado, quando localizar ficha, linha, I25, QR e Pix, então estão juntos apenas na última página e nada da origem é impresso depois deles.
- Dado bloco inteiro que cabe na página atual, quando gerar, então não há quebra adicional somente para a ficha.
- Dado mesmo título, quando gerar novo layout, então dados e bytes bancários são iguais e input permanece imutável.

## Plano de reversão

Reverter somente o renderizador/paginador e as expectativas documentais para o checkpoint anterior `5cded7aa` se houver conteúdo perdido, sobreposição ou ficha dividida. Não restaurar banco, remover snapshots ou reemitir títulos. Esta etapa é desenvolvimento; qualquer reversão/ativação de VPS exige autorização própria. PDFs antigos permanecem preservados.

## Estado e pendências

Decisão funcional aprovada pelo usuário e concluída tecnicamente no desenvolvimento. 53 testes novos (12 planejador/41 PDF real) e 131 testes direcionados em oito arquivos aprovados. Comparação RED isolada contra `5cded7aa`: 21 falhas/14 aprovações nos 35 testes documentais iniciais; o desenvolvimento não foi revertido. Suíte completa serial: 125 arquivos aprovados e um externo opt-in ignorado; 2.640 testes aprovados e um ignorado, com `BTG_SANDBOX_CREDENTIAL_CHECK=false`. TypeScript, build e diff check aprovados.

Amostras fictícias API/CNAB de cinco origens têm duas páginas, origem na primeira e ficha na última; de 80 origens têm quatro páginas, origem nas três primeiras e ficha na quarta. Uma origem curta compartilha uma única página com a ficha nos testes. Descrição acentuada, palavra enorme, avisos multipágina, instruções maiores que 80 pontos e ficha maior que A4 cobertos sem conteúdo perdido. Códigos e input conferidos; QR/Pix 143 bytes CRC C133 e I25 44 dígitos decodificados das últimas páginas renderizadas em 300 DPI das amostras API. O demonstrativo não foi alterado; as três expectativas documentais antigas foram adaptadas mantendo guards, snapshots, códigos e bytes Pix.

Implementação sem migration, dependência, alteração de banco/valores/canais/RBAC, operação BTG real, pagamento ou Central Jurídica; arquivos antigos preservados. Checkpoint de aplicação `b1da399e`. Deploy autorizado em 09/11/2026 às 17:54 e **confirmado pelo usuário em 10/11/2026 às 11:16**: `b1da399e953397703a1669bb9eb17d1397781f34` ativo, HTTP200 local/HTTPS e PM2 online. Sem backup novo/migração; banco/credenciais preservados e nenhuma emissão/cancelamento/reenvio/baixa pelo roteiro. Build anterior `/var/www/cobranca/.dist-anterior-origem-completa-T5yoN1/dist`; registro `/var/www/cobranca/.build-origem-completa-v6qwpG`. Sem acesso SSH independente.

Homologação do novo PDF real da mesma cobrança permanece pendente, sem pagar ou reemitir. Este checkpoint documental de confirmação não requer nova atualização/reinício e não altera a versão ativa da VPS.
