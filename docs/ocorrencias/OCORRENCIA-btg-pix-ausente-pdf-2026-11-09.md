# Resumo da Ocorrência

Em 09/11/2026,14:01, o usuário informou que o boleto baixado em `/devedores/1/detalhes` não apresenta QR Code Pix nem seu código. A VPS foi informada como atualizada para `ca85568c`; o registro local posterior `0f243a89` contém apenas documentação da implantação.

# Classificação e Prioridade

Falha documental/de integração, prioridade alta. Impacta a apresentação de meios de pagamento de um título já emitido; não é autorização para emitir outro título.

# Módulo Impactado

Detalhe do devedor, componente BtgBoletoParcela, projeção documental API, validação EMV e renderizador PDF.

# Comportamento Atual

O PDF relatado não mostra Pix. O gerador imprime QR e Copia e Cola somente quando recebe um payload aprovado pelo validador. A projeção e o router silenciosamente retiram o Pix se a validação falhar, mantendo o PDF de boleto com linha/barras quando estes dados são válidos.

# Comportamento Esperado

Um payload Pix legítimo retornado pela mesma emissão BTG deve chegar intacto ao gerador, produzir QR Code e código completo, preservando os bytes originais e seu CRC. Ausência ou divergência deve ser distinguida de falha de layout; não criar Pix substituto.

# Como Reproduzir

Abrir o detalhe do devedor, selecionar a parcela da emissão API e baixar Boleto (PDF). Confirmar o nome da emissão e a origem do documento. A reprodução isolada já realizada constrói dois EMVs fictícios com estrutura equivalente e CRC correto: GUI `BR.GOV.BCB.PIX` é aceita; GUI `br.gov.bcb.pix` é recusada pelo validador atual. Não houve banco ou rede nessa reprodução.

# Diagnóstico Inicial

O botão API do componente chama `btgBoletos.gerarPdf`; parcelas CNAB e PDFs anexados são caminhos distintos. O PDF API obtém `btgCobrancasEmitidas.pixCopiaECola`, chama `validarPixBtg` e só passa esse campo a `montarDadosPdfBtg` se a validação for bem-sucedida. Em seguida `gerarBoletoPDF` cria o QR com os mesmos bytes e imprime o Copia e Cola. Não há evidência atual de que o renderizador sempre omita um Pix recebido e aprovado.

# Causa Provável

Há uma restrição concreta no código: a comparação do GUI exige literalmente letras maiúsculas. Esse caso foi reproduzido com dados sintéticos. A conferência oficial confirmou que o exemplo de `detail.emv` do POST e da listagem GET contém `0014br.gov.bcb.pix`, em minúsculas. O normalizador já lê `detail.emv`; não há evidência nesses contratos para acrescentar `detail.qrCode.emv` ou outro caminho presumido. Ainda é necessário conferir o payload e o PDF da parcela real para afirmar que essa restrição causou esta ocorrência, distinguindo campo ausente, rejeição por outro motivo e download de documento antigo/CNAB.

