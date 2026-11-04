# Resumo da Ocorrência

Em04/11/2026 o usuário solicitou200 MB por PDF e uma barra de carregamento agradável para os documentos legais do condomínio. A alteração está implementada no desenvolvimento e foi validada localmente. A VPS não foi atualizada nesta etapa.

# Classificação e Prioridade

Melhoria funcional/operacional, prioridade média. Afeta capacidade e acompanhamento de upload, com cuidados de segurança e memória.

# Módulo Impactado

Cadastro administrativo de condomínios, seção Documentos do Condomínio: Convenção Condominial e Regimento Interno.

# Comportamento Atual

Antes deste ajuste, o limite era50 MB e a interface mostrava somente um spinner. O transporte tRPC individual já existia, com parser administrativo exclusivo de80 MB JSON.

# Comportamento Esperado

Aceitar PDFs até200 MB inclusive e mostrar progresso real, distinguindo preparação local, transmissão e gravação confirmada. Mensagens de erro devem permitir nova tentativa consciente sem sucesso falso.

# Como Reproduzir

No formulário do condomínio salvo, selecionar ou arrastar um PDF acima de50 MB. Na versão anterior ele era recusado. Durante envio não havia percentual ou etapas visíveis.

# Diagnóstico Inicial

O limite era compartilhado entre frontend e backend, mas mensagens fixas também precisavam ser atualizadas. O fetch nativo não expõe progresso de upload; a ampliação de base64 precisa de teto específico maior do que200 MB.

# Causa Provável

Capacidade anterior deliberadamente limitada a50 MB; feedback visual simples. Não foi identificado problema em dados financeiros ou nos documentos já existentes.

# Impactos Identificados

Aumenta uso de memória e tráfego durante base64/JSON/Buffer/Blob. Não altera schema, armazenamento, credenciais, cobranças, acordos, CNAB ou BTG. Não remove documentos ou vínculos.

# Correção Proposta

Política compartilhada de200 MB; parser específico300 MB; fetch-XHR somente no httpLink da mutation de upload. Callback de contexto local por operação, cookies preservados. Demais operações continuam usando fetch e batching.

# Regra Atual e Regra Corrigida

Anterior:50 MB binários e80 MB JSON, spinner. Nova:200×1024×1024 bytes binários; base64 máximo279.620.268 caracteres;300 MB JSON exclusivo. FileReader informa leitura real, XHR informa transmissão real; gravação permanece indeterminada até resposta de sucesso.

# Alterações Técnicas Necessárias

Frontend: modelo puro e componente reutilizável de progresso, fases/nome/tamanho/percentual, bloqueio de concorrência e submit enquanto houver upload. Tratamento de abort/rede/timeout, liberação de callbacks e cache das variables grandes. Backend: constantes e mensagens, preservando autenticação antes do parser, validaçãoPDF e condomínio existente. Banco e integrações: nenhuma mudança estrutural.

# Correção de Dados Existentes

Nenhuma. URLs e arquivos anteriores permanecem. A API atualiza a URL apenas após armazenamento bem-sucedido; falha de storage não troca o registro. Não houve envio real ou reprocessamento de documentos para esta validação.

# Histórico e Auditoria

Mantém auditoria existente de tipo/tamanho e alvo, sem conteúdoPDF/base64. Especificação e roteiroVPS versionados. O roteiro antigo50 MB foi identificado como histórico.

# Plano de Testes

Executado: arquivos sintéticos17 MB,50 MB,51 MB e200 MB; recusa200 MB+1 byte no navegador/API; formato/base64/tamanho e roles; cookies, batching e corpo brutoBTG. HTTP local recebe JSON equivalente a200 MB, sem storage externo. XHR/mocks validam headers, abort/timeout/rede, contexto tRPC e eventos reais como fonte de percentual. RenderizaçãoReact/inspeção visual do componente em quatro fases fictícias, sem login ou dados reais.

Resultado final:40 testes específicos no conjunto de documentos,525 testes aprovados na suíte completa e1 teste externo opt-in ignorado;64 arquivos de teste aprovados e1 ignorado. TypeScript e build aprovados. Não é comprovação ponta a ponta de200 MB naVPS/storage.

# Plano de Reversão

Reverter somente os arquivos deste ajuste ao checkpoint3ae12f11; fazer build/reinício controlado. Se houver configuraçãoNginx aplicada futuramente, restaurar sua cópia e validar antes do reload. Sem restauração de banco ou exclusão de PDFs.

# Critérios de Aceite

Cumpridos localmente:200 MB inclusive, limite superior recusado, percentual sem timers/falso sucesso, etapas visualmente distintas, erros tratados e permissões preservadas. Completar validação externa antes de garantir o limite em produção.

# Riscos e Dependências

Base64 causa múltiplas cópias e pico de memória acima do tamanho do PDF. Um upload por formulário não limita outras abas ou usuários. Nginx/CDN,Node/PM2 e storage têm limites próprios. Timeout do cliente10 minutos não cancela automaticamente processamento já aceito pelo servidor. Em perda de resposta, conferir registro antes de repetir; não há retry automático.

# Pendências para Validação

Na implantação autorizada: verificar proxy/corpo efetivo300m e timeouts, observar memória, enviarPDF real200 MB no condomínio de teste e conferir link/tamanho/conteúdo final. Sem alteração naVPS, credenciais ou storage nesta tarefa. Verificação de cabeçalhoPDF não substitui antivírus.

# Próximos Passos

Salvar checkpoint restaurável desta implementação e disponibilizar o desenvolvimento. A atualização e a homologação real naVPS seguirão somente quando autorizadas. Roteiro operacional: `docs/documentos-condominio-200mb-vps.md`.
