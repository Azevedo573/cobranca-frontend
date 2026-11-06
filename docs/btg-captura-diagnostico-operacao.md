# Captura protegida — operação BTG

Implementação em desenvolvimento, aprovada06/11/2026 às17:50:38. Fonte: docs/specs/SPEC-btg-captura-payload-diagnostico.md. Nenhuma captura de cobrança real, recuperação/reenvio ou nova atualização da VPS faz parte desta entrega.

## O que fica salvo

Antes do POST BolePix, o cliente serializa o corpo uma vez. A mesma string é cifrada em btgHttpDiagnosticos e enviada ao banco. Na volta, a resposta é lida uma vez, até64KiB e5s, cifrada e usada no parse. Payloads maiores que64KiB são bloqueados antes do envio, não truncados. Respostas maiores/incompletas têm somente o prefixo recebido preservado e são claramente marcadas como incompletas. A captura é independente da normalização de erro: campos e frases desconhecidos continuam na evidência protegida. HTTP status e byte counts não são prova de liquidação ou de ausência de título.

Corpos usam AES256GCM e HKDF com domínio separado, derivados da chave BTG_TOKEN_ENCRYPTION_KEY existente. A autenticação vincula UUID, ambiente, integração, emissão e tipo de corpo (pedido/resposta). Não são gravados headers/Authorization/accessToken/refreshToken/ClientSecret/segredo de webhook. Metadados/auditoria não recebem plaintext. MEDIUMTEXT comporta o envelope base64 sem reduzir o limite binário original.

Uma captura por emissão canônica preserva história e impede sobrescrita em novas tentativas. Canônicas anteriores à implantação não são capturadas retrospectivamente. Reconstituir cadastro atual não seria prova do pedido antigo. Emissões existentes não são reenviadas para produzir um diagnóstico.

## Como visualizar

Administrador ativo abre Banco → Remessas BTG, seleciona a remessa e seu detalhe. A listagem consulta apenas metadados da captura. “Ver diagnóstico técnico” solicita confirmação e finalidade; só depois busca e decifra o conteúdo, com auditoria estrita. Pedido e resposta aparecem como texto inerte; nenhum HTML/link recebido é executado. Fechar/trocar de remessa descarta o conteúdo na interface. Não enviar esse conteúdo em chat público ou anexá-lo a tickets sem revisão de dados pessoais.

Estado “Sem captura histórica” é esperado em remessas antigas. Item de falha sem emissão vinculada não comprova ausência de canônica; novas capturas são relacionadas pela parcela e IDs canônicos validados. “Sem resposta” indica transporte sem confirmação; “Resposta incompleta” indica limite/prazo/leitura, não JSON íntegro. Falhas de persistência pósPOST conservam evidência inicial e emissão incerta; não repetir o envio. Consulta autorizada não altera parcela/acordo/emissão/canal.

## Retenção e expurgo

Conteúdo disponível por30dias após capturaCriadaEm. A API recusa plaintext expirado mesmo se o corpo ainda existir cifrado. Depois da expiração, expurgo manual administrativo com literal EXPURGAR DIAGNOSTICO BTG e auditoria remove apenas payloadCifrado/respostaCifrada. IDs, hashes, timestamps e estado HTTP permanecem. Não há expurgo agendado, timer nem apagamento de registros financeiros. Backups anteriores ainda podem conter criptogramas: devem seguir a política do escritório. Não prometer exclusão física de todas as cópias.

## Chave e acesso

Não rotacionar nem recriar BTG_TOKEN_ENCRYPTION_KEY só para diagnóstico: a mesma chave-base protege tokens existentes e derivação desta evidência. Seu backup deve ser restrito; nunca colocá-la no Git, tela, URL, logs ou anexos públicos. Chave ausente/alterada, AAD adulterado ou conteúdo inválido impedem decifragem com erro genérico. Uma leitura falha de auditoria não retorna plaintext. Administrador revogado perde acesso; roles não administrativos não têm acesso por ID/listagem.

## Estrutura e futura implantação

Migration0101_workable_ronan.sql cria somente btgHttpDiagnosticos e índices; foi revisada e aplicada exclusivamente no desenvolvimento. Não executa INSERT/UPDATE/DELETE nem altera tabelas antigas. Nenhum backfill.

Provisionador scripts/provisionar-btg-diagnosticos.cjs verifica assinatura do SQL revisado e tipos/defaults/constraints/índices. `node scripts/provisionar-btg-diagnosticos.cjs --check` é somente leitura. Aplicação futura, exclusivamente após autorização e backup confirmado: `node scripts/provisionar-btg-diagnosticos.cjs --apply "CONFIRMAR ESTRUTURA DIAGNOSTICO BTG"`. Não executar drizzle-kit migrate em produção para este corte. MySQL DDL não é transação atômica: falha parcial exige conferir estrutura, não apagar/recriar tabela ou repetir migrations históricas. Estrutura parcial de colunas/constraints é recusada; índices conhecidos faltantes podem ser completados idempotentemente.

Rollbacks de código conservam tabela e corpos cifrados, sem DROP. Restaurar build anterior não é instrução para refazer POST. Só a nova versão habilita captura; nenhum registro prova que cobranças incertas foram recuperadas.

## Próximo módulo: reenvio

Solicitação adicional de17:58:23 registrada em tasks/solicitacao-btg-reenvio-falhas.md. Reenvio requer regras próprias para falha local, rejeição definitiva e estado incerto, consulta/reconciliação bancária e confirmação explícita. Não implementado dentro do cliente de captura; nenhuma emissão1/2 é liberada por este desenvolvimento.

## Validação

Testes com crypto/fetch/DB fictícios cobrem bytes/limites/AAD/rollback/roles/retention e controles de UI. Resultados finais serão acrescentados após as frentes e a suíte completa. Nenhuma chamada bancária real será usada como teste e nenhuma amostra de CPF/endereço real será salva.

### Resultado definitivo — 06/11/2026

Validação concluída, inclusive depois de tornar as datas de captura explícitas:1504 testes aprovados/1 externo opt-in ignorado em100arquivos, TypeScript/build/diff aprovados e HTTP200 no desenvolvimento. Confirmação/texto do diagnóstico conferidos no navegador com dados/callbacks fictícios, sem consulta de corpos reais ou envio; amostra removida. “Bytes da resposta” são o corpo entregue pelo fetch, não headers ou bytes de transporte/compressão HTTP. Captura binária mantém fidelidade; texto com UTF8 inválido informa substituições e não representa byte a byte.

Checklist tasks/plan-btg-captura-payload-diagnostico.md concluído. Especificação de reenvio proposta em docs/specs/SPEC-btg-reenvio-controlado.md, ainda não implementada. Nenhuma emissão1/2 liberada, recuperada ou reenviada; VPS não recebeu0101/captura. Os resultados anteriores substituem a indicação de validação ainda em curso acima. Provisionador --check confirmou novamente a estrutura de desenvolvimento sem alterações.
