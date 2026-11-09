# Resumo da Demanda

Possibilitar reenviar parcela/cobrança cuja tentativa falhou, preservando história e impedindo duplicidade. Solicitação06/11/2026 às17:58:23. Usuário aprovou reenvio controlado e testes no desenvolvimento em09/11/2026 às08:54:43. Não autoriza recuperar/reenviar cobranças reais da VPS nem deploy.

# Classificação

Evolução financeira/integração de prioridade alta e complexidade média/alta. Uma capacidade de recuperação administrativa explícita, dependente da evidência de captura e dos guards de emissão/canal existentes.

# Problema Atual

O item “falha” da remessa não determina o estado do banco. O emissor pode ter enviado POST, perdido resposta ou falhado ao persistir, mantendo canônica incerta. Atualmente qualquer emissão prévia bloqueia nova operação. As remessas1/2 têm respostas antigas descartadas; não reconstruir prova a partir do cadastro atual. “Não encontrei no portal” não é prova suficiente de inexistência do título.

# Solução Proposta

Ação administrativa “Revisar falha / Reenviar pela API”, com análise e confirmação antes da criação de nova tentativa. Separar recuperar vínculo de título já existente de emitir um título novo. A API continua principal; nenhum fallback CNAB, retry automático ou reenvio de lote inteiro.

# Escopo

Recuperação individual de parcela de acordo ativo; seleção no lote futuro apenas de falhas elegíveis confirmadas, não itens emitidos. Consulta oficial de Collections por Collection ID ou correlationId conhecido com paginação validada. Revisão de dados atuais e confirmação de nova tentativa. Reutilizar emissor/criptografia/captura/valores canônicos e locks comuns; não criar emissor paralelo.

# Fora do Escopo

Nova dívida/acordo automático para contornar bloqueio, cancelamento automático de cobrança, baixa automática por ausência de listagem, envio externo de e-mail/WhatsApp, transferência de canal API→CNAB, alteração de valores/vencimentos por retry, scheduler/retry em background, reset/exclusão de registros históricos, liberação por SQL ou recuperação real de Produção nesta autorização de desenvolvimento.

# Módulos Impactados

Backend de elegibilidade/emissão e remessa, cliente de consulta Collections e router administrativo; UI de gestão/detalhe da remessa e prévia do acordo; auditoria; testes. A captura atual guarda uma evidência por emissão canônica, não sobrescrevível. Nova revisão deve criar outra emissão/evidência, mantendo a anterior.

# Regras de Negócio

| Estado comprovado | Ação permitida |
|---|---|
| Falha antes do POST, comprovada pela evidência/estágio persistido | Após correção e confirmação, nova tentativa com histórico e captura próprios |
| Resposta bancária de rejeição definitiva, sem título, evidência identificável e consulta completa coerente | Nova tentativa explicitamente confirmada |
| Banco retorna cobrança válida com correlação, valor, conta e contexto correspondentes | Recuperar o vínculo local/estado conforme resposta; nenhum POST novo |
| Incerta, timeout, retorno descartado, consulta incompleta/indisponível ou divergente | Permanecer bloqueada; consulta/reconciliação, não reenvio cego |

HTTP400 isolado não é suficiente; capturas incompletas não provam rejeição definitiva. Uma lista vazia isolada não resolve a incerteza. Consultar todas as páginas necessárias conforme contrato; impor limites e recusar decisão quando atingir limite/timeout ou ocorrer resposta malformada. A decisão sobre qual erro constitui rejeição definitiva será baseada em corpo/status oficialmente documentados e evidência concreta, não substring livre. Em tentativas antigas sem prova, consulta negativa permite informar “não localizada”, mas não libera automaticamente novo título; solicitar comprovação bancária adicional.

Verificação documental09/11/2026: o envelope oficial `BadRequestError`/`invalidParams` não documenta garantia de atomicidade ou inexistência de título. Portanto, nenhuma regra de `rejeicao_definitiva` fica habilitada nesta entrega. Mesmo o HTTP400 estruturalmente válido permanece incerto sem garantia adicional verificável. Reenvio efetivo nesta versão depende de prova local anterior aoPOST; título remoto inequívoco admite apenas recuperação de vínculo.

Se parcela/acordo/condomínio/valor/conta/canal ou revisão mudaram após a análise, invalidar a prévia e exigir revisão novamente. Admin não pode mudar a chave da tentativa anterior para contornar a idempotência. Nova revisão usa uma referência determinística própria por parcela/revisão, sem truncar, mantendo o identificador anterior intacto.

Transação de recuperação usa lock de parcela/acordo/integração e emissão na ordem dos emissores existentes; verifica revisão/estado esperado e provas atuais. Somente o endpoint de recuperação autorizado admite nova revisão; emissores comuns continuam bloqueando duplicidade. A nova revisão e a marcação auditada da tentativa anterior devem ser atômicas. Guardar código controlado da decisão e referências das evidências, não conteúdo bancário/pagador livre no log. Timeout depoisPOST mantém nova tentativa incerta e impede outro clique até reconciliar.

