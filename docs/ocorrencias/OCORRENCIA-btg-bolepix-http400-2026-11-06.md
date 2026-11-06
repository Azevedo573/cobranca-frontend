# Resumo da Ocorrência

Em 06/11/2026 às 16:17:59, após atualização manual da VPS para `5756c31b`, o usuário informou: “Parcela 1: O BTG recusou a emissão BolePix (HTTP 400).” A consulta somente leitura fornecida às 16:26:17 identificou acordo #5, parcela #19 (parcela 1), emissão #1 e remessa BTG #1. Não houve nova chamada bancária realizada pelo agente nesta investigação.

# Classificação e Prioridade

Falha de integração e limitação de diagnóstico; prioridade alta por impedir a primeira emissão real e deixar potencial reserva bancária pendente. Não há evidência suficiente para afirmar emissão duplicada, título registrado ou erro de valor.

# Módulo Impactado

BTG v2 Collections — emissão BolePix por parcela de acordo na VPS. O contrato oficial reconhece o instrumento `BANKSLIP_QRCODE` e o escopo de gestão `brn:btg:empresas:banking:collections`. [1] [2]

# Comportamento Atual

Na versão da VPS `5756c31b`, `server/btg-v2/client.ts`, função `criarBolePixBtgV2`, fazia POST Collections e, quando `response.ok` era falso, lançava somente uma mensagem com `response.status`, sem ler o corpo ou os identificadores de resposta. A correção aprovada às 16:38:30 foi implementada no desenvolvimento: documento compacto, limites de payload e diagnóstico HTTP protegido. A VPS e sua tentativa existente não foram alteradas nesta implementação.

Em `server/btg-v2/issuance.ts`, falhas no bloco de montagem/envio/persistência são tratadas conservadoramente como `incerta`, com `erroCodigo=EMISSAO_SEM_CONFIRMACAO`. A consulta da VPS confirmou esse estado para emissão #1, revisão 1, ambiente Produção, sem Collection ID local. Valor persistido: 1123 centavos (R$ 11,23); vencimento exibido pela consulta: 06/11/2026. A parcela #19 permanece pendente, com origem `reserva_local`, canal `api_btg_v2` e número `1000000018` preservado. Item #1 da remessa #1 registra `falha` e HTTP 400.

Identificadores locais para investigação: `externalId=v2:prd:parcela_acordo:19:r1` e `detail.correlationId=btgv2-1`, conforme payload gerado pelo emissor. Este correlationId enviado não é um requestId retornado pelo banco. O ID interno de parcela #5 também apareceu na leitura como parcela 2 do acordo #4, sem tentativa relacionada nas tabelas fornecidas; não é o registro do erro atual.

Os horários Date exibidos pela consulta precisam ser confrontados com timezone da conexão/driver antes de serem tratados como horário real da tentativa. O `createdAt` apresentado como 22:17:44Z não deve ser interpretado automaticamente como horário correto para o suporte bancário, dado o relato às 16:17 locais. Nenhuma correção de timezone ou alteração global de datas foi executada.

# Comportamento Esperado

Apresentar um diagnóstico seguro e acionável da recusa, identificar a tentativa existente e impedir segunda emissão API/CNAB. Não expor OAuth, Client Secret, segredo do webhook, payload integral do pagador ou meios de pagamento nos logs/interface.

# Como Reproduzir

O usuário já forneceu a mensagem após uma tentativa real. Não reproduzir com novo POST financeiro. Reproduzir primeiro com `fetch` simulado devolvendo HTTP 400 e um corpo sintético; o cliente atual perde o corpo. Conferir o registro existente por leitura restrita depois de identificar acordo/parcela.

# Diagnóstico Inicial

Confirmado por inspeção: o sistema descarta os detalhes do retorno de erro; a interface exibe uma mensagem genérica. A API oficial documenta respostas 400 e 422, além de sucesso 201. O código e a documentação não permitem inferir o campo recusado apenas pelo status HTTP. [2]

