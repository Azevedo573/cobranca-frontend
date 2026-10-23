# Plano técnico — OAuth BTG Authorization Code

Especificação de referência: `docs/specs/SPEC-btg-oauth-authorization-code.md`.

## Ordem de implementação

1. **Modelo de dados e criptografia**
   - Adicionar tabelas globais `btgOauthEstados` e `btgOauthTokens` ao schema.
   - Criar migração aditiva com índices para estado e ambiente.
   - Implementar cifra AES-256-GCM com chave exclusiva `BTG_TOKEN_ENCRYPTION_KEY`.

2. **Serviço OAuth do backend**
   - Criar `server/btg-oauth.ts` com configuração de ambiente, URL de autorização, geração/validação de state, troca de authorization code, renovação de token e status seguro.
   - Substituir em `btg-service.ts` a autenticação Client Credentials pelo acesso ao token OAuth persistido.

3. **Rotas e permissões**
   - Criar callback público `GET /api/integracoes/btg/callback`.
   - Expor procedures administrativas de status e início do consentimento.
   - Remover procedure de teste baseada em Client Credentials.

4. **Interface de configuração**
   - Substituir o botão de teste pelo botão de conectar/reconectar BTG.
   - Exibir URI de callback, pré-requisitos e estado não sensível da conexão.
   - Não exibir webhook secret nem credenciais na interface.

5. **Testes e validação**
   - Criar testes unitários para state, criptografia, token válido, refresh e callback.
   - Executar testes direcionados, suíte completa, typecheck e build.
   - Criar checkpoint depois da validação, sem publicar/deploy.

## Riscos e mitigação

- **Segredos ausentes:** o código apresentará status seguro de configuração sem tentar obter token.
- **Callback/URI divergente:** a URI vem exclusivamente de `BTG_REDIRECT_URI`; o portal BTG deve conter exatamente o mesmo valor.
- **Falha após autorização:** o state é uso único e o registro de falha é sanitizado; nenhuma cobrança é afetada.
- **Token persistido:** tokens são cifrados antes de gravar; erros e interfaces não retornam tokens.
- **Rollback:** a migration apenas adiciona tabelas. Reverter a aplicação faz o módulo antigo voltar a funcionar, sem apagar tabelas ou dados OAuth.
