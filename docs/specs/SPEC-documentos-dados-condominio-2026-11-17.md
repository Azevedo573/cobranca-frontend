# Resumo da Demanda

Preencher as variáveis do condomínio no fluxo `/modelos-documento/:id/preencher` com dados do cadastro selecionado, incluindo a página relatada `/modelos-documento/1/preencher`. História de usuário: como profissional autorizado, quero selecionar o condomínio, revisar seus dados já preenchidos e gerar o documento sem redigitar informações cadastrais.

Especificação aprovada pelo usuário em 17/11/2026 às 13:47. Implementação ainda não iniciada; plano técnico em revisão. Premissas propostas: aplicar a melhoria aos modelos atendidos por essa tela, manter os valores editáveis e não modificar cadastros nem documentos históricos. Não foi consultado o conteúdo do modelo #1 na VPS.

# Classificação

Melhoria funcional de documentos. Prioridade sugerida: média; complexidade média pelo controle de seleção, edição e autorização. Não é automação agendada nem integração bancária.

# Problema Atual

O código da tela preenche `condominio`, advogado responsável, OAB, vara e comarca após selecionar um condomínio. Não preenche `nomeCondominio`, `cnpjCondominio` ou `enderecoCondominio`, embora o editor já ofereça essas variáveis. O seletor depende da presença de `condominio`; um modelo que usa apenas `nomeCondominio` pode ficar sem seleção adequada. O efeito atual também pode reaplicar dados sobre edições e conservar valores do condomínio anterior quando faltam informações no novo cadastro.

# Solução Proposta

Disponibilizar um seletor de condomínio independente do nome da variável. Ao selecionar, carregar somente os dados autorizados necessários ao documento, preencher os campos presentes no modelo e atualizar a pré-visualização. Permitir revisão e alteração manual antes de imprimir ou gerar PDF.

Manter compatibilidade entre `{{condominio}}` e `{{nomeCondominio}}` para nome, sem reescrever modelos antigos. Disponibilizar variáveis adicionais no editor para os demais campos cadastrais.

# Escopo

| Variável | Fonte cadastral | Regra |
|---|---|---|
| `condominio`, `nomeCondominio` | `name` | Mesmo nome cadastrado; preservar as duas chaves existentes. |
| `cnpjCondominio` | `cnpj` | Usar o CNPJ cadastrado; não criar ou corrigir número automaticamente. |
| `enderecoCondominio` | `address`, `addressNumber`, `addressComplement`, `neighborhood`, `city`, `state`, `zipCode` | Compor endereço completo com apenas componentes existentes e separadores consistentes. |
| `logradouroCondominio`, `numeroCondominio`, `complementoCondominio`, `bairroCondominio`, `cidadeCondominio`, `ufCondominio`, `cepCondominio` | Respectivos componentes acima | Novas variáveis opcionais para documentos que precisam das partes separadas. |
| `telefoneCondominio`, `emailCondominio` | `phone`, `email` | Novas variáveis opcionais de contato. |
| `nomeGestorCondominio`, `emailGestorCondominio` | `managerName`, `managerEmail` | Novas variáveis com rótulos Síndico/Gestor ou Responsável, conforme o tipo cadastrado; sem comprovar representação legal. |
| `advogadoResponsavel`, `oabAdvogado`, `varaCompetente`, `foroComarca` | `juridicoAdvogadoResponsavel`, `juridicoAdvogadoOAB`, `juridicoVaraCompetente`, `juridicoForoComarca` | Preservar o preenchimento jurídico existente com as novas proteções de edição e troca. |

Preencher somente dados utilizados pelo modelo, evitando expor ou transportar cadastro inteiro. Endereço será composto, não apenas o logradouro.

# Fora do Escopo

Não inferir representante legal, assinatura, preposto, CPF pessoal, número de processo, tipo de ação, dados de devedor ou valores financeiros a partir do cadastro do condomínio. `representanteLegal`, `assinatura` e `nomeResponsavel` permanecem manuais nesta proposta, por terem significado diferente ou ambíguo.

Não modificar boletos, acordos, quitações, permissões concedidas, cadastros, PDFs já gerados ou modelos antigos. Não fazer deploy, DDL, importação ou alteração de equipe nesta fase. Não prometer revogação de links públicos de PDFs que já existem.

# Módulos Impactados

Preenchimento de modelos, catálogo do editor, contrato de obtenção de dados para documentos e consistência entre pré-visualização, impressão e PDF. Cadastro de condomínios é fonte de leitura, sem gravação.

