# Resumo da Ocorrência
Em 09/11/2026, o usuário relatou que a colagem do bloco de deploy BTG não funcionava. O arquivo de terminal mostrou duas colagens truncadas/misturadas, sem saída das etapas de implantação.

# Classificação e Prioridade
Falha operacional de transferência por colagem; prioridade alta para concluir a implantação, sem indisponibilidade relatada.

# Módulo Impactado
Implantação VPS do boleto BTG e cancelamento individual, alvo ca85568ceeaa68d1a558f74695a1e819ebe0602d.

# Comportamento Atual
Diagnóstico do usuário às12:31:11: código807de655, dist/index.js com data10:37:17, PM2 online eHTTP200 local. Não apareceu backup com prefixo btg-boleto-cancelamento; provisionador0103 ausente no código local.

# Comportamento Esperado
Transferir o roteiro íntegro, validar assinatura/sintaxe e executar backup→código fixado→0103 seletiva→build isolado→ativação→HTTP/PM2, sem mudanças de cobranças.

# Como Reproduzir
Colar um bloco longo no terminal utilizado pelo usuário. O registro recebido contém uma linha iniciada por `)ash`, com trechos do final e da checagemPM2 misturados ao começo do roteiro.

# Diagnóstico Inicial
Não há evidência de execução das fases de deploy nessa colagem. A versão de código e o build ativo informados continuam anteriores. Não foi realizada consulta independente ao banco daVPS.

# Causa Provável
Truncamento ou corrupção durante a transferência por colagem. O componente específico de terminal/área de transferência não foi identificado.

# Impactos Identificados
Implantação não concluída; serviço continua disponível conforme diagnóstico recebido. Repetir comandos cegamente poderia repetirDDL ou trocar um build fora de sequência.

# Correção Proposta
Versionar o mesmo roteiro validado em scripts/deploy-btg-boleto-cancelamento-vps.sh. Recuperá-lo com git fetch/git show para um arquivo temporário root600, verificarSHA256 e bash-n antes da execução. Fetch/show não alteramHEAD nem dist; o roteiro faz seu backup antes do merge.

# Regra Atual e Regra Corrigida
Antes: transferência do conteúdo inteiro por colagem. Depois: transferência do arquivo viaGit autenticado existente, com somente um comando curto colado. O comportamento do roteiro não mudou.

# Alterações Técnicas Necessárias
Adicionar exclusivamente o roteiro operacional idêntico e esta documentação. Sem frontend/backend/schema/dependências novos; o destino da aplicação permanececa85568c e aDDL é exclusivamente0103.

# Correção de Dados Existentes
Nenhuma. Não liberar, cancelar, emitir, reclassificar ou reenviar títulos.

# Histórico e Auditoria
Roteiro preserva backup privado, commit anterior, hashes, dist anterior e logs locais. SHA256 esperado2f91bc3253fa0c675aa616601f68fec63e61f866473d2181831a963dc8835e18.

# Plano de Testes
Roteiro já validado com24cenários/370verificações simuladas, incluindo falhas de backup/DDL/build/restart/HTTP e integridade de cópia. Cópia versionada deve ser byte a byte idêntica. Mocks não homologamVPS,MySQL,PM2 oupermissões reais.

# Plano de Reversão
Se falhar antes da troca, o dist ativo permanece. Após a troca, o roteiro preserva o dist anterior e interrompe em falha, sem rollback automático. Não restaurar o banco sem nova revisão/autorização: aDDL pode ter sido aplicada e dados posteriores podem existir.

# Critérios de Aceite
Arquivo íntegro/sintaticamente válido; backup concluído; código no destinofixado; --check0103 completo; TypeScript/build; HTTP200 local/HTTPS ePM2online.

# Riscos e Dependências
GitHub autenticado, ferramentas/dependências e espaço/recursos daVPS; indisponibilidade breve no restart. O comando não instala dependências novas nem reiniciaMySQL/Nginx.

# Pendências para Validação
Execução pelo usuário naVPS, resultado daDDL, ativação e homologação funcional doPDF/cancelamento. Não concluídas por este registro.

# Próximos Passos
Entregar comando curto que lê o roteiro de um commit de suporte fixado, sem avançarHEAD antes do backup, e solicitar a saída final ou o primeiro erro. Não repetir o bloco longo.
