# Capability Map — Boleto BTG e cancelamento individual

Aprovado pelo usuário em09/11/2026,11:25, ao solicitar implementação do plano atualizado em11:21. Escopo: desenvolvimento, sem deploy nem consultas/emissões/cancelamentos reais.

- `btg-titulo-contexto`: identidade fresca administrativa, parcela/acordo/condomínio, integração/ambiente, conta/revisão/cadeia e estados bancários/documentais. Projeção por acordo, não últimos100registros.
- `btg-boleto`: snapshot documental protegido, validação linha/barras/EMV, geração PDF a partir da canônica e entrega autenticada. Depende de `btg-titulo-contexto`.
- `btg-cancelamento`: prévia, motivo/literal, operação durável/idempotência local, solicitaçãoDELETE e confirmação porGET sem efeitos financeiros na origem. Depende de `btg-titulo-contexto`.

Ordem: contexto → boleto e cancelamento → integração das telas → testes completos/inspeção → checkpoint. Não há dependência cíclica entre consumidores; ambos leem operação/estado da fonte comum.

Contratos novos: `btgBoletos.listarAcordo({acordoId})`, `.situacaoParcela({parcelaId})`, `.consultarDados({parcelaId})`, `.gerarPdf({parcelaId})`, `.gerarLote({acordoId,parcelaIds})`; `btgCancelamento.preparar({emissaoId})`, `.confirmar({operacaoId,motivo,confirmacao:'CANCELAR COBRANÇA BTG',ciente:true})`, `.consultarResultado({operacaoId})`.

Acesso novo API documental/cancelamento mantém admin ativo/nãoexcluído; nenhuma concessão automática a outros perfis. CNAB já autorizado preserva suas guardas. PDFs históricos de títulos encerrados não serão disponibilizados para novo pagamento; arquivos anteriores permanecem preservados.

Persistência aditiva aprovada09/11/2026,11:41: `btgBoletoSnapshots` e `btgCancelamentos`. Migração0103 aplicada exclusivamente no desenvolvimento, sem backfill. Fonte antiga somente se comprovada por pedido cifrado/captura2xx completa ainda íntegra/vigente; nunca preencher com cadastro atual como se fosse snapshot.

Os três módulos e consumidores estão tecnicamente concluídos: suíte completa serial2568aprovados/1externoBTGopt-in ignorado, TypeScript/build/diff aprovados e amostrasPDF/UI fictícias inspecionadas. Próxima etapa externa: implantação autorizada naVPS e homologação do documento/cancelamento individual. Sem operaçãoBTGreal nesta entrega. Manual: docs/btg-boleto-cancelamento-operacao.md.
