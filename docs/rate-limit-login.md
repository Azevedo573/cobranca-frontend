# Rate Limit de Login

## Regra aplicada

Cada canal de autenticação — administrador, condomínio e colaborador — registra tentativas usando uma chave derivada por hash do canal, IP e identificador informado. O identificador e o IP puros não são gravados nesta tabela de limite.

São permitidas até cinco falhas dentro de quinze minutos. Na tentativa seguinte dentro da mesma janela, o acesso é bloqueado por trinta minutos. Um login bem-sucedido zera o contador daquele canal, IP e identificador.

## Resposta e auditoria

Durante o bloqueio, a API retorna `TOO_MANY_REQUESTS` sem informar se a conta existe. O evento também é enviado à auditoria de falhas de login. Não há alteração em dados financeiros, jurídicos ou de usuários durante o bloqueio.

## Reversão

Para reverter a proteção, restaure o checkpoint anterior e mantenha a tabela `loginRateLimits`; ela é observacional. Para desbloqueio excepcional, um administrador de banco pode remover apenas a linha pelo `keyHash`, sem precisar conhecer ou registrar o identificador original.
