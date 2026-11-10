# Evolução — duas opções de alcance no cadastro de profissionais

## Solicitação e autorização

Em 10/11/2026 o usuário solicitou cadastrar advogados e funcionários para operar em todos os condomínios, mantendo também a opção de carteira selecionada. Às 11:41 aprovou **Advogado e Colaborador interno**, incluindo a implementação e uma estrutura aditiva somente no desenvolvimento. Cobrador/Síndico não receberam opção global, admin administrativo manteve contrato próprio. A aprovação inicial não abrangia VPS ou concessões reais em lote; o deploy foi autorizado separadamente às12:51, sem concessão em lote.

## Diagnóstico

O formulário exigia vínculos individuais e preferência condominial. O backend tinha carteira multi-condomínio, mas existiam consumidores com ternários por papel (dispensa antiga de advogado) e outros que limitavam colaborador ao principal. Alterar apenas a tela deixaria os novos modos inconsistentes. Cinco famílias de consumidores foram revisadas em paralelo em modo leitura antes da integração: carteira financeira, Jurídico/processos, relatórios/exportação, CNAB/documentos e identidade/contexto.

## Regra implementada

`users.escopoCondominios` nullable aceita selecionados/todos; NULL preserva o legado. Global profissional cobre apenas condomínios ativos atuais/futuros e não produz sentinela/adminflags. A identidade/estado/papel/escopo são reconfirmados por usuário atual, inclusive o caminho administrativo; papel do contexto divergente é recusado em vez de conceder acesso com claims antigos.

Cadastro e edição transacionam usuário, alcance, preferência, vínculos e auditoria estrita. Nome/senha/status ou payload omitido não reclassificam o alcance antigo. Mudanças administrativas são reconfirmadas no servidor; na tela, novos globais e alterações de carteira/perfil exigem confirmação visível. Último admin, auto-desativação, exclusão lógica e restauração inativa foram preservados com rollback de auditoria.

Os consumidores novos explícitos usam preflight por objetos/contexto e filtros IN aplicados antes de consultas, LIMIT e totalizadores. Relações entre dívida, devedor, condomínio e acordo são verificadas antes dos efeitos já existentes, sem mudar regras/cálculos financeiros. NULL conserva deliberadamente contratos anteriores e dispensas históricas de cada rota. Demandas/tarefas continuam dependentes de responsável/equipe/perfil; alcance não concede gestão coletiva. BTG/documentos bancários administrativos continuam administrativos.

## Banco e implantação

Migration0104_futuristic_sersi.sql contém apenas `ALTER TABLE users ADD escopoCondominios enum('selecionados','todos')` nullable, sem default não nulo, DML, backfill ou outra tabela. Gerada e revisada antes da aplicação; executada somente pelo SQL do projeto de desenvolvimento em 10/11 às 11:48. Metadados confirmaram enum, IS_NULLABLE YES e default SQL NULL. Não foi criado/editado profissional real.

Provisionador seletivo `scripts/provisionar-usuarios-escopo-condominios.cjs` tem --check, literal para --apply, hash do SQL, validação da base e recusa de tipo/nulabilidade/defaults incompatíveis; idempotente e sem DML. Inicialmente preparado no desenvolvimento; depois executado na VPS pelo roteiro autorizado. Não executa migrations gerais. Migration0098 Jurídica e estruturas BTG anteriores não alteradas.

Usuário confirmou às13:22 em10/11/2026 a VPS ativa `7a37548b2a392a6b8d6590966da2026eed6ccc3a`, migration0104 conferida, HTTP200 local/HTTPS e PM2online; credenciais/acessos existentes preservados e nenhuma migração Jurídica/cadastro/concessão em lote/emissão/cancelamento/reenvio/baixa pelo roteiro. Backup `/var/backups/cobranca/usuarios-escopo-2026-11-10-131016-KkwkdK`, anterior `/var/www/cobranca/.dist-anterior-usuarios-escopo-MlJKIJ/dist`, registro `/var/www/cobranca/.build-usuarios-escopo-CWR9b5`. Evidência fornecida pelo usuário, sem SSH independente ou nova execução de deploy pelo assistente. Manual docs/deploy-usuarios-escopo-vps.md.

## Validação local

Guard novo: RED no código anterior, 12 falhas/7 aprovações em 19 cenários iniciais; GREEN após implementação e cenários adicionais de frescor/admin/filtro interno, 24 testes novos. Provisionador: 13 testes sintéticos. CRUD: 44 testes novos de carteira/legado/role/rollback; formulário: 52 cenários de estado/payload/hidratação/dirty/confirmações/caches; financeiro: 64; Jurídico: 34; relatórios: 56; documentos: 53; identidade: 31. Todos passaram por suas execuções específicas.

São 371 testes novos. TypeScript e build integrados aprovados em 10/11 às 12:04. Primeira suíte completa serial: 2.933 aprovações, 78 falhas em oito arquivos legados e um BTG externo opt-in ignorado. Falhas ocorreram nos mocks anteriores que não atendiam consultas de identidade/estado/perfil por ID ou projetavam recursos como usuário. Compatibilização de fixtures em andamento, sem remover guards/expectativas negativas, ignorar erros ou simular admin para pessoas locais. Resultado definitivo ainda pendente. Testes usam ORM/callers/callbacks/fixtures locais, sem banco ou APIs bancárias reais. Concorrência de rollback e locks é simulada, não homologação InnoDB real.

Compatibilização concluída somente nos oito testes e na fixture compartilhada BTG, com identidade declarativa por ID/papel/estado/perfil/NULL originais, aliases e filtros ORM efetivos. Sem modificar produção, expectativas, nomes, skips ou guards. Suíte final serial em 10/11 às 12:14: **134 arquivos/3.011 testes aprovados**, um BTG externo opt-in ignorado e nenhum erro não tratado. TypeScript, diff, sintaxe do provisionador e limpeza foram aprovados novamente após as fixtures; build permanece o mesmo código de produção validado, sem alterações após sua compilação.

Inspeção visual do componente real UserForm no navegador com admin/pessoas/condomínios fictícios e link tRPC local: Advogado global/selecionados e Colaborador global sem preferência. Callback simulado produziu escopo todos, principal null e lista vazia sem mutation no backend real. A entrada main foi preservada, restaurada byte a byte e a fixture temporária removida antes do check/build. Evidências em `/tmp/usuarios-escopo-evidencias/` são internas, não dados de pessoas reais.

## Limites e reversão

Não se promete correção retroativa de bypasses legados NULL nem revogação de URLs públicas já compartilhadas; mudanças novas explícitas são isoladas de forma coerente. Preflights não reformulam transações financeiras/locks legados, portanto concorrência entre autorização e efeito nesses fluxos ainda exige piloto específico. Cache de matriz RBAC mantém TTL/invalidações existentes, mas profileId atual é verificado antes de reaproveitar permissões.

Caso necessário, suspender/reverter feature sem apagar coluna, usuários, vínculos ou auditoria. Não restaurar banco financeiro nem limpar enum que contenha concessões reais. VPS agora7a37548b com estrutura0104 conferida pelo usuário. Novas concessões/perfis após ativação precisam de revisão antes de qualquer reversão; disponibilidade não valida autorização individual. Não há novo deploy ou operação financeira nesta confirmação documental.

## Pendências

Implantação/estrutura/disponibilidade concluídas por saída do usuário. Conferir as duas opções do formulário sem salvar pessoa fictícia, e realizar piloto consciente de pessoas/perfis reais separadamente. Usuários antigos não passam a globais automaticamente. PDF real BTG da evolução anterior continua como pendência documental independente.
