# Spec: Autenticação BTG Collections por Authorization Code

## Objetivo

Substituir a autenticação atual de `client_credentials` da integração BTG pelo fluxo OAuth 2.0/OpenID Connect **Authorization Code**, conforme a documentação do BTG Empresas para APIs Banking/Collections.

O sistema atende a um modelo de conta BTG única do escritório. A integração deve obter consentimento de um usuário autorizado da conta do escritório, usar o CNPJ autorizado no token e permitir que o sistema emita cobranças associadas internamente a diferentes condomínios. Esta entrega **não habilita emissão real por si só**: ela cria a base segura de autenticação para as próximas correções do adaptador Collections.

### Critérios de sucesso

1. Um administrador consegue iniciar o consentimento por botão na configuração BTG, sem visualizar `client_secret`, access token ou refresh token.
2. O servidor gera `state` aleatório, armazena apenas seu hash, define expiração de 10 minutos e só aceita um uso.
3. O callback público `GET /api/integracoes/btg/callback` valida `state`, trata consentimento negado e troca `code` por tokens usando `grant_type=authorization_code` e Basic Auth no backend.
4. Access token e refresh token ficam cifrados com AES-256-GCM antes de persistidos; a chave é lida somente de `BTG_TOKEN_ENCRYPTION_KEY`.
5. Chamadas futuras obtêm access token válido do armazenamento e renovam token expirando pelo `grant_type=refresh_token`; nenhum token é devolvido pelo tRPC nem gravado em log.
6. A tela mostra estado seguro da conexão: não conectado, aguardando consentimento, conectado ou requer reconexão. O antigo botão de teste via `client_credentials` deixa de existir.
7. O sistema exige `BTG_CLIENT_ID`, `BTG_CLIENT_SECRET`, `BTG_REDIRECT_URI` e `BTG_TOKEN_ENCRYPTION_KEY`; ausência de variável gera erro seguro e orientado ao administrador.
8. Testes unitários cobrem URL de autorização, `state`, cifra/decifra, troca de código, refresh e recusa a estado inválido/expirado/reutilizado. `pnpm test`, `pnpm check` e `pnpm build` precisam passar.

## Premissas e decisões

- O aplicativo BTG é **Confidencial**, pois Banking requer Authorization Code com Client Secret mantido no backend.
- O fluxo usa os escopos `openid brn:btg:empresas:banking:collections`. O escopo de consulta separada só será incluído se estiver habilitado no portal BTG.
- `BTG_REDIRECT_URI` é obrigatória, não possui valor padrão e deve ser idêntica à URI cadastrada no aplicativo BTG para o ambiente atual.
- Sandbox e produção possuem aplicativos, URI e tokens independentes. O ambiente é definido por `BTG_SANDBOX=true|false`.
- A aplicação não exibe nem aceita Client Secret pela interface. `BTG_CLIENT_SECRET` é somente o nome da variável interna que armazena o valor chamado **Client Secret** no portal BTG.
- O token está associado à conta única do escritório. Antes da emissão real, o `companyId` será conferido contra a claim `aud` retornada pelo BTG e contra `BTG_COMPANY_ID` em produção.
- Os campos históricos `clientSecret`, `accessToken` e `tokenExpiresAt` em `btgConfig` serão ignorados pelo novo código e não receberão novas gravações. Eles não serão removidos nesta entrega para preservar compatibilidade e permitir rollback controlado.

## Arquitetura e estrutura

```text
server/btg-oauth.ts
  → URL de autorização, state, callback, troca/refresh de token e AES-256-GCM.

server/btg-service.ts
  → Consome getBtgAccessToken() do novo módulo; remove client_credentials.

server/routes/btg-oauth.ts
  → Callback Express público e retorno seguro à tela de configuração.

server/routers/btg.ts
  → Procedures administrativas: status da conexão e início do consentimento.

client/src/pages/configuracoes/BTGConfig.tsx
  → Botão de conectar/reconectar e estado não sensível da autorização.

drizzle/schema.ts + nova migration
  → btgOauthEstados e btgOauthTokens, com somente valores cifrados persistidos.

server/btg-oauth.test.ts
  → Testes unitários com fetch e banco simulados.
```

### Dados novos

`btgOauthEstados` registra a solicitação temporária de consentimento: hash do state, usuário administrador solicitante, ambiente, URI de retorno, expiração, consumo e erro sanitizado.

