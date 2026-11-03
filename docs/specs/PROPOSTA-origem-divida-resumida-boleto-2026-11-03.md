# Resumo da Demanda

Evitar que a seção “Origem da dívida na formalização do acordo” torne cada boleto excessivamente longo quando houver muitas cobranças originais, preservando a transparência sobre o que foi negociado e como será pago.

# Classificação

Melhoria de apresentação de documento financeiro. Prioridade alta; complexidade média. História de usuário: como pagador, quero identificar o valor desta parcela e consultar a composição completa do acordo sem receber todas as dívidas repetidas em cada boleto.

# Problema Atual

O gerador de boleto já pagina a tabela de dívidas originais e repete seu cabeçalho, mas continua imprimindo todos os títulos em cada boleto. Isso aumenta o tamanho do arquivo proporcionalmente à quantidade de dívidas. A melhoria anterior resumiu o plano de parcelas, não a composição da origem.

# Solução Proposta

Adotar composição adaptativa no boleto e ampliar o documento separado existente:

1. **Boleto individual:** manter o valor exigível em destaque, o resumo do plano, o contexto histórico da origem e a ficha de compensação/Pix.
2. **Origem curta:** mostrar a tabela detalhada apenas quando a quantidade e a altura disponível permitirem. Sugestão inicial: até cinco títulos, desde que caibam com a ficha bancária. O limite depende de validação de layout, não apenas do número de registros.
3. **Origem extensa:** substituir a tabela integral por quadro consolidado contendo quantidade de cobranças, período de vencimentos de origem e composição financeira. Mostrar principal, encargos, descontos e total histórico somente quando esses dados forem confiáveis e compatíveis com o fechamento do acordo. Não preencher lacunas com valores inventados.
4. **Demonstrativo completo do acordo:** evoluir o PDF informativo já existente para conter resumo do acordo, composição integral das dívidas de origem e plano completo de parcelas. As duas tabelas devem ter paginação própria e cabeçalhos repetidos.

Aviso proposto no boleto: “Resumo das cobranças incluídas no acordo. A composição detalhada consta no Demonstrativo completo do acordo. Estes valores explicam a origem da dívida e não alteram o valor deste boleto.”

Não mostrar as primeiras cinco dívidas como se fossem a lista completa. Quando resumir, deixar explícito que o quadro é consolidado.

# Escopo

Layout do PDF individual de acordo, ampliação do PDF informativo existente e atualização do rótulo do botão no detalhe do acordo para “Demonstrativo completo (PDF)”. Aplicar a mesma regra aos PDFs individuais e aos gerados em lote.

# Fora do Escopo

Alterar montantes, juros pactuados, descontos, vencimentos, status, nosso número, pagamento, remessas, CNAB, integração BTG ou código de barras. Não alterar boletos avulsos sem acordo nesta proposta. Não criar nova tabela financeira nem novo título.

# Módulos Impactados

Gerador de boleto, contexto documental do acordo, gerador do plano completo, rotas de exportação de acordos e detalhe do acordo.

# Regras de Negócio

- O valor bancário continua vindo exclusivamente da parcela atual.
- Total histórico da origem, total negociado e valor desta parcela são conceitos distintos e devem ter rótulos explícitos.
- Usar a mesma fonte histórica validada para resumo e detalhamento. Antes da implementação, verificar se os dados disponíveis representam o fechamento do acordo e não encargos recalculados hoje.
- Todos os títulos vinculados devem permanecer disponíveis no demonstrativo, sem duplicidade e sem exclusão.
- Gerar documentos informativos não cria nem liquida cobrança.
- PDFs antigos permanecem preservados; apenas novas gerações recebem o layout.

# Fluxo da Funcionalidade

Ao gerar um boleto de parcela, avaliar a quantidade de títulos e o espaço disponível. Se a tabela curta couber, exibi-la. Caso contrário, apresentar o quadro consolidado com referência ao demonstrativo. No detalhe do acordo, o usuário autorizado poderá gerar o documento completo com a origem integral e todas as parcelas.

# Telas e Experiência do Usuário

**Boleto:** destacar o valor da parcela; separar visualmente origem da dívida e plano de pagamento; informar quando a composição está resumida. Usar tipografia legível, em vez de reduzir a fonte para encaixar todas as linhas.

**Detalhe do acordo:** botão “Demonstrativo completo (PDF)”, preservando carregamento e mensagens de erro existentes. Mensagem sugerida de sucesso: “Demonstrativo gerado com as dívidas de origem e o plano de parcelas.”

O arquivo separado deve ser identificado como informativo, sem Pix ou código de barras próprios. O usuário pode enviar esse documento ao pagador na formalização e os boletos individuais nos vencimentos.

# Dados e Banco de Dados

Reutilizar vínculos de cobranças, parcelas e histórico financeiro já persistidos. Não há migration prevista. Validar a disponibilidade de dados históricos antes de definir campos do resumo; não atualizar nem recalcular registros para preencher o documento.

# Permissões

Preservar permissão de exportação de acordos e validação de acesso ao condomínio do acordo. O documento separado deve manter as mesmas proteções do fluxo existente.

# Integrações e Automações

