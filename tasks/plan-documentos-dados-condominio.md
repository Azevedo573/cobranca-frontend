# Plano — preenchimento de documentos com dados do condomínio

Especificação: `docs/specs/SPEC-documentos-dados-condominio-2026-11-17.md`, aprovada em 17/11/2026 às 13:47. Plano, tarefas e início da implementação no desenvolvimento aprovados em 17/11/2026 às 13:54. Retomada em 23/11 após interrupção, com arquivos em andamento recuperados e sem presumir conclusão. Escopo único: vincular o cadastro autorizado ao preenchimento, com edição manual e PDF consistente. Sem migration, alteração de cadastros, dependências, credenciais, documentos antigos ou VPS.

## Arquitetura e ordem

`catálogo/mapeamento → leitura autorizada → estado de preenchimento → tela → geração contextual → validação/checkpoint`.

O catálogo de variáveis de condomínio ficará em helper compartilhado e alimentará editor, preenchimento e catálogo do PDF; demais categorias permanecem inalteradas. O endereço será composto com as partes disponíveis. O gestor terá variáveis próprias e não alimentará `representanteLegal`, `assinatura` ou `nomeResponsavel` automaticamente.

Criar duas queries específicas em `modelosDocumento`: `listarCondominiosPreenchimento({modeloId})` para seletor mínimo e `obterDadosPreenchimento({modeloId, condominioId})` para valores relevantes ao modelo. Reutilizar carteira fresca de `tenant-guard.ts` e validação do modelo; verificar vínculo inclusive para legado, roles admitidos na tela e permissão `modelos_documento:visualizar`. Não abrir `condominios.getById` administrativo nem devolver cadastro inteiro.

Detalhe de implementação dentro da validação prevista: `validarPreenchimento({modeloId,condominioId:number|null})` confirma o contexto antes da impressão local e retorna apenas `{autorizado:true}`. Não repopula valores revisados, não devolve cadastro/modelo, não renderiza nem armazena PDF. A geração contextual reconfirma o acesso antes do render e novamente antes do storage.

A interface utilizará tRPC e um estado controlado por identidade/modelo/condomínio, com origem de cada campo, revisão de consulta e marcação de edição manual. Seleção de modelo vinculado será autorizada e pré-selecionada; modelo compartilhado exigirá seleção explícita quando houver variáveis condominiais. Respostas tardias não alteram a seleção atual. Troca com edição vinculada exige confirmação; não conservar campos de A quando B não os possui.

Na geração, acrescentar contexto opcional tipado indicando o condomínio e o novo modo de preenchimento. Revalidar acesso/vínculo no servidor antes de renderizar ou armazenar; usar os valores que o profissional revisou, sem trocá-los por uma nova consulta. No novo modo, substituir valores como texto seguro e usar a mesma regra na prévia/impressão/PDF. Chamadas antigas sem o novo contexto mantêm o contrato existente, inclusive tabela HTML de parcelas do `GerarDocumentoModal` e prévia do editor. Não anunciar correção retroativa dos limites do ramo legado.

## Tarefas revisáveis

### 1. Catálogo e mapeamento puro

- [x] Definir variáveis, aliases, endereço parcial/completo e detecção consistente de placeholders.
- Aceite: `condominio`/`nomeCondominio` compatíveis; campos ausentes vazios; gestor sem presunção legal; nenhuma variável financeira derivada do cadastro.
- Arquivos: `shared/modelo-condominio.ts` (novo), `server/modelo-condominio-preenchimento.test.ts` (novo).
- Verificar: `pnpm exec vitest run server/modelo-condominio-preenchimento.test.ts --no-file-parallelism`.

### 2. Leitura autorizada mínima

- [x] Implementar DTO e duas queries de leitura com filtro aplicado antes de devolver dados.
- Aceite: usuário atual com perfil autorizado; somente carteiras válidas; modelo vinculado não admite outra fonte; ausência/inatividade/falha negadas sem dados pessoais ou credenciais na resposta de erro.
- Arquivos: `server/modelo-condominio-dados.ts` (novo), `server/routers.ts`, `server/modelo-condominio-dados.test.ts` (novo).
- Verificar: `pnpm exec vitest run server/modelo-condominio-dados.test.ts server/tenant-guard.test.ts server/tenant-escopo-condominios.test.ts --no-file-parallelism`.

### 3. Estado de seleção e edição

- [x] Implementar helper de transições sem dependência de browser ou banco.
- Aceite: edição manual prevalece na mesma seleção, troca cancelada conserva estado, troca confirmada substitui vinculados/limpa ausentes e descarta resposta antiga; trocar modelo/identidade limpa contexto privado. Campo independente não é sobrescrito.
- Arquivos: `client/src/lib/modelo-condominio-form.ts` (novo), `server/modelo-condominio-form.test.ts` (novo).
- Verificar: `pnpm exec vitest run server/modelo-condominio-form.test.ts --no-file-parallelism`.

