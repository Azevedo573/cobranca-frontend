# Spec — btg-boleto

## Objective

PDF Luminus com dados da mesma emissãoBTG. Dependência: btg-titulo-contexto. Guardas CNAB não serão removidas comofallback. PDF preserva resumo da parcela/acordo e origem completa paginada; demonstrativo separado e sem quadrodeplano no boleto. Nenhuma emissão/baixa/revisão/DELETE na geração.

Pedido de 09/11/2026 às 15:26: remover exclusivamente o bloco superior “VALOR EXIGÍVEL NESTE BOLETO”, incluindo a referência da parcela e o valor grande dentro desse bloco, o fundo/borda e sua reserva de altura. Aplicar no renderizador compartilhado, em PDFs individuais e de lote de acordo, tanto API quanto CNAB. Preservar o valor da parcela em “Detalhes da fatura” e na ficha de compensação, os cartões de resumo, a origem, os códigos bancários e o Pix. Não modificar o contexto/snapshot ou os arquivos já gerados; sem migração, chamada bancária ou deploy nesta alteração.

Decisão posterior aprovada em 09/11/2026 às 17:12: manter todas as dívidas de origem no boleto, dividindo-as entre páginas com cabeçalhos repetidos. A origem usa o espaço após o resumo, sem transporte antecipado da lista inteira. A ficha, linha, barras, QR e Pix permanecem juntos ao final da última página; quando couberem no espaço atual, não criar página exclusiva. Descrições/avisos extensos têm continuação sem truncamento e instruções bancárias têm altura medida. Não há limite artificial de duas páginas para origem longa. Os três cartões, avisos, demonstrativo e retirada do banner permanecem. Spec: `SPEC-boleto-origem-completa-paginada-2026-11-09.md`. Sem deploy ou migration nesta etapa.

## Commands

`pnpm exec vitest run server/btg-boleto*.test.ts --no-file-parallelism --reporter=default`; `pnpm exec vitest run --no-file-parallelism --reporter=default`; `pnpm check`; `pnpm build`.

## Project Structure

`server/btg-v2/boleto-bancario.ts` validações; `server/boleto-pdf.ts` modo discriminado; `server/btg-v2/boleto-snapshot.ts` proteção/fonte; `server/routers/btg-boletos.ts` leitura/consulta/PDF/lote; `client/src/components/btg/BtgBoletoParcela.tsx` apresentação.

## Code Style

```ts
await gerarBoletoPDF({ ...dados, pagamentoBancario: { origem: 'btg_api', codigoBarras, linhaDigitavel } });
```

ModoAPI não calcula código ou geraPixestático. Validar antes PDF:44dígitosbarras/47linha, DVs gerais/campos, correspondência, valor/banco/datafator2025; zeros preservados. EMVvalidadoTLV/CRC e renderizado íntegro.

Correção delimitada09/11/2026: o GUI do template de conta Pix deve reconhecer `br.gov.bcb.pix`, `BR.GOV.BCB.PIX` e capitalização ASCII mista na comparação. O exemplo oficial BTG usa letras minúsculas. Não converter o EMV, reparar CRC, completar chave/URL ou modificar bytes persistidos: CRC/TLV continuam validados sobre o corpo original e o retorno permanece exatamente igual ao recebido. Aceite: projeção, consulta, routerPDF e renderizador preservam o payload minúsculo válido; corrupção, outra GUI e ausência continuam sem Pix substituto. Causa real da cobrança relatada em `/devedores/1/detalhes` depende da evidência de Produção; não inferir conteúdo real da fixture.

## Testing Strategy

Fixtures bancárias sintéticas válidas, ausência/divergência, DV inválido, fator2025, nossoNúmeroextenso, CPF/endereço imutável, QR/barra legível, lote misto, acesso/estado/cache. Testes existenteCNAB/regressãoorigem intactos.

## Boundaries

Sempre usar nossoNúmero oficial e valores/datascongelados conferidos; geradoem UTC. Perguntar antes schema/deploy/novotítulo. Nunca usar cadastroatual como snapshotantigo, completar comPixCNPJ, gerar de emissão incerta/paga/cancelada/expirada ou cancelamento pendente; apresentar URLbancária comoPDF sem verificar. Sem proxyURLlivre.

## Success Criteria

UIpersistente nas telas, geração individual/lote comresultado poritem, consultaGETexplícita semconciliação e merge semapagarcamposválidos. Entrega PDF base64 via tRPC admin com nome/mimetype; browserBlob e revokeObjectURL, semupload público oulocalStorage. Revalidar contexto/status antes entregar; histórico preserve semoferecercomoativo.

Snapshot protegido por emissão, dados mínimos cifrados do pedido e hash/AAD; sem backfill. Estrutura aprovada09/11/2026,11:41 e migração0103 aplicada apenas no desenvolvimento. Fonte legada só por captura2xx completa, compatível, íntegra e de até30dias, validada sem persistência na listagem e materializada com auditoria no PDF. Dados faltantes bloqueiamPDF; cadastro atual não completa histórico.

## Status da implementação

Concluída tecnicamente no desenvolvimento09/11/2026. Fonte canônica/admin fresco, modoAPI sem cálculoCNAB, snapshot na transação da captura antesPOST, consultaGET sem baixa, PDF individual/lote auditado e revalidado depois do render, guardas antigas e componentes compartilhados integrados.

PDF oficial BTG por URL não verificada não foi habilitado. O caminho implementado é o PDF Luminus com dados bancários da mesma emissão, identificado como tal. Não há fetch/proxy arbitrário ou fallback paraCNAB/PixCNPJ.

Validação definitiva:15suítes específicas/507testes na execução integrada e suíte completa serial2568aprovados/1externoBTGopt-in ignorado; TypeScript/build/diff aprovados. PDF sintético inspecionado, I25 decodificado nos testes e UI real conferida com dados/callbacks fictícios. Nenhuma consulta/emissão/cancelamento real ou deployVPS. Manual: docs/btg-boleto-cancelamento-operacao.md. InnoDB/banco real e leitura em aplicativo bancário continuam dependentes de homologação autorizada.

Correção Pix09/11/2026:196testes específicos/4suítes; completa2581aprovados/1externoopt-in ignorado, TypeScript/build/diff aprovados eHTTP200 local. QR do PDF sintético decodificado da página300DPI:140bytes eCRC62A7 idênticos; Copia e Cola integral eI25 preservado. Sem migration/DBreal/emissão/reenvio/deploy. Fonte e pendências do caso real: docs/ocorrencias/OCORRENCIA-btg-pix-ausente-pdf-2026-11-09.md.

Retirada do bloco superior em 09/11/2026: seis regressões novas RED→GREEN em API/CNAB (parcela única, entrada e plano longo), 69 testes específicos em cinco arquivos, suíte completa serial com 2.587 aprovados e um externo opt-in ignorado; TypeScript/build/diff aprovados. A amostra fictícia de R$ 8,62 ficou em uma página sem o quadro ou altura residual, preservando valor nos detalhes/ficha, resumo, origem, códigos e bytes Pix. Somente 12 linhas do renderizador foram retiradas; não houve alteração de snapshot, banco, emissores ou VPS. Registro: docs/ocorrencias/OCORRENCIA-boleto-remover-destaque-valor-2026-11-09.md.
