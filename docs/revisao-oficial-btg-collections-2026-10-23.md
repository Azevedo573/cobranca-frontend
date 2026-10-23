# Revisão da API BTG Collections — 23 de outubro de 2026

## O que está correto

A integração de Cobranças do BTG deve usar OAuth 2.0 no fluxo **Authorization Code**. O próprio BTG informa que `client_credentials` não concede acesso às APIs Banking, portanto ele não é uma alternativa para emitir cobranças. O código atual acertou ao usar Authorization Code, `openid` e o escopo `brn:btg:empresas:banking:collections`. [1] [2] [3]

O fluxo exige um consentimento inicial de uma pessoa no BTG. No Sandbox, qualquer usuário com permissão de desenvolvedor ou superior pode fazer esse login; em Produção, a documentação exige usuário operador ou superior. Depois do consentimento, o BTG retorna um authorization code para a URI cadastrada e o servidor troca esse código por access token e refresh token usando Basic Auth. [2]

Portanto, não existe um modo correto de obter o primeiro token Banking sem esse login/consentimento. Ele pode ser feito no navegador do responsável pelo BTG, mas a URI de retorno precisa ser exatamente a cadastrada no aplicativo. A chave `BTG_TOKEN_ENCRYPTION_KEY` continua sendo uma proteção interna do sistema, não uma credencial do BTG.

Também está correta a utilização do CNPJ Sandbox `30306294000145`. O BTG informa que todas as claims, `companyId` e `accountId` desse ambiente derivam dessa empresa de testes. [2] [6]

## Onde o módulo de cobrança está errado

O problema principal não está no OAuth; está no contrato usado para criar a cobrança. A emissão não deve ser liberada ainda.

O arquivo `server/btg-service.ts` define `BANKSLIP_PIX`, mas a documentação vigente define o boleto híbrido como `BANKSLIP_QRCODE`. Para boleto simples, o tipo é `BANKSLIP`. A documentação apresenta uma divergência entre páginas para o nome do PIX com vencimento: a ficha técnica usa `DUE_DATE_QRCODE`, enquanto a página de criação lista `DUE_DATE_PIX`. Esse detalhe deve ser confirmado com o BTG antes de implementar essa modalidade; para o boleto híbrido, `BANKSLIP_QRCODE` é a referência clara. [4] [5]

O sistema armazena `cobrancas.amount` e `parcelasAcordo.amount` em centavos, mas o exemplo oficial de Collections envia `amount` como decimal em reais, como `270.87`. O código atual entrega o inteiro de centavos diretamente ao BTG. Uma cobrança interna de R$ 270,87 poderia ser enviada como 27087 se isso não for corrigido. A adaptação obrigatória é converter `centavos / 100` somente ao montar o payload do BTG. [4]

O contrato atual exige `account` e `detail` na criação. O sistema já possui agência, conta e convênio em `cnabConfigGlobal` e `configuracaoBoleto`, mas esses dados não são colocados no payload API. Também faltam os nomes corretos do pagador: a referência usa `payer.taxId` e `payer.phoneNumber`; o serviço atual usa `document` e `phone`. [4]

A referência também indica que os dados retornados do boleto ficam em `detail`, como `barCode`, `digitableLine` e, para boleto híbrido, `emv`. O router atual tenta ler campos de nível superior, como `bankSlipUrl`, `pixQrCode` e `pixCopyPaste`, sem evidência correspondente na especificação atual. Isso impede persistir corretamente a linha digitável e o PIX copia-e-cola. [4] [5]

Por fim, a emissão Sandbox requer o header `x-response: success` ou `x-response: error`. O código atual não adiciona esse header. Além disso, o Sandbox usa respostas mockadas, estáticas e não cria, armazena ou liquida cobranças reais; ele só valida contrato e autenticação. [4] [6]

## Correção necessária antes do primeiro teste de cobrança

A próxima implementação deve substituir o modelo de payload por um adaptador Collections atual. Ele deve usar `BANKSLIP_QRCODE` para BolePix, converter centavos para reais, preencher `account.branch` e `account.number`, e criar `detail` com pelo menos `documentNumber`, `correlationId` estável e `externalId` do registro interno. Também deve normalizar o pagador para `taxId` e `phoneNumber`, usar o header `x-response: success` somente em Sandbox e mapear a resposta a partir de `detail.emv`, `detail.barCode` e `detail.digitableLine`.

A adaptação deve prever idempotência. O `correlationId` deve ser determinístico por cobrança/parcela e a persistência local deve ocorrer somente após resposta válida. Não se deve mudar o status financeiro da cobrança para pago a partir de resposta Sandbox, porque esse ambiente não armazena nem liquida entidades reais. [4] [6]

Como reforço de segurança interno, `emitirBoleto`, `cancelarBoleto`, sincronizações e conciliações devem ser restritos a administradores ou submetidos a escopo explícito de condomínio. Hoje essas procedures usam a permissão genérica de usuário autenticado.

## Caminho correto de homologação

Primeiro, o responsável faz uma vez o consentimento OAuth no BTG Sandbox. Depois, o sistema usa o token Sandbox para enviar um payload corrigido com `x-response: success`. O resultado esperado é apenas a resposta estática de contrato; não haverá boleto real, pagamento, webhook ou saldo no Sandbox. [4] [6]

Somente após validar esse contrato deve ser iniciado o processo de homologação de Produção do aplicativo. Em Produção, o token deriva do consentimento de um usuário operador ou superior e a emissão tem efeito financeiro real. [2] [7]

## Referências

[1]: https://developers.empresas.btgpactual.com/docs/starting-doc/Integrando/Fluxo%20de%20autoriza%C3%A7%C3%A3o/Client%20Credentials "Client Credentials"

[2]: https://developers.empresas.btgpactual.com/docs/starting-doc/Integrando/Fluxo%20de%20autoriza%C3%A7%C3%A3o/Authorization%20Code "Authorization Code"

[3]: https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/banking-collections "Banking Collections"

[4]: https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/criar-cobranca "Criar Cobrança"

[5]: https://developers.empresas.btgpactual.com/docs/tecspecs/Banking%20-%20Collections-spec "Ficha técnica Collections"

[6]: https://developers.empresas.btgpactual.com/docs/starting-doc/Integrando/Ambientes/Sandbox "Ambiente Sandbox"

[7]: https://developers.empresas.btgpactual.com/docs/starting-doc/Integrando/Aplicativos/Caracter%C3%ADsticas "Características dos aplicativos"
