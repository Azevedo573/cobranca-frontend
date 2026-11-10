# VPS — duas opções de alcance dos profissionais

## Autorização e estado

Usuário autorizou em 10/11/2026 às 12:51 atualizar a VPS. Alvo de aplicação fixo: `7a37548b2a392a6b8d6590966da2026eed6ccc3a`, aprovado no desenvolvimento com 3.011 testes, TypeScript e build. Última produção confirmada: `b1da399e953397703a1669bb9eb17d1397781f34`.

Esta preparação não é execução remota. O usuário executa como root em `/var/www/cobranca`; não existe acesso SSH independente do assistente. O resultado real ainda está pendente.

## O que o roteiro executa

`scripts/deploy-usuarios-escopo-vps.sh` verifica root/main/working tree, remoto aprovado, ancestralidade da versão, dependências sem alteração e somente migration0104/schema/meta no diff estrutural. Interrompe também se o Git falhar nas conferências. Serializa deploy por flock e confirma PM2 cobranca online com caminho `/var/www/cobranca/dist/index.js`.

Cria backup privado da aplicação, banco e `.env`, com dumps transacionais, verificação de arquivo/footer e hashes. Não exibe credenciais. Credenciais temporárias do dump e `.env` temporário do build são removidos inclusive em falhas. O backup pode conter dados pessoais e segredos: diretório700/arquivos600, não enviar ou publicar seu conteúdo.

Atualiza pelo GitHub por fast-forward para o alvo exato, nunca pela ponta móvel de main. Compila em diretório isolado antes da migration e da ativação. Não instala dependências e não compila sobre dist ativo.

Executa apenas:

```bash
env -u DATABASE_URL node scripts/provisionar-usuarios-escopo-condominios.cjs --check
env -u DATABASE_URL node scripts/provisionar-usuarios-escopo-condominios.cjs --apply 'CONFIRMAR CAMPO ESCOPO CONDOMINIOS'
env -u DATABASE_URL node scripts/provisionar-usuarios-escopo-condominios.cjs --check
```

O provisionador usa o `.env` revisado, e não um DATABASE_URL exportado por engano no terminal. Confere tipo/default/nulabilidade e hash da migration0104. SQL é somente aditivo: `ALTER TABLE users ADD escopoCondominios enum('selecionados','todos')` nullable. Sem DML/backfill; usuários existentes permanecem NULL/legado. Se já correto, não repete o ALTER. Não aplica migration0098 da Central Jurídica, outras migrations, geração geral de schema ou alterações de usuários/perfis.

Depois verifica backup/build/config/versão e troca dist por dois mv curtos, preservando anterior. Se o segundo mv falhar, recoloca dist anterior, sem reiniciar. Reinicia apenas PM2 cobranca como usuário cobranca, fechando fd do lock para não entregá-lo ao daemon. Confere HTTP200 local/HTTPS e estado/caminho PM2. Não altera Nginx, credenciais, concessões de RBAC, dados financeiros, títulos, números/canais/snapshots nem chama BTG.

## Execução

O bloco de entrada é fornecido ao usuário com commit do roteiro e SHA256 exatos após salvamento no GitHub. Ele recupera o script com git show para arquivo temporário e só executa após conferir SHA/sintaxe. Assim não depende de colar todo o script longo, nem avança o HEAD para obter o roteiro antes do backup.

Execução pode levar alguns minutos. Não interromper durante build ou migration. Qualquer falha: parar e informar o trecho final, sem repetir o bloco inteiro. O roteiro registra os caminhos de backup/build anterior e indica se o DDL pode já ter sido aplicado. Não enviar `.env`, dumps, hashes de senhas ou JSON completo do PM2.

## Reversão

Antes da troca, o dist ativo continua intacto; o Git pode já ter sido atualizado. A coluna0104 pode ter sido adicionada sem alterar acessos e deve permanecer.

Após a troca, caso reinício/saúde falhe, não há rollback automático que esconda o erro. Registrar caminho `build-anterior-dir.txt` do backup e revisar antes de ativar o build anterior. Preservar coluna, vínculos, auditoria e todas as operações realizadas depois do backup. **Nunca restaurar banco financeiro ou remover a coluna automaticamente**.

Se profissionais já foram cadastrados ou tiveram alcance/perfil alterado depois da ativação, retornar ao código antigo pode voltar a regras legadas diferentes; a reversão exige análise desses acessos e aprovação. Backup não é autorização para apagar histórico ou restaurar banco por cima de dados novos.

## Homologação após HTTP200

HTTP200/PM2 confirmam disponibilidade, não autorização de cada pessoa. Em cadastro/edição conferir Advogado/Colaborador interno com Todos os condomínios ativos e Somente os selecionados, sem salvar pessoas fictícias em produção. Global pode ficar sem condomínio principal; selecionados exige carteira. Verificar badge legado e que editar apenas dados pessoais não troca o alcance.

Quando um administrador for cadastrar/ajustar uma pessoa real, ele deve escolher conscientemente modo/carteira e confirmar alcance atual/futuro. Conferir também as permissões do perfil; global não transforma profissional em admin ou gestor de equipes/tarefas. Não conceder todos aos usuários antigos em lote. Piloto de pessoas reais e Central Jurídica continuam separados; não executar0098 neste roteiro.

## Validação do roteiro

Sintaxe bash aprovada e script preservado byte a byte. SHA256: `490d2c1199af5b9d3c15153125a6f97bc5d931efdac61afeb880aa6a62053edc`. QA independente: **53 cenários/957 verificações aprovados, zero falhas**, em 10/11/2026. Inclui origens/alvo já presente, Git/branch/dirty/remote/deps/escopo/migration errados, backup/dump/footer/config, build/env/hash, check/apply/postcheck0104, falha do segundo mv com restauração, PM2/restart/HTTP. Arquivos de credenciais temporárias removidos, fd9 fechado no PM2 e exatamente os três comandos seletivos confirmados.

Harness e evidências internos em `/tmp/deploy-usuarios-validacao/`. Git/build/PM2/dump/provisionador foram simulados; Node parsers/tar/hash/mv/flock/permissões reais apenas sobre fixtures. Idempotência de fluxo não equivale a teste do MySQL da VPS. Nenhuma VPS, banco real, credencial real ou operação bancária acessada durante os testes do roteiro.

## Pendências

Roteiro validado e pronto para salvamento no GitHub e recuperação pelo commit/hash fixados. Usuário executar e fornecer saída. Registrar versão ativa e disponibilidade somente após resultado. Homologação manual/perfis/pessoas reais permanece separada; produção não foi marcada como atualizada por esta documentação.