# Regras de Negócio

1. O cadastro selecionado deve ser autorizado para o usuário e compatível com o vínculo do modelo. Um modelo compartilhado permite escolha dentre os condomínios autorizados; um modelo vinculado não pode ser preenchido silenciosamente com outro condomínio.
2. Campos ausentes permanecem vazios e são identificados como “Não informado no cadastro”. Nunca herdar dados do condomínio anterior ou preencher valores fictícios.
3. Edição manual prevalece na mesma seleção. Recarregamento, cache ou chegada tardia de consulta não pode sobrescrevê-la.
4. Ao trocar condomínio, atualizar os campos vinculados à fonte. Se existirem edições manuais nesses campos, confirmar antes da troca; cancelar conserva o documento atual. Confirmar a troca substitui esses campos pelo novo cadastro, limpando os ausentes. Campos independentes não são alterados automaticamente.
5. Descartar respostas antigas após troca de seleção, mudança de usuário ou perda de acesso. Não salvar dados em armazenamento persistente do navegador.
6. Tratar valores cadastrais e editados como texto, não como HTML executável; preservar a formatação do modelo. Prévia, impressão e PDF devem apresentar os mesmos valores revisados.
7. Não obter dados pessoais do síndico de outro cadastro por coincidência de nome. O gestor cadastrado não é prova de representação legal.
8. Não gerar documento automaticamente ao selecionar. O profissional deve revisar e acionar a geração.
9. Não permitir impressão/geração enquanto a fonte escolhida estiver carregando, sem acesso, incompatível ou com erro. Variáveis sem preenchimento devem ser apontadas para revisão antes da conclusão, sem inventar uma obrigatoriedade legal para todos os campos.

# Fluxo da Funcionalidade

Abrir modelo → determinar vínculo autorizado → selecionar condomínio (ou pré-selecionar o vínculo próprio autorizado) → carregar dados mínimos → preencher variáveis existentes → revisar campos ausentes e edições → conferir prévia → gerar PDF ou imprimir.

Para modelo sem vínculo e mais de um condomínio disponível, exigir seleção explícita quando forem utilizadas variáveis do condomínio. Não escolher o primeiro item da lista silenciosamente.

# Telas e Experiência do Usuário

Manter o layout atual e a identidade visual do Luminus. Incluir seção “Dados do condomínio”, seletor com nome cadastrado e ID como identificação auxiliar, rótulos amigáveis e indicação “Preenchido pelo cadastro”. Os campos de documento continuam editáveis e os ausentes recebem aviso discreto.

Estados previstos: modelo carregando, seleção pendente, cadastro carregando, dados preenchidos, cadastro incompleto, alteração manual, confirmação de troca, acesso negado e falha de consulta. Mensagens sugeridas: “Revise os dados antes de gerar o documento”, “Este campo não está informado no cadastro” e “Trocar o condomínio substituirá os campos vinculados ao cadastro, incluindo os que você editou”.

# Dados e Banco de Dados

Os campos propostos já existem em `condominios`; não é necessária migração para este escopo. Os nomes adicionais são variáveis do documento, não colunas novas. Não consultar ou devolver `username`, `password`, configurações bancárias, taxas, URLs privadas ou observações não utilizadas.

# Permissões

Usar identidade atual e os controles existentes de carteira e documento. A escolha “Todos os condomínios” não substitui permissões do perfil. Não tornar `condominios.getById`, atualmente administrativo, acessível indiscriminadamente; preferir um contrato específico de leitura mínima autorizado para o preenchimento. Revalidar o vínculo do modelo e o condomínio no servidor na operação documental quando o novo contexto for informado.

# Integrações e Automações

Somente leitura interna por tRPC. Nenhuma API bancária, serviço externo, agendamento, IA ou busca pública é necessária. PDFs de produção não serão gerados durante a análise.

# Histórico e Auditoria

Preservar PDFs existentes. Edição de variável muda apenas a instância em preenchimento, não o cadastro nem o modelo. Caso seja acrescentado registro de geração/consulta, usar o padrão do projeto com ator, modelo, condomínio, momento e resultado, sem guardar conteúdo pessoal integral ou credenciais. Não incluir nova tabela de auditoria neste escopo sem aprovação adicional.

# Critérios de Aceite

