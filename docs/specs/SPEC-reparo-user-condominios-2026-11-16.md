# SPEC — reparo estrutural seletivo de userCondominios

## Objetivo e aprovação

Relato16/11 de falha no cadastro de colaborador. Consulta da VPS09:26 confirmou ausência de userCondominios, ER_NO_SUCH_TABLE1146/42S02; usersInnoDB e ID11 ausente. Usuário aprovou09:27 backup e criação somente da tabela e índices. Execução pelo terminal da VPS, sem SSH independente. VPS última versão77893949; não atualizar aplicação.

## Escopo e limites

Criar apenas a estrutura equivalente ao schema/migration0094: id auto_increment PK, userId/condominioId int obrigatórios, isActive int default1 obrigatório, createdAt/updatedAt timestamp com defaultCURRENT_TIMESTAMP e onupdate no updatedAt. Unicidade userId+condominioId e dois índices por usuário/condomínio+isActive. ENGINE InnoDB explícita. Todos os índices na mesma instrução CREATE TABLE; sem IF NOT EXISTS que masque estrutura diferente.

Não executar INSERT/UPDATE/DELETE/ALTER/DROP/TRUNCATE, backfill0094, migrações gerais, journal/meta, implantação/build/restart, concessões a pessoas reais ou operações BTG/financeiras. Estrutura vazia não recompõe carteiras legadas: revisão separada. Não eliminar ID11 nem repetir cadastro como sondagem automática.

## Plano e arquivos

1. scripts/reparar-user-condominios-vps.cjs: parser/validação metadata, --check e --apply com literal; mysql2/dotenv existentes; backup via mysqldump sem credenciaisCLI; erro protegido.
2. scripts/reparar-user-condominios-vps.sh: diretório/usuário/lock/versão/arquivos sensíveis, invoca helper; sem mudanças de HEAD, serviço ou configuração.
3. server/reparo-user-condominios.test.ts: testes puros e integração totalmente simulada de backup/criação/recusa/idempotência.
4. docs/reparo-user-condominios-vps.md e todo: manual/evidências/pendências. Bloco curto recuperará ambos scripts por commit e hashes fixos, sem avançar HEAD da aplicação.

## Proteções e estilo

Conferir metadados antes de backup/DDL; tabela ausente permite CREATE, compatível retorna sem escrita, preexistente divergente recusa. users/auditLogs devem existir como InnoDB; banco/configuração não exibidos. Limites de conexão, consultas e mysqldump; lock comum com deploy; backup privado completo do banco+metadata+hash validado antesDDL. .env regular e identidade da configuração reconfirmadas antes do CREATE. Consultar novamente metadata antesDDL para não disputar criação concorrente. Nenhum efeito financeiro pelo roteiro; eventos normais da aplicação não são suspensos.

```js
if (plano !== 'ausente') return; // nunca alterar uma tabela divergente
await backupPrivado();
await db.query(CREATE_TABLE_COM_INDICES); // sem dados de usuários
```

## Comandos e testes

`node --check scripts/reparar-user-condominios-vps.cjs`; `bash -n scripts/reparar-user-condominios-vps.sh`; `pnpm exec vitest run server/reparo-user-condominios.test.ts --no-file-parallelism`; `git diff --check`. Simulações devem cobrir ausência/compatível/incompatível, backup falho/vazio/footer/hash, env alterado/symlink, CREATE falho/pósmetadata incompatível, segredo nos erros não exibido, nenhumDML, idempotência sem reativar vínculo e estrutura correta. Validação independente do wrapper com comandos simulados; nenhuma VPS/DB real no desenvolvimento.

## Critérios de aceite e reversão

Após execução autorizada, metadata contém os seis campos e quatro índices esperados, engineInnoDB, sem INSERT automático. Backup íntegro precedeDDL; erros interrompem e não expõem segredos. Não afirmar cadastro homologado pela criação de tabela ou zero linhas em consulta estrutural. SeDDLfalhar, pode haver criação concluída; inspecionar, nunca apagar/repetir cegamente. Não restaurar banco sobre pagamentos posteriores nem remover vínculos de usuários. Homologação do cadastro e revisão de carteiras continuam separadas.
