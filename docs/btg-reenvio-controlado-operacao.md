# Reenvio controlado BTG — operação

Implementação em desenvolvimento aprovada09/11/2026; não implantada naVPS e nenhuma cobrança real enviada/recuperada por esta tarefa.

Na gestão de remessas, cada item com falha tem revisão individual. Analisar consulta o BTG por identificação própria da tentativa e paginação limitada; não envia nada. A prévia expira em5min, exige o mesmo administrador ativo e revalida integração, conta, parcela, acordo, canal, pagador, estado e prova.

Se título remoto inequívoco for localizado com correlação, conta/beneficiário, valor, vencimento e tipo compatíveis, a confirmação recupera o vínculo semPOST. A parcela/acordo não recebem baixa nesta operação; títulosPAID exigem conciliação própria e conferência de pagamento.

Reenvio só cria revisãoR+1 quando a falha anterior aoPOST é comprovada, a consulta é completa e sem título e não existe outra tentativa ambígua. Exige declaração/literal REENVIAR PARCELA BTG, reserva+auditoria+consumo atômicos e passa pelo emissor/captura existentes uma vez. A emissão anterior não é apagada nem resetada. Sucessos do lote não são reenviados e o CNAB não é fallback.

## Limitação documental importante

HTTP400, frase de erro, timeout, FAILED remoto e lista vazia isolados não provam ausência de emissão. O exemplo oficial BadRequestError/invalidParams confirma rejeição de campos, mas não documenta garantia de atomicidade/ausência de título. Nesta entrega continua classificado como incerto sem garantia adicional verificável do banco. Portanto, tentativas históricas#1/#2 não serão liberadas automaticamente. A captura criptografada serve ao diagnóstico e não recupera retornos antigos descartados.

## Estrutura e futuro deploy

Migração0102 cria btgRecuperacoes com consultas cifradas/decisão/hashes/ator/TTL e acrescenta falhaAntesEnvioEm nullable às emissões; sembackfill. Aplicação exclusiva no desenvolvimento após revisão. VPS necessita backup, migrações0101/0102 conforme inventário e versão validada, nunca drizzle-kit migrate global por reflexo. Provisionador seletivo será validado em--check. Credenciais e tokens não mudam.

Testes usam banco/fetch/valores fictícios. Concorrência simulada não equivale à homologação de InnoDB/BTG real. Piloto real e deploy são etapas separadas.

Fontes oficiais: [Listar cobranças](https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/listar-cobrancas) e [Criar cobrança](https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/criar-cobranca).

## Validação técnica definitiva —09/11/2026

1.872 testes aprovados e1 externoBTGopt-in ignorado na suíte serial de107arquivos;424 regressões específicas em8arquivos. pnpm check, pnpm build e git diff --check aprovados. O aviso habitual de chunks grandes do Vite não bloqueou o build. Foram testados consulta/crypto/provas/router/serviço/emissor, rollback, duas confirmações, mudanças entre análise e confirmação, cadeia de revisões e acesso à captura antiga. Três integrações usam o service e o cliente reais com fetch explicitamente mockado, sem rede bancária.

Componentes reais inspecionados com amostra fictícia nos estados bloqueado/elegível, resumo de conta mascarada, revisão atual/nova, aviso e confirmação desabilitada antes da declaração/literal. A amostra foi removida. Não houve login/usuário novo, título real, concessão RBAC, consulta ao BTG real, reclassificação financeira ou deploy naVPS. Concorrência de fixture em memória não substitui homologação de InnoDB real.

Capturas antigas continuam acessíveis ao administrador pelos vínculos atuais e pela cadeia auditada de revisão autorizada, inclusive quando o item aponta uma tentativa mais recente. Metadata/listagens não revelam corpos. Consulta da recuperação fica cifrada com domínio separado; sua prévia expira em5min. Não há expurgo automático/scheduler novo; retenção de backups exige política operacional própria.