Fontes oficiais consultadas09/11/2026: [criação da cobrança](https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/criar-cobranca), [schema do POST](https://developers.empresas.btgpactual.com/assets/js/b05136c2.10e8401d.js), [listagem](https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/listar-cobrancas), [schema do GET](https://developers.empresas.btgpactual.com/assets/js/4e04dca3.b96332a6.js). O GET usado é listagem com filtro `id`; ambos documentam `detail.emv`, `detail.barCode`, `detail.digitableLine` e `detail.ourNumber`. São opcionais no schema; sua disponibilidade imediata não é garantida. A comparação de GUI é a única mudança de comportamento desta correção; requisitos de status/identidade não foram relaxados.

# Impactos Identificados

Nenhuma gravação de banco ou alteração financeira realizada nesta investigação. Não há motivo para resetar estado, remover número, gerar outra cobrança ou alterar conta recebedora. O código bancário e a linha digitável não devem ser confundidos com o código Pix ausente.

# Correção Proposta

A correção delimitada foi implementada no desenvolvimento: comparação ASCII sem distinção entre maiúsculas/minúsculas somente para o GUI. Não altera bytes do EMV, URL/chave, valor ou CRC. Mantém validações estruturais, unicidade de campos e CRC. Se a causa no título real for dado ausente, usar a consulta documental explícita do título já emitido; não fazer POST de criação. Não foram acrescentados campos Pix presumidos ou alterados status/revisão.

# Regra Atual e Regra Corrigida

Anterior: GUI literal maiúsculo, falha de Pix suprimida noPDF. Corrigida: reconhecerGUIASCII maiúsculo/minúsculo/misto, preservar integralmente oconteúdo recebido e permitir somentePixestruturalmenteválido; sem geração/reparoCRC/fallbackestático. Usuário autorizou09/11/2026,14:23 e confirmou14:54 a implantação de2ead4388 naVPS com backup/build/trocareversível,HTTP200local/HTTPS ePM2online, semmigração. NãoháacessoSSHindependente da sessão; a conferência doPDFreal continua pendente.

# Alterações Técnicas Necessárias

O único código de aplicação alterado é `server/btg-v2/boleto-bancario.ts`, na comparação do GUI. Regressões de validador, projeção/router/PDF e consulta explícita usando dados fictícios. O detalhe do devedor já usa o componente documental compartilhado; nenhum segundo gerador foi criado. Sem migração, mudança de banco, OAuth/webhook, dependências, permissões ou payload de emissão.

# Correção de Dados Existentes

Não aplicar atualização em massa ou reconstruir payloads. Um payload existente válido deve ser reapresentado sem modificar banco. Se estiver ausente, consulta explícita e autorizada de dados do título existente, preservando evidência/códigos anteriores e todas as guardas.

# Histórico e Auditoria

Manter auditoria documental existente, canônica, revisão, vínculo com parcela e snapshot. Não salvar CPF, EMV real ou códigos de pagamento neste registro de ocorrência. Novos diagnósticos, se necessários, usam somente estado/código de motivo e IDs autorizados.

# Plano de Testes

Caso sintético equivalente com GUI maiúsculo e minúsculo, CRC correto e bytes preservados; CRC/TLV corrompido ainda recusado; outra GUI recusada; Pix ausente não inventado. Projeção e PDF recebem payload autorizado inteiro; QR decodificado deve corresponder ao mesmo payload. Regressão CNAB, revisão canônica, pagamento/cancelamento, perfis/carteira e snapshot. Testar o PDF real depois, sem pagar nem cancelar o título.

Resultados definitivos09/11/2026:196testes específicos/4suítes aprovados; completa serial2581aprovados/1externoBTGopt-in ignorado; TypeScript/build/diff aprovados e desenvolvimentoHTTP200. Testes novos totalizam13regressões. A amostra sintética possui uma página A4; o QR foi decodificado da página renderizada300DPI pelo libzbar existente:140bytes idênticos ao EMV da fixture, CRC62A7 preservado. O Copia e Cola nos streams é byte a byte igual ao payload; I25 decodificado corresponde ao código bancário da mesma fixture. Sem instalação de dependências, banco/BTGreal ou alteração de qualquer título. A simulação não prova a causa específica do título real relatado.

Amostra não pagável: `/home/ubuntu/entregas/btg-pix-minusculo-sintetico.pdf`; evidência reproduzível: `/home/ubuntu/entregas/btg-pix-minusculo-verificacao.json`. Ambos contêm somente dados fictícios.

# Plano de Reversão

Se houver correção, reverter apenas seu commit de código após aprovação, preservando dados e evidências. Nova implantação exige backup e troca reversível. O boleto anterior não deve ser excluído nem o título recriado. Nesta investigação nada foi alterado que exija reversão financeira.

# Critérios de Aceite

O documento da emissão API correta apresenta QR e Copia e Cola íntegros quando o BTG disponibilizar Pix válido; códigos inválidos não são reparados nem substituídos. Os dados da mesma emissão não mudam, e o download não emite/cancela/reenvia nem consulta o banco silenciosamente.

# Riscos e Dependências

A captura/consulta real define se o problema é validação ou campo ausente. PDFs antigos anexados são estáticos e não se tornam o documento da canônica atual. Conteúdo já compartilhado não pode ser revogado. Não assumir ausência de cobrança no banco pela ausência do QR no PDF.

# Pendências para Validação

Número doacordo/parcela, origem/nome doPDFbaixado e presença/formato doEMVretornado peloBTG. Contrato/correçãodelimitada/testestécnicos concluídos eVPSimplantada conforme saída do usuário09/11/2026,14:54:versão2ead4388,backup`/var/backups/cobranca/btg-pix-pdf-2026-11-09-144144-PQrilQ`,buildanterior`/var/www/cobranca/.dist-anterior-pix-pdf-YtanHw/dist`,HTTP200local/HTTPS ePM2online. Banco/credenciaispreservados e nenhumaemissão/cancelamento/reenvio pelo roteiro. Não precisa novo deploy para testar. Roteiro:scripts/deploy-btg-pix-pdf-vps.sh; registro:docs/deploy-btg-pix-pdf-vps.md.

# Próximos Passos

Atualizar navegadorCtrl+F5 e baixar novamente oBoleto(PDF) da mesma emissãoAPI naVPS para conferirQR ePixCopiaeCola. Se permanecer ausente, verificar evidência daquela parcela para distinguir dadoausente/inválido ou documentoantigo/CNAB. Não criar/cancelar/pagar/reenviar cobrança para testar esta correção; implantação não é homologação documental.
