# Gate 2 — API BTG em Produção após Homologação

## Objetivo
Preparar a API BolePix BTG v2 para Produção, mantendo a emissão real bloqueada até que um administrador conclua os pré-requisitos e faça a liberação explícita.

## Decisão registrada
CNAB permanece habilitado como fluxo bancário homologado. A API BTG será uma trilha complementar para parcelas de acordo, inicialmente sem substituir CNAB. Produção só poderá emitir após homologação bancária e ativação administrativa auditada.

## Pré-requisitos de Produção
1. `BTG_SANDBOX=false`, Client ID, Client Secret, Company ID, Redirect URI HTTPS e chave de criptografia cadastrados no cofre seguro de Produção.
2. Aplicativo BTG de Produção com Collections habilitado, OAuth concluído e tokens cifrados no backend. Accounts é exigido para consulta oficial; pode ser desativado explicitamente no caminho manual aprovado em 05/11/2026.
3. Conta recebedora obtida pela API oficial ou cadastrada como `manual_producao` com confirmação administrativa/CNPJ do escritório, vinculada ao condomínio. Conta `manual_sandbox` continua proibida em Produção.
4. `BTG_WEBHOOK_SECRET` contendo o segredo cadastrado no webhook BTG (não o Client Secret nem access token OAuth), callback HTTPS configurado no BTG e teste de `Authorization: Bearer <webhook secret>`/deduplicação aprovado. A presença local da variável não comprova cadastro, entrega ou homologação.
5. Emissão, consulta, cancelamento e pagamento integral homologados com acordo de teste e evidência registrada.

## Regras de segurança
- Produção inicia com `emissaoHabilitada=0`.
- Somente `adminProcedure` pode alterar integração, vincular conta, liberar ou desabilitar emissão.
- Liberação exige confirmação textual explícita, OAuth conectado, conta elegível ativa e webhook configurado. Conta manual de Produção requer confirmação administrativa registrada e CNPJ igual ao da integração atual; não é classificada como validada pela API.
- Cada emissão exige acordo ativo, parcela elegível, vínculo condomínio→conta e idempotência persistida.
- CNAB e BolePix não podem emitir para a mesma parcela; o vínculo já existente ao fluxo CNAB bloqueia a API BTG.
- O pagamento webhook/API só é aplicado quando a autenticação `Authorization: Bearer <webhook secret>`/consulta é válida e o valor integral coincide; pagamento parcial segue revisão manual, como o CNAB.

## Critérios de aceite
- Dado ambiente Produção sem ativação, quando o administrador tentar emitir, então a operação é bloqueada sem chamada ao BTG.
- Dado ambiente Produção homologado e ativado, quando uma parcela elegível de acordo é emitida, então o sistema grava reserva/idempotência antes da chamada e registra o resultado auditável.
- Dado webhook inválido, duplicado, valor divergente ou parcial, quando recebido, então não baixa parcela, acordo ou cobrança.
- Dado cancelamento ou conciliação, quando executado por administrador, então altera somente a emissão da integração/condomínio correspondente.

## Limites desta etapa
A emissão real não será ativada automaticamente nesta sessão: depende do cadastro das credenciais e da homologação externa. A ação final de liberar Produção será sempre manual, administrativa e auditada.

Exceção aprovada em 05/11/2026 às 17:42: `SPEC-btg-conta-manual-producao.md`. Não autoriza deploy, emissão, alteração de valores ou conversão de contas de Sandbox. Cadastro local não comprova titularidade nem aceitação do banco; conferir dados e beneficiário no piloto.

## Correção de autenticação do webhook — 06/11/2026

As referências anteriores a HMAC neste documento estão corrigidas: conforme a documentação oficial BTG consultada em 06/11/2026, o webhook deve ser autenticado por `Authorization: Bearer <webhook secret>`. Mantém-se a variável `BTG_WEBHOOK_SECRET`, que deve corresponder ao segredo cadastrado no webhook BTG. A rota pública existente é `POST https://luminus.gomesesilvaadv.com.br/api/webhooks/btg/v2/producao`. Esta correção documental não comprova que o webhook foi cadastrado, entregue ou homologado.
