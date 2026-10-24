# Resumo da Ocorrência

O botão de emissão BolePix não foi encontrado após a habilitação da homologação Sandbox e o vínculo de conta recebedora a um condomínio de teste.

# Classificação e Prioridade

Falha de integração financeira e regra de exibição; prioridade alta, com impacto operacional de homologação. Não há indício de emissão ou alteração financeira indevida.

# Módulo Impactado

Tela de detalhe do devedor, tabela de cobranças e fluxo BolePix BTG v2.

# Comportamento Atual

A ação `Emitir BTG` é exibida somente para parcelas de acordo quando `modoBoleto` do condomínio é `api_btg`. Cobranças normais não recebem a ação, embora o backend BolePix v2 aceite `origemTipo: cobranca` e `origemTipo: parcela_acordo`.

# Comportamento Esperado

Durante a homologação Sandbox, cobranças normais e parcelas elegíveis devem oferecer `Emitir BolePix`, independentemente da configuração legada CNAB/API. Títulos pagos, cancelados ou já vinculados ao fluxo CNAB/BTG legado devem continuar bloqueados.

# Diagnóstico Inicial

A condição visual reutiliza uma regra da integração legada por condomínio. A liberação BolePix v2 é global, controlada por `btgIntegracoes.emissaoHabilitada`, e a própria emissão já possui idempotência e validação de vínculo de conta.

# Causa Provável

Migração incompleta da interface: o backend e o modal v2 evoluíram para as duas origens de título, mas a tabela manteve o filtro visual exclusivo de parcelas no fluxo legado.

# Impactos Identificados

Não haverá migration nem alteração de registros existentes. A correção não remove títulos, não altera valores e não ignora as barreiras de backend. A exposição visual da ação será limitada a títulos sem vínculo legado; o backend permanece a fonte de verdade contra duplicidade.

# Correção Proposta

Criar um helper de elegibilidade do BolePix v2 e usá-lo na tabela para mostrar `Emitir BolePix` em cobranças e parcelas elegíveis. Mostrar uma indicação de vínculo legado quando aplicável. A emissão continuará dependente do Sandbox habilitado, dados completos do pagador, vínculo de conta e confirmação explícita no modal.

# Regra Atual e Regra Corrigida

Regra atual: somente parcela + `modoBoleto=api_btg` vê `Emitir BTG`.

Regra corrigida: cobrança ou parcela pode ver `Emitir BolePix` se não estiver paga/cancelada e não houver vínculo com CNAB/BTG legado. A regra não depende de `modoBoleto`, pois a homologação BolePix v2 é independente.

# Alterações Técnicas Necessárias

Frontend: helper testável de elegibilidade e ajuste da tabela. Backend e banco: sem alteração. Integração: sem nova chamada nem reprocessamento.

# Histórico e Auditoria

A emissão continua criando registro canônico e log de auditoria existentes. A simples abertura do modal não gera log nem alteração financeira.

# Plano de Testes

Validar cobrança pendente, parcela pendente, título pago, título cancelado e título com vínculo CNAB/BTG legado. Executar testes unitários do helper, suíte completa, TypeScript e build.

# Plano de Reversão

Reverter o helper e a condição de renderização para a regra anterior. Não há dados de banco a restaurar. Acionar reversão se a interface permitir abrir o modal para título com vínculo legado ou se houver regressão em CNAB.

# Critérios de Aceite

Dado um título pendente sem vínculo legado, quando o administrador abre o detalhe do devedor durante a homologação Sandbox, então visualiza `Emitir BolePix`. Dado um título pago, cancelado ou vinculado ao legado, então a ação não é oferecida. Dado o clique na ação, então o backend continua exigindo pré-requisitos e confirmação final.

# Riscos e Dependências

A emissão real permanece bloqueada por ambiente. A homologação depende das credenciais OAuth, da conta vinculada e do Sandbox BTG. Dados do pagador incompletos bloqueiam a confirmação no modal.

# Pendências para Validação

Após a correção, o administrador deve abrir uma cobrança pendente de teste e confirmar que o botão aparece antes de autorizar a confirmação final de emissão.

# Próximos Passos

Implementar helper, testar os cenários e atualizar a tabela de cobranças sem modificar registros financeiros existentes.
