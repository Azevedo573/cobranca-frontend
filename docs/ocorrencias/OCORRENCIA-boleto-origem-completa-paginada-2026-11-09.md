# Resumo da Ocorrência

Em 09/11/2026, o usuário relatou incômodo com a paginação do boleto real. Às 17:12 escolheu explicitamente manter a origem completa no boleto e dividi-la entre páginas, com a parte bancária inteira no final. Os dados pessoais e códigos reais do arquivo não são reproduzidos neste registro.

# Classificação e Prioridade

Melhoria corretiva documental; prioridade alta e complexidade média. Impacto operacional/cliente, com preservação das regras financeiras e da rastreabilidade.

# Módulo Impactado

Renderizador compartilhado `server/boleto-pdf.ts` para acordo API/CNAB, incluindo reutilização no lote. Novo planejador puro `server/boleto-origem-paginacao.ts`. Demonstrativo e integração bancária não são modificados.

# Comportamento Atual

A regra anterior resumia origens com mais de cinco títulos. Quando uma tabela curta não cabia junto da ficha na página atual, mas cabia numa nova página, transportava a lista completa, deixando o recibo e os cartões isolados com grande área vazia.

# Comportamento Esperado

Todas as origens aparecem em fluxo após o resumo. A tabela continua entre páginas com cabeçalhos repetidos. Depois de todas as dívidas e avisos, a ficha de compensação, a linha, as barras e o Pix/QR são desenhados juntos na última página. Se couberem na página atual, não há quebra exclusiva para a ficha.

# Como Reproduzir

Gerar apenas o PDF de um título existente com origem histórica de cinco ou 80 cobranças. Para testes, usar exclusivamente as fixtures fictícias de `server/boleto-origem-paginada.test.ts`, sem emitir novo título, consultar banco/BTG ou pagar.

# Diagnóstico Inicial

O arquivo real tem duas páginas A4 e cinco origens. A inspeção do código confirmou a condição de transporte antecipado da tabela mais ficha. A leitura visual confirma a disposição e a presença dos códigos, mas não homologa o título real nem sua leitura em aplicativo bancário.

# Causa Provável

Política documental adaptativa e reserva da ficha dentro da decisão de apresentar a origem curta. Essa condição foi removida do renderizador; a fonte histórica permanece intacta.

# Impactos Identificados

Mudança na quantidade de páginas de documentos novos, que cresce com a origem. Nenhuma alteração de dados, cobrança, valor, status, snapshot, canal, permissão, auditoria ou histórico. Os três cartões e avisos continuam; o banner retirado não volta. O plano completo de parcelas permanece somente no demonstrativo.

# Correção Proposta

Implementada a origem integral por altura, com primeira página parcial e demais páginas completas. Descrições extensas usam trechos identificados, sem perda de caracteres; o principal aparece somente no primeiro trecho da mesma dívida. Quadro e avisos extensos também são paginados explicitamente antes da ficha. Instruções bancárias têm altura medida e preservada, sem encolher QR/barras.

# Regra Atual e Regra Corrigida

Anterior: até cinco títulos detalhados quando coubessem com a ficha; caso contrário, origem consolidada ou transporte antecipado. Nova: detalhamento integral de qualquer quantidade, em fluxo, e reserva única da ficha ao final. Não há teto artificial de duas páginas para origem extensa.

# Alterações Técnicas Necessárias

Paginador/renderizador implementados. Testes documentais anteriores adaptados somente onde a decisão aprovada invalida limites/consolidação; proteções financeiras e de códigos mantidas. Sem alterações de frontend, rotas, banco, dependências ou integração.

# Correção de Dados Existentes

Nenhuma. PDFs históricos ficam preservados; um novo download só recebe a regra depois que o ambiente correspondente for atualizado. Gerar o PDF não cria uma nova cobrança bancária.

# Histórico e Auditoria

Auditoria/RBAC da geração intactos. Especificação aprovada em `docs/specs/SPEC-boleto-origem-completa-paginada-2026-11-09.md`; plano em `tasks/plan-boleto-origem-completa.md`. Não expor payloads reais ou informações pessoais em logs/documentação.

# Plano de Testes

Comparação RED isolada contra checkpoint `5cded7aa`: 21 falhas e 14 aprovações nas 35 regressões documentais iniciais, comprovando omissão da origem extensa e transporte para outra página. O ambiente ativo não foi trocado para esse teste. Planejador puro: 12 testes aprovados.

Amostras fictícias API de cinco origens: duas páginas, origem na primeira e ficha na segunda. 80 origens: quatro páginas, origem nas três primeiras e ficha na quarta. Inspeção visual aprovada. Páginas bancárias renderizadas em 300 DPI: QR/Pix decodificado por libzbar com 143 bytes e CRC C133, idêntico à fixture; I25 de 44 dígitos decodificado igual ao código sintético esperado, sem pagamento.

Validação integrada/final concluída: 41 novos testes de PDF real e 12 do planejador, 131 direcionados aprovados em oito arquivos. Suíte completa serial com `BTG_SANDBOX_CREDENTIAL_CHECK=false`: 125 arquivos aprovados/um externo ignorado; 2.640 testes aprovados/um ignorado. TypeScript, build e diff check aprovados. Uma origem curta compartilha uma página com a ficha; instruções extensas são preservadas sem sobrepor pagador/códigos e uma ficha maior que A4 é rejeitada explicitamente. Testes API/CNAB, entrada, parcela única, origem/plano longos, legados/snapshots e guards mantidos. Os extratores locais de streams dos dois testes bancários foram corrigidos para respeitar objetos e `/Length` em PDFs multipágina, sem suprimir erro ou relaxar bytes.

# Plano de Reversão

Reverter somente código documental/paginador e expectativas associadas para `5cded7aa` se houver perda de linhas, sobreposição, ficha dividida ou código ilegível. Não restaurar banco, apagar snapshot, remover dívidas ou reemitir cobranças. Reversão/ativação de produção sempre sob autorização específica do usuário.

# Critérios de Aceite

Todas as dívidas em ordem; primeiro espaço aproveitado; cabeçalhos e continuações legíveis; principal não duplicado em trechos; nenhum aviso após a ficha; códigos e Pix juntos na última página, íntegros; uma página quando o conjunto couber; input imutável e nenhuma página vazia. Bloco bancário impossível de caber em A4 deve falhar explicitamente, não ser cortado ou dividido.

# Riscos e Dependências

Origem integral pode gerar mais páginas, conforme decisão aprovada. Não diminuir fontes/códigos para impor uma página. Dados históricos indisponíveis continuam sinalizados, sem valores inventados. Excesso extraordinário de instruções ou Pix que torne a ficha maior que A4 impede a geração até revisão documental apropriada, sem alterar título bancário.

# Pendências para Validação

Regressão de desenvolvimento concluída, checkpoint preparado para salvar. Deploy na VPS e leitura de novo PDF real da mesma cobrança exigem etapas separadas; sem autorização nesta confirmação. Sem migration, infraestrutura, Central Jurídica ou operação bancária nesta entrega.

# Próximos Passos

Salvar a versão validada de desenvolvimento e apresentar amostras. Depois da revisão do usuário, preparar atualização manual da VPS com versão fixada, sem reemitir ou cancelar títulos.
