# Gestão de documentos — Substituir e Excluir

## Solicitação e diagnóstico

O usuário solicitou, em 04/11/2026, opções de excluir ou substituir a Convenção Condominial e o Regimento Interno. A ação X anterior limpava apenas o formulário. O submit convertia vazio em undefined, sem garantir retirada persistente do vínculo.

## Correção implementada

Na aba **Jurídico → Documentos do Condomínio**, os cartões agora apresentam **Visualizar PDF**, **Substituir PDF** e **Excluir documento**.

Substituição: selecionar PDF válido de até 200 MB, revisar nome/tamanho e confirmar. A URL anterior só é substituída após o upload e a gravação bem-sucedidos. Falha ou cancelamento conserva o documento antigo. A barra real de progresso foi preservada.

Exclusão: confirmar retirada do cadastro, persistir null apenas no campo documental correspondente e atualizar a tela. Não depende de Salvar condomínio. O arquivo físico permanece no armazenamento; a ação não revoga links antigos. Não há exclusão definitiva nem promessa de restauração por interface.

## Segurança e concorrência

A mutation exige administrador, condomínio existente, confirmação true e URL atual esperada. O vínculo é alterado em transação curta com lock de linha. Se outra sessão mudou o documento, a tentativa desatualizada recebe CONFLICT. O upload ocorre fora da transação.

A nova interface não reenvia URLs no salvamento comum do cadastro editado. A atualização direcionada do cache mantém outros campos ainda não salvos. Botões e submit ficam bloqueados durante operações documentais.

## Auditoria

Tipo, condomínio, usuário, operação, URL anterior/nova e tamanho do upload quando disponível. Base64 e conteúdo PDF não são registrados. O logger existente continua sendo de melhor esforço.

## Arquivos

- client/src/components/DocumentoCondominioCard.tsx
- client/src/pages/admin/CondominioForm.tsx
- server/condominio-documentos-persistencia.ts
- server/routers.ts
- server/condominio-documentos-acoes.test.ts
- server/condominio-documentos-persistencia.test.ts
- server/condominio-documentos-card.test.ts

## Validações concluídas

19 testes de actions/persistência e 16 testes de cartão aprovados. TypeScript e build aprovados. Prévia sintética do componente real conferida no navegador; sem upload externo, login bancário ou alterações em documentos reais.

A suíte completa terminou com 560 testes aprovados e 1 teste externo opt-in ignorado (67 arquivos aprovados, 1 ignorado). Não houve falhas. Relatórios locais: `/home/ubuntu/validacoes-documentos-acoes/testes-completos.log` e `build.log` na mesma pasta.

## Sem alterações externas

Nenhuma migration, dependência, ajuste de Nginx/PM2, deploy ou exclusão física. Cobranças, acordos, BTG, valores e permissões de outros módulos não foram alterados.

## Validação manual pendente

Depois da atualização autorizada da VPS, usar apenas documentos de teste:

1. Abrir um condomínio com PDF cadastrado e clicar Substituir PDF.
2. Selecionar PDF pequeno; cancelar e conferir que o antigo permanece.
3. Repetir, confirmar e observar progresso; reabrir o cadastro e verificar o novo PDF.
4. Clicar Excluir documento; cancelar e conferir que continua disponível.
5. Confirmar exclusão; reabrir o cadastro e verificar campo vazio.
6. Digitar outro campo sem salvar, alterar documento e verificar que o texto digitado não foi perdido.
7. Conferir registro de auditoria e bloqueio das ações durante processamento.

O teste externo de exatamente 200 MB permanece separado e pendente, conforme ocorrência anterior. Não é necessário usar arquivo grande para validar substituição e retirada.

## Reversão

Reverter o checkpoint de código se necessário, sem desfazer banco. A mudança não introduz DDL. A retirada já efetuada não deve ser automaticamente revertida no banco: se for preciso recuperar vínculo, utilizar histórico/auditoria com autorização administrativa e sem alterar outros dados.
