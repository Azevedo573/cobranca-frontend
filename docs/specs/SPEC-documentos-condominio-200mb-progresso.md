# Documentos do Condomínio: 200 MB e progresso real

Pedido aprovado pelo usuário em 04/11/2026: elevar Convenção Condominial e Regimento Interno para **200 MB por PDF** e apresentar uma barra visual durante o envio, seguindo identidade do formulário existente. Ajuste da capacidade atual, sem novo provedor ou schema e sem deploy nesta execução.

## Regra e limites

Limite binário compartilhado: 200 × 1024 × 1024 bytes, inclusive. Base64 máximo: ceil(bytes/3) × 4, cerca de 267 MB. JSON exclusivo da mutation administrativa: **300 MB**, autenticado antes do parser, sem alterar limites globais 50 MB nem webhook BTG 1 MB. Um documento por vez. Backend mantém verificação do tamanho real, PDF, condomínio existente, permissões e URL anterior se storage falhar.

## Progresso e UX

FileReader relata percentual de preparação real. XMLHttpRequest, encapsulado no fetch do httpLink apenas do upload, relata percentual real de transmissão; demais operações tRPC preservam fetch/batching/cookies. Não usar timer/fake progress e não chamar 100% de transmissão de sucesso: depois de transferir, mostrar **Salvando documento…** até retorno e confirmação do servidor. UI apresenta nome, tamanho, barra suave em cores do painel e fases **Preparando PDF → Enviando → Salvando → Concluído/Erro**. Estados de erro legíveis, sem deixar spinner infinito; erro de rede, abort e timeout tratados. Sem reenvio automático.

O timeout do cliente para este upload será 10 minutos; é orçamento de requisição, não estimativa ou garantia de duração. Deve ser compatível com rede/proxy. Encerramento/liberação em erro e não ampliar transporte dos demais módulos. Não permitir salvar cadastro/remover outro documento enquanto upload estiver em curso para evitar perda de URL por corrida.

## Implementação

1. Ajustar constantes e mensagens backend para 200 MB, JSON300mb.
2. Helper testável de fetch via XHR e callback no contexto da mutation isolada; fallback fetch quando XHR não disponível (testes Node/SSR).
3. Modelo puro de fases/progresso e componente reutilizável nos dois documentos; integrar leitura/transmissão/sucesso/erro e limitar eventos duplicados.
4. Atualizar regressões de limite/tRPC/HTTP e adicionar testes XHR: headers/cookies, progresso, sucesso, HTTP não2xx, abort, timeout, rede e processamento sem falso sucesso.
5. Testes em série, TypeScript, build, registro e checkpoint; não enviar documentos reais para o storage nem executar ações na VPS.

## Aceite e testes

Aceitar 50 MB, >50 MB e 200 MB exatos; recusar 200 MB+1 byte; preservar conteúdo PDF e URL existente em falha. Percentuais reais entre 0 e100, transmissão completa fica processando até resposta, sucesso somente após mutation confirmada. Testar roles nãoadmin/batching/proxy paths/BTG raw. Testes pesados executados serialmente para limitar memória. Comandos: `pnpm exec vitest run server/condominio-documentos*.test.ts --no-file-parallelism`; `pnpm exec vitest run --no-file-parallelism`; `pnpm check`; `pnpm build`.

## Limitações e reversão

Pipeline base64 atual pode consumir várias vezes200MB em RAM durante leitura/JSON/Buffer/Blob. Manter limite restrito e um upload por formulário; esta mudança não garante controle global de concorrência. Provedor, Nginx/CDN, Node/PM2 e rede precisam de teste real autorizado antes de garantir200MB em produção. Na VPS, corpo JSON compatível: limite efetivo300m e timeouts adequados, somente após inspeção de configuração ativa. Não criar blocosNginx cegamente nem alterar produção aqui. Reverter arquivos deste ajuste ao checkpoint3ae12f11 e configuraçãoNginx eventualmente aplicada, com build/restart controlado; não restaurar banco nem apagar PDFs armazenados.
