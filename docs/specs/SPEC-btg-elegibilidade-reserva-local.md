# Especificação — elegibilidade BTG e reserva local de numeração

Status: proposta para aprovação, em 06/11/2026. Base de código `4d47413a`. Caso de referência: acordo #5, parcela #19, condomínio #1 na VPS. Nenhuma emissão, alteração de dados ou implantação é autorizada por este documento enquanto não houver aprovação.

## Objetivo e premissas

Corrigir o conflito entre criação de acordo, que reserva nosso número localmente, e elegibilidade API, que interpreta qualquer número como título legado. Preservar acordo obrigatório, valor/vencimento, numeração e histórico, RBAC, condomínio, exclusividade CNAB/API e idempotência. Não remover a trava de número para todos os registros nem limpar números existentes.

A saída da VPS fornecida pelo usuário confirma acordo #5 ativo, parcela #19 pendente com número `1000000018`, status `nao_enviado`, sem remessa, dados bancários legados ou emissão v2 registrada. Isso não equivale a conferir o portal do banco ou provar que nenhum boleto/PDF foi encaminhado por fora do sistema.

## Regra proposta

Introduzir origem explícita da numeração local, em coluna aditiva `parcelasAcordo.nossoNumeroOrigem`, nullable, enum `reserva_local` / `legado`. Registros atuais ficam null (origem não comprovada), sem reclassificação automática. Não alterar números ou estado de remessa.

Novos acordos criados pelo servidor que reservarem numeração serão marcados como `reserva_local`, antes de qualquer encaminhamento. O cliente não pode fornecer ou alterar esse marcador livremente.

Uma parcela com número pode ser elegível para API somente se a reserva local estiver explicitamente comprovada, o acordo estiver ativo, a parcela estiver pendente/atrasada, status de remessa for exatamente `nao_enviado` e não existir remessa, coleção/dados legados ou emissão/reserva v2 que impeça nova emissão. Número com origem null/legado continua bloqueado, ainda que o status seja não enviado. Ausência de número não dispensa os demais guards.

CNAB/fluxo legado devem consumir a reserva ao encaminhar um título, marcando origem legada e preservando número e histórico. Travas precisam impedir que CNAB/legado e API usem a mesma parcela simultaneamente. Não modificar layout CNAB ou valores; apenas os guards e a rastreabilidade de canal necessários a esta correção.

## Parcela existente e confirmação administrativa

Adicionar ação administrativa de confirmação de reserva local no contexto da parcela bloqueada, sem emissão automática. Requer literal/declaração inequívoca de que a parcela não foi enviada, registrada ou distribuída em outro canal e que o número foi somente reservado pelo sistema. A ação não é cancelamento bancário e não deve ser usada para títulos registrados.

Para o acordo #5/parcela #19, o administrador poderá usar essa ação após revisar o caso. Revalidar no servidor todos os dados atuais, acordo, condomínio e vínculos, sob transação/locks compartilhados com os emissores. Se aparecer qualquer evidência bancária, recusar e não realizar alteração parcial. Registrar ator, data, motivo, estado anterior e posterior em auditoria estrita na mesma transação. Não alterar nosso número, valor, vencimento, snapshots ou saldo.

Não confirmar todas as parcelas antigas em massa. Não inferir canal pelo nome de perfil, data de criação ou ausência isolada de remessa. Casos ambíguos continuam em revisão.

## Contratos e arquivos

- Schema e migration aditiva exclusiva da nova coluna, sem backfill ou execução de migrações históricas.
- `server/routers.ts` / `server/db-acordos.ts`: registrar origem quando o próprio servidor reservar a numeração e reforçar o consumo/trava no CNAB/legado.
- `server/btg-v2/issuance.ts` / `remessas.ts`: uma política de elegibilidade para fila, prévia, seleção e reserva antes do POST; motivos específicos de bloqueio.
- Router/helper administrativo separado para confirmar reserva, com Zod, RBAC e auditoria transacional; nenhuma entrada pública para definir marcador.
- Componentes BTG de parcelas/remessa e helper visual: exibir reserva a confirmar versus remessa/legado/emissão existente, confirmação acessível e invalidação direcionada de caches.
- Testes em `server/*.test.ts`, sem banco real/BTG real. Documentação de operação e provisionamento restrito para futura VPS.

