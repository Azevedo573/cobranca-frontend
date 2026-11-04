# Convenção e Regimento até 50 MB — verificação da VPS

> Referência histórica. Em04/11/2026 o usuário ampliou o limite para200 MB e solicitou progresso visual. Para a nova versão, consultar `documentos-condominio-200mb-vps.md`;80m não comporta o transporte de umPDF de200 MB.

## O que mudou no código

Somente **Convenção Condominial** e **Regimento Interno**, em Documentos do Condomínio, passam de 16 MB para **50 MB por PDF** (50 × 1024 × 1024 bytes). Outros uploads mantêm seus limites.

Clique e arraste usam a mesma validação. A API verifica tamanho real decodificado, cabeçalho PDF e condomínio existente, mantendo permissão administrativa. Só troca a URL após sucesso no armazenamento. Não há migration, alteração de parcelas, remessas ou credenciais.

O cliente usa uma mutation tRPC individual. Como o envio é base64, um PDF de 50 MB vira aproximadamente 67 MB de JSON. O Express reserva **80 MB somente nesse endpoint**, autenticando administrador antes do parser; outros endpoints conservam 50 MB, e o webhook BTG conserva corpo bruto de 1 MB.

## Antes de aplicar em Produção

Nenhum comando deste roteiro foi executado na VPS pelo agente. A atualização do código e qualquer alteração de Nginx devem seguir o procedimento orientado com backup, build bem-sucedido e reinício controlado.

Na VPS, examine localmente:

```bash
sudo nginx -t
sudo nginx -T 2>&1 | grep -nE 'server_name|location|client_max_body_size|client_body_timeout|proxy_read_timeout|proxy_send_timeout|proxy_pass'
```

Essa saída é somente leitura. Se for compartilhá-la, confira antes que não contenha valores sensíveis. Não cole a configuração inteira sem revisão.

## Limite necessário no proxy

O limite **efetivo** que atende o upload deve ser no mínimo `80m` para este corpo JSON, não `50m`, pois 50 MB referem-se ao arquivo binário. Se o limite já for maior, não reduzi-lo. Verificar também qualquer proxy/CDN anterior.

A preferência é aplicar `client_max_body_size 80m;` em uma `location` específica para `/api/trpc/condominios.uploadDocumento`, **somente após inspecionar a configuração ativa**. Não criar um bloco genérico às cegas: ele precisa preservar exatamente os headers, protocolo, destino upstream, regras TLS/acesso e `proxy_pass` utilizados pelo restante da API.

Se for mais simples aplicar no `server` existente, avaliar o escopo ampliado no Nginx; o limite da aplicação permanece restrito ao endpoint. Não alterar automaticamente todos os virtual hosts. A escolha depende da configuração encontrada.

Uploads lentos e processamento pelo armazenamento podem exigir `client_body_timeout`, `proxy_send_timeout` e `proxy_read_timeout` adequados, por exemplo 180 segundos, após revisão operacional. Não elevar timeouts globais sem necessidade.

Após uma alteração revisada: guardar cópia do arquivo de configuração, executar `sudo nginx -t` e **somente se passar** `sudo systemctl reload nginx`. Não é necessário executar migrations.

## Teste manual depois do deploy

1. No condomínio de teste, entrar como administrador e enviar um PDF real entre 17 e 50 MB.
2. Testar convenção e regimento, tanto clique quanto arraste, um por vez.
3. Conferir sucesso, abrir o documento e verificar tamanho/conteúdo. Não trocar documentos reais de cliente apenas para testar sem autorização.
4. Confirmar que arquivo acima de 50 MB é recusado. PDF inválido também deve ser recusado; verificação de cabeçalho não substitui antivírus.
5. Em falha de envio, o link anterior deve continuar preservado.

Testes locais de HTTP e armazenamento com mocks não garantem o limite do proxy de storage real. O provedor recebe o PDF binário de até 50 MB mais overhead multipart, e sua capacidade deve ser confirmada com o teste autorizado.

## Diagnóstico de erros

- **413:** Nginx/CDN ou limite de corpo JSON; verificar caminho efetivo, pois uma `location` mais específica pode sobrescrever a regra.
- **401/403:** sessão inválida ou usuário não administrador. Não remover a proteção para contornar.
- **400:** PDF inválido, arquivo vazio, base64 inválido, tamanho excedido ou envio agrupado.
- **502/504:** verificar logs do proxy, PM2 e armazenamento; evitar tentativas automáticas repetidas.
- **Erro de storage:** não concluir que o banco de documentos falhou; revisar resposta do provedor sem expor credenciais nem conteúdo em logs.

## Reversão

Restaurar somente os arquivos de código/configuração alterados, usando o checkpoint anterior 74514462 como referência para o upload. Não restaurar banco nem apagar documentos enviados. Fazer novo build antes do reinício e validar Nginx antes do reload.
