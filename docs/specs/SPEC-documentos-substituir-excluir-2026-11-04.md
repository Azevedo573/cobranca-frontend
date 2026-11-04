# Resumo da Demanda

Permitir substituir e excluir a Convenção Condominial e o Regimento Interno diretamente na aba Jurídico do cadastro do condomínio. História: como administrador, quero trocar ou retirar um documento com confirmação, sem perder o arquivo vigente quando o envio falhar.

# Classificação

Melhoria localizada da gestão documental; prioridade média, complexidade pequena/média. Solicitada pelo usuário em 04/11/2026. Mantém a política de acesso e armazenamento existente.

# Problema Atual

O botão X limpa somente o estado do formulário. O submit converte a URL vazia em undefined, portanto o vínculo pode continuar no banco. Não há ação explícita de substituição enquanto existe documento.

# Solução Proposta

Ações Visualizar PDF, Substituir PDF e Excluir documento. Excluir é retirada lógica do vínculo do cadastro, não eliminação física no armazenamento. A operação é imediata e confirmada, independente de Salvar cadastro. Substituir abre a seleção, revisa o arquivo e confirma antes de começar o envio com a barra existente. A URL atual permanece utilizável até o sucesso.

# Escopo

Convenção e Regimento, limite PDF de 200 MB, confirmação, persistência nula da retirada, histórico de URLs na auditoria e mensagens de sucesso/erro. Reutilizar tRPC, Progress e AlertDialog existentes, sem dependências.

# Fora do Escopo

Exclusão física de objetos, sistema completo de versões/restauração, upload streaming, mudança de infraestrutura, documentos de outros módulos e deploy automático. A disponibilidade de links antigos no armazenamento não é revogada por esta ação.

# Módulos Impactados

CondominioForm, cartão documental compartilhado, router de condomínios, helper documental de persistência, testes e documentação.

# Regras de Negócio

Somente administrador autenticado, conforme upload atual. Condomínio precisa existir. Não limpar URL antes do upload. Não alterar cadastro inteiro para retirar um documento. Recusar remoção de URL diferente da exibida (documento alterado por outra sessão). Não enviar URLs de documentos novamente no submit comum da interface editada. Não permitir ações documentais ou salvamento concorrentes na mesma tela.

# Fluxo da Funcionalidade

Substituir: selecionar PDF válido → confirmar nome/tamanho → enviar com progresso → salvar nova URL → atualizar tela/cache. Cancelamento ou falha mantém URL anterior. Excluir: confirmar documento/condomínio → mutation administrativa → persistir null no campo correspondente → atualizar tela/cache. Falha mantém cartão e exibe erro. A retirada de um documento ausente não modifica outros campos.

# Telas e Experiência do Usuário

Aba Jurídico, seção Documentos. Cartões consistentes com o visual atual, ações nomeadas e responsivas, navegação por teclado, confirmação com foco acessível, botão em processamento. A confirmação explica que o arquivo físico histórico será preservado. Formulário novo continua exigindo salvar antes do upload. Barra real de preparação/envio/gravação mantida.

# Dados e Banco de Dados

Reutilizar juridicoConvencaoUrl e juridicoRegimentoUrl nullable. Nenhuma migration. Remoção compara a URL atual ao valor esperado antes de atualizar somente a coluna documental. Campos financeiros, jurídicos e outras configurações não são alterados.

# Permissões

adminProcedure no backend e controles administrativos na interface. Não ampliar síndico, advogado ou colaborador. Testar sessão ausente, papéis não administrativos e condomínio inexistente.

# Integrações e Automações

Mesmo storagePut com chave única na substituição; nenhuma chamada de exclusão física nem alteração em BTG, Nginx ou PM2. Sem automação.

# Histórico e Auditoria

Registrar tipo, operação, usuário, condomínio, URL anterior/nova e tamanho quando disponível. Não armazenar base64 ou conteúdo do PDF na auditoria. Reutilizar o logger existente (melhor esforço).

# Critérios de Aceite

- Dado documento salvo, quando cancelar qualquer confirmação, então nenhuma mutation é disparada.
- Dado substituição, quando upload falhar, então URL antiga e formulário permanecem utilizáveis.
- Dado exclusão confirmada, quando mutation tiver sucesso, então o campo fica null e a retirada continua após reabrir o cadastro.
- Dado documento alterado em outra sessão, quando tentar retirar a URL antiga, então retornar CONFLICT sem apagar o atual.
- Dado upload/exclusão em andamento, quando clicar outra ação ou Salvar, então bloquear concorrência.
- Dado alteração de outros campos não salva, quando documento mudar, então não descartar essas alterações.
- Dado qualquer operação documental, então não modificar cobranças, acordos, limite ou arquivos físicos históricos.

# Tarefas Técnicas

1. Backend: remoção administrativa com validação e auditoria; auditar substituição no upload existente.
2. Frontend: cartão compartilhado e confirmações, mutation de retirada, estado de processamento e atualização direcionada de cache.
3. Banco: nenhum DDL; leitura e atualização documental somente quando acionadas pelo usuário.
4. Testes: callers tRPC, falha de storage, conflito, persistência, UI/estado e regressões de progresso.
5. Documentação: checklist concluído e pendências de homologação/VPS.

Comandos: `pnpm exec vitest run --no-file-parallelism`, `pnpm check`, `pnpm build`. Não editar framework, vendors, segredos ou dependências. Código React/TypeScript e shadcn; testes Vitest em server/*.test.ts. Exemplo: `await logAudit(ctx, { action: "update", entity: "condominio", condominioId: input.condominioId, metadata: { operacaoDocumento: "excluir" } });`.

# Riscos e Dependências

Upload base64 mantém consumo elevado de memória; teto PM2 de 4 GiB aplicado pelo usuário, teste máximo externo ainda pendente. O armazenamento é público no modelo atual: retirar vínculo não invalida URL histórica. Falha posterior à gravação de storage pode deixar objeto não vinculado. Não repetir uploads automaticamente.

# Pendências para Validação

Teste manual das novas ações no desenvolvimento e, após deploy autorizado, na VPS. Nenhum documento real será substituído/excluído pelo agente para testar.

# Próximos Passos

Implementar esta melhoria localizada, executar testes/typecheck/build, salvar checkpoint e orientar validação. Não executar novo deploy ou upload real durante a implementação.
