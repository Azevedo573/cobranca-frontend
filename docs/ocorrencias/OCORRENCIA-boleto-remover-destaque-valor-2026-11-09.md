# Resumo da Ocorrência

Em 09/11/2026 às 15:26, o usuário pediu retirar do boleto o bloco “VALOR EXIGÍVEL NESTE BOLETO”, com a referência da parcela e o valor em destaque. O exemplo informado foi a parcela 1/1 do acordo #9, de R$ 8,62. A autorização é para alterar o documento, não valores ou operações bancárias.

# Classificação e Prioridade

Ajuste de apresentação de documento financeiro; prioridade baixa e escopo delimitado. O valor exigível deve continuar identificado nos campos próprios do boleto.

# Módulo Impactado

Renderizador compartilhado `server/boleto-pdf.ts`, utilizado por boleto individual e lote nos modos API BTG e CNAB.

# Comportamento Atual

Quando existe contexto de acordo, o recibo imprime um bloco azul com título, referência da parcela e valor grande, reservando altura antes de “Detalhes da fatura”.

# Comportamento Esperado

Retirar somente esse bloco e seu espaço. Manter “Detalhes da fatura”, vencimento, valor, ficha de compensação, resumo do acordo, origem histórica, linha digitável, código de barras, QR Code e Pix Copia e Cola quando válidos/disponíveis.

# Como Reproduzir

Gerar um novo PDF de uma parcela de acordo com contexto documental. O pedido não exige consultar, pagar, cancelar, criar ou reenviar a cobrança para reproduzir.

# Diagnóstico Inicial

O bloco está isolado em um `if (contextoAcordo)` no renderizador, entre a identificação do beneficiário/pagador e os detalhes da fatura. Os detalhes, a ficha e os cartões do acordo são desenhados separadamente.

# Causa Provável

O comportamento vem de uma decisão anterior de destaque do valor, agora substituída pela preferência do usuário por um documento sem esse quadro adicional. Não é uma divergência de cálculo.

# Impactos Identificados

A remoção reduz a altura do recibo e pode permitir que a origem curta caiba onde antes seria consolidada; essa adaptação já faz parte da regra existente. Não altera valores, datas, títulos, vínculos, status, canal, dados pessoais, banco, integrações ou permissões. PDFs históricos permanecem iguais.

# Correção Proposta

Remover o desenho do bloco, seus três textos e o incremento de altura correspondente. Não modificar a estrutura de `contextoAcordo` ou os dados de entrada.

# Regra Atual e Regra Corrigida

Anterior: quadro superior adicional com título/referência/valor. Corrigida: não há esse quadro; o valor da parcela continua em “Detalhes da fatura” e na ficha de compensação. Demais seções permanecem.

# Alterações Técnicas Necessárias

Backend: retirada localizada no renderizador e regressões de PDF real. Frontend, banco, schema, dependências, OAuth, webhook e emissores: nenhuma alteração. Atualizar as especificações documentais que exigiam o bloco.

# Correção de Dados Existentes

Nenhuma. Não reprocessar títulos, alterar snapshots, apagar arquivos ou substituir documentos históricos. O layout vale para novas gerações após a atualização do código.

# Histórico e Auditoria

Preservar os registros e as guardas da geração documental. O checkpoint registra a mudança de layout; nenhum conteúdo pessoal ou resposta bancária real é incluído nesta ocorrência.

# Plano de Testes

Regressões com fixtures sintéticas de parcela única, entrada e plano longo nos modos API/CNAB. As seis regressões novas falharam antes da retirada exclusivamente pelo título, referência e espaço do quadro; após a alteração, passaram. Verificam o valor nos detalhes/ficha, resumo/origem, barras I25 decodificadas, linha digitável, bytes Pix/QR e input imutável. O espaço residual foi conferido pelo posicionamento extraído do PDF real, comparado a um controle sem contexto.

Testes específicos: 69 aprovados em cinco arquivos. Suíte completa serial: 2.587 testes aprovados e um externo BTG opt-in ignorado, em 123 arquivos aprovados e um ignorado. TypeScript, build e `git diff --check` aprovados. A amostra sintética de R$ 8,62 foi renderizada e inspecionada em uma página, sem o quadro, com valor, resumo, origem, QR, Copia e Cola e ficha legíveis. Não há dados bancários reais na amostra.

# Plano de Reversão

Se houver perda de informação, sobreposição ou regressão, reverter apenas o commit de layout e recompilar pelo procedimento operacional aprovado. Não restaurar banco nem modificar títulos/arquivos históricos. A reversão na VPS exige autorização e preservação do build anterior.

# Critérios de Aceite

O novo PDF não contém “VALOR EXIGÍVEL NESTE BOLETO” nem a linha própria do quadro removido; o valor da parcela segue legível nos campos existentes. Códigos, Pix, contexto e resumo não são alterados. API e CNAB reutilizam a mesma alteração, inclusive no lote.

# Riscos e Dependências

A mudança de altura pode alterar a quebra de página ou a decisão adaptativa da origem; validar com origem e plano extensos. A validação sintética não substitui a conferência de um novo PDF real depois de um deploy autorizado.

# Pendências para Validação

Implementação e validação técnica concluídas no desenvolvimento. A atualização da VPS e a conferência de um novo documento real dependem de autorização separada. Nenhuma migration, chamada bancária ou alteração da VPS foi realizada.

# Próximos Passos

Entregar o checkpoint validado e a amostra sintética. Após autorização e atualização da VPS, gerar somente um PDF novo da mesma cobrança para conferir o layout. PDFs antigos mantêm seu formato; não é necessário emitir, cancelar, pagar ou reenviar o título.
