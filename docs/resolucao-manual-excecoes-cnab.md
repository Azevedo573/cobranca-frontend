# Resolução Manual de Exceções CNAB

## Escopo desta etapa

A central de exceções permite registrar três decisões humanas: **em revisão**, **ignorada** e **demanda criada**. Cada decisão exige justificativa e registra o usuário, data e eventual demanda relacionada.

## Controle financeiro

> Esta funcionalidade não altera cobranças, acordos, parcelas, saldos ou status de baixa.

A procedure de revisão grava somente uma linha em `retornoExcecaoRevisoes`. Não há action, campo ou mutation de baixa automática nesta etapa. A vinculação de uma exceção a uma cobrança e qualquer baixa financeira exigirão uma entrega posterior, com permissões reforçadas e confirmação explícita.

## Implantação

Na VPS, a migration `drizzle/0085_opposite_tarantula.sql` deve ser aplicada antes do deploy da interface. A criação da tabela é aditiva e não altera dados de retornos já processados.
