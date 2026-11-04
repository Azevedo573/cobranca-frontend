# Resumo da Ocorrência

Em 04/11/2026, após atualização da VPS para d11f28fc, o usuário relata falha ao autenticar: SELECT de loginRateLimits não executa. Às 11:33, a execução pelo usuário confirmou que a tabela estava ausente. O SQL isolado da migration 0087 criou a tabela, e a consulta dos seis campos passou a executar corretamente. Às 11:34, o usuário confirmou “Consegui entrar no sistema”: acesso restabelecido na VPS, sem reinício adicional ou alteração de credenciais.

# Classificação e Prioridade

Inconsistência de schema de autenticação; prioridade crítica por impedir o acesso ao sistema.

# Módulo Impactado

Autenticação e proteção persistente contra tentativas excessivas de login.

# Comportamento Atual

O login retorna o erro técnico da consulta de loginRateLimits em vez de concluir a verificação de credenciais.

# Comportamento Esperado

Executar o limitador de tentativas e prosseguir normalmente à autenticação quando permitido.

# Como Reproduzir

Abrir o login da VPS atualizada e tentar entrar. Não repetir tentativas sucessivas nem redefinir senhas para reproduzir.

# Diagnóstico Inicial

Código e schema esperam id, keyHash, attempts, windowStartedAt, blockedUntil e updatedAt. A migration 0087_lying_blindfold.sql cria exclusivamente essa tabela. O procedimento condicional retornou “Tabela loginRateLimits criada”, confirmando ausência anterior. DESCRIBE confirmou chave primária auto_increment, keyHash varchar(64) único, attempts com padrão zero, timestamps esperados e blockedUntil anulável. O SELECT dos seis campos com LIMIT 0 concluiu sem erro.

# Causa Provável

Causa confirmada: tabela de proteção de login não criada na VPS. Trata-se de pendência estrutural anterior ao commit 19ce4669, não de migration introduzida nas melhorias recentes de PDF. A VPS recebeu provisionamento BTG específico, sem executar todas as migrations antigas.

# Impactos Identificados

Acesso de usuários comprometido. Nenhuma evidência de alteração de senhas, vínculos, valores financeiros, cobranças ou integração BTG. HTTP 200 do login e PM2 online não comprovam autenticação funcional: a validação anterior não cobriu entrada com credenciais e schema completo de autenticação.

# Correção Proposta

Usar a conexão do .env da VPS para conferir a existência da tabela. Somente se ausente, executar o SQL exato da migration 0087, revisada e composta por um único CREATE TABLE. Se existente, testar as colunas; falhas devem interromper o procedimento sem ALTER, DROP, exclusão ou recriação. Não executar drizzle-kit migrate ou push globais em um histórico já inconsistente.

# Regra Atual e Regra Corrigida

Preservar a proteção atual: cinco tentativas na janela de quinze minutos, com bloqueio de trinta minutos. Corrigir somente a disponibilidade da estrutura. Não desativar a proteção nem implementar bypass de login.

# Alterações Técnicas Necessárias

Banco: criação isolada condicional da tabela ausente. Frontend, backend, integrações e credenciais: sem alterações nesta correção operacional. A exibição de erro SQL bruto ao cliente deve ser tratada em manutenção separada após recuperar o acesso, sem esconder a falha operacional.

# Correção de Dados Existentes

Nenhuma. Não apagar tentativas já registradas caso a tabela exista. Não alterar usuários, senhas, perfis ou associações condominiais.

# Histórico e Auditoria

Preservar o backup privado já feito pelo usuário em 04/11/2026. Registrar a saída não sensível da criação e verificação, sem .env, dumps, senhas ou tokens. Não declarar a migration completa aplicada no histórico Drizzle nem executar baselines globais como parte desta correção.

# Plano de Testes

Verificar existência e SELECT das seis colunas. Conferir tipos e unicidade de keyHash quando a tabela existir. Usuário testa login válido uma vez, acesso permitido aos seus condomínios e bloqueio a recursos não vinculados. Credenciais inválidas continuam negadas. Não provocar bloqueio da conta real com repetição deliberada. Após acesso, testar o PDF individual e o demonstrativo completo. Se surgir outra consulta inválida, diagnosticar separadamente.

# Plano de Reversão

Não remover a tabela criada nem restaurar banco como primeira ação. Se a correção não resolver, manter dados preservados e investigar código MySQL real. Qualquer retorno ao código anterior exige instrução específica e autorização, sem git reset destrutivo e sem restaurar dump sobre dados recentes. Responsável pela execução: usuário na VPS, com acompanhamento nesta tarefa.

# Critérios de Aceite

Tabela existente com campos esperados; query do limitador executa; login válido funciona; permissões e limitador preservados; nenhum dado financeiro ou credencial alterado.

# Riscos e Dependências

Usuário MySQL precisa de CREATE quando a tabela for realmente ausente. Estrutura existente divergente ou permissão insuficiente exige novo diagnóstico, não substituição automática. Sem conexão direta autorizada com a VPS nesta etapa.

# Pendências para Validação

Inspeção, criação isolada e SELECT validados às 11:33; login real confirmado pelo usuário às 11:34 de 04/11/2026. A falha relatada de autenticação foi resolvida. Permanecem pendentes na validação geral da atualização: testes das permissões no uso normal, agrupamento visual dos acordos, novo PDF de parcela e demonstrativo completo. Não afirmar que esses fluxos foram testados em produção apenas com a confirmação do login.

# Próximos Passos

Retomar a validação manual do agrupamento de acordos, boleto novo de parcela existente e demonstrativo completo. Não criar acordo, cobrança ou remessa para validar a atualização; não ativar o BTG. Não é necessário reiniciar PM2, alterar senhas ou executar migrations gerais. Se houver novo erro em outro fluxo, receber a mensagem e diagnosticar separadamente.
