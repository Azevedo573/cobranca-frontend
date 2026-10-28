# Tarefas — Acordos longos: boleto compacto e plano completo

- [x] Criar resumo puro do plano de acordo
  - Aceite: 65 etapas não exigem tabela integral no boleto
  - Verificar: teste unitário com entrada e 64 parcelas
- [x] Compactar bloco de plano no boleto individual
  - Aceite: valor do título, composição histórica e ficha permanecem inalterados
  - Verificar: regressão de código de barras e PDF de referência
- [x] Criar PDF informativo de plano completo com paginação
  - Aceite: todas as parcelas aparecem em ordem, com cabeçalho repetido
  - Verificar: teste de paginação de 65 itens
- [x] Expor geração protegida e auditada
  - Aceite: usuário sem acesso não gera documento de acordo externo
  - Verificar: teste de procedure/RBAC
- [x] Adicionar ação no detalhe do acordo
  - Aceite: botão gera, abre e informa falha sem alterar a tabela de parcelas
  - Verificar: TypeScript e inspeção visual
- [x] Executar validação completa
  - Aceite: suíte, TypeScript e build aprovados
  - Verificar: comandos da especificação
