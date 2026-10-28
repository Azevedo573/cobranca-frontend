# Resumo da Ocorrência

O boleto da entrada do acordo #1500001, nosso número 1000000024, foi gerado com 51 páginas. O acordo possui uma entrada e 64 parcelas regulares.

# Classificação e Prioridade

- Tipo: falha de apresentação e paginação de documento financeiro.
- Prioridade: alta.
- Impacto: operacional, comunicação com pagador e reputação.

# Diagnóstico

A tabela integral do plano de pagamento foi desenhada no recibo individual sem paginação por linha. Após a parcela 52, cada célula excedente gerou uma página isolada no PDFKit. A composição histórica possui uma linha e a ficha bancária está íntegra; não há evidência de valor bancário incorreto.

# Regra Anterior

Todo o plano de parcelas era impresso dentro de cada boleto individual.

# Regra Corrigida

O boleto mostra somente resumo do plano; um demonstrativo separado mostra todas as parcelas com paginação controlada.

# Impactos em Dados e Integrações

Não haverá migration nem mudança em acordo, parcela, título, Pix, código de barras, nosso número, CNAB ou remessa. PDFs existentes são preservados. PDFs regenerados receberão o novo layout.

# Plano de Testes

- Plano com entrada + 64 parcelas.
- Acordo sem entrada.
- Valores regulares iguais e diferentes.
- Preservação de `parcela.amount` no código de barras do boleto.
- Controle de acesso e auditoria do demonstrativo.
- Suíte, TypeScript, build e inspeção visual do cenário #1500001.

# Plano de Reversão

Reverter somente os arquivos de apresentação, procedure e botão. Não há dados a restaurar.

# Resultado Validado

- Boleto sintético de entrada + 64 parcelas: **1 página**, sem a tabela integral de parcelas.
- Demonstrativo informativo do mesmo plano: **4 páginas**, com 65 etapas em ordem e cabeçalho repetido.
- Foram preservados o valor do título, a composição histórica, a ficha de compensação, o código de barras e o Pix do boleto.
- Validação técnica: 449 testes aprovados, 1 teste externo de Sandbox ignorado, TypeScript e build de produção aprovados.
