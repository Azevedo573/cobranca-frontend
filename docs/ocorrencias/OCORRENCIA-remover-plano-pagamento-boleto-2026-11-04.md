# Resumo da Ocorrência

Em 04/11/2026, após validar a atualização da VPS, o usuário pediu retirar do PDF do boleto todo o bloco “Plano de pagamento do acordo”, inclusive entrada, número de parcelas, etapas, quitadas, saldo em aberto e sua nota final. Pedido explícito autoriza implementação desta mudança delimitada, sem nova aprovação de especificação.

# Classificação e Prioridade

Ajuste de apresentação de documento financeiro; prioridade média. Escopo pequeno e conhecido.

# Módulo Impactado

Gerador compartilhado server/boleto-pdf.ts, usado por geração individual e em lote.

# Comportamento Atual

Após os três cartões de “Resumo do acordo”, o boleto imprime um quadro adicional contendo o resumo do plano de pagamento.

# Comportamento Esperado

Eliminar completamente esse quadro e sua altura reservada. Manter os cartões de “Resumo do acordo”, a identificação da parcela/entrada atual, o valor do boleto, a origem adaptativa das dívidas, ficha de compensação, linha digitável, código de barras e Pix. O demonstrativo completo separado continua apresentando todas as parcelas.

# Como Reproduzir

Gerar PDF de parcela de acordo; observar o quadro entre “Resumo do acordo” e a origem da dívida. Cenário citado: parcela única de R$ 202,66, sem entrada.

# Diagnóstico Inicial

O bloco está em um único trecho do gerador. Usa resumirPlanoBoletoAcordo apenas para exibição, sem participação no cálculo do título. Sua retirada dispensa alterações de contrato, banco e rotas.

# Causa Provável

Resumo do plano deixou de ser necessário no boleto individual conforme nova orientação do usuário; a informação permanece disponível no demonstrativo próprio.

# Impactos Identificados

Boleto mais compacto. Sem exclusão de parcelas, mudança de valores, encargos, saldo persistido, nosso número ou regras de acesso. Boletos avulsos sem acordo não usam esse bloco e não devem mudar.

# Correção Proposta

Retirar importação sem uso, desenho/textos do quadro e seu incremento vertical. Não modificar o gerador do demonstrativo completo. Aplicar aos PDFs novos, individualmente ou em lote, por meio do gerador compartilhado.

# Regra Atual e Regra Corrigida

Antes: boleto mostra quadro do plano. Depois: plano fica no demonstrativo separado; boleto mantém demais informações existentes. Não alterar “Resumo do acordo”, pois o usuário pediu especificamente o quadro “Plano de pagamento do acordo”.

# Alterações Técnicas Necessárias

Backend: remoção delimitada da renderização. Testes: regressões do PDF real. Frontend, banco, integrações e permissões: nenhuma alteração necessária.

# Correção de Dados Existentes

Nenhuma. Arquivos antigos são preservados. Novo layout exige geração de PDF novo da parcela existente, não criação de nova cobrança ou remessa.

# Histórico e Auditoria

Registrar tarefa e checkpoint. Não executar chamadas bancárias, storage de produção ou emissão de títulos durante testes sintéticos.

# Plano de Testes

Adicionar teste que inicialmente falha por encontrar o quadro. Cobrir parcela única sem entrada de R$ 202,66, entrada e acordo longo. Confirmar ausência do título e de todas as mensagens do quadro; presença de valor, resumo do acordo, origem, Pix e ficha; entrada de dados intacta; código de barras e linha digitável inalterados. O teste do demonstrativo deve preservar as parcelas integrais. Executar suíte serial, TypeScript e build. Revisar PDF sintético visualmente para confirmar que o bloco desaparece sem deixar espaço em branco indevido ou sobreposição.

## Resultados verificados no desenvolvimento

Teste inicial detectou o quadro nos três cenários antes da remoção. Após retirar a renderização e ajustar a expectativa ao rótulo existente da origem consolidada, a suíte completa passou: **485 testes aprovados**, 61 arquivos aprovados, 1 teste/arquivo externo BTG opt-in ignorado deliberadamente. TypeScript e build de produção aprovados; permanecem avisos prévios de tamanho de bundle. Nenhuma dependência nova ou migration.

Amostra fictícia de parcela única de R$ 202,66 validada por extração textual e inspeção das duas páginas. O quadro e sua reserva de altura desapareceram; os cartões de resumo permaneceram. A regra anterior de manter origem curta inteira junto da ficha na página seguinte continua preservada, por isso a amostra permanece com duas páginas. Origem, valor, Pix e ficha são legíveis, sem sobreposição. Nenhum documento real, storage de produção ou API bancária foi utilizado.

# Plano de Reversão

Reverter apenas o trecho removido do gerador e os critérios de teste correspondentes, usando o checkpoint anterior dbd94cb5 como referência. Não restaurar banco nem apagar PDFs; nenhum dado mudou. Caso necessário aplicar à VPS, seguir atualização específica após validar o código e confirmar o procedimento com o usuário; sem deploy automático nesta etapa.

# Critérios de Aceite

Novo PDF não contém quadro de plano nem sua nota. Valor da parcela, origem da dívida, resumo do acordo e instrumentos de pagamento permanecem. Demonstrativo separado conserva todas as etapas. Boleto com origem extensa continua até duas páginas nos cenários sintéticos já cobertos.

# Riscos e Dependências

Quebra de página pode mudar positivamente pela redução de altura, mas deve ser validada. Poppler é usado apenas para inspeção textual/visual nos testes locais, não é dependência de produção. Não modificar regras financeiras para satisfazer layout.

# Pendências para Validação

Testes, build e inspeção visual concluídos no desenvolvimento. Pendente: atualização desta modificação na VPS e conferência de PDF novo de parcela existente. A VPS ainda utiliza d11f28fc até orientação específica de atualização; não presumir implantação desta modificação.

# Próximos Passos

Salvar checkpoint restaurável e orientar o próximo deploy quando solicitado pelo usuário. Após atualização futura da VPS, gerar um PDF novo para conferir o layout; arquivos antigos não mudam automaticamente. Não executar migrations nem recriar a tabela loginRateLimits para esta alteração visual.
