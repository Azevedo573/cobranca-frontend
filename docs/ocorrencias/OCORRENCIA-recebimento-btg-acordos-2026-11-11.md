# Resumo da Ocorrência

O usuário relatou que o BTG enviou `collections.paid` para o acordo #12, mas recebeu HTTP 400. Os dados mínimos apresentados informavam pagamento de R$ 5,84 por QR Code, enquanto a emissão e a parcela armazenam 584 centavos. A correção completa foi aprovada em 11/11/2026, às 17:30, exclusivamente no desenvolvimento.

A alteração inclui conversão monetária, recebimento da parcela, total pago do acordo, quitação das origens ao concluir o plano e saldo do devedor. Não autoriza implantação, reentrega ou baixa real do acordo #12.

# Classificação e Prioridade

Manutenção financeira e de integração, prioridade alta. Há incompatibilidade monetária e divergência entre os caminhos de recebimento. Não se trata de ajuste visual nem de autorização para reparar históricos.

# Módulo Impactado

BTG v2/Collections, parcelas e acordos, dívidas de origem, saldo do devedor, conciliação administrativa e baixa manual.

# Comportamento Atual

Antes da correção, o schema recusava o valor pago decimal. Webhook e conciliação não compartilhavam a cascata financeira completa; a baixa manual tinha etapas fora de uma transação comum e substituía a descrição das origens.

A correção está implementada no desenvolvimento. A VPS permanece na versão `7a37548b`, conforme o último relato do usuário, sem esta alteração. Nenhum pagamento real foi aplicado durante o desenvolvimento.

# Comportamento Esperado

Um pagamento integral comprovado deve quitar uma única parcela elegível. O total nominal pago do acordo e o saldo do devedor devem refletir esse recebimento. Somente a conclusão integral de um plano coerente deve quitar o acordo e suas dívidas de origem. Outras dívidas devem continuar abertas e todas as descrições e valores históricos devem ser preservados.

# Como Reproduzir

Usar dados fictícios: envelope autenticado `collections.paid`, com `amountPaid: 5.84`, para emissão de 584 centavos e plano de uma parcela. No código anterior o decimal era recusado. No código corrigido, parcela, acordo, origens, saldo e auditoria devem ser atualizados em uma transação, sem alterar PDF, Pix ou valores nominais.

# Diagnóstico Inicial

O objeto copiado do portal não contém o envelope `event/data`. Isso não comprova ausência na transmissão: o portal pode mostrar apenas `data`. A aplicação continua recusando payload plano, inferência de evento apenas pelo status e autenticação inválida. `collections.processing` não confirma quitação.

O diagnóstico HTTP 400 agora informa somente nomes de campos de um catálogo permitido, nunca valores, corpo bancário, dados pessoais ou segredos.

# Causa Provável

A incompatibilidade monetária foi reproduzida no schema real e é causa suficiente do HTTP 400 quando o envelope está correto. A causa única da tentativa da VPS ainda depende da URL, envelope e resposta integrais. A falha Bearer retorna HTTP 401 no handler v2; não se altera segredo ou conta com base no HTTP 400 apresentado.

Também foram identificadas implementações financeiras divergentes entre webhook, conciliação e baixa manual.

# Impactos Identificados

A correção afeta status de parcela/acordo/origem, saldo do devedor, total pago e auditoria. Preserva identidades, canais, nominais, snapshots, descrições, RBAC, carteira e cancelamento seguro. Não cria receita para cada origem nem baixa outras dívidas do mesmo devedor.

# Correção Proposta

| Componente | Implementação |
|---|---|
| Conversão monetária | Decimal exato de reais para centavos, sem arredondamento ou heurística de unidade. |
| Recebimento comum | Contexto bloqueado, validação de plano/origens e aplicação transacional. |
| Quitação | Origem quitada somente após todas as parcelas pagas, sem apagar descrição ou inventar rateio. |
| Saldo do devedor | Planos válidos sem duplicar suas origens; outras dívidas e ambiguidades permanecem consideradas. |
| Adaptadores | Webhook, cliente/consulta, conciliação e baixa manual usam as regras correspondentes. |

# Regra Atual e Regra Corrigida

O contrato externo atual BTG está em reais: `5.84` corresponde a 584 centavos; o inteiro `5` corresponde a 500 centavos. A base interna continua em centavos. Apenas `amountPaid/paidAmount` explícitos comprovam o valor pago; nominal isolado, divergência, sinal, precisão inválida ou status contraditório não quitam a parcela.

`acordos.valorPago` soma os nominais das parcelas pagas. Para novos recebimentos integrais validados, nominal e recebido coincidem. Para históricos, essa soma não constitui prova bancária retrospectiva. `valorPagoAcordo`, utilizado no histórico de quebra, permanece intacto.

Todas as parcelas precisam estar pagas e o plano precisa corresponder ao valor negociado. Parcela cancelada não equivale a paga nem gera desconto implícito.

