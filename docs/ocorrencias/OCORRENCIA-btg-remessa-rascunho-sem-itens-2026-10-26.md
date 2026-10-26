# Resumo da Ocorrência

Em 26/10/2026, durante a homologação manual no Sandbox, a remessa BTG #2 do condomínio Park Premium Recreio foi criada com uma parcela selecionada, porém permaneceu em `rascunho`, sem itens de remessa, emissão BolePix ou registro de auditoria final.

# Classificação e Prioridade

- **Tipo:** falha de integração/persistência pré-envio.
- **Prioridade:** alta.
- **Impacto:** financeiro-operacional no ambiente Sandbox.
- **Dados envolvidos:** remessa BTG #2; nenhuma cobrança externa emitida.

# Módulo Impactado

Banco → Remessas BTG; procedure `btgV2.criarEEnviarRemessa`.

# Comportamento Atual

O cabeçalho da remessa é persistido, mas a execução é interrompida antes da inserção de `btgRemessaItens` e antes de qualquer chamada à API BTG. O lote fica em `rascunho` sem progresso.

# Comportamento Esperado

Após o cabeçalho ser persistido, os itens devem ser registrados e o lote deve seguir para `enviando` e para um estado final. Caso a persistência pré-envio falhe, o lote deve ficar em `falha`, com erro seguro e auditável, sem cobrança externa.

# Como Reproduzir

1. Criar uma remessa BTG Sandbox com uma parcela elegível.
2. Confirmar o envio.
3. Consultar a persistência local.
4. Observar a remessa criada sem itens e ainda em `rascunho`.

# Diagnóstico Inicial

A remessa #2 contém `totalSelecionado=1`, sem itens, sem emissão e sem auditoria de envio. O ponto imediatamente posterior ao insert do cabeçalho interpreta incorretamente o resultado MySQL de inserção em ambientes onde o `insertId` é devolvido dentro de uma tupla/array.

# Causa Confirmada

O driver MySQL retornou o resultado de insert no formato `[{ insertId: 60001 }, null]`. A leitura anterior considerava somente um objeto direto, interpretava o identificador como zero e interrompia a rotina antes de inserir os itens.

# Impactos Identificados

- Nenhuma cobrança ou título foi enviado ao BTG.
- Nenhuma parcela foi baixada, alterada ou vinculada a emissão.
- O cabeçalho #2 deve ser preservado para rastreabilidade; não deve ser excluído.

# Correção Proposta

1. Extrair `insertId` de forma compatível com objetos, tuplas e tuplas aninhadas retornadas pelo driver MySQL.
2. Tratar falha de gravação de itens antes do envio como falha terminal do lote, com mensagem segura, totais coerentes e auditoria.
3. Cobrir ambos os formatos de retorno por testes unitários.
4. Não reenviar automaticamente a remessa #2 nem emitir qualquer cobrança durante a correção.

# Regra Atual e Regra Corrigida

- **Atual:** um lote pode permanecer em `rascunho` caso a persistência de itens falhe após a criação do cabeçalho.
- **Corrigida:** todo lote com falha pré-envio é marcado como `falha`; somente lotes com itens persistidos podem iniciar emissão.

# Alterações Técnicas Necessárias

- **Back-end:** normalizador de resultado MySQL e tratamento explícito de falha pré-envio no router BTG v2.
- **Front-end:** nenhuma alteração obrigatória para a correção; a tela já distingue `falha` de `rascunho`.
- **Banco:** nenhuma migration ou exclusão necessária.
- **Integração:** nenhuma nova chamada BTG durante a correção.

# Correção de Dados Existentes

As remessas Sandbox #2 e #30001 foram mantidas e marcadas como `falha` com motivo técnico seguro, sem exclusão, sem tentativa automática e sem emissão BTG.

# Histórico e Auditoria

A correção registra auditoria de falha pré-envio para novos casos. Os lotes históricos #2 e #30001 permanecem preservados como evidência do cenário de homologação.

# Plano de Testes

- Inserção com resultado MySQL direto (`{ insertId }`).
- Inserção com resultado MySQL em tupla (`[{ insertId }, campos]`).
- Falha antes da emissão: lote finalizado como `falha` e nenhuma chamada ao cliente BTG.
- Fluxo normal: itens persistidos antes da emissão.
- RBAC: procedures continuam exclusivas de administrador.
- Regressão: testes BTG, TypeScript e build.

# Plano de Reversão

Reverter apenas a alteração de interpretação do `insertId` e o tratamento de falha pré-envio, mantendo migrations e todos os dados. Não apagar a remessa #2. A reversão exige validação do responsável técnico se testes de regressão falharem.

# Critérios de Aceite

- Um retorno MySQL válido nos dois formatos obtém o ID correto.
- Uma falha de persistência pré-envio não deixa lote em `rascunho`.
- Nenhuma cobrança externa é emitida durante falha de persistência.
- A homologação manual subsequente cria itens, emissão e status final.

# Riscos e Dependências

A nova homologação dependerá do Sandbox BTG estar disponível e de uma parcela de acordo permanecer elegível. A correção não será aplicada em Produção nesta etapa.

# Pendências para Validação

Reexecutar uma nova remessa Sandbox manualmente após testes internos e validar a tela de detalhe.

# Próximos Passos

Executar uma nova tentativa manual no Sandbox, sem reutilizar automaticamente os lotes #2 ou #30001.