# Fluxo da Funcionalidade

Administrador abre falha, analisa status/evidência e executa consulta ao banco sem emitir. Se já existir título coerente, revisa e confirma recuperação do vínculo. Se a falha for elegível para nova tentativa, vê número da parcela, valor, vencimento, conta/ambiente e resumo da decisão; confirma literalmente REENVIAR PARCELA BTG. Só então o backend revalida/gera revisão/captura e envia uma vez. Sucesso atualiza o item; erro conserva tentativas e evidências e não repete automaticamente. Múltiplos cliques/concurrentes resultam em uma única nova emissão canônica, não múltiplos POSTs.

# Telas e Experiência do Usuário

No detalhe da remessa, botões Revisar falha e Consultar situação BTG. “Reenviar pela API” somente quando backend indicar elegibilidade com prova e prévia não expirada; exibir tentativa original/nova revisão e esclarecer que pode criar título real em Produção. Incertas mostram “Verificar no banco”, não botão de envio habilitado. Mostrar progresso e resultado por parcela; invalidar caches de acordo/remessa/captura após sucesso, sem conteúdo técnico sensível em toast. Sem botão genérico que envie novamente todo o lote incluindo sucessos.

# Dados e Banco de Dados

Preservar emissões, itens e capturas existentes. Reutilizar revisao/unique de origem e geração de externalId/idempotência; a origem e canal continuam da mesma parcela. Definir persistência de estágio de falha local/decisão e vínculo de tentativa anterior antes da implementação. Se for necessária DDL aditiva, apresentar/revisar a migração e aplicar somente no desenvolvimento aprovado, sem backfill/alteração financeira retrospectiva. Não apagar nem sobrescrever evidencia anterior; expurgo30dias preserva metadados mas pode impedir prova de rejeição, devendo manter a recuperação bloqueada quando não houver comprovação suficiente.

# Permissões

Administrador ativo autenticado, perfil/contexto fresco e carteira/condomínio conformes aos guards existentes. Analisar por ID não autoriza outro condomínio ou integração. Nenhum grant automático, execução por colaborador ou bypass por alteração manual de role. Consulta, recuperação de vínculo e nova emissão possuem auditoria e confirmação distintas; falha de autorização/DB/auditoria antesPOST impede envio.

# Integrações e Automações

Mesmo produto Banking Collections e OAuth existentes. GET de consulta não altera títulos; validar ambiente/CNPJ/conta e identidade da resposta. A política de nova revisão/idempotência deve ser conferida no contrato BTG, não presumir que um header inventado impedirá duplicidade. Nenhuma automação externa ou timer.

# Histórico e Auditoria

Registrar quem analisou, consultou e confirmou, quando, qual tentativa/parcela/revisão/evidência, decisão controlada e resultado. Não gravar payload/retorno/token/CPF em metadata livre. Estado de remessa atualizado deve refletir tentativas mais recentes sem remover histórico nem esconder falhas antigas. Registro técnico não significa emissão paga.

# Critérios de Aceite

Dado título existente confirmado, recuperação vincula sem POST. Dado falha anterior aoPOST comprovada, confirmação gera uma nova revisão/evidência e exatamente um POST. Dado estado incerto/listagem vazia sem outra prova/consulta incompleta, nenhuma emissão. Dado lote misto, sucessos/pagos/cancelados não são reenviados. Dado concorrência de dois administradores, somente uma tentativa vence a reserva. Dado mudança de valor/vencimento/conta/carteira após prévia, rejeitar. Dado falha de auditoria/DB antesPOST, rollback; apósPOST, manter incerteza, não liberar/repetir. Dado CPF/endereço/resposta livre, auditoria/UI pública nunca expõem. Dado canônica antiga, manter IDs/valores e histórico, sem inferir título inexistente.

# Tarefas Técnicas