A ficha técnica e o contrato de criação foram consultados em 06/11/2026. O exemplo padrão publicado corresponde a boleto simples, embora o contrato liste alternativas BolePix. Não presumir todos os campos internos de BolePix exclusivamente a partir desse exemplo. [1] [2]

Conferência posterior do schema efetivo `CreateBankslipPixRequest` no asset oficial da página identificou `BankslipPixDetailRequest.documentNumber`: obrigatório, string, `maxLength:15`. O código vigente monta `parcela_acordo-19-R1`, que tem 20 caracteres. Essa incompatibilidade é comprovada e precisa ser corrigida, embora o corpo do erro original não esteja disponível para atribuir-lhe a causa exclusiva. `detail.correlationId` tem limite de 20; `btgv2-1` é compatível. [3]

# Causa Provável

Identificador documental excede o máximo oficial e é uma causa plausível do HTTP 400, com a violação de schema comprovada. Podem existir outras validações; o retorno descartado impede afirmar a causa exclusiva. A falta de diagnóstico também é confirmada. Não há evidência de erro nos valores, conta, telefone ou datas. A ausência de `externalId` nas propriedades documentadas não implica rejeição, e não foi encontrado requisito UUID; não alterá-lo como tentativa especulativa. [3]

# Impactos Identificados

A emissão #1 está bloqueada localmente como incerta, sem Collection ID. Ausência de Collection ID local não comprova inexistência de título no banco. Reenviar, gerar CNAB para contornar ou apagar a reserva pode duplicar obrigação financeira. A investigação deve preservar conta, parcela, valor, vencimento, número reservado, canal e histórico.

# Correção Proposta

Tentativa e dados mínimos identificados por SELECT. Próximo passo: confrontar campos do payload com a variante específica BolePix e, se houver histórico/apoio bancário disponível, obter o retorno original pelos identificadores existentes, sem novo POST. Não há motivo bancário completo persistido no cliente, emissão ou mensagem de item consultados.

Implementação da especificação aprovada `docs/specs/SPEC-btg-bolepix-documento-diagnostico.md`: documento compacto determinístico `PA{id}R{revisão}`, validação ≤15, correlação ≤20 e limites de endereço sem truncamento. O helper `server/btg-v2/errors.ts` lê erros em streaming até 32 KiB e 5 segundos, descarta corpo original e mantém somente campos/motivos reconhecidos de `reason`/`invalidParams`, códigos fixos e requestId UUID permitido. Valores inválidos, BRN arbitrário, dados do pagador, HTML e segredos não são repassados. Mensagem ≤500 caracteres, sem retry. [3]

Diagnóstico opcional por parcela é preservado no resultado administrativo; a mensagem limitada permanece em itens de remessa e o diagnóstico é revalidado independentemente na auditoria existente. As telas existentes renderizam a mensagem como texto React. Nenhuma migration, nova credencial ou concessão foi necessária. O nosso número, externalId, chave idempotente, origem/valor/datas/conta e reserva incerta permanecem preservados; não houve recuperação/reenvio da tentativa #1.

# Regra Atual e Regra Corrigida

Regra anterior: identificador documental longo e erro HTTP somente genérico; falha mantém reserva/canal incertos. Regra corrigida: documento compacto e validado, captura protegida de campos/motivos conhecidos e fallback genérico para respostas desconhecidas/ilegíveis. A proibição de reenvio/fallback e a política canônica de falha continuam iguais. Não interpretar HTTP 400 isolado como autorização para liberar a parcela.

# Alterações Técnicas Necessárias

Frontend: a tela existente já renderiza a mensagem protegida como texto React, sem HTML bancário ou alteração de fluxo. Backend: leitura de erro limitada, allowlist de campos/frases, fallback defensivo e preservação do HTTP; nenhum cabeçalho/payload integral é impresso. A integração também mantém GET/DELETE e sucesso 204 de cancelamento inalterados, sem executar essas operações reais nos testes.

Banco: sem migração/DDL/DML real; itens/resumo de remessa e auditoria existentes mantêm diagnóstico permitido para erros futuros. Integração: documento compactado e limites oficiais validados; externalId/chave/payload financeiro preservados. A resposta já descartada não pode ser recuperada retroativamente do cliente anterior.

