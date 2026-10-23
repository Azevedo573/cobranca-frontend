# Configuração OAuth — BTG Collections

A integração de Banking/Collections do Luminus usa OAuth 2.0/OpenID Connect pelo fluxo **Authorization Code**. Não utilize `client_credentials` para esta integração.

## URI de retorno em produção

Cadastre exatamente esta URI na versão de produção do aplicativo confidencial BTG:

```text
https://luminus.gomesesilvaadv.com.br/api/integracoes/btg/callback
```

A URI cadastrada no portal deve ser idêntica ao valor da variável `BTG_REDIRECT_URI`, incluindo protocolo, domínio e caminho. Não inclua barra adicional no final.

## Pré-requisitos no aplicativo BTG

O aplicativo precisa ser **Confidencial** e deve ter os escopos:

```text
openid
brn:btg:empresas:banking:collections
```

A conta do escritório que fará o consentimento precisa ser a conta BTG que receberá as cobranças. Em produção, o consentimento deve ser realizado por usuário BTG com perfil de Operador ou superior.

## Variáveis de ambiente

As variáveis devem existir apenas no servidor. Não grave valores em arquivos versionados, banco de dados em texto puro ou frontend.

### Sandbox de homologação

```dotenv
BTG_SANDBOX=true
BTG_CLIENT_ID=<client-id-do-aplicativo-sandbox>
BTG_CLIENT_SECRET=<client-secret-do-mesmo-aplicativo-sandbox>
BTG_REDIRECT_URI=<uri-https-do-callback-do-ambiente-sandbox>
BTG_TOKEN_ENCRYPTION_KEY=<chave-base64-com-32-bytes>
```

No Sandbox, o BTG usa o CNPJ de teste `30306294000145`; `BTG_COMPANY_ID` não é usado.

A URI Sandbox deve apontar para o ambiente que está executando esta versão do código e também deve ser cadastrada no aplicativo Sandbox BTG. Não utilize a URI de produção durante testes no Sandbox, pois o retorno seria direcionado ao sistema produtivo.

### Produção (VPS)

```dotenv
BTG_SANDBOX=false
BTG_CLIENT_ID=<client-id-do-aplicativo-producao>
BTG_CLIENT_SECRET=<client-secret-do-mesmo-aplicativo-producao>
BTG_COMPANY_ID=<cnpj-do-escritorio-apenas-digitos>
BTG_REDIRECT_URI=https://luminus.gomesesilvaadv.com.br/api/integracoes/btg/callback
BTG_TOKEN_ENCRYPTION_KEY=<chave-base64-com-32-bytes>
```

Para criar uma chave de proteção com tamanho adequado, execute somente no servidor seguro:

```bash
openssl rand -base64 32
```

Guarde o resultado como `BTG_TOKEN_ENCRYPTION_KEY`. Não o altere após conectar a conta sem antes planejar a rotação, pois os tokens já persistidos são cifrados com ela.

## Consentimento

Depois de configurar as variáveis e reiniciar o processo, acesse **Configurações → Integração BTG Pactual** como administrador e clique em **Conectar conta BTG**. O sistema direciona ao BTG, valida o `state` de uso único e retorna para a mesma tela após o consentimento.

O access token e o refresh token nunca são mostrados na interface. Eles são cifrados com AES-256-GCM antes de serem armazenados nas tabelas `btgOauthTokens`. Estados temporários de autorização são gravados com hash e expiram em 10 minutos.

## Migração da VPS

Quando esta versão for aprovada para produção, aplique a migration versionada e reinicie o processo:

```bash
cd /var/www/cobranca
rm -f drizzle/meta/0083_snapshot.json
git pull
pnpm db:push
pnpm build
sudo -u cobranca pm2 restart cobranca --update-env
```

Confirme a existência das tabelas `btgOauthEstados` e `btgOauthTokens` antes de iniciar o consentimento no ambiente de produção.

## Limite desta entrega

Esta entrega substitui somente a autenticação pelo fluxo correto do BTG. A emissão real deve continuar bloqueada até a próxima etapa: adaptação do payload Collections, idempotência, conciliação, webhook e homologação de ponta a ponta.
