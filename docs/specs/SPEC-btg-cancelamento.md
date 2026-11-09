# Spec — btg-cancelamento

## Objective

Cancelar somenteemissãoBTG identificada, com motivo e confirmação. Dependência btg-titulo-contexto. Não excluir/perdoar/pagar/cancelar dívida/parcela/acordo; nãoliberarAPI/CNABapóscancelamento.

## Commands

`pnpm exec vitest run server/btg-cancelamento*.test.ts server/btg-v2-webhook.test.ts --no-file-parallelism --reporter=default`; `pnpm check`; `pnpm build`.

## Project Structure

`server/btg-v2/cancelamento.ts` serviço; `server/routers/btg-cancelamento.ts` tRPC; `client/src/components/btg/BtgCancelamentoDialog.tsx`; tabela operacional aditiva `btgCancelamentos`, aprovada09/11/2026,11:41 e aplicada somente no desenvolvimento pela migração0103, junto a `btgBoletoSnapshots`.

## Code Style

```ts
await confirmarCancelamentoBtg({ db, usuarioId, operacaoId, motivo, confirmacao: 'CANCELAR COBRANÇA BTG', ciente: true });
```

PréviaTTL5min e hashcontexto; motivo5–500chars no registrorestrito; UUIDoperação, adminfresco, integração/ambiente/conta/últimarevisão. Umaoperaçãoativa por título e consumoatômico antesDELETE; sem retryautomático.

## Testing Strategy

Mocks somente:GET→DELETE204→GETCANCELED; CANCELING/CANCEL_FAILED; títuloPAID/divergente/indíciopagamento; erros400/403/404/422/500/timeout; concorrência/doubleclick/versãostale; auditoriainicialfalha→zeroDELETE; falhaapósefeito→operaçãopreservada; pagamento/webhookatrasado preservado.

## Boundaries

Sempre identificar e consultar antes DELETE, sem transação longa na rede.204 nãoé estadofinal; confirmarCANCELED. Recusado/incertoconsultar, não repetir automaticamente. Perguntar antes DDL/deploy/cancelamentoreal/reemissão. Nunca usar literallegadoCANCELAR para bypasssemoperação, marcarcancelado seWHEREnãoalteroulinha, apagaroumodificarpagamento, usarCNABcomoalternativa.

## Success Criteria

A rota antigacancelarEmissao deve falhar com orientação para fluxo seguro, evitando bypass. Prévia/preparação/confirmação/consulta auditadas; estado solicitado/em_confirmacao/recusado/cancelado/conflito_pagamento operacional separado de enumfinanceiro. Título fica cancelada só após confirmação e não se sobrescreve paga. Não reescrever sucessooriginalde remessa. Ação nas telas refleteestado real, sem textosfixosSandbox. Documento/cópiaativos bloqueados em operação ativa/cancelado; arquivojácompartilhado nãoérevogado.

## Status da implementação

Concluída tecnicamente no desenvolvimento09/11/2026. Chave única por emissão, motivo/consulta cifrados, prévia5min, confirmação literal/ciente com identidade fresca, consumo auditado antesDELETE, GETresultado sem repetição e confirmação somenteCANCELED ou webhook compatível. Bypasslegado bloqueado. Pagamento prevalece; indícios/divergências bloqueiam e ficam auditados, sem apagar parcela/acordo ou liberarAPI/CNAB.

Webhook preserva prioridade de pagamento, contexto/ordem de locks, histórico e auditoria transacional. Falha de update/auditoria/finalização responde500/rollback e permite reentrega; não existe ACK200 antecipado.

Suíte completa serial definitiva:2568aprovados/1externoBTGopt-in ignorado; TypeScript/build/diff aprovados.66novas regressões de cancelamento/webhook e3suítes198testes targeted, sem alterar a suíte handler antiga. Concorrência e rollback são mocks determinísticos, não homologaçãoInnoDB real. UI conferida com amostra fictícia e restaurada. Sem cancelamento/consulta bancária real, alteração de credenciais/RBAC ou deployVPS. Manual: docs/btg-boleto-cancelamento-operacao.md.
