# Atualização VPS — origem completa paginada e banco na última página

## Autorização e escopo

Usuário autorizou a atualização em 09/11/2026 às 17:54. Alvo da aplicação: `b1da399e953397703a1669bb9eb17d1397781f34`, salvo e disponível no GitHub. Mantém o pedido anterior de não criar novo backup da aplicação/banco; somente o build anterior é preservado para reversão. Não executar DDL, migrations, instalação de dependências, BTG, emissão, cancelamento, reenvio ou baixa. Nginx, credenciais, timers e Central Jurídica não são alterados.

A sessão não possui acesso SSH independente à VPS. Execução feita pelo usuário como root em `/var/www/cobranca`, usando o repositório `Azevedo573/cobranca-frontend`/branch main. Antes desta atualização, a última versão de produção confirmada era `2ead4388`; implantação isolada de `5cded7aa` não foi confirmada. Em 10/11/2026 às 11:16, o usuário confirmou `b1da399e` ativo, incorporando também a retirada do banner. Roteiro aceita versões na cadeia entre a correção Pix e o alvo, incluindo o próprio alvo; rejeita código posterior/divergente ou anterior à correção Pix.

## Roteiro

Arquivo: `scripts/deploy-boleto-origem-vps.sh`. Recuperar do checkpoint que contém o roteiro usando `git show CHECKPOINT:scripts/deploy-boleto-origem-vps.sh`, sem avançar HEAD para esse checkpoint operacional. Conferir SHA-256 e sintaxe antes de executar. O script em si atualiza código somente para `b1da399e`, não para a ponta móvel de main.

Proteções: root, diretório físico esperado, branch main, working tree rastreado limpo, exclusão por flock, remoto autorizado, canônica de versões, schema/dependências inalterados e arquivos alterados restritos ao documento/testes/docs. Untracked antigos como `.pm2/` e `.build-*` não são apagados. Exige PM2 `cobranca` online usando `/var/www/cobranca/dist/index.js` e HTTP200 local antes de iniciar.

Fluxo: registra versão anterior; fetch/fast-forward fixado; archive em diretório privado de build; cópia temporária privada de `.env`, removida ao terminar/falhar; symlink das dependências existentes; TypeScript e build; permissões 750/640 para grupo da aplicação; hashes e leitura. O dist ativo não é compilado nem sobrescrito em uso. Só após sucesso move dist atual para `.dist-anterior-origem-completa-*`, ativa novo dist e reinicia somente `cobranca` sob seu próprio usuário. O FD do lock é fechado nos comandos PM2 para não ser herdado pelo daemon. Verifica HTTP200 local, PM2 e HTTPS, além de integridade da configuração.

Não cria arquivo de dump nem tar de backup. O build anterior é indispensável para troca reversível, mas não constitui backup completo de dados/configuração. A aplicação fará suas operações normais após o reinício; o roteiro não chama banco/BTG nem endpoints financeiros.

## Validação

Aplicação alvo já validada: 2.640 testes aprovados e um externo BTG opt-in ignorado; TypeScript/build/diff; amostras API/CNAB e códigos sintéticos decodificados. Não repetir teste externo de credenciais na VPS.

Roteiro: `bash -n` aprovado; SHA-256 `17fb0af52396d188b0c3f25f3fe3b9945cd52565577fab7a9fdbf98e05906e08`. Validação isolada final: 32 cenários e 290 verificações, todas aprovadas; código inalterado durante a execução. Harness em `/tmp/deploy-origem-validacao/harness.py` e evidências em `results.json`/`cases`. Git/identidade/PM2/curl/check/build simulados; diffs normais usam Git local read-only, tar/hash/env/mv/lock/permissões são reais em fixtures privadas, sem acessar produção/banco/BTG. Não homologados build/usuário/PM2 ou serviço reais na VPS; aplicação alvo foi compilada/testada anteriormente no desenvolvimento. Simulação não substitui execução real/PM2/InnoDB.

Cobertos sucesso desde `2ead4388`, `5cded7aa` e alvo; dirty/cached, remoto/branch/versão indevidos, alvo ausente, schema/package/lock/arquivo fora de escopo, env alterado, falha check/build, segundo mv/restauração, restart/HTTP/HTTPS/PM2 e concorrência de lock. Nenhum segredo canário nos logs e `.env` temporário removido em todos os casos. Primeira simulação expôs status ignorado do Git no guard de escopo; corrigido para captura explícita de status tanto no guard de escopo quanto na checagem de estrutura/dependências. Ambos os erros agora bloqueiam antes da atualização/ativação, com regressões próprias.

## Falhas e reversão

Se o script falhar, parar e enviar somente a saída, nunca `.env`, `pm2 env`, payloads, capturas ou credenciais. Não repetir todo o roteiro automaticamente. Se falha antes da troca, dist anterior permanece ativo, embora o HEAD possa estar atualizado. Se segundo mv falhar, dist anterior é recolocado antes de qualquer reinício. Falha após ativação não produz rollback silencioso: preservar caminhos para revisão.

A saída mostra `Build anterior: /var/www/cobranca/.dist-anterior-origem-completa-XXXXXX/dist`. Para reversão autorizada, guardar também o novo dist, recolocar o anterior no caminho ativo e reiniciar somente PM2 `cobranca`; conferir leitura/HTTP200 local/HTTPS e PM2. Não restaurar banco nem modificar títulos/contas. O commit anterior é registrado dentro do diretório anterior. Git HEAD e dist podem divergir durante reversão e devem ser registrados explicitamente. Preparar bloco exato com o caminho informado pelo usuário, evitando adivinhação de diretórios.

## Homologação após a atualização

Enviar a seção `=== ATUALIZAÇÃO CONCLUÍDA ===` e resultados de serviço ao assistente. Disponibilidade HTTP não prova correção financeira. Depois, no detalhe do devedor/acordo, baixar um PDF novo da MESMA cobrança existente; não criar, reemitir ou pagar título. Arquivos antigos permanecem intactos.

Verificar todas as origens na ordem, início na primeira página após o resumo, cabeçalhos de continuação e valores históricos/avisos completos antes da ficha. Linha digitável/barras/QR/Pix devem permanecer juntos na última página e preservar o título. Curto pode caber em uma página; origem longa pode legitimamente gerar mais páginas. Plano de parcelas segue no demonstrativo separado e banner de valor continua retirado.

## Estado

**Implantação confirmada pelo usuário em 10/11/2026 às 11:16**, mediante a saída `=== ATUALIZAÇÃO CONCLUÍDA ===`:

- Versão ativa: `b1da399e953397703a1669bb9eb17d1397781f34`.
- Build anterior preservado: `/var/www/cobranca/.dist-anterior-origem-completa-T5yoN1/dist`.
- Registro local: `/var/www/cobranca/.build-origem-completa-v6qwpG`.
- Sem backup novo ou migração; HTTP200 local/HTTPS e PM2 online.
- Banco e credenciais preservados; nenhuma cobrança emitida, cancelada, reenviada ou baixada por este roteiro.

Confirmação baseada na saída fornecida, sem verificação SSH independente; a data acima é a do relato, não um horário de execução inferido. Não executar novamente o deploy para registrar esta confirmação. Este registro documental não altera a versão ativa e não requer pull/build/restart na VPS.

Permanece pendente a homologação do novo PDF real da mesma cobrança: origem integral, cabeçalhos, dados/avisos, banco/códigos/Pix apenas na última página e banner ausente. HTTP/PM2 comprovam disponibilidade informada, não legibilidade dos códigos, situação bancária ou conferência financeira do título.
