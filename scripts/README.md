# Scripts de Manutenção

Este diretório contém scripts auxiliares para manutenção e população de dados do sistema.

## seed-indices-bcb.mjs

Script para popular a tabela `indicesBCB` com dados históricos dos índices de correção monetária do Banco Central do Brasil.

### Funcionalidade

Busca dados históricos dos últimos 10 anos (2016-2026) para os 4 índices principais:

- **IPCA** (Índice de Preços ao Consumidor Amplo) - código BCB 433
- **IGP-M** (Índice Geral de Preços do Mercado) - código BCB 189
- **INPC** (Índice Nacional de Preços ao Consumidor) - código BCB 188
- **IGP-DI** (Índice Geral de Preços - Disponibilidade Interna) - código BCB 190

### Quando Usar

- **Primeira execução**: Popular dados históricos completos (10 anos)
- **Atualização mensal**: Buscar índices do mês anterior
- **Recuperação**: Repopular dados após perda ou corrupção

### Como Executar

```bash
# Executar o script
node scripts/seed-indices-bcb.mjs

# Ou usar npx tsx para suporte TypeScript
npx tsx scripts/seed-indices-bcb.mjs
```

### Comportamento

1. **Conecta ao banco** usando `DATABASE_URL` do ambiente
2. **Busca dados da API** do Banco Central para cada índice
3. **Verifica duplicatas** antes de inserir
4. **Atualiza registros** existentes se o valor mudou
5. **Insere novos** registros para meses faltantes
6. **Aguarda 1 segundo** entre índices para não sobrecarregar a API
7. **Exibe resumo** com total de inserções, atualizações e erros

### Saída Esperada

```
🚀 Iniciando população de índices BCB...

✅ Conectado ao banco de dados

📊 Processando IPCA (código 433)...
  Buscando dados da API: https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/2016&dataFinal=31/12/2026
  Recebidos 121 registros
  ✅ IPCA processado com sucesso

[... outros índices ...]

📈 Resumo da População:
  ✅ Registros inseridos: 436
  🔄 Registros atualizados: 48
  ❌ Erros: 0
  📊 Total processado: 484

✅ População de índices concluída!
```

### Estrutura dos Dados

Cada registro na tabela `indicesBCB` contém:

| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `id` | int | ID auto-incremento | 1 |
| `indice` | enum | Nome do índice | "IPCA" |
| `mesReferencia` | varchar(10) | Mês no formato YYYY-MM-01 | "2025-01-01" |
| `valor` | decimal(10,4) | Valor percentual do índice | 0.5600 |
| `createdAt` | timestamp | Data de criação do registro | 2026-02-25 12:00:00 |
| `updatedAt` | timestamp | Data da última atualização | 2026-02-25 12:00:00 |

### Validação

Após executar o script, valide os dados no banco:

```sql
-- Ver cobertura de dados por índice
SELECT 
  indice, 
  MIN(mesReferencia) as primeiro, 
  MAX(mesReferencia) as ultimo, 
  COUNT(*) as total 
FROM indicesBCB 
GROUP BY indice;

-- Resultado esperado (121 meses por índice):
-- IPCA   | 2016-01-01 | 2026-01-01 | 121
-- IGP-M  | 2016-01-01 | 2026-01-01 | 121
-- INPC   | 2016-01-01 | 2026-01-01 | 121
-- IGP-DI | 2016-01-01 | 2026-01-01 | 121
```

### Tratamento de Erros

O script possui tratamento robusto de erros:

- **Erro de conexão**: Exibe mensagem e encerra com código 1
- **Erro na API**: Continua com próximo índice e conta como erro
- **Erro de inserção**: Registra erro e continua com próximo registro
- **Resumo final**: Mostra total de erros encontrados

### Manutenção

**Frequência recomendada**: Mensal (após divulgação dos índices oficiais)

**Automação futura**: Considere criar um job cron ou agendamento para executar automaticamente todo dia 10 de cada mês (após divulgação dos índices oficiais).

### Notas Importantes

- A API do BCB é pública e não requer autenticação
- O script respeita limite de 1 segundo entre requisições
- Dados são idempotentes (pode executar múltiplas vezes sem duplicar)
- Valores são armazenados com 4 casas decimais de precisão
