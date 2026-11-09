# Spec — btg-titulo-contexto

## Objective

Resolver emissão correta de parcela e expor metadados documentais sem consultas/emissão externa em leituras. Admin fresco ativo/nãoexcluído; vínculo completo parcela→acordo→devedor/condomínio→emissão→integração/ambiente/conta; última revisão só com cadeia auditada de recuperação. Não usar collectionId isolado, camposlegados ou últimos100registros como fonte.

## Commands

`pnpm exec vitest run server/btg-titulo*.test.ts --no-file-parallelism --reporter=default`; `pnpm check`; `pnpm build`.

## Project Structure

`server/btg-v2/titulo-contexto.ts` provider; `server/routers/btg-boletos.ts` fronteira documental; tests emserver; consumidores boleto/cancelamento próprios.

## Code Style

```ts
const contexto = await carregarTituloBtg(tx, usuarioId, parcelaId);
if (!contexto.emissao || !contexto.identidadeValida) throw erroSeguro();
```

Funções tipadas; mensagens estáticas semPII/raw; dates UTC; valores emcentavos.

## Testing Strategy

Fixtures/mocks de DB; admin revogado, IDs alheios, múltipla integração/ambiente, revisão ambígua, cadeia adulterada, documento pendente/encerrado, valor/data divergentes; leituras não chamam POST/DELETE/conciliação/BCB.

## Boundaries

Sempre: autorização fresca antes conteúdo/rede; projeção minimal; locks ordenados quando houver alteração. Perguntar antes: novas tabelas/migration/deploy/operação real. Nunca: relaxar RBAC, alterar estado financeiro da parcela/acordo, inferir inexistência da cobrança de lista vazia.

## Success Criteria

Cada parcela se resolve independentemente dos registros recentes. Ausência/inconsistência bloqueia capacidades, sem misturar revisões/canais. Snapshot e operaçãocancelamento são lidos pelo provider sem depender dos consumidores. LeituraAPI nova somenteadmin; CNAB mantém regras atuais.

## Status da implementação

Concluída tecnicamente no desenvolvimento09/11/2026. Contexto fresco por parcela, integração/ambiente/conta/canal/revisão e cadeia de recuperação conferidos; operação ativa/pagamento/divergência bloqueiam documento. Listagem valida snapshot/captura criptograficamente sem INSERT, rede ou conciliação. Não há auto-grant, uso de collectionId isolado ou consulta dos últimos100registros como fonte documental.

Migração0103 das duas tabelas foi aprovada09/11/2026,11:41 e aplicada exclusivamente no desenvolvimento, sem backfill. Suíte completa serial2568aprovados/1externoBTGopt-in ignorado, TypeScript/build/diff aprovados. Operação/VPS e concorrênciaInnoDB real continuam como homologação externa autorizada separadamente.