### 4. Tela e catálogo visível

- [x] Integrar seletor sempre disponível quando o modelo usa variáveis do condomínio; rótulos amigáveis, origem, avisos, confirmação de troca e bloqueio durante carga/erro.
- Aceite: modelo com apenas `nomeCondominio` funciona; manual permanece editável; gestor/representante distinguidos; layout e campos jurídicos existentes mantidos; não chamar geração na seleção.
- Arquivos: `client/src/pages/PreencherModeloJuridico.tsx`, `client/src/pages/ModeloEditor.tsx`, `server/modelo-pdf.ts` (catálogo), `server/modelo-condominio-tela.test.ts` (novo).
- Verificar: `pnpm exec vitest run server/modelo-condominio-tela.test.ts server/modelo-condominio-form.test.ts --no-file-parallelism`; inspeção da tela real com dados/callbacks fictícios sem cadastro, geração ou e-mail reais.

### 5. Consistência documental e contexto de geração

- [x] Integrar o novo contexto opcional de geração e substituição textual segura; sinalizar variáveis pendentes para revisão.
- Aceite: acesso conferido antes de produzir PDF/storage; valores humanos revisados iguais na prévia, impressão e PDF; caracteres especiais e trechos semelhantes a HTML permanecem texto; chamadas antigas e tabela de parcelas preservadas.
- Arquivos: `shared/modelo-condominio.ts`, `server/modelo-pdf.ts`, `server/routers.ts`, `client/src/pages/PreencherModeloJuridico.tsx`, `server/modelo-condominio-geracao.test.ts` (novo).
- Verificar: `pnpm exec vitest run server/modelo-condominio-geracao.test.ts server/escopo-documentos-consumidores.test.ts --no-file-parallelism`; PDF sintético local, sem storage público ou emissão real.

### 6. Regressão, documentação e entrega

- [x] Conferir critérios da spec, tipos/build/diff, testes completos, remover fixtures temporárias e preparar documentação/entrega para checkpoint. Salvar a versão validada após finalizar esses registros.
- Verificar: `pnpm check`; `BTG_SANDBOX_CREDENTIAL_CHECK=false DATABASE_URL='' pnpm exec vitest run --no-file-parallelism`; `pnpm build`; `git diff --check`.
- Banco externo e BTG real desligados nos testes. Não excluir testes falhos para aprovar a suíte.
- Arquivos documentais: spec, este plano, `todo.md` e guia final em entregas; evidências locais sem dados de produção.

Resultados efetivos: seis arquivos novos/222 testes da melhoria; 305 focados/9arquivos aprovados23/11. Em24/11, TypeScript/build/diff e suíte serial final com3.578 testes/147 arquivos aprovados; um teste/arquivo BTG externo opt-in ignorado. Build mantém apenas aviso de bundles grandes. Página real inspecionada com queries e geração/impressão fictícias: edição e refetch, troca cancelada/confirmada, Beta sem CNPJ/OAB/gestor, revisão de vazios, fonte perdida removida e identidade nova limpa. Desktop/móvel390px; PDF sintético local de uma página inspecionado e extraído. Duas fixtures temporárias removidas antes do check/build final. Nenhum banco, InnoDB real, storage, documento real, concessão de perfil ou operação BTG usado.

Falhas encontradas durante desenvolvimento não foram ignoradas: teste JSX precisou import React para Vitest; assert disabled foi ajustado para atributo real, não classe CSS; divergência de caixa em variáveis manuais no modo PDF foi capturada por teste RED e corrigida usando a mesma normalização do shared. Contrato antigo permaneceu sem essa alteração. A suíte final não teve falhas ou erros não tratados.

## Paralelismo e limites

Após aprovar o plano, backend de leitura autorizada e helper de formulário podem avançar em paralelo depois de fixar o catálogo/DTO. A integração final e `server/routers.ts` terão responsável único para evitar edições concorrentes. Testes podem ser escritos independentemente com dados fictícios e contratos definidos.

Nenhuma tarefa inclui schema, migração, cadastro real, perfil novo, alteração de autorização em lote, envio de documento, assinatura ou deploy. Se a revisão exigir qualquer ampliação desses limites, atualizar a especificação e solicitar aprovação antes de executá-la.

## Reversão e produção

Reversão técnica: restaurar a versão anterior da aplicação, preservando dados e PDFs. Sem rollback de banco. Após validar o desenvolvimento, entregar versão fixa e roteiro de VPS somente em etapa autorizada separadamente. Não misturar com o reparo de `userCondominios`, a Central Jurídica ou operações BTG.
