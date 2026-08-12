# Runbook Operacional — VPS Luminus

Este runbook define o procedimento padrão de atualização, migração, verificação, backup e recuperação da aplicação em produção. Execute os comandos a partir do diretório `/var/www/cobranca` e use uma janela de manutenção quando a alteração puder afetar emissão de boleto, conciliação ou sincronizações.

> Nunca versionar credenciais, senhas, tokens, arquivos `.env` ou dumps de banco no repositório.

## 1. Pré-deploy

Antes de atualizar, confirme se não há alterações locais inesperadas e faça backup do banco.

```bash
cd /var/www/cobranca
git status --short

sudo mkdir -p /var/backups/cobranca
sudo mysqldump -u cobranca -p cobranca \
  --single-transaction --routines --triggers \
  > /var/backups/cobranca/cobranca-$(date +%F-%H%M%S).sql
```

O `git status --short` deve estar vazio ou conter apenas arquivos conscientemente gerados. Caso haja metadados de migration locais não versionados, não os apague automaticamente sem identificar a origem. Primeiro, registre o nome do arquivo e confirme se ele já existe no repositório remoto.

## 2. Atualização de código

```bash
cd /var/www/cobranca
git pull --ff-only
pnpm install --frozen-lockfile
```

Se o pull informar que um arquivo local impede o merge, pare. Use `git status --short` para identificar a alteração, faça cópia para uma pasta temporária e só então aplique a resolução aprovada. Não usar `git reset --hard` em produção.

## 3. Migrations

Antes de aplicar uma migration, confirme se ela já foi aplicada. Para a migration da Onda 0:

```bash
mysql -u cobranca -p cobranca -e "SHOW TABLES LIKE 'execucoesOperacionais';"
```

Se a tabela ainda não existir, aplique a migration versionada:

```bash
cd /var/www/cobranca
mysql -u cobranca -p cobranca < drizzle/0084_glamorous_skullbuster.sql
```

Depois, valide a estrutura:

```bash
mysql -u cobranca -p cobranca -e "DESCRIBE execucoesOperacionais;"
```

Uma migration deve ser aplicada **uma única vez**. Registre no ticket/release que ela foi aplicada, com data e responsável.

## 4. Build, restart e validação

```bash
cd /var/www/cobranca
pnpm build
sudo -u cobranca pm2 restart cobranca --update-env
sudo -u cobranca pm2 status
sudo -u cobranca pm2 logs cobranca --lines 80 --nostream
```

Validações mínimas após o restart:

1. A página `/login-admin` abre normalmente.
2. Um administrador acessa **Administração → Agendamentos**.
3. A área **Saúde Operacional** é exibida sem erro.
4. Uma sincronização TJRJ autorizada registra resultado no painel.
5. Não há erro de migration, conexão MySQL ou exception não tratada nos logs PM2.

## 5. Recuperação

Se o build falhar, não reinicie a aplicação: preserve a versão que estava ativa e investigue a falha. Se a aplicação iniciar mas apresentar falha crítica, restaure o último checkpoint de código aprovado e reinicie o PM2.

Para recuperação do banco, o restore só deve ocorrer após autorização explícita, pois pode substituir dados recentes:

```bash
# Exemplo — usar apenas após validação do arquivo e autorização
mysql -u cobranca -p cobranca < /var/backups/cobranca/ARQUIVO_VALIDADO.sql
```

Após qualquer recuperação, registre motivo, horário, responsável, versão de código, backup utilizado e validações executadas.

## 6. Diagnóstico rápido

| Sintoma | Verificação inicial |
|---|---|
| Aplicação indisponível | `sudo -u cobranca pm2 status` e logs PM2 |
| Erro após deploy | `pnpm build`, logs PM2 e última migration aplicada |
| TJRJ sem resultado | Painel Saúde Operacional, número CNJ, logs de execução e disponibilidade da API |
| Fila WhatsApp parada | Status PM2, logs de fila e registros pendentes |
| CNAB inconsistente | Lote, retorno, nosso número, central de exceções e auditoria |

## 7. Política de segurança

Não colocar senhas em comandos enviados por chat, documentação versionada, logs ou scripts. Sempre usar prompt de senha, variável de ambiente protegida ou cofre de segredos autorizado.