# Correção de Dados Existentes

Nenhuma neste diagnóstico. Não apagar `btgCobrancasEmitidas`, incrementar revisão, limpar `canalBancario`, alterar `externalId`, cancelar título ou restaurar dump antigo. Qualquer recuperação deve identificar a reserva canônica e confirmar a situação bancária primeiro.

# Histórico e Auditoria

Preservar tentativa, identificadores locais, status e horários. Registrar eventual motivo seguro e decisão de recuperação sem CPF/CNPJ integral, tokens, Pix, boleto ou dados completos da conta. A emissão relatada pelo usuário não foi comandada pelo agente.

# Plano de Testes

Simular erros 400/422/500, corpo JSON/não JSON/vazio e falha de leitura; garantir limite/redação de segredos/dados pessoais, fallback seguro e ausência de retry. Simular resposta de criação aceita seguida de falha local para preservar `incerta`. Regressões de reserva, RBAC/carteira, idempotência e bloqueio recíproco API/CNAB. Nenhum teste financeiro real para obter um erro mais detalhado.

Resultado definitivo no desenvolvimento: 188 testes específicos em 7 arquivos; suíte serial com 1343 testes aprovados e 1 externo opt-in ignorado (92 arquivos aprovados/1 ignorado). TypeScript, build e diff aprovados, HTTP200 local. Cobertura inclui erro literal documentado, limites textuais/Unicode, JSON/UTF-8 inválido, 32KiB exatos/excesso, prazo global de 5s, cancelamento pendente, getter/proxy hostil, UUID com documento embutido, dados pessoais sem dígitos, ausência de retry e preservação de canônica incerta sem Collection ID. Auditoria administrativa é testada com mocks e não-admin bloqueado; não há nova autorização de dados nem teste de emissão autenticada real.

# Plano de Reversão

Uma melhoria de diagnóstico deve permitir reversão do código sem alterar registros existentes. Não restaurar banco sobre operações recentes ou remover marcadores. Mudanças de recuperação financeira exigem autorização específica e decisão baseada em retorno/conciliação do BTG.

# Critérios de Aceite

Identificar acordo/parcela/tentativa e estado canônico; obter evidência suficiente para atribuir causa; mostrar diagnóstico seguro nas próximas respostas de erro; não chamar POST automaticamente, não trocar canal e não expor dados sensíveis. Payload e título só podem ser corrigidos depois de confirmar a causa.

# Riscos e Dependências

Depende da identificação da tentativa e de leitura dos registros da VPS; eventual retorno bancário original pode estar disponível somente no BTG. Consultar documentação não substitui o retorno específico. Não supor que mudar agência, telefone, vencimento ou CPF resolve a recusa.

# Pendências para Validação

Identificação, valor e estado local confirmados para acordo #5/parcela #19/emissão #1. Contrato BolePix conferido e violação de `documentNumber` comprovada. Implementação técnica e validação completa concluídas. Permanecem exclusivamente externas: implantação futura da correção na VPS; retorno original específico do BTG, se disponível no banco; situação do título sem nova emissão; decisão autorizada de recuperação da tentativa #1.

# Próximos Passos

Salvar a correção validada no GitHub. Depois, somente mediante solicitação, preparar atualização da VPS com backup, build e troca reversível, sem migration ou reenvio automático. Manter a parcela e a emissão existentes bloqueadas até esclarecer a situação bancária e planejar sua recuperação separadamente. Não obter o diagnóstico repetindo POST financeiro. A instrumentação nova não recupera retrospectivamente o corpo descartado.

## Referências

[1]: https://developers.empresas.btgpactual.com/docs/tecspecs/Banking%20-%20Collections-spec "BTG Collections — ficha técnica e modalidades"
[2]: https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/criar-cobranca "BTG Collections — contrato de criação de cobrança"
[3]: https://developers.empresas.btgpactual.com/assets/js/b05136c2.10e8401d.js "Schema oficial de CreateBankslipPixRequest e resposta 400"
