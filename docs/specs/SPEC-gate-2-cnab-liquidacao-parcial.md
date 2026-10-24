# Gate 2 — Liquidação Parcial CNAB em Revisão Manual

## Objetivo
Impedir que o retorno CNAB de liquidação parcial (`07`/`007`) quite automaticamente cobranças, parcelas ou acordos.

## Regra de negócio aprovada
A ocorrência `07`/`007` será registrada como **revisão manual obrigatória**, independentemente do valor informado no arquivo. Até uma regra futura de saldo parcial ser homologada, o sistema não altera status, `paidAt`, `paidAmount`, `paymentDate`, `valorPago` do acordo, cobranças vinculadas nem indicadores de recuperação.

## Escopo
- Classificador de retorno CNAB novo e legado.
- Processamento principal do retorno BTG/CNAB 240.
- Registro de item em exceção/revisão usando a infraestrutura existente.
- Testes de regressão para `06`, `07` e `09`.

## Fora do escopo
- Baixa proporcional, saldo residual, renegociação automática ou uma nova tela de conciliação parcial.
- Alteração de schema: a fila atual de exceções será reutilizada inicialmente.

## Critérios de aceite
- Dado retorno `07`/`007` de uma cobrança ou parcela, quando processado, então os campos financeiros e estados permanecem inalterados e o item fica visível para revisão manual.
- Dado retorno `06`/`006`, quando processado, então o caminho normal de liquidação integral continua disponível.
- Dado retorno `09`/`009`, quando processado, então a semântica de cancelamento continua inalterada.
- Dado o parser legado, quando encontrar `07`, então não o classifica como liquidação automática.

## Segurança e auditoria
A alteração não aceita escopo informado pelo cliente como autorização. Os guards do Gate 1 permanecem responsáveis por validar condomínio e recurso antes de qualquer operação financeira.

## Verificação
```bash
pnpm exec vitest run server/cnab-retorno.test.ts server/configuracao-boleto.test.ts --no-file-parallelism --reporter=default
pnpm check
pnpm build
```
