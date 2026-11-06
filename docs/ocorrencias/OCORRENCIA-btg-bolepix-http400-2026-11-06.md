# Resumo da Ocorrência

Em 06/11/2026 às 16:17:59, após atualização manual da VPS para `5756c31b`, o usuário informou: “Parcela 1: O BTG recusou a emissão BolePix (HTTP 400).” A conversa anterior tratava do acordo #5/parcela #19, mas o identificador da tentativa atual ainda precisa ser confirmado. Não houve nova chamada bancária realizada pelo agente nesta investigação.

# Classificação e Prioridade

Falha de integração e limitação de diagnóstico; prioridade alta por impedir a primeira emissão real e deixar potencial reserva bancária pendente. Não há evidência suficiente para afirmar emissão duplicada, título registrado ou erro de valor.

# Módulo Impactado

BTG v2 Collections — emissão BolePix por parcela de acordo na VPS. O contrato oficial reconhece o instrumento `BANKSLIP_QRCODE` e o escopo de gestão `brn:btg:empresas:banking:collections`. [1] [2]

# Comportamento Atual

`server/btg-v2/client.ts`, função `criarBolePixBtgV2`, faz POST Collections e, quando `response.ok` é falso, lança somente uma mensagem com `response.status`, sem ler o corpo ou os identificadores de resposta. Não há captura do motivo específico do HTTP 400 nesse caminho.

Em `server/btg-v2/issuance.ts`, falhas no bloco de montagem/envio/persistência são tratadas conservadoramente como `incerta`, com `erroCodigo=EMISSAO_SEM_CONFIRMACAO`. A origem e o canal continuam protegidos contra outro envio. Esse é o comportamento do código; o estado da tentativa real ainda não foi consultado.

# Comportamento Esperado

Apresentar um diagnóstico seguro e acionável da recusa, identificar a tentativa existente e impedir segunda emissão API/CNAB. Não expor OAuth, Client Secret, segredo do webhook, payload integral do pagador ou meios de pagamento nos logs/interface.

# Como Reproduzir

O usuário já forneceu a mensagem após uma tentativa real. Não reproduzir com novo POST financeiro. Reproduzir primeiro com `fetch` simulado devolvendo HTTP 400 e um corpo sintético; o cliente atual perde o corpo. Conferir o registro existente por leitura restrita depois de identificar acordo/parcela.

# Diagnóstico Inicial

Confirmado por inspeção: o sistema descarta os detalhes do retorno de erro; a interface exibe uma mensagem genérica. A API oficial documenta respostas 400 e 422, além de sucesso 201. O código e a documentação não permitem inferir o campo recusado apenas pelo status HTTP. [2]

A ficha técnica e o contrato de criação foram consultados em 06/11/2026. O exemplo padrão publicado corresponde a boleto simples, embora o contrato liste alternativas BolePix. Não presumir todos os campos internos de BolePix exclusivamente a partir desse exemplo. [1] [2]

# Causa Provável

Causa específica da recusa ainda desconhecida. Há hipóteses de validação do pagador, datas, formato/identificadores do payload, dados da conta ou habilitação bancária; nenhuma foi comprovada para a tentativa real. A ausência de detalhe é uma falha confirmada de observabilidade, não prova de qual hipótese causou o HTTP 400.

# Impactos Identificados

A emissão pode ficar bloqueada localmente como incerta, sem Collection ID. Ausência de Collection ID local não comprova inexistência de título no banco. Reenviar, gerar CNAB para contornar ou apagar a reserva pode duplicar obrigação financeira. A investigação deve preservar conta, parcela, valor, vencimento, número reservado, canal e histórico.

# Correção Proposta

Primeiro identificar a tentativa e conferir seus dados mínimos por SELECT. Quando houver identificadores e horário, buscar o retorno original nos canais de diagnóstico do banco, se disponível, sem novo POST.