# Alterações Técnicas Necessárias

A implementação é somente no backend e testes, sem novo schema, migração, dependência ou tela. Contratos tRPC existentes são preservados.

`updateParcela` não pode contornar a permissão `acordos/aprovar` para pagar, nem reabrir ou trocar isoladamente a data de parcela paga. A conciliação continua sendo uma mutation financeira: o GET ocorre fora da transação, e integração, conta, contexto e revisão são revalidados antes dos efeitos. Respostas parciais não sobrescrevem documentos, Pix ou barras já consolidados.

O recálculo de saldo consulta vínculos e parcelas em lote. Um teste com 80 origens evita regressão para uma consulta por dívida. Ambiguidades históricas mantêm tratamento conservador, sem conceder quitação automática.

# Correção de Dados Existentes

Nenhuma nesta etapa. Duplicata de parcela paga é no-op: não recompõe total, cascata ou datas antigas. A conciliação de pagamento divergente conserva indício e conflito de cancelamento, sem quitar a parcela.

A reentrega ou baixa do acordo #12 exige atualização autorizada e revisão separada. Não se cria um novo título nem um pagamento fictício para corrigir o caso.

# Histórico e Auditoria

A tabela existente `auditLogs` recebe recibo mínimo: IDs internos, valor em centavos, canal, método por catálogo, data/fonte e liquidação comprovada opcional. Não recebe payload pessoal ou códigos de pagamento.

A quitação por acordo altera status/data da origem, não sua descrição, principal ou `paidAmount` por rateio inventado. Writes e auditoria exigem uma linha afetada; falha desfaz os efeitos financeiros. Conflitos de pagamento/cancelamento continuam monotônicos e auditados.

# Plano de Testes

Os seis novos arquivos têm 232 testes. A regressão focada final passou em 470 testes de 11 arquivos, e autorização/baixa manual passaram em 81 testes de dois arquivos. Foram reproduzidas falhas RED antes das implementações de moeda, recebimento, saldo, manual, conciliação e integração.

A primeira suíte completa teve 3.259 aprovados e quatro falhas em `vencimentos.test.ts`, que dependia implicitamente do banco de desenvolvimento. Essa fixture foi substituída por usuários e parcelas sintéticos, sem remover guards. A estrutura retornada agora é testada com dados não vazios. O simulador passou a comparar corretamente datas e timestamps UTC serializados pelo Drizzle. Os cinco testes de vencimentos e os testes relacionados passaram em 168 casos.

A suíte completa definitiva passou em **3.263 testes de 140 arquivos**, com apenas um arquivo/teste externo BTG opt-in ignorado e nenhuma falha ou erro não tratado. TypeScript, build e `git diff --check` também foram aprovados. Nenhum teste acessou banco ou BTG reais: `DATABASE_URL` permaneceu vazio e o opt-in BTG desligado. Evidências e documentação prontas para salvar a versão técnica.

# Plano de Reversão

Não houve operação real a reverter. O futuro deploy deve ter backup privado e versão fixa. Rollback de código não deve apagar pagamentos/auditoria nem restaurar banco sobre operações posteriores. Não remover migrações antigas ou aplicar baixas em lote como reversão. O responsável deve autorizar qualquer reversão em produção após revisar operações posteriores ao deploy.

# Critérios de Aceite

Um evento fictício autenticado de R$ 5,84 quita a parcela de 584 centavos uma vez, e o plano de uma parcela fecha sem apagar origens. Primeira parcela não quita o plano inteiro; outra dívida mantém saldo. Duplicatas não duplicam recebimento. Auditoria ou update falho desfaz a operação. Contexto cruzado, cancelado, incoerente ou valor divergente não recebe falsa quitação. Suíte, tipos, build e diff devem passar antes da entrega.

# Riscos e Dependências

Os testes de corrida usam serialização em memória, não provam concorrência InnoDB. Criação e consolidação devem respeitar a coordenação das origens; piloto real permanece separado. Não se promete correção de todos os históricos ou confirmação do envelope bancário real.

CNAB/legado, caixa e rateio histórico não entram automaticamente neste serviço. Métodos e horários ausentes não são fabricados. Código corrigido não significa que o pagamento antigo já foi reaplicado.

# Pendências para Validação

Salvar a versão validada. Confirmar URL, envelope e resposta do evento real. Autorizar implantação e revisão de reentrega individual, com conferência de emissão, parcela, acordo, origens, total pago e saldo. HTTP 200, isoladamente, não comprova baixa.

# Próximos Passos

Entregar a versão técnica validada. Depois, atualizar a VPS com autorização própria e tratar o evento do acordo #12 de maneira controlada. Nesta etapa não se executam migração, deploy, nova cobrança, pagamento, cancelamento, reenvio, recuperação financeira ou baixa real.
