# Spec — btg-boleto

## Objective

PDF Luminus com dados da mesma emissãoBTG. Dependência: btg-titulo-contexto. Guardas CNAB não serão removidas comofallback. PDF preserva resumo da parcela/acordo/origem adaptativa; demonstrativo separado e sem quadrodeplano no boleto. Nenhuma emissão/baixa/revisão/DELETE na geração.

## Commands

`pnpm exec vitest run server/btg-boleto*.test.ts --no-file-parallelism --reporter=default`; `pnpm exec vitest run --no-file-parallelism --reporter=default`; `pnpm check`; `pnpm build`.

## Project Structure

`server/btg-v2/boleto-bancario.ts` validações; `server/boleto-pdf.ts` modo discriminado; `server/btg-v2/boleto-snapshot.ts` proteção/fonte; `server/routers/btg-boletos.ts` leitura/consulta/PDF/lote; `client/src/components/btg/BtgBoletoParcela.tsx` apresentação.

## Code Style

```ts
await gerarBoletoPDF({ ...dados, pagamentoBancario: { origem: 'btg_api', codigoBarras, linhaDigitavel } });
```

ModoAPI não calcula código ou geraPixestático. Validar antes PDF:44dígitosbarras/47linha, DVs gerais/campos, correspondência, valor/banco/datafator2025; zeros preservados. EMVvalidadoTLV/CRC e renderizado íntegro.

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
