# SPEC — Recebimento BTG e quitação consistente de acordos

## Objetivo e aprovação

Usuário aprovou em11/11/2026 às17:30 a opção «correção completa no desenvolvimento»: conversão monetária BTG e baixa consistente de parcela, total pago do acordo, origens após quitação integral e saldo do devedor, com histórico, outras dívidas, idempotência e rollback preservados. É uma capacidade financeira de recebimento de ponta a ponta; conversão e liquidação são seus componentes, não produtos independentes.

Não autoriza deploy, SQL/migração, reentrega/baixa real do acordo12, chamadas bancárias, título novo, mudanças de credenciais, schema ou dependências. Base local bfaf5cac; aplicação VPS7a37548b conforme último relato. Registros reais apenas analisados; fixtures mínimas devem ser fictícias e nunca conter payload pessoal/EMV/barras.

## Problema comprovado

O evento observado informa statusPAID, amountPaid5.84 em reais, pago porQRCODE. A emissão/parcela têm584centavos. O schema exige amountPaid inteiro e rejeita o decimal antes de gravar a entrega, causa suficiente de400 caso envelope válido. O objeto copiado não inclui event/data; ainda não comprova corpo HTTP integral/envelope, URL ou resposta exata. Não aceitar flat nem inferir event porstatus.

Webhook baixa emissão/parcela e acordo na última paga, mas não origens ou valorPago. Manual tem cascata não transacional e apaga descrição. Conciliação é mutation, reaplica pagamento e não compartilha os guards/locks. Corrigir os três caminhos novos sem reparar automaticamente históricos.

## Regras funcionais

1. Contrato monetário atual BTG/v2: valores monetários externos em reais. Converter decimal de até duas casas para centavos de forma exata, sem Math.round, heurística por inteiro/decimal, fallback nominal ou fator100 inferido do valor local. Um inteiro externo5 representa500centavos. Manter provas explícitas amountPaid/paidAmount, recusar ausências/tipos/precisão/overflow/negativos ou campos contraditórios. Comparar centavos convertidos à emissão/parcela; nominal não prova recebimento. Contratos antigos em centavos não serão aceitos silenciosamente como nova prova bancária.
2. Preservar envelope event/data, JSON e Bearer estritos. Diagnóstico400 pode retornar apenas enum estático/caminho de campo permitido, nunca valor/corpo/segredo/cause/log de dados pessoais. collections.processing não deve baixar nada; não ampliar eventos sem prova.
3. Serviço comum transacional por parcela, utilizado pelo webhook v2, conciliação v2 e baixa manual. Recebe centavos internos, data, origem/ator/canal e contexto bloqueado. Valida existência, vínculo/condomínio/devedor, parcela elegível, valor e estado do acordo. Cancelados/ambíguos não são reabertos. Manter inadimplente quando recebimento parcial do plano não representar quitação.
4. Ordem de locks comum: acordo → todas parcelas → vínculos/origens e devedor → emissões/cancelamentos. Integração/conta podem preceder no BTG. Não criar inversão manual×webhook. Contexto bloqueado preparado antes das emissões; nenhum efeito remoto dentro de transação financeira. Atualizações/auditoria estritas na mesma transação e conferir affectedRows. Erro em qualquer etapa desfaz parcela/acordo/origens/saldo/auditoria/estado da emissão.
5. Pagamento de parcela não paga integral registra uma vez statuspago e data. Não sobrescrever data/valores de parcela já paga; duplicata não reaplica receita ou cascata histórica. Registrar evidência mínima em auditLogs existente: parcela/acordo/valor/canal/método comprovado e IDs internos, data/fonte; sem PII. Nenhum caixa novo ou tabela de recebimento sem aprovação adicional.
6. Atualizar acordos.valorPago pela soma dos nominais das parcelas pagas: para novos recebimentos integrais validados nominal=pago; em parcelas históricas isso é soma nominal/status, não nova prova bancária. Não inventar rateio de recebimento histórico, nem mudar valorPagoAcordo usado no histórico de quebra sem necessidade explicitada. Fechar acordo somente com todas parcelas pagas e plano nominal coerente com agreedAmount. Canceladas não contam como pagas ou quitação antecipada; incoerência exige revisão, não perdão/desconto implícito.
7. Na quitação integral, validar todos vínculos e cobranças no mesmo condomínio/devedor; não quitar cobrança cancelada ou reutilizada por outro acordo ativo/novo. Preservar description, amount, valorOriginal e snapshots; statuspago e data rastreável de quitação, sem atribuir valor integral a cada origem ou preencher paidAmount por rateio inventado. Histórico vincula origens ao acordo/recebimento auditado.
8. Situação/saldo do devedor consideram outras cobranças/planos, sem somar simultaneamente origem negociada e saldo do acordo. Não zerar saldo nem marcarpago havendo outras dívidas. Usar mesma regra de leitura e de atualização para evitar lista versus detalhes contraditórios; preservar cálculo de encargos avulsos existente. Não recalcular snapshots nem valores bancários.
9. Manual mantém permissão acordos/aprovar e carteira fresca/preflight; não concede admin nem confirma pagamento bancário fictício. Não cria/cancela emissão/segunda cobrança. Updates genéricos de parcela não podem bypassar o serviço para marcá-la paga. Conciliação exige contexto da integração atual, identidade remota exata e revalidação após GET; não sobrescreve documentos/Pix consolidados nem opera cancelamento por mera consulta. Legado/CNAB, quebra/consolidação automática e desenho de caixa fora do escopo; documentar esses limites.
10. Um webhook validado pode continuar retornando200/ignorado para divergência de contexto; não declarar baixa apenas pelo HTTP. Preservar prioridade paga/conflitos de cancelamento, hash/idempotência e500 após rollback. Reentrega real somente depois de deploy autorizado e revisão separada.