Exemplo de contrato de domínio, sujeito a implementação tipada:

```ts
type OrigemNossoNumero = 'reserva_local' | 'legado' | null;
// Evidência bancária prevalece sobre qualquer marcador local.
// O estado null com número não pode ser convertido em reserva por uma leitura.
```

## Estratégia de implementação e testes

Primeiro modelar a origem e seus testes; depois criação/consumo e travas; em seguida política e confirmação auditada; por fim interface e operação. Os detalhes de locks/contratos serão registrados no plano técnico após aprovação. Não expandir para emissão avulsa ou gestão bancária nova.

Cobrir: reserva comprovada elegível; número antigo ambíguo bloqueado; qualquer remessa/retorno/coleção/Pix/API legado prevalece; reserva/emissão v2 impede duplicidade; acordo inativo e parcela paga/cancelada recusados; confirmação sem autorização, literal incorreto ou vínculo surgido durante a operação recusada; falha de auditoria causa rollback; numeração/snapshots preservados; disputa CNAB/API não permite dois encaminhamentos; fila/prévia/reserva consistentes.

Comandos de validação na raiz `/home/ubuntu/cobranca-frontend`:

```bash
pnpm exec vitest run --no-file-parallelism --reporter=default
pnpm check
pnpm build
git diff --check
```

Testes específicos deverão preceder a suíte completa. Homologação de cobrança real não é substituída por fixtures, e nenhuma cobrança será enviada durante o desenvolvimento.

## Limites, autorização e reversão

Sempre preservar numeração, valores, histórico e guards; auditoria da confirmação é obrigatória. Aprovação desta proposta autoriza implementação no desenvolvimento, inclusive migration aditiva e caminho administrativo, mas não autoriza reclassificação real da parcela #19, cadastro de teste em banco real, envio ao BTG ou deploy automático na VPS.

Sem dependência nova prevista. Se outra alteração de schema/regra for necessária além deste corte, registrar e obter aprovação. Não alterar OAuth, segredo de webhook, conta recebedora, escopos, CNAB financeiro, parcelas ou acordos para mascarar o bloqueio.

Rollbacks de código mantêm dados e histórico; voltar ao código anterior bloqueará novamente reservas numeradas. Não restaurar dump antigo sobre transações novas nem apagar registros para retornar a um estado elegível. A implantação posterior terá backup e roteiro de DDL específica, sem `db:push` global.

## Critérios de aceite

1. Criar acordo novo com reserva de número não causa falso bloqueio para API, desde que não haja outro vínculo.
2. O acordo #5 pode passar por confirmação administrativa de reserva, sem perder `1000000018`, desde que todas as checagens atuais e declaração sejam válidas.
3. Nenhum acordo antigo é liberado automaticamente; boletos efetivos e estados incertos continuam protegidos.
4. CNAB/API não podem encaminhar a mesma parcela em concorrência; nenhuma falha é tratada como permissão para reemitir.
5. Fila, prévia e reserva aplicam a mesma política; a interface apenas reflete o servidor.
6. Auditoria, testes, TypeScript e build aprovados antes de checkpoint e futura implantação pelo GitHub.
7. Confirmação de reserva não envia cobrança; emissão continua uma ação financeira separada e explícita.

## Pendências de aprovação

Aprovar o corte técnico acima. O administrador ainda deverá conferir que a parcela #19 não foi encaminhada/distribuída fora do sistema antes de qualquer confirmação real. Cadastro e entrega do webhook BTG seguem como homologação separada, não demonstrada pela elegibilidade desta parcela.
