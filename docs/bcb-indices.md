# Integração com API do Banco Central - Índices de Correção Monetária

## Resumo

Este documento descreve a integração com a API pública do Banco Central do Brasil para obtenção de índices de correção monetária oficiais (IPCA, IGP-M, INPC, etc.) usados no cálculo de valores devidos.

## URL Base da API

```
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{código_serie}/dados?formato=json&dataInicial={dd/mm/aaaa}&dataFinal={dd/mm/aaaa}
```

## Índices Disponíveis

### IPCA - Índice Nacional de Preços ao Consumidor Amplo

O IPCA é o índice oficial de inflação do Brasil, medido pelo IBGE. É o mais utilizado para correção monetária em contratos, dívidas e acordos judiciais.

**Código da série:** `433`  
**Periodicidade:** Mensal (variação percentual)  
**Fonte:** IBGE  
**Período disponível:** 01/1980 até presente  
**Formato do valor:** Percentual (ex: "0.56" = 0.56%)

**Exemplo de resposta:**
```json
[
  { "data": "01/01/2025", "valor": "0.16" },
  { "data": "01/02/2025", "valor": "1.31" },
  { "data": "01/03/2025", "valor": "0.56" }
]
```

### IGP-M - Índice Geral de Preços do Mercado

O IGP-M é calculado pela FGV e muito utilizado para reajuste de aluguéis e contratos de longo prazo.

**Código da série:** `189`  
**Periodicidade:** Mensal (variação percentual)  
**Fonte:** FGV  
**Período disponível:** 01/1989 até presente  
**Formato do valor:** Percentual (ex: "1.06" = 1.06%)

**Exemplo de resposta:**
```json
[
  { "data": "01/01/2025", "valor": "0.27" },
  { "data": "01/02/2025", "valor": "1.06" },
  { "data": "01/03/2025", "valor": "-0.34" }
]
```

### INPC - Índice Nacional de Preços ao Consumidor

O INPC é medido pelo IBGE e utilizado principalmente para reajuste de salários.

**Código da série:** `188`  
**Periodicidade:** Mensal (variação percentual)  
**Fonte:** IBGE  
**Período disponível:** 01/1979 até presente

### IGP-DI - Índice Geral de Preços - Disponibilidade Interna

**Código da série:** `190`  
**Periodicidade:** Mensal (variação percentual)  
**Fonte:** FGV  
**Período disponível:** 01/1944 até presente

## Formato de Data

A API aceita datas no formato brasileiro: `dd/mm/aaaa`

**Exemplos:**
- `01/01/2025` (1º de janeiro de 2025)
- `31/12/2025` (31 de dezembro de 2025)

## Características da API

✅ **Pública e gratuita** - Não requer autenticação  
✅ **Dados oficiais** - Fonte confiável (Banco Central)  
✅ **Histórico completo** - Dados desde 1944 (IGP-DI) ou 1979 (INPC)  
✅ **Atualização mensal** - Dados novos disponibilizados mensalmente  
✅ **Formato JSON** - Fácil integração

## Implementação Recomendada

### 1. Serviço de Integração

Criar um serviço no backend (`server/bcb-api.ts`) que:
- Faz requisições HTTP à API do BCB
- Implementa cache para evitar requisições repetidas
- Trata erros de rede e indisponibilidade
- Converte formato de data (dd/mm/aaaa ↔ ISO)

### 2. Cálculo de Correção Monetária

Para calcular a correção monetária entre duas datas:

1. Buscar índices mensais do período
2. Aplicar fórmula de correção acumulada:
   ```
   fator = (1 + índice1/100) × (1 + índice2/100) × ... × (1 + índiceN/100)
   valor_corrigido = valor_original × fator
   ```

**Exemplo:**
- Valor original: R$ 1.000,00
- Período: jan/2025 a mar/2025
- IPCA: 0.16% (jan), 1.31% (fev), 0.56% (mar)
- Fator: (1 + 0.16/100) × (1 + 1.31/100) × (1 + 0.56/100) = 1.0204
- Valor corrigido: R$ 1.000,00 × 1.0204 = **R$ 1.020,40**

### 3. Configuração por Condomínio

Permitir que cada condomínio escolha:
- Índice de correção (IPCA, IGP-M, INPC, IGP-DI)
- Se aplica correção monetária ou não
- Data de referência para início da correção

### 4. Cache e Performance

- Armazenar índices no banco de dados após primeira consulta
- Atualizar cache mensalmente (job agendado)
- Evitar requisições repetidas para o mesmo período

## Próximos Passos

1. ✅ Pesquisar API e identificar códigos
2. ✅ Testar requisições e validar formato
3. ⏳ Implementar serviço de integração no backend
4. ⏳ Adicionar campo de índice no schema do condomínio
5. ⏳ Integrar no cálculo de valores devidos
6. ⏳ Criar interface para configuração
7. ⏳ Implementar cache e job de atualização
8. ⏳ Testar com dados reais

## Referências

- [API do Banco Central](https://api.bcb.gov.br/)
- [Sistema Gerenciador de Séries Temporais (SGS)](https://www3.bcb.gov.br/sgspub/)
- [Documentação IBGE - IPCA](https://www.ibge.gov.br/estatisticas/economicas/precos-e-custos/9256-indice-nacional-de-precos-ao-consumidor-amplo.html)
- [Documentação FGV - IGP-M](https://portal.fgv.br/noticias/igp-m)