Propor melhoria do cliente para capturar informações de erro sanitizadas e limitadas, com status e identificadores permitidos, preservando a política de ausência de retry. Não alterar payload, valor, datas, canal ou tratamento financeiro da tentativa existente sem especificação, teste e aprovação adequados. Esta ocorrência registra proposta; nenhum código foi modificado nesta etapa.

# Regra Atual e Regra Corrigida

Regra atual: erro HTTP vira mensagem genérica; falha de emissão mantém reserva/canal incertos. Regra proposta de diagnóstico: conservar informações seguras para investigação, sem alterar a proibição de reenvio/fallback. Não interpretar HTTP 400 isolado como autorização para liberar a parcela.

# Alterações Técnicas Necessárias

Frontend: exibir motivo sanitizado e identificador de suporte quando disponíveis. Backend: ler corpo de erro com limite de tamanho, sanitização/allowlist e fallback para texto não JSON; preservar código HTTP e evitar impressão de cabeçalhos/payload.

Banco: avaliar persistência mínima somente após definição de contrato; nenhum DDL/DML foi executado. Integração: confirmar a forma específica BolePix oficial antes de alterar qualquer campo. A resposta já descartada não pode ser recuperada retroativamente do cliente atual.

# Correção de Dados Existentes

Nenhuma neste diagnóstico. Não apagar `btgCobrancasEmitidas`, incrementar revisão, limpar `canalBancario`, alterar `externalId`, cancelar título ou restaurar dump antigo. Qualquer recuperação deve identificar a reserva canônica e confirmar a situação bancária primeiro.

# Histórico e Auditoria

Preservar tentativa, identificadores locais, status e horários. Registrar eventual motivo seguro e decisão de recuperação sem CPF/CNPJ integral, tokens, Pix, boleto ou dados completos da conta. A emissão relatada pelo usuário não foi comandada pelo agente.

# Plano de Testes

Simular erros 400/422/500, corpo JSON/não JSON/vazio e falha de leitura; garantir limite/redação de segredos/dados pessoais, fallback seguro e ausência de retry. Simular resposta de criação aceita seguida de falha local para preservar `incerta`. Regressões de reserva, RBAC/carteira, idempotência e bloqueio recíproco API/CNAB. Nenhum teste financeiro real para obter um erro mais detalhado.

# Plano de Reversão

Uma melhoria de diagnóstico deve permitir reversão do código sem alterar registros existentes. Não restaurar banco sobre operações recentes ou remover marcadores. Mudanças de recuperação financeira exigem autorização específica e decisão baseada em retorno/conciliação do BTG.

# Critérios de Aceite

Identificar acordo/parcela/tentativa e estado canônico; obter evidência suficiente para atribuir causa; mostrar diagnóstico seguro nas próximas respostas de erro; não chamar POST automaticamente, não trocar canal e não expor dados sensíveis. Payload e título só podem ser corrigidos depois de confirmar a causa.

# Riscos e Dependências

Depende da identificação da tentativa e de leitura dos registros da VPS; eventual retorno bancário original pode estar disponível somente no BTG. Consultar documentação não substitui o retorno específico. Não supor que mudar agência, telefone, vencimento ou CPF resolve a recusa.

# Pendências para Validação

Confirmar se ocorreu no acordo #5/parcela #19 ou em outro acordo. Obter valor/vencimento e status/identificadores mínimos por leitura. Verificar se houve título visível no BTG sem realizar segunda emissão. Definir proposta de diagnóstico e recuperação somente depois dessas evidências.

# Próximos Passos

Pedir os identificadores do acordo da tentativa. Preparar leitura restrita dos registros corretos, sem consulta a senhas/tokens ou envio bancário. Manter a parcela bloqueada até esclarecer a emissão.

## Referências

[1]: https://developers.empresas.btgpactual.com/docs/tecspecs/Banking%20-%20Collections-spec "BTG Collections — ficha técnica e modalidades"
[2]: https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/criar-cobranca "BTG Collections — contrato de criação de cobrança"
