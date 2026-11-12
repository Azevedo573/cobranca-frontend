# Deploy VPS — recebimento BTG e quitação consistente

## Autorização e estado

Em 12/11/2026, às 09:39, o usuário autorizou o deploy da correção. A sessão foi verificada: não há acesso SSH configurado ou identidade SSH disponível. Às 09:42, o usuário escolheu executar o bloco completo no próprio terminal, como root. Nenhuma operação na VPS foi realizada pelo Manus.

**Alvo fixo da aplicação:** `77893949b1ced99e97a75dc69a9a912af2c3513f`.

**Base mínima confirmada:** `7a37548b2a392a6b8d6590966da2026eed6ccc3a`.

**Roteiro:** `scripts/deploy-btg-recebimento-vps.sh`.

A preparação do roteiro não altera a versão alvo e não implanta a ponta móvel da `main`. O roteiro foi entregue no commit operacional `7ddfb4b3eaa5e3c0abbe323448255760760c7200`.

## Implantação confirmada pelo usuário

Em **12/11/2026, às 10:25**, o usuário apresentou a saída de conclusão da execução manual na VPS:

- Versão ativa: `77893949b1ced99e97a75dc69a9a912af2c3513f`.
- Backup: `/var/backups/cobranca/btg-recebimento-2026-11-12-102046-5NaoTF`.
- Build anterior: `/var/www/cobranca/.dist-anterior-btg-recebimento-YzfItz/dist`.
- Registro local: `/var/www/cobranca/.build-btg-recebimento-9FJtK5`.
- Sem migração; HTTP 200 local/HTTPS e PM2 online. Credenciais e histórico preservados.
- Nenhuma emissão, cancelamento, recuperação, baixa manual ou reentrega de evento foi forçada pelo roteiro. Recebimentos normais de novos eventos passam a usar a correção.

Este registro se baseia na saída fornecida pelo usuário, sem acesso SSH independente. **Não comprova quitação do acordo #12** nem ausência de eventos bancários legítimos posteriores. Nenhum novo deploy, comando na VPS ou efeito financeiro é executado ao salvar esta confirmação.

## Escopo

Atualiza os adaptadores e serviços de recebimento BTG, acordos e saldo, com conversão monetária externa em reais, preservação das origens e baixa transacional. A versão da aplicação passou em 3.263 testes, TypeScript, build e diff.

Não há migração, instalação de dependências, alteração de schema, Nginx, usuários, credenciais ou Central Jurídica. Não invoca API bancária nem força emissão, cancelamento, conciliação, recuperação financeira ou reentrega do evento do acordo #12.

**Atenção:** após a ativação, o processamento normal dos eventos bancários recebidos continuará, usando a regra corrigida. O deploy não impede que uma notificação legítima posterior registre um recebimento; apenas não força nenhuma operação financeira.

## Proteções do roteiro

1. Confere root, diretório canônico `/var/www/cobranca`, branch main, árvore rastreada limpa e remoto GitHub aprovado. Preserva arquivos não rastreados.
2. Confere PM2 `cobranca` online, apontando para `dist/index.js`, e HTTP 200 local antes de alterar arquivos. Usa lock não bloqueante de deploy.
3. Busca o alvo no GitHub; recusa origem anterior, posterior ou divergente. Recusa diferenças de dependências, schema, core ou cliente.
4. Cria backup privado da aplicação, banco e `.env`, com validação de arquivo/dump/hash. Diretório 700 e arquivos 600. Valida chave BTG por tamanho, regex e round-trip Base64 canônico, conforme o consumidor da aplicação; não corrige nem troca chaves. Reconfirma `.env` regular sem symlink em cada conferência. Credenciais de MySQL são temporárias em arquivo privado, nunca na linha de comando; erros do dump permanecem em arquivo local.
5. Atualiza o código somente por fast-forward ao alvo exato. Não executa `git pull` sem alvo, migrations ou provisionadores.
6. Compila um `git archive` isolado, com dependências já existentes e cópia temporária de `.env`. Não compila sobre o dist ativo. Remove a cópia de configuração ao terminar ou falhar.
7. Confere os hashes, configuração preservada e leitura pelo usuário `cobranca`. Preserva o dist anterior e ativa o candidato por troca de diretórios. Se o segundo `mv` falhar, recoloca o anterior sem reiniciar PM2.
8. Reinicia somente PM2 `cobranca`, como usuário `cobranca`, sem transmitir o descritor do lock ao daemon. Confere HTTP 200 local/HTTPS, PM2 e `.env` preservado.

