# Ajuste: Documentos do Condomínio até 50 MB

## Objetivo e escopo

Pedido em 04/11/2026: convenção condominial e regimento interno devem aceitar arquivos maiores que 16 MB. Premissa comunicada ao usuário: limite de **50 MB por PDF**, usando 50 × 1024 × 1024 bytes, mantendo limites dos demais módulos. Trata-se de ajuste da capacidade existente, não novo sistema de documentos. Nenhuma alteração de banco ou provedor, permissões permanecem administrativas.

## Contrato e critérios de aceite

- Seleção por clique e arrastar-e-soltar seguem a mesma política: PDF, não vazio, até 50 MB inclusive. Nome .pdf sem distinção entre maiúsculas/minúsculas e MIME compatível; MIME vazio pode ser usado com extensão PDF.
- Validar o tamanho real decodificado e cabeçalho PDF no backend, não confiar somente no navegador. Recusar payload inválido, documento vazio, não PDF e mais de 50 MB antes do storage.
- Exigir administrador e condomínio existente. Atualizar apenas URL da convenção/regimento após armazenamento bem-sucedido, preservando documento anterior em caso de falha; manter auditoria com tipo/tamanho, sem base64.
- 50 MB em base64 excedem o parser JSON global de 50 MB. Reservar parser de **80 MB** apenas para POST /api/trpc/condominios.uploadDocumento, com autenticação administrativa antes de ler corpo grande. Preservar parser global 50 MB e webhook BTG bruto 1 MB.
- Enviar essa mutation tRPC via httpLink individual; todas as outras chamadas mantêm httpBatchLink e cookies. Não adicionar fetch ad hoc de upload nem alterar storagePut.
- Tratar erro/abort de FileReader e prevenir seleção concorrente enquanto um upload estiver em andamento. Atualizar textos de limite no formulário.
- Na VPS, confirmar Nginx com client_max_body_size 80m e timeouts compatíveis; documentar inspeção e alteração manual, sem executar deploy ou recarregar Nginx nesta tarefa.

## Estrutura e estilo

Política pura em shared/documentos-condominio.ts; decodificador em server/condominio-documentos-upload.ts; registro do parser isolado em server/condominio-documentos-http.ts. Formulário, main.tsx e router mantêm tRPC e padrão TypeScript existente. Exemplo: `if (buffer.length > DOCUMENTO_CONDOMINIO_MAX_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo muito grande. Máximo 50 MB." });`.

## Plano e tarefas

1. Testes de política, limite real/assinado e permissão/sem efeitos de storage.
2. Helper compartilhado, backend e guarda de condomínio existente.
3. Parser isolado autenticado e transporte individual, com testes HTTP reais locais sem serviços externos.
4. Unificar handlers e textos do formulário.
5. Testes serial, TypeScript, build; registrar limitações externas e checkpoint.

## Comandos

Executar no projeto: `pnpm exec vitest run server/condominio-documentos*.test.ts --no-file-parallelism --reporter=verbose`; `pnpm exec vitest run --no-file-parallelism --reporter=default`; `pnpm check`; `pnpm build`.

## Estratégia de testes

Vitest no diretório server: rejeitar vazio/não PDF, aceitar 17 MB e 50 MB, recusar 50 MB + 1 byte, ambos os tipos, nomes com extensão maiúscula, MIME incompatível, base64 inválido. Caller tRPC mocka armazenamento/banco, verifica administrador, alvo inexistente, nenhuma troca de URL em falha e tamanho correto em auditoria. Transporte local: requisição de tamanho acima do parser anterior, ausência de autenticação e path diferente não recebem ampliação. Testes não criam documento real nem usam API bancária.

## Limites e reversão

Sempre: preservar documentos existentes e permissões, limite real no servidor e mensagens claras. Nunca: arquivo sem limite, base64 no banco, segredo em log, upload real apenas para teste, remoção de documentos anteriores ou mudança no BTG. Sem dependências novas. Reversão: reverter apenas arquivos deste ajuste ao checkpoint anterior 74514462, sem restaurar banco. Documentos já enviados permanecem acessíveis.

## Riscos e validação pendente

Base64 consome memória adicional, portanto um arquivo por mutation e limite delimitado. Upload depende de limite do proxy de armazenamento, Nginx e rede; testes com mocks/local não comprovam transferência real ponta a ponta em Produção. Deve ser validado pelo usuário com documento >16 MB após atualização orientada da VPS. Não afirmar produção configurada sem evidência.
