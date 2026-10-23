# Homologação BolePix BTG v2 — Sandbox

## Objetivo

Validar no ambiente de desenvolvimento o fluxo First-Party do escritório: OAuth, consulta de conta recebedora, vínculo condomínio→conta e emissão de BolePix. O Sandbox do BTG usa respostas estáticas e não cria títulos financeiros reais. [1]

A emissão v2 usa `BANKSLIP_QRCODE`, que é o tipo oficial de boleto híbrido com QR Code Pix. [2]

## Pré-requisitos no cofre seguro do Sandbox

Cadastre ou confirme estas variáveis no ambiente de desenvolvimento. Os valores não devem ser incluídos em arquivos, commits ou telas do sistema.

```text
BTG_SANDBOX=true
BTG_CLIENT_ID=<Client ID do aplicativo Sandbox>
BTG_CLIENT_SECRET=<Client Secret do mesmo aplicativo>
BTG_REDIRECT_URI=https://<dominio-https-do-sandbox>/api/integracoes/btg/callback
BTG_TOKEN_ENCRYPTION_KEY=<chave-base64-de-32-bytes>
```

O URL de retorno cadastrado no portal BTG deve ser exatamente igual a `BTG_REDIRECT_URI`, incluindo caminho e HTTPS. A autorização agora solicita também o escopo `empresas.btgpactual.com/accounts.readonly`, necessário para consultar as contas autorizadas. O escopo de Collections continua sendo `brn:btg:empresas:banking:collections`. [3] [4]

> Se o consentimento OAuth foi feito antes desta atualização, conecte novamente a conta Sandbox para conceder o novo escopo de leitura de contas.

A variável abaixo ainda não é necessária para o Sandbox, porque esse ambiente não entrega webhooks reais. Ela será obrigatória antes de habilitar o callback na Produção:

```text
BTG_WEBHOOK_SECRET=<segredo HMAC entregue/cadastrado no BTG>
```

## Passo a passo no sistema

1. Acesse **Banco → BTG — Configuração**. A página exibirá o ambiente atual e o checklist de prontidão.
2. Na aba **Conexão**, clique em **Conectar conta BTG** e conclua o consentimento no portal BTG. Os tokens permanecem cifrados no backend e nunca são exibidos na interface.
3. Na aba **Contas e condomínios**, clique em **Consultar contas**. Essa chamada é manual e consulta `GET /:companyId/banking/accounts` no BTG. [4]
4. Selecione um condomínio de teste e associe uma das contas retornadas. Não há seleção automática de conta.
5. Na aba **Regras e saúde**, defina o limite após o vencimento e a descrição padrão. Em seguida, clique em **Habilitar homologação** e confirme digitando `HOMOLOGAR`.
6. Abra um devedor de teste com CPF/CNPJ, nome e endereço completo. Em uma cobrança pendente, escolha a ação de BolePix. O modal revisa os dados e pede confirmação antes do POST.
7. Registre o resultado. O novo registro fica em `btgCobrancasEmitidas`; os campos BTG/CNAB históricos de `cobrancas` e `parcelasAcordo` não são alterados por esta emissão v2.
8. Repita a mesma ação uma vez. O sistema deve devolver o mesmo registro, sem criar um segundo título, pois a emissão usa chave única de origem/revisão e idempotência.
9. Em **Banco → Conciliação BolePix BTG v2**, execute a consulta manual do título. A baixa só é aplicada se `paidAmount` retornado pelo BTG for idêntico ao valor local em centavos.
10. Para testar cancelamento, selecione uma emissão não encerrada, digite `CANCELAR` e aguarde a resposta `204` do BTG. O registro de origem continua pendente e não é cancelado automaticamente.

## Controles já aplicados

A rota de emissão está limitada ao Sandbox. Produção não tem botão de ativação nesta versão. Antes de chamar o BTG, o sistema grava uma reserva exclusiva da emissão; se houver falha sem confirmação, o título entra em estado `incerta` e não pode ser reemitido automaticamente.

A rota de webhook v2 é `POST /api/webhooks/btg/v2/:ambiente`. Ela usa corpo bruto, exige HMAC SHA-256 e guarda apenas hash e metadados mínimos da entrega para deduplicação. O Sandbox não é adequado para testar webhooks. [1]

## Não executar ainda

Não configure credenciais de Produção nem altere `BTG_SANDBOX` para `false`. A próxima fase exige conciliação e cancelamento v2, teste controlado e autorização explícita para Produção.

## Próxima etapa técnica já especificada

O cancelamento v2 usará `DELETE /:companyId/banking/collections/:collectionId`; no Sandbox o BTG exige o header `x-response: success` e responde `204` em caso de sucesso. A consulta para conciliação usa `GET /:companyId/banking/collections` com `pageSize` e `pageNumber`, podendo filtrar pelo identificador da cobrança. [5] [6]

## Referências

[1]: https://developers.empresas.btgpactual.com/docs/starting-doc/Integrando/Ambientes/Sandbox "Ambiente Sandbox BTG Empresas"
[2]: https://developers.empresas.btgpactual.com/docs/tecspecs/Banking%20-%20Collections-spec "Ficha técnica Collections"
[3]: https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/criar-cobranca "Criar cobrança Collections"
[4]: https://developers.empresas.btgpactual.com/docs/tecspecs/Banking%20-%20Accounts-spec "Ficha técnica Conta PJ"
[5]: https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/cancelar-cobranca "Cancelar cobrança Collections"
[6]: https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/listar-cobrancas "Listar cobranças Collections"
