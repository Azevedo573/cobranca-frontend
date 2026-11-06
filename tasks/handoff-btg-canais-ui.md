# Handoff concluído — UI API principal/CNAB alternativo

A interface usa `btgCanais.situacaoAcordo({ acordoId })` como array e `confirmarReservaLocal` com literal compartilhado e declaração. Consulta/confirmação financeira API é administrativa; confirmar reserva não emite título.

O DTO final da fila API **inclui `nossoNumero`**, origem, canal, `codigo` e `podeConfirmarReserva`, portanto a confirmação individual na gestão pode usar o estado esperado sem consulta auxiliar por cartão. A pendência apontada durante a implementação foi resolvida na integração. O componente alternativo `ReservaLocalFila.tsx`, não utilizado, foi removido.

CNAB retorna os nomes reais `elegivelCnab`, `motivoBloqueioCnab`, `codigoBloqueioCnab`, `confirmarReservaDisponivel`. O adaptador aceita esses contratos sem sobrepor bloqueio backend por decisão visual. A navegação CNAB é funcional e consome os filtros de acordo/condomínio; mantém seleção/geração com confirmação e condomínio único.

API é ação principal; CNAB alternativa explícita. `modoBoleto=api_btg` histórico não dispara emissão legada automática ao criar acordo. Meios de pagamento existentes são preservados e o resultado canônico deve ser usado para boletos API.

Validação principal concluída: suíte completa com 1227 testes aprovados/1 externo opt-in ignorado, TypeScript, build e diff sem erros. Componentes reais de situação/confirmação inspecionados no navegador com dados fictícios/callbacks locais, sem backend. A amostra foi retirada e o navegador voltou ao login.

Não houve sessão/piloto autenticado com cobrança real, envio ao BTG, DB de teste persistido, concessão RBAC, credencial alterada ou deploy. O manual de operação e os limites estão em `docs/btg-api-principal-cnab-operacao.md`.
