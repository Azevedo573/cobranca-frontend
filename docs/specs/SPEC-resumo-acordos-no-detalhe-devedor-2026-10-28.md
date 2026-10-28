# Resumo da Demanda

Agrupar as parcelas de um mesmo acordo em uma única linha na aba **Cobranças** do detalhe do devedor, mantendo as parcelas acessíveis sob demanda.

# Classificação

Melhoria de experiência do usuário no módulo financeiro, prioridade média e complexidade pequena.

# Problema Atual

Cada parcela ativa aparece como uma linha independente na tabela de cobranças. Em acordos parcelados, isso amplia a tela, repete dados do mesmo acordo e torna difícil identificar total, progresso e próximo vencimento.

# Solução Proposta

Exibir uma linha-resumo por acordo ativo com: número do acordo, quantidade e progresso das parcelas, próximo vencimento em aberto, total negociado calculado pela soma das parcelas, saldo em aberto e status. A ação **Ver parcelas** expande a linha e mantém a tabela atual de parcelas, incluindo PDF, linha digitável e Pix de cada título.

# Escopo

- Agrupar somente parcelas recebidas em `cobrancas.getComAcordos` pelo `acordoId`.
- Preservar cobranças avulsas em sua tabela atual.
- Permitir expansão independente para cada acordo.
- Manter acesso ao detalhe completo do acordo.

# Fora do Escopo

- Não alterar parcelas, acordos, valores, vencimentos, status, remessas, boletos ou integrações.
- Não criar migrations, agregações persistidas ou novas regras de pagamento.

# Regras de Negócio

- A linha consolidada é apenas uma visão; cada parcela continua sendo o título financeiro válido.
- Total negociado é a soma das parcelas exibidas no acordo, em centavos.
- Saldo em aberto soma parcelas que não estejam pagas ou canceladas.
- Próximo vencimento é o menor vencimento das parcelas em aberto.
- Ações de boleto/Pix permanecem por parcela dentro da expansão.

# Critérios de Aceite

- Dado um acordo com quatro parcelas pendentes, quando a aba Cobranças for aberta, então deverá haver uma única linha do acordo com progresso `0/4`, total e próximo vencimento.
- Dado mais de um acordo ativo, quando a aba for aberta, então cada acordo deverá ter sua própria linha-resumo.
- Dado um acordo expandido, quando o usuário clicar em Ver parcelas, então cada parcela deverá exibir seus dados e ações originais.
- Dado uma cobrança avulsa, quando a aba for aberta, então ela continuará exibida fora do resumo de acordos.

# Dados e Banco de Dados

Nenhuma alteração no banco. A consolidação ocorre somente em memória, no frontend, a partir das parcelas já retornadas.

# Permissões

São mantidas as permissões já exigidas para visualizar cobranças e gerar documentos.

# Histórico e Auditoria

Não há mutação de dados. O histórico financeiro, os títulos e as ações existentes permanecem inalterados.

# Riscos e Dependências

A visão consolidada não pode ocultar parcelas: por isso a expansão preserva a tabela detalhada e as ações individuais.
