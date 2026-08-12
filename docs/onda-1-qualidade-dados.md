# Onda 1 — Qualidade de Dados e Visão Consolidada do Devedor

## Importação de devedores e cobranças

A prévia da planilha agora aponta **possíveis duplicidades internas** como aviso, sem bloquear a importação automaticamente. O aviso é emitido quando duas linhas possuem a mesma identidade de devedor (CPF/CNPJ; na ausência, bloco e unidade), a mesma referência ou vencimento, o mesmo tipo de cobrança e o mesmo valor.

O aviso exige ciência explícita do operador. Ele não substitui revisão humana, pois duas cobranças semelhantes podem ser legítimas conforme a regra do condomínio.

No momento da gravação, o sistema também protege contra reimportação acidental: uma cobrança é ignorada quando já existir, para o mesmo condomínio e devedor, um título com o mesmo vencimento, valor e tipo. O resultado da importação informa a quantidade ignorada; nenhum título existente é atualizado ou removido automaticamente.

## Visão consolidada do devedor

A tela de detalhes do devedor passa a exibir um cartão de consolidação com títulos em aberto, valor nominal em aberto, acordos ativos, demandas abertas e processos ativos vinculados por demanda. Esses dados são exclusivamente informativos: não recalculam, baixam, cancelam nem modificam cobranças, acordos ou dados jurídicos.

| Indicador | Fonte | Finalidade |
|---|---|---|
| Títulos em aberto | Cobranças não pagas | Priorizar negociação e cobrança |
| Acordos ativos | Acordos ativos ou inadimplentes | Identificar renegociação e acompanhamento |
| Demandas abertas | Demandas abertas/em andamento | Expor pendências jurídicas relacionadas |
| Processos ativos | Processos vinculados às demandas do devedor | Indicar risco e facilitar continuidade do caso |

## Limites atuais

Esta primeira entrega não usa correspondência aproximada por nome para identificar devedores, não altera valores financeiros existentes e não cria vínculos jurídicos automáticos. Qualquer correspondência que não seja CPF/CNPJ ou bloco/unidade exige validação humana.
