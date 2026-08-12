# Resposta a Exposição de Sessão Administrativa

## Situação identificada

Uma requisição copiada do navegador continha um cookie de sessão administrativo. Cookies de sessão são credenciais de acesso: qualquer pessoa que receba um valor ainda válido pode reproduzir requisições autorizadas até sua expiração ou revogação.

## Correções no código

As procedures de usuários retornam uma projeção mínima, sem `passwordHash` ou `openId`. As consultas genéricas de condomínio não retornam `password` nem `username`. O cookie de sessão é HTTP-only, seguro sob HTTPS e usa `SameSite=Lax`.

## Ação obrigatória na VPS

Após o deploy, gere um novo valor aleatório para `JWT_SECRET` no arquivo `.env` da VPS e reinicie o PM2. Isso invalida todas as sessões emitidas com o segredo anterior, inclusive a sessão que foi copiada para o terminal. Todos os usuários precisarão entrar novamente.

```bash
cd /var/www/cobranca
openssl rand -hex 48
# Edite o .env e substitua JWT_SECRET pelo valor gerado.
sudo -u cobranca pm2 restart cobranca --update-env
```

Não publique ou compartilhe o novo valor do segredo.