`btgOauthTokens` registra uma conexão global por ambiente: access token cifrado, refresh token cifrado, vencimento, escopos, companyId confirmado, estado da conexão e datas de auditoria. Não armazena Client Secret.

A migration adiciona tabelas; não altera cobranças, parcelas, acordos ou títulos existentes.

## Comandos

```bash
pnpm test -- server/btg-oauth.test.ts server/btg.test.ts
pnpm check
pnpm build
pnpm test
```

Na VPS, após deploy e validação de backup:

```bash
cd /var/www/cobranca
rm -f drizzle/meta/0083_snapshot.json
git pull
pnpm db:push
pnpm build
sudo -u cobranca pm2 restart cobranca --update-env
```

O deploy não faz parte desta alteração de desenvolvimento e só ocorrerá se for solicitado expressamente.

## Estilo de código

```ts
const state = randomBytes(32).toString("base64url");
const stateHash = createHash("sha256").update(state).digest("hex");

if (stateRecord.usedAt || stateRecord.expiresAt <= new Date()) {
  throw new BtgOAuthError("STATE_INVALIDO", "A autorização expirou. Inicie novamente.");
}
```

- TypeScript estrito, funções pequenas e erros sanitizados para a interface.
- Tokens e secrets nunca podem estar em mensagens, logs, respostas tRPC ou dados de auditoria.
- Valores cifrados usam envelope `v1:iv:tag:ciphertext`, AES-256-GCM e chave Base64 de 32 bytes.
- Operações de conexão são exclusivas de administrador; callback valida `state`, não sessão de navegador.

## Estratégia de testes

- Teste unitário de URL: host correto por ambiente, `client_id`, `redirect_uri`, escopos e state.
- Teste criptográfico: cifra não contém token em claro e decifra corretamente com chave válida.
- Teste de callback: state inexistente, expirado ou já utilizado falha sem chamar token endpoint.
- Teste de callback válido: POST usa `grant_type=authorization_code`, `code`, `redirect_uri` e Basic Auth; persistência é cifrada.
- Teste de refresh: token ainda válido não chama BTG; token próximo do vencimento usa `grant_type=refresh_token`; falha de refresh marca reconexão sem apagar histórico.
- Teste de permissão: usuário não administrador não inicia consentimento nem consulta estado detalhado.
- Regressão: módulo BTG não usa `grant_type=client_credentials` ou `scope=collections`.

## Limites

### Sempre

- Validar entrada e expiração do state.
- Manter segredos apenas no servidor.
- Criptografar tokens persistidos.
- Preservar registros financeiros e manter logs sanitizados.
- Executar testes, typecheck e build antes do checkpoint.

### Solicitar confirmação antes

- Aplicar a migration no banco de desenvolvimento ou produção.
- Cadastrar/alterar URI de redirecionamento, escopos ou webhook no portal BTG.
- Configurar segredos reais na plataforma ou na VPS.
- Fazer deploy ou alterar variáveis da VPS.

### Nunca

- Comitar Client Secret, access token, refresh token, chave de criptografia ou dados pessoais de pagadores.
- Expor tokens ou secrets ao frontend, banco em texto puro, logs, audit logs ou mensagens de erro.
- Emitir, cancelar ou alterar cobrança real durante os testes OAuth.
- Remover dados financeiros ou tokens históricos sem aprovação explícita.

## Questões abertas

1. Qual URI HTTPS exata será cadastrada no portal BTG para produção? Sugestão: `https://luminus.gomesesilvaadv.com.br/api/integracoes/btg/callback`.
2. O aplicativo já possui os escopos `openid` e `brn:btg:empresas:banking:collections` habilitados na versão Sandbox?
3. Para a produção, o CNPJ/conta autorizados correspondem à conta BTG do escritório que será o beneficiário das cobranças?
4. Após implementar, o administrador deverá registrar a URI no portal BTG e informar os quatro segredos pelo painel seguro; esta etapa não será feita automaticamente.

## Referências

- [Authorization Code — BTG](https://developers.empresas.btgpactual.com/docs/starting-doc/Integrando/Fluxo%20de%20autoriza%C3%A7%C3%A3o/Authorization%20Code)
- [Collections — BTG](https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/banking-collections)
- [Características do aplicativo — BTG](https://developers.empresas.btgpactual.com/docs/starting-doc/Integrando/Aplicativos/Caracter%C3%ADsticas)