## Componentes, plano e ordem

- `server/btg-v2/valores.ts`: conversão/data e valor pago canônicos; testes puros.
- `server/recebimento-acordo.ts`: contexto bloqueado, recebimento/quitação/auditoria; testes em memória.
- `server/saldo-devedor.ts` ou helper equivalente: cálculo sem duplicidade de origens/plano e outras dívidas; tests.
- Adaptadores `server/btg-v2/webhook.ts`, `settlement.ts`, `client.ts`, `server/routers.ts`: compartilhamento do serviço; nenhuma função financeira individual sem transação.
- Consumidor `server/db-devedores.ts`: saldo alinhado quando necessário; não reformularfrontend ou endpoints não relacionados.
- Fixtures BTG antigas representavam centavos externos; adaptar para reais explícitos sem apagar casos/assertivas. Novas fixtures cobrem origens/devedor/plano reais em forma sintética. Não remover guard para fazer teste antigo passar.

Ordem: especificação→testesRED→helpers monetários/contexto→serviço e adaptadores em paralelo por arquivos distintos→integraçãoGREEN→suite serial/check/build→documentação/checkpoint. Pausar para aprovação adicional se surgir necessidade de schema/dependência ou mudança fora destas regras. O manual de reentrega/VPS não será executado nesta etapa.

## Stack, estrutura e estilo

TypeScript/Express/tRPC/DrizzleMySQL, Vitest, React existente. Código server-side tipado, erros enum estáticos e sem corpo bancário em logs. Reutilizar schema, auditLogs e fixture transacional; sem novos pacotes.

Exemplo de contrato (nomes devem permanecer alinhados entre responsáveis):
```ts
const valorPagoCentavos = valorPagoBtgEmCentavos(data);
if (valorPagoCentavos === null || valorPagoCentavos !== emissao.amount) {
  return finalizarEntrega(tx, entrega.id, "PAYMENT_AMOUNT_MISMATCH");
}
```

## Comandos e testes

