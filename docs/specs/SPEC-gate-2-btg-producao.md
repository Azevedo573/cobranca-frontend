# Gate 2 — API BTG em Produção após Homologação

## Objetivo
Preparar a API BolePix BTG v2 para Produção, mantendo a emissão real bloqueada até que um administrador conclua os pré-requisitos e faça a liberação explícita.

## Decisão registrada
CNAB permanece habilitado como fluxo bancário homologado. A API BTG será uma trilha complementar para parcelas de acordo, inicialmente sem substituir CNAB. Produção só poderá emitir após homologação bancária e ativação administrativa auditada.

## Pré-requisitos de Produção
1. `BTG_SANDBOX=false`, Client ID, Client Secret, Company ID, Redirect URI HTTPS e chave de criptografia cadastrados no cofre seguro de Produção.
2. Aplicativo BTG de Produção com escopos Collections e Accounts habilitados, OAuth concluído e tokens cifrados no backend.
3. Conta recebedora obtida pela API oficial — nunca por cadastro manual Sandbox — vinculada ao condomínio.
4. `BTG_WEBHOOK_SECRET` cadastrado, callback HTTPS configurado no BTG e teste de HMAC/deduplicação aprovado.
5. Emissão, consulta, cancelamento e pagamento integral homologados com acordo de teste e evidência registrada.

## Regras de segurança
- Produção inicia com `emissaoHabilitada=0`.
- Somente `adminProcedure` pode alterar integração, vincular conta, liberar ou desabilitar emissão.
- Liberação exige confirmação textual explícita, OAuth conectado, conta oficial ativa e webhook configurado.
- Cada emissão exige acordo ativo, parcela elegível, vínculo condomínio→conta e idempotência persistida.
- CNAB e BolePix não podem emitir para a mesma parcela; o vínculo já existente ao fluxo CNAB bloqueia a API BTG.
- O pagamento webhook/API só é aplicado quando assinatura/consulta são válidas e valor integral coincide; pagamento parcial segue revisão manual, como o CNAB.

## Critérios de aceite
- Dado ambiente Produção sem ativação, quando o administrador tentar emitir, então a operação é bloqueada sem chamada ao BTG.
- Dado ambiente Produção homologado e ativado, quando uma parcela elegível de acordo é emitida, então o sistema grava reserva/idempotência antes da chamada e registra o resultado auditável.
- Dado webhook inválido, duplicado, valor divergente ou parcial, quando recebido, então não baixa parcela, acordo ou cobrança.
- Dado cancelamento ou conciliação, quando executado por administrador, então altera somente a emissão da integração/condomínio correspondente.

## Limites desta etapa
A emissão real não será ativada automaticamente nesta sessão: depende do cadastro das credenciais e da homologação externa. A ação final de liberar Produção será sempre manual, administrativa e auditada.