Após aprovação: identificar estados/provas/contrato idempotente; especificar armazenamento estritamente necessário; testes de consulta/paginação/erros; endpoint de análise e recuperação transacional; adaptar emissor para revisão autorizada somente nesse endpoint; UI individual com prévia/confirmação; auditoria/concorrência/lote; manual; suíte completa e checkpoint. Arquivos existentes em server/btg-v2 e routers, UI BTG; testes em server/*.test.ts. Node/TypeScript/Drizzle/tRPC/React existentes, sem nova dependência por padrão.

Comandos: pnpm exec vitest run --no-file-parallelism --reporter=default; pnpm check; pnpm build; git diff --check. Estilo: funções tipadas, erro seguro, contexto fresco e confirmação no router; mocks de banco/fetch e provas controladas. Sem chamadas bancárias ou submissões reais em teste.

# Riscos e Dependências

Maior risco é cobrar duas vezes por tratar incerteza como falha definitiva. Recuperar exige evidência, contratos e contexto; indisponibilidade do BTG não pode aumentar permissividade. A API pode não oferecer prova negativa definitiva por correlação; nesse caso manter bloqueio e escalar validação bancária em vez de criar exceção silenciosa. Captura técnica deve ser concluída primeiro. Reenvio pode falhar por dados incorretos não corrigidos; nunca remediar valor/conta/CPF por adivinhação.

# Pendências para Validação

Aprovação do desenvolvimento recebida09/11/2026. Migração0102 revisada/aplicada exclusivamente no desenvolvimento, sem backfill; provisionador seletivo testado. Falta homologação de concorrência/isolamento noInnoDB real e confirmação bancária externa. Recuperação/emissão reais1/2 e deploy não foram autorizados nesta execução. Rejeição definitiva porHTTP400 continua sem garantia documental suficiente e permanece bloqueada.

# Próximos Passos

Implementação técnica concluída09/11/2026:1872 testes aprovados/1 externoBTGopt-in ignorado,424 regressões específicas, TypeScript/build/diff aprovados e componentes reais inspecionados com dados fictícios. Salvar checkpoint e manter implantação da captura0101/recuperação0102 naVPS, após inventário/backup e autorização, como outra etapa. Não usar novo acordo ou reset SQL para contornar as tentativas históricas.

Referências públicas verificadas09/11/2026: https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/listar-cobrancas ; https://developers.empresas.btgpactual.com/assets/js/4e04dca3.b96332a6.js (`data`, `_links.next.href` com cursor opaco; não usar totalPages/pageNumber inferidos); https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/criar-cobranca . Não presumir causalidade do HTTP400 sem retorno específico.

## Contrato técnico de desenvolvimento

Dev: `pnpm run dev`. Sempre: validar contexto fresco, provas e prévia, preservar tentativas e testar antes do checkpoint. Perguntar antes: schema/dependências/CI, exceção de prova negativa, recuperação/reestruturação de históricos e operação real. Nunca: gravar segredos/rawPII em logs, editar vendor, remover testes falhos para passar, repetir POST automático, tratar consulta vazia como autorização financeira.

Exemplo de estilo previsto (guarda ilustrativa, não implementação de reenvio):

```ts
function assertConsultaCompleta(consulta: { completa: boolean }): void {
  if (!consulta.completa) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Consulta bancária incompleta; reenvio permanece bloqueado.",
    });
  }
}
```

Testes Vitest em server/*.test.ts com DB/fetch fictícios e cenários de erro/concorrência; não usar títulos reais como teste. Aderir aos helpers de transação/valores/exclusividade atuais. A captura prévia está tecnicamente concluída/validada1504testes; não foi implantada na VPS. A política de reenvio foi aprovada09/11/2026; não houve envio real nesta implementação.

## Contratos aprovados para implementação —09/11/2026

Migração aditiva mínima: `btgCobrancasEmitidas.falhaAntesEnvioEm` nullable para prova explícita de falha local nova, sem backfill; tabela `btgRecuperacoes` guarda UUID de análise, tentativa anterior/nova(nullable), integração/parcela/condomínio/ator, decisão controlada, estado analisada/consumida, hashes de contexto/prova/consulta, diagnóstico vinculado, consulta completa e corpo de consulta protegido criptograficamente, datas/criação/expiração5min/consumo. Não copiar CPF/conta/payload/resposta em campos livres. Consulta cifrada recebe domínio/AAD próprios, não plaintext na listagem/auditoria. Expiração bloqueia nova confirmação; nenhum timer.

`btgRecuperacao.analisar({parcelaId,remessaId?})`: mutation administrativa fresca, GET bancário semPOST, auditoria estrita e prévia individual com UUID; saída só resumo mascarado/decisão/motivo controlado/expiraEm/revisões. `confirmar({analiseId,confirmacao,ciente:true})`: ator/contexto iguais, reconsulta quando necessário e revalida estado/prova/expiração/hash/conta/pagador/valores/carteira; literal REENVIAR PARCELA BTG ou RECUPERAR VINCULO BTG. Reserva a nova revisão/auditoria/consumo atômicos e usa capacidade opaca de uso único para o emissor existente. A reserva anterior não é resetada. Emissores normais retornam revisão mais recente, sem bypass porR1 ou revisão fornecida pelo cliente.

Nova revisão conserva a remessa de origem para histórico da captura; não reabre remessa inteira. Item aponta a tentativa mais recente depois de validado seu contexto, e auditoria/tabela/captura preservam estado anterior. Totais de remessa são recalculados dos itens sem reenviar sucessos. Para antigo item sem emissaoID, resolver canônica diretamente por parcela/integração/remessa com unicidade e contexto, nunca contador.

Estado `preparado` isolado não prova falha: exigir emissão reservada com erro local concluído e prova explícita/estágio compatível, lock antes da decisão e nenhuma outra tentativa inconclusiva. Título recuperado exige correlação, conta/beneficiário, valor, vencimento e tipo coerentes; campos ausentes/incompatíveis bloqueiam. RecuperarPAID não baixa origem automaticamente nesta funcionalidade: conservar vínculo e sinalizar conciliação existente com valor/data confirmados. Não aplicar pagamento sem prova completa.