## Execução

O bloco curto entregue recupera o roteiro de um commit operacional fixo, confere SHA-256 e sintaxe, e o executa. Esse commit inclui apenas roteiro/documentação; o script continua apontando para a aplicação `77893949`.

Execute como root no terminal da VPS. Não use `sudo bash` no sandbox, não aplique migrations gerais e não clique em reentregar o evento do acordo #12 durante o deploy. Não exponha `.env`, dump, corpos bancários ou logs com dados pessoais na conversa.

A execução pode levar alguns minutos. Não abra uma segunda execução enquanto a primeira estiver compilando. Se houver erro, pare e envie apenas a mensagem protegida. Não repita o roteiro inteiro.

## Resultado esperado

```text
=== ATUALIZAÇÃO CONCLUÍDA ===
Versão ativa: 77893949b1ced99e97a75dc69a9a912af2c3513f
Backup: /var/backups/cobranca/btg-recebimento-...
Build anterior: /var/www/cobranca/.dist-anterior-btg-recebimento-.../dist
Registro local: /var/www/cobranca/.build-btg-recebimento-...
Sem migração; HTTP200 local/HTTPS e PM2 online. Credenciais e histórico preservados.
```

Os caminhos definitivos serão registrados a partir da saída real, nunca inferidos.

## Falhas e recuperação

**Antes da troca:** o dist ativo não é substituído; o Git pode já estar no alvo. Backup e registros são preservados. Examine a falha para retomar a etapa necessária, sem restaurar banco ou repetir todo o fluxo.

**Segundo rename falhou:** o próprio roteiro tenta recolocar o dist anterior e não reinicia PM2. Confirme a mensagem e os arquivos antes de retomar.

**Após troca/reinício:** o script não esconde a falha nem faz rollback financeiro automático. Envie a mensagem e os caminhos do backup/build anterior. A recuperação de build deve ser controlada, considerando eventos que possam ter chegado após a ativação.

Rollback de código/build não desfaz pagamentos ou auditorias. Não restaure o banco sobre eventos posteriores nem apague históricos para reexecutar recebimento. Não altere tokens, chaves, canais ou identidades dos títulos.

## Testes do roteiro

Primeira validação independente: 93 cenários, 90 aprovados e três falhas decorrentes de dois pontos de endurecimento: chave Base64 fora do contrato aceita pelo parser permissivo e `.env` substituído por link de bytes idênticos após merge/build. Os guards foram reforçados sem alterar dados ou o código da aplicação. Nenhum cenário foi removido.

Validação integral do roteiro corrigido: **93 cenários e 3.543 verificações aprovadas, zero falhas**. `bash -n`, integridade do source e todos os checks globais aprovados. SHA-256: `21d366abf8922378f2a22fe40d166ae523aea82fc3d393758fc8529e96fa8ca8`.

Git mutante, build, dump, identidade, PM2 e HTTP são simulados. Parsers Node, tar/hash/mv/flock e permissões operam somente sobre fixtures sintéticas e privadas. Durante a simulação não foram executados SSH, MySQL/BTG/rede reais, migração, instalação ou operação financeira. A simulação não comprova serviço, dump recuperável ou estado bancário da VPS. Evidências em `/tmp/deploy-btg-recebimento-validacao/results.json`; primeira rodada preservada em `before-hardening`. A implantação foi confirmada posteriormente pela saída do usuário, conforme o registro acima.

## Conferência posterior

A ativação está confirmada. Próximo passo: conferir o estado atual do acordo #12, inicialmente por leitura, e revisar URL, envelope e resposta do evento real se a baixa ainda estiver pendente. Conferir emissão, parcela, acordo, origens, valor pago e saldo, sem nova cobrança. Qualquer reentrega ou conciliação financeira é uma etapa separada e deve ser revisada e autorizada. HTTP 200 de disponibilidade não prova quitação do acordo #12.
