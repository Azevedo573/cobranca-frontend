# Plano — API BTG principal e CNAB alternativo

Aprovado em 06/11/2026 às 15:19:17. Entrega técnica concluída no desenvolvimento na mesma data. Fonte: `docs/specs/SPEC-btg-elegibilidade-reserva-local.md`; manual: `docs/btg-api-principal-cnab-operacao.md`. Sem autorização de VPS, título real, reclassificação da parcela #19 ou mudança de credenciais nesta evolução.

## Responsabilidades e integração

O domínio/schema/locks/router administrativo foram implementados pelo agente principal. Três frentes separadas implementaram API v2, criação/CNAB/legado e UI; a integração final foi revisada pelo principal. Nenhuma frente criou dados de teste persistidos ou chamou o BTG real.

## Checklist técnico concluído

- [x] Especificação revisada e aprovada, com API principal e CNAB alternativo.
- [x] Política comum tipada; números antigos ambíguos ficam bloqueados e evidências bancárias prevalecem.
- [x] Schema nullable `nossoNumeroOrigem` e `canalBancario`; migration 0100 revisada e aplicada apenas no desenvolvimento, sem backfill.
- [x] Locks ordenados de parcela/acordo e consulta de emissões em quaisquer integrações/revisões compartilhados pelos emissores.
- [x] Criação registra número reservado como local, sem escolher canal ou emitir automaticamente.
- [x] API revalida parcela/acordo/valores/conta, reserva canal junto à emissão canônica, reaproveita idempotência e mantém estados incertos bloqueados.
- [x] CNAB por condomínio/global e caminho legado usam locks/política comum. Seleção integral/condomínio único; canal reservado antes dos efeitos; CNAB revalidado também depois da geração antes do vínculo.
- [x] Evidência do arquivo CNAB e reservas persistidas para investigação em falha, sem fallback/release automático.
- [x] Confirmação individual administrativa com declaração/literal, número esperado, transação, auditoria estrita/rollback; sem emissão ou alteração de valores/número.
- [x] UI API principal/CNAB alternativo, revisão/seleção reais, estado de canal, bloqueios e caches coerentes. Fila API inclui número esperado; componente auxiliar não utilizado removido.
- [x] Guarda de reapresentação de PDF impede fabricar boleto local para reserva livre/API; boletos CNAB históricos com evidência permanecem reapresentáveis.
- [x] Testes específicos de confirmação, canal, ambos sentidos de concorrência, legado, carteira/RBAC, filas, caches, rollback e contexto desatualizado aprovados.
- [x] Suíte completa serial: **1227 aprovados / 1 externo opt-in ignorado**. TypeScript, build e diff aprovados.
- [x] Componentes reais de situação/confirmação inspecionados no navegador com dados/callbacks fictícios. Declaração e literal obrigatórios; nenhum backend chamado.
- [x] Manual e provisionador de DDL restrita preparados/testados; --check no desenvolvimento confirmou estrutura completa sem alterações adicionais.
- [x] Backlog, especificação, manual e handoff atualizados com resultados/limites e preparados para checkpoint pelo GitHub, sem deploy.

## Contratos finais

`shared/btg-canais.ts`: `avaliarElegibilidadeCanalParcela`, origem/canal e `CONFIRMACAO_RESERVA_LOCAL`. Marcador de canal é reserva/uso efetivo, não preferência visual. Idempotência de registro canônico existente não autoriza uma nova operação.

`server/btg-canais.ts`: `bloquearParcelasParaCanal` retorna parcela, estado do acordo, condomínio e existência de emissão v2 sob lock; `idsComEmissaoV2` suporta filas. API bloqueia integração/conta antes de parcela/acordo; nenhum caminho adquire integração após parcela.

`btgCanais.situacaoAcordo` retorna array; `confirmarReservaLocal({ parcelaId, nossoNumeroEsperado, confirmacao, declaracaoNaoEncaminhada })` é administrativa e altera apenas a origem com auditoria transacional. Backend fornece os motivos/capacidades; frontend não libera uma prévia mais restritiva por uma consulta geral.

API retorna `codigo` e `podeConfirmarReserva`; CNAB retorna `elegivelCnab`, `motivoBloqueioCnab`, `codigoBloqueioCnab`, `confirmarReservaDisponivel`. Adaptador UI preserva os guards reais. Navegação CNAB consome filtros de acordo/condomínio na tela existente. Nenhuma migração em massa de `modoBoleto`.

## Verificação e limites

Executados testes específicos, `pnpm exec vitest run --no-file-parallelism --reporter=default`, `pnpm check`, `pnpm build`, `git diff --check` e provisionador --check. Logs principais fora do repo em `/home/ubuntu/btg-canais-suite-final.log` e `/home/ubuntu/btg-canais-check-build-final.log`.

Concorrência foi simulada com transações serializadas e emissores/helpers reais; não substitui teste InnoDB/BTG de Produção. Sem sessão no navegador, a gestão redirecionou ao login. Homologação autenticada real, envio de mensagem ao devedor, cadastro/entrega do webhook e pagamento não foram executados nem comprovados.

## Etapas externas após solicitação

Atualizar VPS pelo GitHub com backup, migration 0100 específica e build reversível. Conferir o título #19 fora do sistema antes da confirmação individual. Revisar a primeira parcela nova/conta/valor/vencimento/ambiente antes de qualquer emissão real; validar webhook e pagamento separadamente. Não executar estas etapas automaticamente ou restaurar dump antigo sobre transações novas.
