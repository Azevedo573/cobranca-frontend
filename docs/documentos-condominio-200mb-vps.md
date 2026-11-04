# Documentos do Condomínio: 200 MB e progresso — roteiro da VPS

## Alteração validada no desenvolvimento

Convenção Condominial e Regimento Interno aceitam **200 MB por PDF**, inclusive (200 × 1024 × 1024 bytes). Outros uploads conservam seus limites. Não há migration ou mudança de provedor, usuários, boletos ou BTG. **A VPS não foi alterada nesta implementação.**

A barra informa **Preparando PDF**, **Enviando PDF**, **Salvando documento** e **Documento enviado**. Preparação usa eventos reais de leitura local; envio usa bytes transmitidos pelo XMLHttpRequest dentro do transporte tRPC isolado. Os callbacks ficam no cliente, não nos headers/JSON. Durante armazenamento, a barra é indeterminada e não informa sucesso antes do retorno do servidor. Mostra nome, tamanho e erros; impede uploads simultâneos no formulário e salvamento concorrente do cadastro.

Validação concluída: 40 testes específicos de documentos; suíte completa com **525 testes aprovados e 1 teste externo opt-in ignorado**, TypeScript e build aprovados. O teste HTTP local recebeu corpo equivalente a 200 MB, sem usar storage externo. A inspeção visual utilizou o componente real com estados fictícios. Isso **não comprova** capacidade ponta a ponta de 200 MB na VPS/provedor.

## Limites por camada

| Camada | Limite/observação |
| --- | --- |
| Arquivo PDF | 209.715.200 bytes, validado no navegador e no backend |
| Base64 máximo | 279.620.268 caracteres, aproximadamente 267 MB antes do JSON |
| Express: mutation de documentos | 300 MB JSON; administrador autenticado antes do parser; sem batch |
| Demais parsers Express | 50 MB, sem ampliação |
| Webhook BTG | 1 MB bruto, sem alteração |
| Nginx/CDN da aplicação | Corpo efetivo compatível com `300m`, após inspeção |
| Storage | Recebe 200 MB binários + multipart; limite externo precisa ser confirmado |
| Cliente do upload | Orçamento de 10 minutos para a requisição; sem reenvio automático |

200 MB de PDF **não equivalem a 200 MB de corpo HTTP**. O pipeline base64/JSON/Buffer/Blob usa múltiplas cópias e exige memória adicional. A trava no formulário não impede uploads de outras abas ou administradores; não garante capacidade sob concorrência. O runtime Node/PM2 precisa ser observado em homologação autorizada. Não prometer 200 MB ponta a ponta somente porque os testes locais passaram.

## Pré-checagem somente leitura

Antes de atualizar a VPS, confirme backup, branch/commit e arquivos locais pelo procedimento de operação existente. Para inspecionar Nginx sem modificar:

```bash
sudo nginx -t
sudo nginx -T 2>&1 | grep -nE 'server_name|location|client_max_body_size|client_body_timeout|proxy_read_timeout|proxy_send_timeout|proxy_pass'
```

Revise a saída antes de compartilhá-la. Não divulgar configuração completa ou credenciais. Verifique proxies/CDNs anteriores e o limite efetivo da location de upload.

## Configuração, quando a implantação for autorizada

Preferência: `client_max_body_size 300m;` no caminho específico `/api/trpc/condominios.uploadDocumento`, **sem criar location às cegas**. Preservar destino upstream, `proxy_pass`, headers, TLS e regras de acesso existentes. Limite já maior não deve ser reduzido sem avaliação. Aplicar no server inteiro somente após revisão consciente: Express continuará restringindo os demais caminhos, mas o proxy terá escopo maior.

Avaliar `client_body_timeout`, `proxy_send_timeout` e `proxy_read_timeout`, além dos limites dos proxies anteriores, para a rede e o processamento esperado. O cliente deste upload espera até 600 segundos; timeouts de Nginx devem ser revisados em conjunto, não copiados globalmente. Configurar Node/PM2 e armazenamento conforme recursos medidos; não desativar limites ou segurança.

Guardar cópia da configuração. Após edição revisada, executar `sudo nginx -t`; somente se passar, recarregar com `sudo systemctl reload nginx`. Atualizar código/build/restart da aplicação usando o roteiro normal e o checkpoint informado na entrega. **Não executar drizzle-kit migrate/push para essa mudança.**

## Homologação real autorizada

1. Usar condomínio de teste sem substituir documento de cliente indevidamente. Enviar um PDF real acima de 50 MB e depois um de 200 MB exatos, um por vez.
2. Conferir fases e percentual: leitura local e envio HTTP distintos; transmissão a 100% aguarda armazenamento. Sem total conhecido, indicador indeterminado.
3. Confirmar o link final, abrir o PDF e comparar tamanho/conteúdo ou hash. Resposta de sucesso não substitui a conferência da integridade do arquivo salvo.
4. Testar clique e arraste para Convenção e Regimento; recusar 200 MB + 1 byte e PDF inválido.
5. Em falha, a URL persistida anterior deve permanecer. Em erro/timeout, verificar o registro antes de repetir: o servidor pode ter concluído a operação mesmo que a resposta se perca.
6. Observar memória Node/PM2, logs sem conteúdo PDF e eventuais limites de storage/CDN. Testes locais sem provedor real não substituem estes passos.

## Erros comuns

| Sintoma | Verificação |
| --- | --- |
| 413 | Nginx/CDN, parser específico e envio sem batch; arquivo deve respeitar 200 MB |
| 401/403 | Sessão/admin; não remover guarda para contornar |
| 400 | PDF, base64 ou tamanho inválido; payload individual |
| 502/504/timeout | Proxy, Node/PM2 ou armazenamento; consultar registro antes de repetir |
| Barra em Salvando | Transmissão terminou, resposta ainda pendente; armazenamento não expõe percentual neste pipeline |
| Falha de storage | Verificar capacidade externa sem expor dados ou credenciais |

## Reversão

Voltar os arquivos deste ajuste ao checkpoint **3ae12f11** e restaurar somente a configuração Nginx eventualmente modificada. Fazer build bem-sucedido e reinício controlado. Não restaurar banco nem apagar documentos enviados: links anteriores permanecem válidos. O roteiro antigo de 50 MB é referência histórica, não a configuração necessária para 200 MB.
