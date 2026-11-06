# Plano — captura criptografada de payload e retorno BTG

Aprovado em06/11/2026 às17:50:38. Fonte: docs/specs/SPEC-btg-captura-payload-diagnostico.md. Implementação técnica concluída e validada no desenvolvimento. Sem BTG real/deploy/reenvio/recuperação.

- [x] Schema aditivo btgHttpDiagnosticos/MEDIUMTEXT, migration0101 revisada/aplicada só no desenvolvimento e provisionador seletivo futuro com assinaturaSQL/constraints/defaults/recusa parcial/idempotência.
- [x] Crypto AES256GCM/HKDF/AAD e repositório de captura com contexto fresco, metadados e limites de64KiB; bytes/expurgo/troca de chave/adulteração/rollback testados.
- [x] Cliente serializa uma vez, grava antesPOST, inicia captura, lê retorno uma vez até64KiB/5s, persiste e usa mesmos bytes; transporte e persistência pósPOST conservam estado incerto sem retry.
- [x] Emissão/acordo/remessa propagam ator e IDs de captura; sem mexer em canônica histórica/payload/valores/externalId; vínculo do item de falha revalidado contra origem real, sem inferência de contador.
- [x] Router administrativo fresco; listagens apenas metadados; visualizar com confirmação/finalidade/auditoria estrita e expurgo manual de corpos expirados conservando histórico. Locks e→diagnóstico alinhados ao writer, TTL exato30dias.
- [x] UI no detalhe de remessa, texto inerte, confirmação/finalidade, sem plaintext em polling/lista/localStorage/toasts/cache global. Cache privado retira corpos antesdispatch; guarda descarta respostas tardias/fechamento/troca de contexto.
- [x] Revalidação definitiva após timestamps explícitos: suíte completa1504 aprovados/1 externo opt-in ignorado; TypeScript/build/diff e HTTP200 local. Componente real conferido com dados/callback fictícios; amostra removida sem tRPC bancário.
- [x] Manual/especificação/resultados atualizados; artefatos completos e prontos para checkpoint GitHub sem publicação.

Etapas externas: implantação autorizada com backup/DDL seletiva, comprovação de situação bancária de tentativas1/2 e qualquer emissão real são separadas. Corpos antigos descartados não podem ser reconstruídos. Captura exata não implica diagnóstico bancário detalhado. Solicitação de reenvio especificada separadamente em docs/specs/SPEC-btg-reenvio-controlado.md; regras de recuperação precisam de revisão/aprovação, não foram inseridas como retry do cliente.
