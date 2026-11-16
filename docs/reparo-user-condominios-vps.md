# Reparo VPS — estrutura de userCondominios

## Ocorrência e autorização

Em16/11/2026 o cadastro de colaborador falhou no UPDATE de vínculos. Às09:26 a consulta do usuário mostrou somente usersInnoDB, ausência da tabela/colunas/índices de userCondominios, erro1146/ER_NO_SUCH_TABLE/42S02 e ID11 não encontrado. Às09:27 o usuário aprovou backup e criação somente da tabela e índices, sem backfill. Nenhum acesso SSH independente; execução pelo terminal da VPS.

## O que será executado

Backup privado do banco completo antes de qualquer CREATE. Uma única instrução CREATE TABLE com seis campos, PKid, unicidadeuserId/condominioId e índicesuserId/isActive econdominioId/isActive. ENGINEInnoDB explícita. Estrutura equivalente ao schema e parteDDL0094, sem o INSERT/reativação que existe na migração histórica.

Nenhum ALTER/DROP/INSERT/UPDATE/DELETE, journal de migrações, build, reinício, deploy, edição de .env, concessão/revogação em lote, BTG ou efeito financeiro forçado. O Git/HEAD da aplicação permanece77893949. Novos eventos bancários legítimos continuam sendo processados pela aplicação; não se suspende o serviço para o backup.

## Segurança e verificação

Scripts scripts/reparar-user-condominios-vps.cjs e .sh serão recuperados por commit e hashes fixos para um diretório temporário privado. O wrapper exige root, /var/www/cobranca, HEAD77893949/main limpo e dependências presentes. Usa o lock comum de deploy; nenhuma atualização de HEAD.

Helper verifica users e auditLogs como InnoDB, metadata de vínculos e engine. Tabela compatível existente retorna sem escrita/backup; divergente para, sem ALTER. Ausente permite reparo somente com flag e literal explícitos. Configuração obtida do .env regular, sem symlink; hash reconfirmado antes/depois de backup eDDL. Banco/credenciais não exibidos.

Mysqldump recebe credenciais em arquivo privado temporário, não em argumentos de senha. Usa --defaults-file exclusivo, HOMEprivado e MYSQL_TEST_LOGIN_FILE inexistente nesse diretório para não herdar opções de backup/login externos; protocoloTCP e identidade de conexão iguais ao mysql2. Basebackups exige rootowner e sem escrita por grupo/outros; escritaCNF protegida pelo finally mesmo em falha parcial. Backup em /var/backups/cobranca/user-condominios-... com diretório700/arquivos600, dump+estrutura-anterior.json+SHA256SUMS. Saída do dump e logs privados, limite10min; execução bem-sucedida, arquivo não vazio, footer final, estruturasusers/auditLogs e hashes conferidos antesDDL. CNF removido ao terminar/falhar. Isso não substitui ensaio de restauração; snapshot consistente depende das engines e ausência de DDL concorrente fora do lock. Usa as opções MySQL já utilizadas nos backups da VPS; cliente incompatível falha antesDDL, sem fallback silencioso.

Reconsulta metadata antes de criar; se outro responsável já tiver criado estrutura compatível, não repete nem altera. CREATEsemIFNOTEXISTS, campos e índices juntos. Conferência posterior e SELECTLIMIT0 verificam colunas, sem ler dados pessoais ou testar cadastro por mutation.

## Resultado esperado

```text
=== ESTRUTURA CRIADA E CONFERIDA ===
userCondominios: seis campos, chave primaria, unicidade e dois indices; InnoDB.
Backup: /var/backups/cobranca/user-condominios-...
Sem preenchimento de vinculos, reativacao de acessos, alteracao de usuarios, deploy, reinicio ou operacao BTG.
```

A estrutura criada não garante que todo o formulário de cadastro funcionará: outras dependências serão exercitadas apenas ao usuário repetir o cadastro pretendido. ID11ausente não comprova ausência de outras tentativas ou do email original.

## Carteiras antigas

A tabela nasce vazia. Não copiar users.condominioId nem reativar vínculos automaticamente. Modos legados/restritos podem precisar de configuração administrativa explícita; alcance todos usa sua própria regra de carteira. Criar estrutura não promove usuário a administrador nem concede acesso global. Revisão/recuperação de carteiras anteriores exige escopo e autorização separados.

## Falhas e reversão

Se backup falhar, não executarDDL. O script mostra código protegido e caminho local, nunca payload, senha ou sqlMessage. Não enviar dump/.env/logsprivados na conversa.

DDLMySQL não é rollback transacional de dados. SeCREATE/pósconferência falhar, a tabela pode já existir; parar e inspecionar antes de repetir. Não apagar tabela/índices/vínculos/auditoria como compensação; não restaurar o banco sobre pagamentos posteriores. Recuperação deve ser pontual e autorizada, preservando registros de qualquer cadastro realizado após a criação.

## Testes e limitações

Preparação concluída: 93 testes de metadata/protocolo aprovados, TypeScript, node--check/bash-n e diff aprovados. Revisão independente inicial reproduziu pontos de isolamento das opções/privacidade da base/limpeza de CNF e recheckHEAD; reforçados antes da entrega. QA final do backup: 14 cenários/113 verificações aprovadas sobre fixtures privadas, sem mysqldump/DB/VPS reais. Erros/tabela divergente continuam recusados, sem remover guards. Não foi executada suíte completa ou build porque aplicação não foi alterada.

SHA256helper: 51cc3fe50bc018f123504ffd9b90b4e5e59ce53e01e73da6d155105bebf37900. SHA256wrapper: a9acdba337d497df0c3ba953c4254f194a5cdd35deb0d13d54107e1837ee8dd5. O usuário pediu09:34 somente o bloco; nenhuma homologação manual lhe será exigida para executar o reparo aprovado. A conferência estrutural é automática no roteiro.

Referências do isolamento: [opções mysqldump](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html) e [arquivos de opções/Login](https://dev.mysql.com/doc/refman/8.0/en/option-files.html), consultadas16/11. MYSQL_TEST_LOGIN_FILE redireciona os arquivos de login; --defaults-file não basta sozinho para ignorá-los.

## Pendências

- Salvar roteiro e entregar bloco fixado por commit/hash.
- Saída real da VPS confirmando backup e estrutura.
- Sucesso do cadastro e alcance/perfil não são inferidos por metadata; nenhum teste de cadastro será executado automaticamente ou solicitado como pré-requisito do reparo.
- Carteiras antigas e eventual aprimoramento do preflight de deploy são assuntos separados, não executados neste reparo.
