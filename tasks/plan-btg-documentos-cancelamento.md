# Plano — boleto BTG e cancelamento individual

Aprovado09/11/2026,11:25; origem807de655. Estrutura adicional aprovada09/11/2026,11:41. Implementação técnica concluída no desenvolvimento09/11/2026.

- [x] Recuperar plano/mapa e documentar contratos independentes btg-titulo-contexto → btg-boleto / btg-cancelamento.
- [x] Autorizar/revisar/aplicar apenas migração0103: duas tabelas e índices, sem backfill ou alteração de título/valor.
- [x] Provider de admin fresco/contexto/revisão/cadeia/valor/data/estado; projeção por parcela/acordo; testes.
- [x] Snapshotcifrado mínimo na mesma transação da captura antesPOST; recuperação somente captura íntegra2xx/30dias; sem cadastro atual histórico; testes.
- [x] ConsultaGET documental explícita sem baixa/POST/DELETE; identidade e merge sem apagar campos; testes.
- [x] ModoAPI noPDF e validador bancário sem cálculoCNAB/Pixestático; DV/correspondência/fator2025/TLV/CRC; testes.
- [x] RouterPDFadmin base64/lote poritem, autorização integral e audit/revalidação após render, sem storagepúblico/rede; testes.
- [x] Cancelamento prévia5min/motivo/literal/ciente/GETresultado idempotente com chaveúnica, consumoauditado antesDELETE e identidade fresca; testes.
- [x] Bloquear bypasslegado e integrar webhook/cancelamento com pagamento prioritário e rollback, sem regressãofinanceira; testes.
- [x] Componente compartilhado na remessa/acordo/devedor/modal/conciliacão/histórico; caches/reload/Blob/revoke e limpeza de estado.
- [x] Provisionadorseletivo0103 --check/hash/literal/tipos/default/índices/idempotência;49regressões e checagem somenteleitura aprovados.
- [x] Testes específicos:15suítes507aprovados na execução integrada; webhook final3suítes198aprovados/66novos.
- [x] Suítecompleta serial definitiva:121suítes aprovadas,1externa ignorada;2568testes aprovados/1BTGopt-in ignorado.
- [x] TypeScript/build/diff aprovados eHTTP200 local. Nenhum segredo/OAuth/dependência alterado.
- [x] PDF real sintético inspecionado e I25 decodificado nos testes; componentes reais de prévia/confirmacão com dados fictícios conferidos e página normal restaurada.
- [x] Atualizar manual/specs/todo e preparar checkpoint do estado validado.

## Limites e homologação externa

- [x] Autorizar e implantar naVPS com inventário/backup/pullfixado/provisionador0103/buildisolado/trocareversível/reinícioaplicação/HTTP. Usuário confirmou09/11/2026,12:36: versãoativa ca85568c,0103 completa,HTTP200 local/HTTPS ePM2online; backup btg-boleto-cancelamento-2026-11-09-123412-9SNARl.
- [ ] Validar PDF de emissão real, leitura bancária dos códigos sem pagar, reload nas telas e consulta parcial real.
- [ ] Homologar cancelamento somente de título expressamente autorizado, incluindo confirmação noBTG/Luminus e concorrênciaInnoDB real.

PDF oficial BTG por URL não verificada não foi habilitado: o caminho entregue é o PDF Luminus com dados bancários, claramente identificado. Dados históricos insuficientes bloqueiam, não são reconstruídos. Concorrência/rollback testados em memória não substituemInnoDB real.

Fora da autorização original de desenvolvimento: redeBTGreal, credenciais/RBAC, backfillfinanceiro, emissão/cancelamentoreal ou deployVPS. O deploy foi autorizado posteriormente e concluído conforme registro acima, sem autorizar novo efeito bancário. A geração não emite título, não altera canal/valor/número, não faz conciliação e não envia arquivo ao storagepúblico. Cancelamento não elimina dívida/acordo, não baixa parcela e não liberaAPI/CNAB.
