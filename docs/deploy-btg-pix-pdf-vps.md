# Deploy da correção de Pix no PDF BTG — VPS

Autorizado pelo usuário em09/11/2026 às14:23. Código de aplicação de destino: `2ead4388cc60a0a06207422b8057eea441ade521`. A última versão ativa informada da VPS é `ca85568ceeaa68d1a558f74695a1e819ebe0602d`. A execução será manual pelo usuário como root; não há acesso SSH da sessão à VPS. Este documento não confirma implantação.

## Escopo

O roteiro `scripts/deploy-btg-pix-pdf-vps.sh` atualiza exclusivamente até o commit fixado. Faz backup da aplicação e do banco, compila num diretório temporário, preserva o `dist` anterior, reinicia somente `cobranca` via PM2 sob o usuário `cobranca`, e verifica HTTP200 local/HTTPS e PM2 online. Não altera Nginx, MySQL, configuração de OAuth/webhook/perfis, nem dependências. Não executa provisionadores/migrações, emissão, cancelamento ou reenvio bancário. O dump é backup, não restauração do banco.

A correção documental reconhece a capitalização ASCII do GUI Pix sem alterar payload/CRC. O projeto foi validado com2581testes aprovados e1externoopt-in ignorado, TypeScript/build/diff,196testes específicos e leitura independente do QR sintético. Não é confirmação da causa na cobrança real.

## Condições de entrada

Execute numa janela de manutenção, evitando operações bancárias simultâneas. O roteiro exige root, branch `main`, origem `ca85568c` ou o próprio destino `2ead4388`, nenhuma alteração em arquivos rastreados, repositório `Azevedo573/cobranca-frontend`, PM2 `cobranca` online e HTTP200 local. Diretórios temporários e `.pm2/` não são excluídos. Outros estados exigem diagnóstico; não usar reset/clean/stash indiscriminados.

O roteiro exige Git/Node/pnpm/mysqldump/sudo/curl/sha256sum/tar/flock existentes. As credenciais são lidas localmente para um arquivo de cliente protegido, removido ao terminar; nunca são mostradas. A configuração original e a chave de criptografia são preservadas. A cópia de configuração usada no build é removida ao terminar. Não gerar nova chave BTG.

## Execução pelo GitHub

Extraia a versão íntegra do roteiro a partir do commit de suporte informado na resposta operacional, sem avançar a branch ainda. Confira SHA256 e `bash -n` antes de executar. O roteiro então cria o backup **antes do merge do código**; fetch de referências é somente obtenção de código, não deploy.

Hash do roteiro validado: `32bd6c6947ddb709408b77a1e0e69f7235e1d41a6e13824159fd9bbcb2edebb8`. O código de aplicação implantado continua `2ead4388`, mesmo que o arquivo do roteiro tenha sido extraído de um commit posterior que contenha apenas suporte documental/operacional.

Não cole o conteúdo extenso do roteiro no terminal. Use o comando curto de extração/checagem/execução fornecido. Se falhar, pare e compartilhe só a mensagem e o último título de etapa, sem credenciais, dumps ou configuração.

## Etapas e salvaguardas

| Etapa | Salvaguarda |
|---|---|
| Verificação inicial | Origem/branch/working tree/serviço e lock impedem deploy concorrente ou inesperado. |
| Backup | Diretório privado; aplicação, banco, configuração e commit anterior; tar/dump conferidos e hashes guardados. |
| Git | Destino fixado, ancestry e fast-forward; diferenças de dependências ou `drizzle` são recusadas. |
| Compilação | `pnpm check` e `pnpm build` em diretório isolado; o build ativo não é apagado. |
| Ativação | Hash/configuração/versão revalidados; leitura pelo usuário da aplicação; build anterior guardado antes da troca. |
| Reinício | Somente `sudo -u cobranca pm2 restart cobranca --update-env`; sem reiniciar banco/Nginx/timers. |
| Pós-deploy | Tentativas limitadas de HTTP local; PM2 online; HTTP HTTPS200; configuração idêntica ao backup. |

Falha de backup ou build impede troca/reinício. Se a segunda movimentação da troca falhar, o roteiro recoloca o `dist` anterior antes de sair. Falha de reinício/saúde **após a troca** não é escondida: o roteiro informa o backup/build anterior e para para revisão. Não repita o roteiro inteiro nesse estado nem restaure o banco automaticamente.

## Reversão

Se houver falha depois da troca, analisar PM2 e HTTP primeiro. Mediante decisão de reversão, preservar o build novo problemático, recolocar o build anterior indicado em `build-anterior-dir.txt`, reiniciar somente `cobranca` e conferir HTTP/PM2. Reconciliar separadamente o estado do Git; o commit rastreado e o build ativo podem diferir após uma falha. Banco e títulos não são restaurados, pois esta alteração não contém migração nem correção financeira. O backup completo é evidência/proteção, não autorização para substituir dados recentes.

## Conferência do PDF da cobrança real

Após o usuário informar `ATUALIZAÇÃO CONCLUÍDA`, atualizar o navegador comCtrl+F5, abrir o mesmo devedor/acordo e baixar novamente o **Boleto (PDF)** da parcela API pela área atual. Não usar um PDF antigo anexado/CNAB. Conferir QR, Pix Copia e Cola, linha/barras e valor da mesma canônica, sem pagar, cancelar, recriar ou reenviar.

Se o Pix continuar ausente, identificar o acordo/parcela e analisar a presença/formato do EMV e o documento baixado. Ausência de dados bancários não deve ser disfarçada por um Pix criado pelo sistema. Uma consulta documental explícita, quando necessária, é uma etapa de leitura separada, não uma nova emissão.

## Estado

Autorização recebida; roteiro preparado e validado isoladamente em09/11/2026:39cenários aprovados,918verificações,0falhas. `bash -n` aprovado e SHA256 original preservado. Harness usou cópia em/tmp, configuração fictícia, Git/PM2/build/HTTP/dump simulados e tar/hash reais sobre dados fictícios. Nenhuma configuração real, banco, VPS ou serviço foi acessado pelo teste.

Cobertos sucesso, origem/branch/working tree/remoto inesperados, backup falho, build parcial, gates de dependências/schema, adulteração antes da ativação, falha da segunda movimentação com retorno do build anterior, reinício/saúde falhos após troca e preservação dos caminhos de recuperação. A simulação não prova restauração do dump, build/PM2/permissões/HTTP reais ou concorrência/crash de filesystem. A troca usa dois movimentos curtos, não uma troca atômica única. Se falhar após trocar, parar para revisão; o rollback não é automático.

O deploy real e a homologação do PDF aguardam execução/resultado do usuário. Roteiro de suporte será publicado noGitHub, sem novo código de aplicação além do destino fixado2ead4388.
