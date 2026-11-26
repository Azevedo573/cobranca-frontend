# Deploy VPS — preenchimento de documentos por condomínio

## Escopo e autorização

Usuário autorizou a preparação do deploy em26/11/2026. Conferência enviada às15:02: VPS em `77893949b1ced99e97a75dc69a9a912af2c3513f`, branch main, arquivos rastreados limpos, PM2 cobranca online e HTTP200 local/HTTPS. Somente builds antigos e .pm2 não rastreados; devem ser preservados. Não há acesso SSH nesta sessão; execução pelo usuário como root, conforme fluxo utilizado nas atualizações anteriores.

Alvo fixo da aplicação: `02f25b11c0c28f2e9a08f070ed000dfc92a21883`. Não implantar a ponta móvel da main nem o futuro commit do roteiro. Aplicação já validada:3578 testes aprovados,1 teste externo BTG opt-in ignorado, TypeScript e build aprovados. Comparação com a base confirma ausência de diferenças em drizzle, dependências e server/_core.

## Plano e critérios

1. Conferir identidade root, caminho, main, working tree, remoto GitHub, lock de deploy, PM2 e HTTP local.
2. Buscar alvo exato e conferir ancestralidade, dependências/schema/core inalterados e mudanças de runtime estritamente documentais.
3. Verificar somente leitura da estrutura userCondominios: ocorrência anterior relatou ausência, sem confirmação de reparo. Se ausente ou incompatível, parar antes de atualizar código; não criar tabela nem executar provisionador neste deploy.
4. Backup privado de aplicação, banco e .env, com tar/dump/hash conferidos. Não exibir credenciais ou incluir senha em CLI.
5. Atualizar por fast-forward ao alvo fixo; compilar git archive isolado usando dependências existentes; check/build sem tocar no dist ativo.
6. Remover configuração temporária, confirmar hashes, .env intacto e leitura por cobranca.
7. Preservar dist anterior, trocar diretórios e reiniciar somente PM2 cobranca como cobranca, fechando o descritor do lock nos comandos PM2.
8. Confirmar HTTP200 local/HTTPS e PM2/configuração. Usuário deve enviar a saída de conclusão; disponibilidade não comprova homologação funcional.

## Limites e riscos

Sem migrations, DDL/DML, instalação, exclusão de arquivos antigos, git reset/clean/stash, alterações Nginx/credenciais/perfis, emissão/cancelamento/reenvio/baixa bancária ou geração de documento real pelo roteiro. A aplicação permanece atendendo durante o backup/build; o reinício pode causar breve indisponibilidade. Eventos bancários normais continuam; nenhum evento é forçado. O snapshot de banco não torna o backup da aplicação atomicamente consistente com eventos futuros.

Roteiro baseado no deploy de recebimento BTG já executado na mesma VPS, adaptado ao alvo e ao escopo documentais. Testes de simulação locais serão registrados antes da entrega; não substituem execução na VPS.

## Falhas e recuperação

Antes da troca, dist ativo preservado; Git pode já estar no alvo. Não repetir todo o roteiro; revisar erro e retomar a etapa necessária. Se segundo rename falhar, recolocar dist anterior sem reiniciar. Depois da troca/reinício, parar e informar erro/caminhos; sem rollback silencioso. Nunca restaurar banco sobre recebimentos ou cadastros posteriores. Rollback de build não desfaz histórico financeiro/documental.

## Conferência funcional posterior

Acessar um modelo com variáveis cadastrais, escolher condomínio autorizado e conferir nome/CNPJ/endereço/campos disponíveis; editar um campo, trocar a fonte com confirmação e conferir ausentes sem herança. Representante/assinatura continuam manuais. Não gerar documentos jurídicos reais como teste sem revisão humana. HTTP200 não garante carteira/perfil de cada usuário.

## Estado

Preparação em andamento. Nenhum deploy real, migração, reparo da tabela ou alteração da versão da VPS executados nesta sessão.

## Validação do roteiro concluída

Em26/11/2026, validação isolada do source final:96/96 cenários e5008/5008 verificações aprovados, zero falhas no escopo. Sintaxe bash aprovada. SHA-256 do roteiro antes/depois: `abf31cd5cf47f8861e1bfe3888b6344e91355f2892cce463a2e61c7dd9cf9878`.

Cobertura de sucesso/base/alvo, Git/branch/dirty/remoto/ancestralidade/schema/deps/allowlist, preservação não rastreados, backup/tar/hash/permissões e cleanup, dump/check/build falhos, symlink .env pósmerge/build, segundo mv falho com restauração sem restart, restart/HTTP/HTTPS/PM2 falhos pósativação sem rollback financeiro. Preflight mysql2 simulado: sucesso LIMIT0 sem registros, tabela/coluna ausentes e conexão recusada com segredo-canário; falhas antes de backup/merge/build, mensagens protegidas e conexões destruídas. Chave BTG não é validada/alterada neste deploy documental; .env preservado byte a byte.

Evidências locais em `/tmp/deploy-documentos-condominio-validacao/RELATORIO.md`, `summary.json` e `results.json`. Script e código da aplicação intactos durante a simulação. Somente fixtures privadas, comandos sensíveis mocks, Node com módulos sintéticos e Git local somente leitura. Sem VPS, banco/BTG/rede reais, sudo/PM2/fetch reais, instalação ou migração. Não é prova de funcionamento real da produção ou de backup restaurável.

Estado atualizado: roteiro preparado e validado para execução pelo usuário. Ainda não há confirmação de deploy nem de reparo real da estrutura userCondominios. Não tratar o futuro checkpoint operacional como versão ativa da VPS; o script fixa a aplicação em02f25b11.
