# Resumo da Ocorrência

Em 04/11/2026, ampliar a capacidade de Convenção Condominial e Regimento Interno para PDFs maiores que 16 MB. Limite adotado e comunicado: **50 MB por arquivo**. Implementação concluída no desenvolvimento, sem deploy na VPS.

# Classificação e Prioridade

Melhoria corretiva de capacidade, prioridade média, impacto operacional e jurídico documental.

# Módulo Impactado

Cadastro administrativo de condomínio → Documentos do Condomínio. Ajuste exclusivo desses dois documentos.

# Comportamento Atual

Antes da correção, clique e arraste recusavam arquivos maiores que 16 MB. O backend não validava tamanho real/conteúdo, e o parser JSON global de 50 MB não comportava um PDF binário de 50 MB codificado em base64.

# Comportamento Esperado

Receber PDF não vazio de até 50 MB inclusive, validar no browser/API, armazenar arquivo e atualizar somente a URL correta, mantendo administrador e documento anterior quando o armazenamento falha.

# Como Reproduzir

Editar condomínio salvo e tentar enviar convenção/regimento maior que 16 MB. Validar também seleção por clique e arrastar-e-soltar. Após a atualização da VPS, usar condomínio de teste com autorização para substituir o documento.

# Diagnóstico Inicial

Dois handlers FileReader repetidos com limite 16 MB; textos 16 MB; parser global Express 50 MB; transporte httpBatchLink geral; procedure sem verificação de tamanho real, PDF ou condomínio alvo.

# Causa Provável

Desalinhamento de limites entre PDF binário, base64 e JSON. Base64 de 50 MB ocupa aproximadamente 67 MB antes do envelope. Duas mutations agrupadas podem ultrapassar até o parser ampliado.

# Impactos Identificados

Sem mudança de schema, títulos, acordos, remessas, pagamentos, credenciais ou provedor. Links de documentos antigos preservados. Mais memória durante upload, mitigada por um envio de cada vez e parser ampliado restrito/autenticado.

# Correção Proposta

Executada: política compartilhada 50 MB; helper de validação decodificada e cabeçalho PDF; parser de 80 MB exclusivo para endpoint de upload com autenticação prévia; transporte tRPC individual somente para essa mutation; unificação de clique/arraste e erros de FileReader.

# Regra Atual e Regra Corrigida

Anterior: 16 MB no browser, ausência de limite binário próprio na API e 50 MB de JSON global. Nova: 50 MB binários por PDF, limite base64 antes de alocação e tamanho real após decodificação; 80 MB JSON apenas para POST individual `condominios.uploadDocumento`, preservando os limites de outros módulos e corpo bruto BTG.

# Alterações Técnicas Necessárias

Concluídas: `shared/documentos-condominio.ts`, `server/condominio-documentos-upload.ts`, `server/condominio-documentos-http.ts`, registro no servidor, validação de alvo/auditoria no router, transporte em `client/src/lib/trpcTransport.ts`, uso em main e formulário. Sem novas dependências. Fora desta execução: verificar Nginx/CDN e limite real do proxy de armazenamento na VPS.

# Correção de Dados Existentes

Nenhuma. Não remover documentos antigos nem executar migrações/reprocessamento. Atualizar somente a URL do tipo escolhido depois do upload bem-sucedido.

# Histórico e Auditoria

Manter auditoria do condomínio e acrescentar tipoDocumento/tamanhoBytes, sem base64 nem conteúdo documental nos logs. Sem upload real nesta validação.

# Plano de Testes

Resultados: **25 regressões específicas aprovadas**; suíte completa **510 aprovados, 1 teste externo opt-in ignorado**, em 63 arquivos aprovados e 1 ignorado; `pnpm check` e `pnpm build` aprovados. Testes cobrem 17 MB, 50 MB exatos, 50 MB + 1 byte, falso PDF, base64 inválido, MIME/nome, ambas as categorias, autorização, alvo inexistente e storage falhando. HTTP local testa corpo base64 de 50 MB, cookies/sem batch, batching preservado das demais chamadas, parser global não ampliado, auth antes de JSON e webhook bruto. Banco/storage são mocks, sem ações financeiras reais.

# Plano de Reversão

Se houver 413/504 persistente ou pressão de memória, usuário responsável aprova retorno do código de upload ao checkpoint anterior 74514462 e restauração da configuração Nginx eventualmente alterada; novo build/restart e `nginx -t` antes de reload. Preservar banco e documentos já enviados; não restaurar banco por alteração somente de transporte. Antes de alteração da VPS, backup de código/configuração conforme roteiro operacional.

# Critérios de Aceite

Código e testes locais atendidos: aceita >16 MB até 50 MB, recusa excedente/não PDF, mantém admin, troca somente a URL correta e não interfere em outros uploads ou BTG. Aceite ponta a ponta: upload/download real autorizado na VPS após confirmar Nginx/armazenamento.

# Riscos e Dependências

50 MB binários produzem ~67 MB de JSON e maior consumo de RAM. Nginx/CDN deve permitir corpo compatível, idealmente 80m para caminho específico, preservando headers/upstream. Storage precisa aceitar 50 MB binários + multipart. Verificação de `%PDF-` é preliminar e não antivírus. Timeouts devem comportar conexão lenta.

# Pendências para Validação

Nenhum deploy feito. Capacidade efetiva do Nginx/CDN/storage não verificada nesta tarefa. Navegador abriu formulário mas redirecionou à tela de login, portanto inspeção visual autenticada pendente; não foi solicitado login ou alterada senha. Teste com documento real pelo usuário após atualização da VPS.

# Próximos Passos

Salvar checkpoint; quando autorizado, conduzir inspeção Nginx e atualização da VPS sem migrations, seguida de teste manual. Roteiro em `docs/documentos-condominio-50mb-vps.md`. Alteração do boleto já salva em 74514462 permanece incluída: quadro de plano removido do boleto, demonstrativo separado preservado.
