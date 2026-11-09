# Plano — reenvio controlado BTG

Aprovado09/11/2026 às08:54:43, desenvolvimento somente. Spec: docs/specs/SPEC-btg-reenvio-controlado.md. Base11b57b42.

- [x] Consulta oficial Collections por correlação/ID, paginação cursor reconstruída,20páginas/1MiB/10s, redirects/loops/parciais recusados.
- [x] Provas cifradas/hash/AAD/TTL; falha local antesPOST explicitamente comprovada, nunca inferida retrospectivamente.
- [x] ClassificarHTTP400 estruturalmente oficial como incerto quando não há garantia documental de inexistência de título; nenhuma regra de rejeicao_definitiva habilitada por presunção.
- [x] Schema/migração0102 mínima revisada/aplicada só no desenvolvimento; provisionador seletivo --check/confirmação/hash/tipos/default/constraints testado, sem backfill.
- [x] Análise administrativa fresca, consulta persistida cifrada, snapshot/hash/provas, auditoria semPII e prévia5min.
- [x] Confirmação literal/ciente, revalidação/reconsulta, recuperação de vínculo semPOST ou reservaR+1/auditoria/consumo atômicos.
- [x] Capacidade interna opaca usoúnico; emissor revalida cadeia de revisões/prova/ator/contexto antesPOST, captura e cliente únicos.
- [x] Fluxo comum escolhe revisão mais recente sem bypass; existente incerta/reservada não conta como sucesso emitido.
- [x] Item/totais atualizados individualmente; capturas antigas acessíveis por cadeia autorizada/validada/auditada, sem apagar histórico.
- [x] UI individual com resumo/decisão/TTL/literal/ciente, caches/stale/busy guard; sem lote inteiro/fallback/retry automático.
- [x] Testar acesso/concorrência/rollback/consulta incompleta/título remoto/PAIDsembaixa/valor&cadastro mudados/legados/timeout.
- [x] Integração service→emissor→captura cifrada→cliente real com fetch explicitamente fictício: sucesso, falha auditoria antesPOST e timeout depoisPOST.
- [x] 424 regressões específicas em8arquivos (inclui63 de captura histórica), suíte completa1872 aprovados/1 externoBTGopt-in ignorado em107arquivos; TypeScript/build/diff aprovados.
- [x] Inspeção visual dos componentes reais com dados/callbacks fictícios; nenhum tRPC/GET/POST bancário. Amostra removida após inspeção.
- [x] Manual operacional/spec/backlog atualizados e checkpoint preparado.

Pendências exclusivamente externas: autorizar/inventariar/backup/implantar captura0101 e recuperação0102 naVPS; homologação InnoDB/BTG real; diagnóstico/prova adicional/decisão bancária para tentativas históricas1/2. Esta execução não concedeu permissões, alterou segredos/tokens/números/valores reais, recuperou/reclassificou tentativas históricas ou enviou títulos. Testes de concorrência são em memória, não garantia de isolamento MySQL real. HTTP400/lista vazia/timeout sem prova suficiente continuam bloqueados.