`pnpm check`; `pnpm build`; `git diff --check`.
`BTG_SANDBOX_CREDENTIAL_CHECK=false pnpm exec vitest run --no-file-parallelism` para suíte final. Testes focados incluem valores, recebimento, saldo, webhook/cancelamento/client/settlement e baixa manual. Nenhum teste BTG externo opt-in. RED isolado/antes do helper e GREEN registrados em logs temporários, não em produção.

Cenários:5.84→584, inteiro5→500, zeros/negativos/tipos/mais de2casas/overflow/campos contraditórios; envelope estrito; primeira/última parcela, entradas/planos longos, várias origens/desconto negociado/encargos preservados; outras dívidas e acordos; cancelados/inadimplência/contexto cruzado/plano incoerente; duplicatas e corrida entre canais; auditoria/updatefalhos; consulta remota muda contexto; nenhuma alteração de PDF/Pix/valores; carteira/RBAC conservados.

## Critérios de aceite

Com dados fictícios equivalentes ao valor do caso12, o evento encapsulado/autenticado deve registrar pagamento uma vez, concluir acordo de uma parcela, marcar origens quitadas sem apagar descrições ou duplicar valor recebido e refletir saldo correto. Eventos repetidos não reaplicam efeito; divergentes/cancelados não quitam; falha de auditoria desfaz tudo. API/manual usam mesma regra. Testes/comandos aprovados e árvore restrita ao escopo, sem migração ou operação real.

## Limites e reversão

Sempre preservar dado/identidade e validar transação. Perguntar antes de schema, dependências, backfill, correção de registros históricos, chamadas BTG ou reentrega. Nunca commitar payload pessoal/segredo, pagar/cancelar/reemitir ou conceder acesso. Reversão futura de código não apaga recebimentos/auditoria e não restaura banco sobre eventos novos. Ledger de caixa e método/data históricos ausentes não serão fabricados; o audit do novo recebimento conserva a evidência mínima permitida.

## Implementação e validações

Conversão decimal exata, serviço comum com plano/vínculos/origens/devedor bloqueados, valorPago, quitação preservando descrição e saldo sem duplicar plano/origem implementados. Adaptadores API/manual/consulta integrados com revalidação de identidade/conta/revisão, permissões e auditoria. Indícios divergentes na consulta permanecem conservados, sem baixa; status pago contraditório no webhook é ignorado com código estático. Respostas de consulta não sobrescrevem dados documentais. Saldo usa consultas em lote, com teste de 80 origens.

Seis novos arquivos somam 232 testes. Testes focados finais: 470 aprovados/11 arquivos; autorização/manual: 81 aprovados/2 arquivos. REDs antes do código e GREEN locais registrados. TypeScript/build/diff do estado final aprovados. Primeira suíte completa: 3.259 aprovados/4 falhas de vencimentos, que dependiam do banco de desenvolvimento. Fixture substituída por usuários/parcelas sintéticos e datas SQL comparadas corretamente no simulador, sem remover guards; 168 testes relacionados passaram. Suíte completa final aprovada às18:00 em11/11: 140 arquivos e 3.263 testes aprovados, um arquivo/teste BTG externo opt-in ignorado, nenhuma falha ou erro não tratado. Execução com DATABASE_URL vazio e opt-in BTG desligado; nenhum banco/BTG real. Documentação e plano de reversão preparados para checkpoint.

Registros: docs/ocorrencias/OCORRENCIA-recebimento-btg-acordos-2026-11-11.md e tasks/plan-recebimento-btg-acordos.md. Sem esquema, migração, dependências, telas, credenciais, banco/BTG real ou implantação alterados nesta etapa. Fixtures de concorrência não substituem piloto InnoDB nem validam os writers de criação/consolidação.

## Pendências externas

URL e envelope/resposta do400 ainda devem ser conferidos antes de homologação real. Piloto InnoDB/concor­rência real, deploy e reentrega do acordo12 separados. Fixtures comprovam regra local, não entrega/estado bancário real.