- Dado modelo com `nomeCondominio`, quando selecionar condomínio autorizado, então nome, CNPJ e endereço presentes no modelo são preenchidos sem precisar adicionar `condominio`.
- Dado modelo antigo com `condominio`, quando selecionar condomínio, então o preenchimento continua funcionando sem editar o modelo.
- Dado endereço composto completo ou parcial, quando preencher, então não aparecem `null`, `undefined`, separadores duplicados ou componentes inventados.
- Dado campo alterado manualmente, quando houver atualização da mesma consulta, então a edição permanece.
- Dado condomínio A preenchido, quando trocar para B sem CNPJ/OAB, então valores de A não permanecem nesses campos; havendo edição vinculada, a troca exige confirmação.
- Dada resposta tardia de A, quando a seleção atual é B, então os dados de A são descartados.
- Dado condomínio fora da carteira ou diferente do vínculo do modelo, quando tentar obter/preencher/gerar pelo novo contrato, então o servidor nega antes de devolver dados ou produzir PDF.
- Dado gestor cadastrado, quando preencher documento com `representanteLegal`, então não atribuir representação legal automaticamente.
- Dado texto cadastral com caracteres especiais, quando revisar/imprimir/gerar PDF, então aparecer como texto e não executar HTML; valores revisados devem coincidir nos três meios.
- Dado PDF antigo, quando o cadastro for alterado, então o arquivo existente permanece intacto.

# Tarefas Técnicas

Especificação proposta, não plano de implementação já aprovado.

Front-end: ampliar catálogo e rótulos; desacoplar seletor das aliases; controlar fonte, campos editados, carga e confirmação de troca. Back-end: definir DTO mínimo de variáveis, validar modelo/carteira e manter contrato legado da geração para consumidores que não participam do novo fluxo. Banco: nenhuma alteração. Testes: helpers de mapeamento/endereço, transições de seleção/edição, aliases, campos ausentes, respostas tardias, autorização e regressões de preview/PDF.

Estrutura esperada: tela em `client/src/pages/PreencherModeloJuridico.tsx`; catálogo em `client/src/pages/ModeloEditor.tsx` e `server/modelo-pdf.ts`; contrato tRPC em `server/routers.ts` ou router/helper documental próprio; testes Vitest em `server/*.test.ts`; helpers puros compartilhados quando adequados.

Padrão: TypeScript, React e tRPC existentes; mapeamento explícito, sem `any` de cadastro completo e sem interpolar valores como markup. Exemplo ilustrativo, não código implementado:

```ts
const dadosDocumento = {
  nomeCondominio: cadastro.name ?? "",
  cnpjCondominio: cadastro.cnpj ?? "",
};
```

Comandos previstos para a futura implementação: `pnpm check`; `pnpm exec vitest run server/modelo-condominio-preenchimento.test.ts --no-file-parallelism` (nome proposto para a nova suíte, a criar no plano); `BTG_SANDBOX_CREDENTIAL_CHECK=false DATABASE_URL='' pnpm exec vitest run --no-file-parallelism`; `pnpm build`; `git diff --check`. Desenvolvimento usa `pnpm dev`; não iniciar outro servidor sem necessidade.

Sempre preservar campos manuais, usar dados fictícios em testes e revisar o diff. Pedir aprovação adicional para schema, dependências, redefinição de dados ou produção. Nunca conceder acesso, obter credenciais, gerar documento real ou corrigir cadastro financeiro implicitamente.

# Riscos e Dependências

Principais riscos: mistura entre condomínios, sobrescrita de edição, divergência de aliases, exposição excessiva de cadastro e interpretação incorreta do gestor como representante legal. Mitigações estão nas regras acima. Modelos podem usar nomes de variáveis fora do catálogo; essas variáveis continuam manuais até um mapeamento explícito, sem correspondência por aproximação.

Reversão futura: remover a nova versão de preenchimento ou restaurar o build anterior, preservando cadastros, documentos e fontes históricos. Não requer rollback de banco. Logs, armazenamento público e geração documental existentes têm limites próprios que não devem ser anunciados como resolvidos por esta melhoria.

# Pendências para Validação

Proposta e premissas de edição/troca aprovadas; pendente revisão do plano técnico. Se for desejado que `representanteLegal` receba automaticamente o gestor, é necessária decisão explícita de regra jurídica; a recomendação inicial é manter manual. Nenhuma inspeção da VPS, teste novo, código, checkpoint ou deploy desta funcionalidade foi realizado.

# Próximos Passos

Especificação salva no projeto após aprovação. Revisar o plano/tarefas de implementação com arquivos e testes exatos antes de iniciar código. Implementar no desenvolvimento após os gates correspondentes. Publicação na VPS e qualquer geração real exigem etapa separada; não misturar com reparo de usuários, BTG ou Central Jurídica.
