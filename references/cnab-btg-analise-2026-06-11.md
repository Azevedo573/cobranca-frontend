# Análise BTG CNAB 240 — 2026-06-11

## Arquivos analisados

| Arquivo | Observação principal |
|---|---|
| `/home/ubuntu/upload/erros_processamento_REMESSA_11062026(2).rem_1781195143952.csv` | O BTG reporta dois erros: **data de vencimento indefinida/inválida** e **nosso número com caracteres não permitidos**. |
| `/home/ubuntu/upload/exemplo_arquivo_remessa_layout_240.rem` | Arquivo de exemplo com 8 linhas e 240 caracteres por linha. Contém segmentos `P`, `Q`, `R` e `S`. |
| `/home/ubuntu/upload/LayoutFebraban240-V-10.9.pdf` | PDF FEBRABAN V10.9 com índice indicando a seção **3.2 Cobrança** e **4.0 Descrição de Campos**, úteis para validar o segmento P. |

## Erros exatos do CSV

> "Erro no campo 'Data de Vecimento do Título', pois a data undefined é inválida ou está no passado. Verifique a operação com o campo Seu Número igual a 0000006    2006 e nome do sacado igual a ANTONIO CARLOS."

> "Erro no campo 'Nosso Número' (00004322600 00000000), esse campo não pode conter letras. Verifique a operação com o campo Seu Número igual a 0000006    2006 e nome do sacado igual a ANTONIO CARLOS."

## Achados iniciais sobre o erro atual

| Campo | Evidência | Interpretação |
|---|---|---|
| **Data de vencimento** | O BTG leu `undefined` | Em algum ponto o sistema está montando o título com `dataVencimento` ausente, inválida ou deslocada para um valor que o parser do banco não reconhece. |
| **Nosso número** | O BTG leu `00004322600 00000000` | Há forte indício de **desalinhamento de colunas**, porque existe um espaço dentro do campo lido como nosso número. |
| **Seu Número** | O BTG menciona `0000006    2006` | O campo também aparenta estar desalinhado ou sendo preenchido com conteúdo concatenado indevidamente. |

## Achados sobre o arquivo de exemplo BTG

| Item | Achado |
|---|---|
| Quantidade de linhas | 8 |
| Tamanho das linhas | 240 caracteres |
| Segmentos presentes | `P`, `Q`, `R`, `S` |
| Header de lote | O exemplo não parece seguir, visualmente, o mesmo preenchimento do mapeamento FEBRABAN puro já implementado no sistema. |
| Segmento P | A leitura direta com offsets FEBRABAN padrão não produz campos coerentes em todas as posições, o que indica necessidade de validar o layout com a documentação antes de alterar novamente o gerador. |

## Índice útil do PDF FEBRABAN V10.9

| Seção | Página do índice |
|---|---|
| **3.2 Cobrança** | 49 |
| **3.2.2 Títulos em Cobrança** | 54 |
| **4.0 Descrição de Campos** | 142 |
| **C - Títulos em Cobrança** | 146 |

## Próximos passos planejados

1. Ler as páginas da documentação FEBRABAN referentes a **Cobrança / Títulos em Cobrança**.
2. Confirmar os offsets oficiais do **segmento P**.
3. Comparar o layout oficial com o exemplo BTG e com o gerador atual.
4. Corrigir apenas com base na combinação de **documentação + exemplo + erro real do CSV**.
5. Validar com testes unitários e novo checkpoint.

## Hipótese de trabalho atual

A causa mais provável é uma combinação de **deslocamento de colunas** e/ou **montagem inconsistente dos campos `nossoNumero`, `seuNumero` e `dataVencimento`** em uma procedure específica de remessa que ainda não está obedecendo ao mesmo layout usado no restante do projeto.

Não assumir que o exemplo BTG está totalmente alinhado ao parser FEBRABAN sem antes conferir as páginas técnicas do manual.

## Fontes

- CSV de erros do BTG anexado pelo usuário.
- Arquivo de exemplo de remessa BTG anexado pelo usuário.
- PDF `LayoutFebraban240-V-10.9.pdf`, páginas 1–5 (índice e navegação).


## Offsets oficiais confirmados no PDF FEBRABAN V10.9

Fonte: `/home/ubuntu/upload/LayoutFebraban240-V-10.9.pdf`, páginas 54 a 58.

### Registro Header de Lote — Cobrança (p. 54)

| Campo | Posição |
|---|---|
| Banco | 1-3 |
| Lote | 4-7 |
| Registro | 8 |
| Operação | 9 |
| Serviço | 10-11 |
| Nº versão layout lote | 14-16 |
| Tipo de inscrição | 18 |
| Nº de inscrição | 19-33 |
| Convênio | 34-53 |
| Agência mantenedora | 54-58 |
| Dígito agência | 59 |
| Conta corrente | 60-71 |
| Dígito conta | 72 |
| Dígito ag/conta | 73 |
| Nome da empresa | 74-103 |
| Mensagem 1 | 104-143 |
| Mensagem 2 | 144-183 |
| Nº remessa/retorno | 184-191 |
| Data de gravação | 192-199 |
| Data do crédito | 200-207 |

### Registro Detalhe — Segmento P (Obrigatório Remessa) (p. 55)

| Campo | Posição |
|---|---|
| Banco | 1-3 |
| Lote | 4-7 |
| Registro | 8 |
| Nº do registro | 9-13 |
| Segmento | 14 |
| CNAB | 15 |
| Código movimento | 16-17 |
| Agência | 18-22 |
| Dígito agência | 23 |
| Número da conta corrente | 24-35 |
| Dígito conta | 36 |
| DV ag/conta | 37 |
| Identificação do título no banco (nosso número) | 38-57 |
| Código da carteira | 58 |
| Forma de cadastramento | 59 |
| Tipo de documento | 60 |
| Identificação da emissão do boleto | 61 |
| Identificação da distribuição | 62 |
| Número do documento de cobrança | 63-77 |
| Data de vencimento do título | 78-85 |
| Valor nominal do título | 86-100 |
| Agência cobradora | 101-105 |
| DV agência cobradora | 106 |
| Espécie do título | 107-108 |
| Identificação de título aceito/não aceito | 109 |
| Data de emissão do título | 110-117 |
| Código dos juros de mora | 118 |
| Data dos juros de mora | 119-126 |
| Juros de mora por dia/taxa | 127-141 |
| Código do desconto 1 | 142 |
| Data do desconto 1 | 143-150 |
| Valor/percentual do desconto | 151-165 |
| Valor do IOF | 166-180 |
| Valor do abatimento | 181-195 |
| Identificação do título na empresa (seu número) | 196-220 |
| Código para protesto | 221 |
| Número de dias para protesto | 222-223 |
| Código para baixa/devolução | 224 |
| Número de dias para baixa/devolução | 225-227 |
| Código da moeda | 228-229 |
| Nº do contrato da operação de crédito | 230-239 |

### Conclusão técnica importante

O gerador atual do projeto **não está seguindo esses offsets oficiais do segmento P**. Ele foi implementado com um mapeamento alternativo em que convênio e conta ocupam posições diferentes e o nosso número começa na posição 50. Pela documentação oficial FEBRABAN, o nosso número deve começar na posição **38** e a conta deve começar na posição **24**.

Isso fortalece a hipótese de que os erros reportados pelo BTG são causados por **deslocamento estrutural do segmento P**, e não apenas por erro de conteúdo em `dueDate`.