Nenhuma chamada bancária ou automação nova. Reutilizar armazenamento e exportação de PDFs existentes.

# Histórico e Auditoria

Preservar auditoria da geração do documento informativo, com acordo, tipo do documento e quantidade de itens. Não incluir dados pessoais ou conteúdo integral da dívida no log.

# Critérios de Aceite

- Dado um acordo com poucos títulos, quando a tabela couber no layout validado, então ela continua completa no boleto.
- Dado um acordo com muitos títulos ou sem espaço suficiente, quando gerar o boleto, então a origem aparece como resumo identificado, sem listar todos os títulos.
- Dado o mesmo acordo, quando gerar o demonstrativo completo, então todas as dívidas vinculadas e todas as parcelas aparecem em ordem, com paginação segura.
- Dado um resumo consolidado, quando comparar seus valores com a fonte histórica disponível, então os montantes devem coincidir ou a informação ausente deve ser sinalizada, nunca inventada.
- Dado um usuário sem acesso ao condomínio, quando solicitar o demonstrativo, então a exportação é bloqueada.
- Dado um boleto já emitido, quando regenerar somente o PDF, então valor, vencimento, linha digitável, código de barras, Pix e identificação do título não mudam.
- Dado um cenário com origem e plano extensos, quando renderizar os documentos, então não há páginas vazias, sobreposição ou perda de linhas. Meta de boleto: até duas páginas nos cenários validados; demonstrativo cresce conforme a quantidade de itens.

# Tarefas Técnicas

**Frontend:** atualizar nome e descrição do botão, manter estados de carregamento e erro.

**Backend:** criar regra pura de decisão de layout; consolidar origem a partir dos dados históricos disponíveis; ampliar o documento separado com a tabela integral; preservar exportação protegida e auditada.

**Banco:** nenhuma alteração prevista; somente leitura para verificar consistência das fontes.

**Testes:** origem com poucos e muitos títulos; limite de espaço; cobrança com descrição extensa; totais e arredondamento em centavos; plano e origem extensos juntos; PDF individual e em lote; acesso negado; preservação dos dados bancários.

**Documentação:** atualizar especificação documental e roteiro de uso após aprovação e implementação.

# Riscos e Dependências

Dados históricos incompletos podem impedir mostrar uma composição financeira fiel ao fechamento. O limite de cinco títulos é uma sugestão inicial e deve respeitar altura disponível. O demonstrativo longo pode ter várias páginas legitimamente; o objetivo é evitar sua repetição em cada boleto, não ocultar dados ou comprimir excessivamente sua tipografia.

# Pendências para Validação

Apresentação aprovada pelo usuário em 03/11/2026 e implementada no desenvolvimento. A validação manual de novos PDFs de acordos reais e a futura atualização da VPS ficam sob controle do usuário; nenhuma implantação está incluída nesta alteração.

## Decisões após auditoria da fonte histórica

- O principal documental vem de `acordoCobrancas.valorOriginal`, não do valor atual da cobrança. Metadados de descrição/vencimento são do cadastro vinculado atual e não possuem snapshot próprio.
- Snapshots atuais são agregados repetidos nas parcelas; modelos antigos eram proporcionais. Não somar, multiplicar nem ratear snapshots para reconstruir histórico.
- Encargos só aparecem quando existe snapshot completo e consistente cujo principal coincide com a soma integral dos vínculos. Valores ausentes, vínculos duplicados conflitantes, principal zero suspeito e snapshots proporcionais são sinalizados.
- `snapshotValorAtualizado` representa a **base dos títulos na formalização**, anterior aos ajustes da negociação, e não o total financeiro final do acordo. Esse rótulo é usado nos dois PDFs. A chave interna `totalFechamento` do contrato documental tem exclusivamente essa semântica e não afeta valores negociados ou bancários.
- Descontos, custas e extras sem discriminação estruturada não são deduzidos pela diferença entre base e total negociado. Não há detalhamento de encargos por dívida; o documento mostra os componentes agregados disponíveis, sem valores inventados.
- O helper preserva vínculos sem metadados, deduplica IDs iguais e sinaliza consolidação de acordo anterior. Metadados somente são carregados quando a cobrança pertence ao mesmo condomínio e devedor do acordo.
- Fonte documental única em `server/origem-divida-acordo.ts`, reutilizada no boleto individual, em cada PDF do lote e no demonstrativo. A geração não consulta BCB nem recalcula juros na data atual.
- A tabela curta usa largura real da fonte e até cinco títulos, somente quando cabe inteira junto da ficha. A origem extensa usa quadro consolidado. O demonstrativo tem paginação independente por origem e parcelas, com descrições extensas continuadas sem truncamento.

# Próximos Passos

No detalhe do acordo, gerar **Demonstrativo completo (PDF)** para consultar todas as dívidas e etapas. Para conferir o novo layout do boleto, gerar um PDF novo: arquivos antigos preservam o formato original. Testes sintéticos verificam boleto de até duas páginas com 80 dívidas/65 etapas, descrição extensa, preservação de título/Pix e controles reais de RBAC/tenancy. Não criar novo acordo, remessa ou cobrança para aplicar esta melhoria documental.
