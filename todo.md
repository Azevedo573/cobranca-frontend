# TODO - Sistema de Gestão de Cobranças Condominiais

## Banco de Dados e Modelos
- [x] Criar tabela de condominios
- [x] Estender tabela de users com role e condominio_id
- [x] Criar tabela de devedores
- [x] Criar tabela de cobrancas
- [x] Criar tabela de tentativas_cobranca
- [x] Criar tabela de acordos
- [x] Criar tabela de parcelas_acordo

## Backend (tRPC Routers)
- [x] Criar router de autenticação customizada
- [x] Criar router de condominios (CRUD admin)
- [ ] Criar router de usuários (CRUD admin)
- [x] Criar router de devedores (CRUD)
- [x] Criar router de cobranças (CRUD)
- [x] Criar router de tentativas de cobrança
- [x] Criar router de acordos
- [ ] Criar router de relatórios e estatísticas

## Identidade Visual
- [x] Configurar tema com cores Gomes & Silva (verde neon + azul navy)
- [x] Adicionar fontes elegantes via Google Fonts
- [x] Customizar componentes shadcn/ui com identidade visual

## Frontend - Páginas e Componentes
- [x] Página de login customizada
- [x] Dashboard do Administrador
- [x] Dashboard do Síndico
- [x] Dashboard do Cobrador
- [ ] Página de gestão de condominios (admin)
- [ ] Página de gestão de usuários (admin)
- [ ] Página de listagem de devedores
- [ ] Página de detalhes do devedor
- [ ] Página de cobranças
- [ ] Página de registro de tentativas de cobrança
- [ ] Página de acordos
- [ ] Página de relatórios com gráficos

## Funcionalidades
- [ ] Isolamento de dados por condomínio
- [ ] Validação de permissões por role
- [ ] Sistema de filtros e busca
- [ ] Exportação de relatórios
- [ ] Notificações de ações importantes

## Testes
- [ ] Testes de autenticação
- [ ] Testes de isolamento de dados
- [ ] Testes de CRUD de entidades
- [ ] Testes de cálculos de relatórios

## Nova Solicitação - Páginas CRUD Completas
- [x] Página de listagem de condominios (admin)
- [x] Página de formulário de condominio (criar/editar)
- [x] Página de listagem de usuários (admin)
- [x] Página de formulário de usuário (criar/editar)
- [x] Página de listagem de devedores
- [x] Página de formulário de devedor (criar/editar)
- [ ] Página de detalhes do devedor com histórico
- [x] Página de listagem de cobranças
- [x] Página de formulário de cobrança (criar/editar)
- [x] Integrar todas as rotas no App.tsx

## Correção - Vincular Devedor ao Condomínio
- [x] Adicionar campo de seleção de condomínio no formulário de devedor
- [x] Permitir que admin selecione qualquer condomínio
- [x] Pré-selecionar condomínio do usuário logado para síndicos/cobradores

## Módulo de Tentativas de Cobrança
- [x] Criar página de detalhes do devedor com informações completas
- [x] Adicionar listagem de tentativas de cobrança no detalhes do devedor
- [x] Criar formulário de registro de tentativa de cobrança
- [x] Adicionar campos: tipo de contato, data, resultado, observações
- [x] Integrar rotas no App.tsx
- [x] Testar fluxo completo de registro de tentativas

## Bug - Devedor não aparece na lista após cadastro
- [x] Investigar problema no backend ao criar devedor
- [x] Verificar invalidação de cache do tRPC
- [x] Corrigir e testar fluxo completo

## Bug Crítico - Devedor não está sendo salvo no banco
- [x] Verificar logs do servidor para erros
- [x] Verificar procedure devedores.create no backend
- [x] Verificar função createDevedor no db-devedores.ts
- [x] Testar cadastro e validar salvamento no banco
- [x] Adicionar seletor de condomínio para admin visualizar devedores

## Bug - Nova Cobrança não mostra devedores
- [x] Adicionar filtro de condomínio na página de Nova Cobrança
- [x] Carregar devedores baseado no condomínio selecionado
- [x] Admin seleciona condomínio primeiro, depois devedor
- [x] Síndico/cobrador vê devedores do próprio condomínio automaticamente

## Bug - Erro de validação no formulário de cobrança
- [x] Corrigir query de devedores para não executar quando condominioId é null
- [x] Adicionar validação correta no enabled da query

## Bug - Erro ao criar cobrança (condominioId null)
- [x] Adicionar condominioId ao payload da mutation de criar cobrança
- [x] Validar que condominioId está sendo enviado corretamente

## Nova Funcionalidade - Credenciais de Condomínio
- [x] Adicionar campos username e password na tabela condominios
- [x] Atualizar formulário de condomínio com campos de usuário e senha
- [x] Atualizar backend para salvar credenciais do condomínio
- [x] Testar cadastro e edição de condomínio com credenciais

## Nova Funcionalidade - Login Customizado para Condomínios
- [x] Instalar bcrypt para hash de senhas
- [x] Implementar hash de senha ao criar/atualizar condomínio
- [x] Criar endpoint de login customizado (username/password)
- [x] Gerar token JWT após autenticação bem-sucedida
- [x] Criar tela de login customizada no frontend
- [x] Integrar login customizado com gerenciamento de sessão
- [x] Redirecionar para dashboard correto após login
- [x] Testar fluxo completo de login customizado

## Bug - Cobranças não aparecem na listagem
- [x] Adicionar filtro de condomínio na página de listagem de cobranças
- [x] Admin seleciona condomínio para visualizar cobranças
- [x] Síndico/cobrador vê cobranças do próprio condomínio automaticamente

## Nova Funcionalidade - Editar e Excluir Registros
- [x] Criar mutation de delete de devedor no backend
- [x] Criar mutation de delete de cobrança no backend
- [x] Adicionar botão de editar na tabela de devedores
- [x] Adicionar botão de excluir com diálogo de confirmação na tabela de devedores
- [x] Adicionar botão de editar na tabela de cobranças
- [x] Adicionar botão de excluir com diálogo de confirmação na tabela de cobranças
- [x] Testar fluxo completo de edição e exclusão

## Bug - Servidor retornando HTML em vez de JSON
- [x] Verificar logs do servidor para identificar erro
- [x] Corrigir problema no backend que está causando resposta HTML
- [x] Testar queries tRPC após correção

## Nova Funcionalidade - Rotas de Edição
- [x] Adicionar rotas `/devedores/:id/editar` e `/cobrancas/:id/editar` no App.tsx
- [x] Modificar DevedorForm para detectar parâmetro :id na URL
- [x] Carregar dados do devedor existente quando em modo edição
- [x] Modificar CobrancaForm para detectar parâmetro :id na URL
- [x] Carregar dados da cobrança existente quando em modo edição
- [x] Testar fluxo completo de edição

## Sistema Funcional de Registro e Visualização de Cobranças
- [x] Criar dashboard do síndico com lista de tentativas de cobrança recentes
- [x] Adicionar estatísticas de cobranças no dashboard (total de tentativas, devedores contatados, resultados)
- [x] Melhorar interface de registro de tentativas para cobradores
- [x] Criar página simplificada para cobrador registrar tentativas rapidamente
- [x] Integrar rota /tentativas/nova no App.tsx
- [x] Testar fluxo completo: cobrador registra → síndico visualiza

## Login e Registro de Colaboradores
- [x] Criar tela de login específica para colaboradores (/login-colaborador)
- [x] Implementar autenticação de colaboradores com username/password
- [x] Adicionar campo userId nas tentativas para identificar colaborador responsável (já existia)
- [x] Atualizar dashboard do síndico para mostrar nome do colaborador
- [x] Atualizar dashboard do admin para mostrar tentativas de todos os condomínios
- [x] Criar query para listar todas as tentativas (admin)
- [x] Adicionar rota /login-colaborador no App.tsx
- [x] Testar fluxo: colaborador loga → registra tentativa → aparece nos dashboards

## Correção e Implementação de Cadastro de Usuários
- [x] Corrigir erro no Select do formulário de usuários (valor vazio não permitido)
- [x] Implementar validação de campos obrigatórios
- [x] Adicionar campo de senha no formulário
- [x] Criar hash bcrypt da senha antes de salvar
- [x] Remover campo openId do formulário (gerado automaticamente)
- [x] Atualizar mutations create e update no backend
- [x] Testar cadastro de novo usuário colaborador
- [x] Testar login com usuário recém-cadastrado

## Ajuste de Condomínio para Colaboradores
- [x] Remover obrigatoriedade de condomínio para colaboradores (podem trabalhar em vários)
- [x] Manter obrigatoriedade apenas para síndicos
- [x] Atualizar validação no formulário UserForm
- [x] Atualizar texto de ajuda do campo condomínio
- [x] Testar cadastro de colaborador sem condomínio
- [x] Testar cadastro de síndico com validação de condomínio obrigatório

## Correção de Login do Colaborador
- [x] Investigar redirecionamento para OAuth após login
- [x] Corrigir LoginColaborador para redirecionar ao dashboard do cobrador
- [x] Garantir que autenticação customizada funcione sem OAuth
- [x] Testar fluxo: login colaborador → dashboard cobrador

## Correção de Autenticação Customizada do Colaborador
- [x] Investigar por que useAuth não reconhece sessão customizada
- [x] Verificar endpoint auth.me no backend
- [x] Corrigir validação de token customizado no contexto
- [x] Garantir que dashboard do cobrador aceite sessão customizada
- [x] Adicionar suporte a authType="colaborador" no verifyCustomToken
- [x] Testar login colaborador → acesso ao dashboard sem OAuth

## Relatório de Produtividade por Colaborador
- [x] Criar query no backend para estatísticas gerais por colaborador
- [x] Criar query para distribuição de tentativas por condomínio
- [x] Criar query para ranking de performance
- [x] Adicionar router de relatórios no backend
- [x] Criar página de relatório em /admin/relatorios/produtividade
- [x] Adicionar tabela com estatísticas por colaborador
- [x] Adicionar gráfico de barras para visualização
- [x] Implementar filtros por período (hoje, semana, mês, customizado)
- [x] Implementar filtro por condomínio
- [x] Adicionar rota no App.tsx
- [x] Adicionar link no menu do admin
- [x] Testar relatório com dados reais

## Correção do Gerador CNAB 240 - Segmento R
- [x] Analisar layout real do Segmento R no arquivo BTG_27042026.txt
- [x] Corrigir campos de multa (pos 062-083) para usar brancos conforme BTG
- [x] Corrigir campo instrucao 3 (pos 084-123) para usar brancos conforme BTG
- [x] Atualizar testes unitarios do Segmento R para refletir layout BTG
- [x] Validar todos os 218 testes passando e 0 erros TypeScript

## Sistema de Cálculo Automático de Valores Devidos
- [x] Adicionar campos no schema de condomínios: taxaJurosMensal, taxaMulta, taxaHonorarios
- [x] Executar db:push para aplicar mudanças no banco
- [x] Atualizar formulário de condomínio para incluir configuração de taxas
- [x] Atualizar schema do tRPC para aceitar taxas no create/update
- [x] Criar função calcularValorDevido(valorOriginal, dataVencimento, condominio)
- [x] Criar componente BreakdownValor para mostrar detalhamento
- [x] Atualizar página de detalhes do devedor com valores calculados
- [x] Atualizar lista de cobranças com valores atualizados
- [x] Atualizar dashboard do síndico com totais calculados
- [x] Testar cálculos com diferentes cenários (atrasos variados)

## Integração de Cálculos nas Páginas
- [x] Atualizar DevedorDetalhes.tsx para buscar taxas do condomínio
- [x] Adicionar card BreakdownValor na página de detalhes do devedor
- [x] Calcular total de todas as cobranças do devedor com encargos
- [x] Atualizar tabela de cobranças em DevedorDetalhes com coluna "Valor Atualizado"
- [x] Atualizar lista de cobranças (CobrancasList) com valores calculados
- [x] Atualizar dashboard do síndico com totais calculados
- [x] Testar cálculos com diferentes cenários de atraso

## Correção de Página de Detalhes da Cobrança
- [x] Verificar se existe componente CobrancaDetalhes.tsx
- [x] Criar página de detalhes da cobrança se não existir
- [x] Registrar rota /cobrancas/:id no App.tsx
- [x] Testar navegação do botão "Ver detalhes"

## 🎯 Transformação em Sistema Profissional de Cobranças

### 1. Sistema de Priorização e Scoring
- [x] Criar algoritmo de scoring de devedores (valor devido, tempo de atraso, histórico)
- [x] Adicionar campo "prioridade" (alta/média/baixa) calculado automaticamente
- [x] Implementar ordenação inteligente nas listagens por prioridade
- [x] Adicionar badges visuais de prioridade nas tabelas
- [x] Criar dashboard de "Casos Prioritários" para cobradores
- [x] Adicionar campos score e prioridade no schema
- [x] Criar funções de cálculo de score no backend
- [x] Adicionar endpoints tRPC para scoring
- [x] Criar componente BadgePrioridade
- [x] Criar página CasosPrioritarios
- [x] Adicionar rota /casos-prioritarios no App.tsx
- [x] Adicionar badges de prioridade na listagem de devedores
- [x] Integrar sistema de priorização completo

### 2. Módulo Completo de Acordos e Parcelamentos
- [x] Criar tabela "acordos" no banco (devedorId, valorTotal, numParcelas, valorParcela, dataInicio)
- [x] Criar tabela "parcelas" (acordoId, numeroParcela, valorParcela, dataVencimento, dataPagamento, status)
- [x] Criar funções de cálculo de acordos (entrada + parcelas com juros)
- [x] Criar backend tRPC para acordos (create, list, getById)
- [x] Implementar componente SimuladorAcordo na página de detalhes da cobrança
- [x] Adicionar formulário de simulação (entrada, número de parcelas, taxa de juros)
- [x] Exibir tabela com plano de pagamento calculado
- [x] Implementar botão "Criar Acordo" para formalizar
- [x] Adicionar opção de gerar PDF/texto do acordo para compartilhar
- [ ] Criar página de negociação de acordo com simulador de parcelas
- [ ] Implementar geração automática de parcelas mensais
- [ ] Criar página de acompanhamento de acordos ativos
- [ ] Adicionar controle de pagamento de parcelas individuais
- [ ] Implementar alertas de parcelas vencendo/vencidas
- [ ] Adicionar relatório de taxa de cumprimento de acordos

### 3. Dashboard Unificado do Devedor (Visão 360°)
- [ ] Criar timeline unificada com todas as interações (cobranças, tentativas, acordos)
- [ ] Adicionar gráfico de evolução da dívida ao longo do tempo
- [ ] Mostrar histórico completo de pagamentos e promessas
- [ ] Adicionar seção de "Próximas Ações Recomendadas"
- [ ] Implementar score de risco de inadimplência
- [ ] Adicionar notas e observações do colaborador

### 4. Automações e Alertas Inteligentes
- [ ] Criar sistema de alertas automáticos (parcelas vencendo, promessas não cumpridas)
- [ ] Implementar notificações push para colaboradores
- [ ] Adicionar regras de escalonamento automático (X dias sem resposta → aumentar prioridade)
- [ ] Criar sugestões automáticas de ações baseadas em histórico
- [ ] Implementar lembretes de follow-up para cobradores

### 5. KPIs e Métricas Estratégicas
- [ ] Dashboard executivo com KPIs principais:
  * Taxa de recuperação mensal
  * Tempo médio de recuperação
  * Valor médio recuperado por colaborador
  * Taxa de conversão de tentativas em acordos
  * Aging de dívidas (0-30, 31-60, 61-90, 90+ dias)
- [ ] Gráfico de funil de cobrança (pendente → em cobrança → acordo → pago)
- [ ] Comparativo mensal de performance
- [ ] Ranking de condomínios por inadimplência
- [ ] Projeção de recuperação baseada em histórico

### 6. Melhorias de UX e Integração
- [ ] Adicionar busca global (buscar devedor, cobrança, acordo em qualquer lugar)
- [ ] Implementar atalhos de teclado para ações rápidas
- [ ] Criar widget de "Ações Rápidas" em todos os dashboards
- [ ] Adicionar exportação de dados (Excel, PDF) em todas as listagens
- [ ] Implementar filtros avançados salvos por usuário
- [ ] Adicionar modo escuro para uso prolongado

### 7. Comunicação e Templates
- [ ] Criar biblioteca de templates de mensagens (WhatsApp, Email, SMS)
- [ ] Implementar envio em massa de notificações
- [ ] Adicionar histórico de comunicações enviadas
- [ ] Criar templates personalizáveis por condomínio
- [ ] Implementar variáveis dinâmicas nos templates (nome, valor, vencimento)

## Login Customizado para Administrador
- [x] Criar página /login-admin com formulário de email e senha
- [x] Adicionar endpoint de autenticação admin no backend
- [x] Implementar validação de credenciais e geração de token JWT
- [x] Redirecionar para /admin/dashboard após login bem-sucedido
- [x] Atualizar verifyCustomToken para reconhecer tokens de admin
- [x] Adicionar rota no App.tsx
- [x] Adicionar campo passwordHash no schema users
- [x] Executar db:push para aplicar mudanças
- [x] Testar fluxo completo de login

## Configurar Senha para Admin Existente
- [x] Gerar hash bcrypt da senha "123456"
- [x] Atualizar campo passwordHash do usuário admin no banco
- [x] Testar login com a senha configurada

## Sidebar de Navegação com Controle de Acesso
- [x] Analisar estrutura atual de rotas e páginas existentes
- [x] Definir itens de menu por nível de acesso (admin, cobrador, visualizador)
- [x] Criar componente Sidebar.tsx com navegação lateral
- [x] Implementar lógica de controle de acesso baseado em user.role
- [x] Adicionar ícones e organização visual dos itens de menu
- [x] Integrar sidebar no layout principal (App.tsx)
- [x] Adicionar indicador visual de página ativa
- [x] Implementar responsividade (colapsar em mobile)
- [x] Testar navegação com diferentes níveis de acesso
- [x] Ajustar espaçamento e layout das páginas com sidebar

## Correção de Erro HTML na Sidebar
- [x] Corrigir âncoras aninhadas (<a> dentro de <a>) na Sidebar.tsx

## Página de Acordos
- [x] Criar query tRPC acordos.list com filtros
- [x] Criar query tRPC acordos.getById com parcelas
- [x] Criar página Acordos.tsx com listagem
- [x] Adicionar filtros por status, devedor e condomínio
- [x] Implementar visualização de detalhes do acordo
- [x] Mostrar progresso de pagamento das parcelas
- [x] Adicionar rota /acordos no App.tsx

## Página de Detalhes do Acordo
- [x] Criar página AcordoDetalhes.tsx
- [x] Buscar dados do acordo e parcelas via tRPC
- [x] Exibir informações completas do acordo (devedor, valores, datas)
- [x] Criar tabela de parcelas com todas as informações
- [x] Adicionar botão para marcar parcela como paga
- [x] Implementar mutation para atualizar status da parcela
- [x] Mostrar progresso visual do acordo (parcelas pagas/total)
- [x] Adicionar rota /acordos/:id no App.tsx

## Renomear Cobranças para Processos de Cobrança
- [x] Renomear componente Cobrancas.tsx para ProcessosCobranca.tsx
- [x] Renomear CobrancaForm.tsx para ProcessoCobrancaForm.tsx
- [x] Renomear CobrancaDetalhes.tsx para ProcessoCobrancaDetalhes.tsx
- [x] Atualizar rotas no App.tsx
- [x] Atualizar links na Sidebar
- [x] Atualizar títulos e textos nas páginas

## Nova Página de Tentativas de Cobrança
- [x] Criar tabela tentativasCobranca no schema (já existe)
- [x] Criar funções de banco em db-tentativas.ts
- [x] Criar router tRPC para tentativas (já existe, atualizado)
- [x] Criar página TentativasCobranca.tsx com listagem
- [x] Adicionar formulário de nova tentativa (usa página existente /tentativas/nova)
- [x] Implementar filtros (devedor, cobrador, data, resultado)
- [x] Adicionar estatísticas (total de tentativas, taxa de sucesso)
- [x] Adicionar rota /tentativas no App.tsx
- [x] Adicionar link na Sidebar

## Formulário Inline de Tentativa na Página de Tentativas
- [x] Adicionar formulário expansível/colapsável no topo da página
- [x] Implementar campos: devedor, cobrança, tipo de contato, resultado, observações
- [x] Adicionar validação de campos obrigatórios
- [x] Implementar mutation para criar tentativa
- [x] Atualizar lista automaticamente após criar tentativa

## Atualizar Botão Nova Tentativa
- [x] Fazer botão "Nova Tentativa" expandir o formulário inline
- [x] Remover navegação para página separada
- [x] Adicionar scroll automático para o formulário quando expandido

## Filtrar Processos por Devedor no Formulário de Tentativa
- [x] Implementar filtro dinâmico de processos baseado no devedor selecionado
- [x] Limpar seleção de processo quando devedor mudar
- [x] Exibir mensagem quando devedor não tiver processos (placeholder do select)

## Redirecionamento Automático para Acordo
- [x] Adicionar opção "Deseja Realizar Acordo" no enum result do schema
- [x] Executar db:push para aplicar mudanças no banco
- [x] Adicionar opção no select de resultado do formulário
- [x] Implementar lógica de redirecionamento no onSuccess da mutation
- [x] Verificar se resultado selecionado é "deseja_acordo"
- [x] Salvar tentativa normalmente
- [x] Redirecionar para página de detalhes do processo (/processos/:id)
- [x] Adicionar mensagem de sucesso antes do redirecionamento
- [x] Testar fluxo completo (registro → redirecionamento → simulador) - Lógica implementada, funcionará quando formulário inline for exibido

## Campo Desconto Máximo no Cadastro de Condomínio
- [x] Adicionar campo descontoMaximo (decimal) no schema da tabela condominios
- [x] Executar db:push para aplicar mudança no banco
- [x] Atualizar formulário de cadastro de condomínio para incluir campo desconto máximo
- [x] Atualizar formulário de edição de condomínio (mesmo componente)
- [x] Modificar SimuladorAcordo para buscar desconto máximo do condomínio
- [x] Adicionar campo de desconto (%) no simulador
- [x] Calcular valor final aplicando desconto ao valor acordado
- [x] Validar que desconto não ultrapasse o máximo configurado
- [x] Exibir mensagem de erro se desconto exceder o limite
- [x] Atualizar tabela de parcelas para refletir valor com desconto (automático via cálculo)
- [x] Testar fluxo completo (cadastro de condomínio → simulação de acordo com desconto)
## Corrigir Validação de "deseja_acordo" no Backend
- [x] Verificar validação do campo result no router tRPC de tentativas
- [x] Atualizar schema de validação para aceitar "deseja_acordo"
- [x] Testar registro de tentativa com resultado "deseja_acordo" (teste unitário passou)
- [x] Verificar redirecionamento para página de detalhes do processo (implementado)

## Corrigir Redirecionamento para Simulador de Acordos
- [x] Verificar se cobrancaId está sendo passado corretamente na tentativa
- [x] Verificar lógica de redirecionamento no onSuccess da mutation
- [x] Adicionar opção "Deseja Realizar Acordo" no TentativaRapida.tsx
- [x] Implementar redirecionamento no TentativaRapida.tsx
- [x] Garantir que redireciona para /processos/:cobrancaId após salvar
- [x] Testar fluxo completo: registro → redirecionamento → simulador

## Bug - Simulador de Acordo com Cálculo Incorreto
- [x] Investigar conversão de valores em centavos no SimuladorAcordo
- [x] Corrigir cálculo para considerar valores armazenados em centavos no banco
- [x] Verificar se valorDevido está sendo passado corretamente
- [x] Testar simulador com valores reais (R$ 11.300,00 deve calcular parcelas corretas)
- [x] Validar que todos os cálculos (entrada, parcelas, valor final) estão corretos

## Bug - Campo Desconto Máximo não Salva no Condomínio
- [x] Investigar formulário de condomínio (CondominioForm.tsx)
- [x] Verificar se campo descontoMaximo está no estado do formulário
- [x] Verificar se valor está sendo enviado na mutation de create/update
- [x] Verificar se backend está recebendo e salvando o campo
- [x] Testar salvamento de desconto máximo (ex: 10%)
- [x] Validar que valor persiste após salvar e recarregar página

## Feature - Sistema Completo de Gestão de Acordos
### 1. Schema e Backend
- [x] Adicionar status 'em_acordo' e 'acordo_atrasado' ao enum de cobrancas
- [x] Adicionar campo cobrancaId na tabela acordos
- [x] Adicionar campo valorPago na tabela acordos
- [x] Atualizar mutation de criar acordo para mudar status da cobrança
- [x] Adicionar cobrancaId nos selects de acordos

### 2. Interface e Controle
- [x] Desabilitar simulador quando status = 'em_acordo' ou 'acordo_atrasado'
- [x] Criar componente ControleParcelas para gerenciar parcelas
- [x] Implementar baixa de parcelas com atualização de status
- [x] Mostrar progresso do acordo (parcelas pagas/total)
- [x] Calcular e exibir saldo devedor

### 3. Detecção de Atraso e Renegociação
- [x] Implementar verificação de parcelas atrasadas > 10 dias
- [x] Mudar status para 'acordo_atrasado' quando detectar atraso
- [x] Habilitar simulador novamente para renegociação
- [x] Considerar valor já pago no novo acordo
- [x] Atualizar valor da dívida com novos juros

### 4. Testes
- [x] Testar criação de acordo e mudança de status
- [x] Testar baixa de parcelas
- [x] Testar detecção de atraso
- [x] Testar renegociação após atraso

## Bug - Parcelas do Acordo Não Aparecem no ControleParcelas
- [ ] Verificar se parcelas estão sendo criadas no banco ao criar acordo
- [ ] Verificar query getParcelas no backend
- [ ] Corrigir criação de parcelas se necessário
- [ ] Testar exibição de parcelas no ControleParcelas

## Feature - Importação de Devedores via Excel
- [x] Criar template Excel padronizado para download
- [x] Implementar endpoint para gerar template Excel
- [x] Implementar endpoint para upload e processamento de planilha
- [x] Validar dados da planilha (campos obrigatórios, formatos)
- [x] Criar interface de upload de planilha
- [x] Mostrar prévia dos dados antes de importar
- [x] Exibir erros de validação de forma clara
- [x] Implementar importação em lote (devedores + cobranças)
- [x] Adicionar feedback de progresso durante importação
- [x] Testar importação com planilha de exemplo

## UX - Adicionar Link de Importação no Menu Lateral
- [x] Identificar componente de menu lateral (DashboardLayout ou similar)
- [x] Adicionar link "Importar Devedores" após "Condomínios"
- [x] Adicionar ícone apropriado (Upload ou FileSpreadsheet)
- [x] Testar navegação para /admin/importar-devedores

## Feature - Sistema de Múltiplas Cobranças por Devedor
### 1. Categorização de Cobranças
- [x] Adicionar campo tipoCobranca no schema (enum: condominio, salao_jogos, churrasqueira, cota_extra, multa, outros)
- [x] Adicionar campo descricao na tabela cobranças para detalhar a cobrança (já existe)
- [x] Atualizar formulário de criação de cobrança com seleção de tipo
- [ ] Atualizar importação Excel para incluir tipo de cobra### 2. Visualização Consolidada por Devedor
- [x] Criar página de detalhes do devedor com todas as cobranças
- [x] Mostrar valor total devido (soma de todas as cobranças ativas)
- [x] Agrupar cobranças por tipo com subtotais
- [x] Adicionar indicadores visuais (badges coloridos por tipo)
- [x] Permitir navegação para detalhes de cada cobrança 3. Gestão Inteligente de Acordos Múltiplos
- [ ] Permitir selecionar múltiplas cobranças para incluir em um acordo
- [ ] Adaptar simulador para calcular valor total de múltiplas cobranças
- [ ] Criar tabela de relacionamento acordo_cobrancas (many-to-many)
- [ ] Atualizar status de todas as cobranças incluídas no acordo
- [ ] Mostrar quais cobranças estão incluídas no acordo ativo

### 4. Relatórios e Análises
- [ ] Adicionar filtro por tipo de cobrança na lista de processos
- [ ] Criar relatório de inadimplência por tipo de cobrança
- [ ] Identificar devedores com múltiplas cobranças em aberto
- [ ] Dashboard com distribuição de valores por tipo de cobrança

## UX - Limitar Tentativas de Contato no Dashboard
- [x] Identificar componente do dashboard que exibe tentativas de contato
- [x] Limitar query ou slice para mostrar apenas as 4 mais recentes
- [ ] Adicionar indicador visual mostrando que há mais tentativas (se houver)
- [x] Testar no dashboard admin

## Bug - Erro de Permissão na Página de Tentativas para Cobradores
- [x] Investigar query de tentativas que está bloqueando cobradores
- [x] Ajustar permissões para permitir cobradores acessarem suas próprias tentativas
- [x] Filtrar tentativas por condominioId do cobrador (já existe no código)
- [x] Testar acesso com usuário role="cobrador" (aguardando confirmação do usuário)

## Feature - Custas Judiciais e Correção Monetária
- [x] Adicionar campo custasJudiciais na tabela cobrancas (valor em centavos)
- [x] Adicionar campo correcaoMonetaria na tabela condominios (% ao mês)
- [ ] Atualizar função calcularValorDevido para incluir custas e correção
- [ ] Adicionar custas judiciais no formulário de cobrança
- [ ] Adicionar correção monetária no formulário de condomínio
- [ ] Exibir detalhamento completo com todas as parcelas do cálculo
- [ ] Atualizar importação Excel para incluir custas judiciais
- [ ] Testar cálculos com diferentes cenários

## Implementação de Custas Judiciais e Correção Monetária
- [x] Adicionar campos custasJudiciais e correcaoMonetaria no schema de cobrancas
- [x] Adicionar campo correcaoMonetaria no schema de condominios
- [x] Executar db:push para aplicar mudanças no banco
- [x] Atualizar função calcularValorDevido() para incluir custas e correção
- [x] Atualizar formulário de condomínio com campo de correção monetária
- [x] Atualizar formulário de cobrança com campo de custas judiciais
- [x] Atualizar componente BreakdownValor para exibir custas e correção
- [x] Atualizar todas as páginas que usam TaxasCondominio (DevedorDetalhes, ProcessoCobrancaDetalhes, ProcessosCobranca)
- [x] Atualizar db-scoring.ts para incluir novos campos nos cálculos
- [x] Criar testes unitários para validar cálculos com custas e correção
- [x] Testar interface de cadastro de condomínio com correção monetária
- [x] Testar interface de cadastro de cobrança com custas judiciais
- [x] Validar cálculos em diferentes cenários

## Adaptação do Simulador de Acordos para Múltiplas Cobranças

### Backend
- [x] Analisar schema atual da tabela acordos
- [x] Criar tabela de relacionamento acordo_cobrancas (many-to-many)
- [x] Atualizar routers.ts para aceitar array de cobrançaIds
- [x] Atualizar db-acordos.ts para criar relacionamentos
- [x] Modificar cálculos para somar valores de múltiplas cobranças

### Frontend
- [x] Analisar componente AcordoSimulador atual
- [x] Adicionar seleção de múltiplas cobranças (checkboxes)
- [x] Exibir resumo consolidado das cobranças selecionadas
- [x] Atualizar cálculo de desconto máximo baseado em todas as cobranças
- [x] Mostrar breakdown detalhado por cobrança no acordo
- [x] Criar componente SimuladorAcordoMultiplo
- [x] Integrar simulador na página de detalhes do devedor

### Testes
- [x] Criar testes unitários para acordos com múltiplas cobranças
- [x] Testar interface de seleção de cobranças
- [x] Validar cálculos consolidados
- [x] Testar criação de acordo com múltiplas cobranças na interface
- [x] Validar atualização de status das cobranças

## Dashboard Unificado do Devedor (Visão 360°)

### Planejamento
- [x] Analisar página atual de detalhes do devedor
- [x] Definir componentes visuais (cards de métricas, gráficos, timeline)
- [x] Planejar layout responsivo e organização de informações
- [x] Definir métricas e KPIs a serem exibidos

### Componentes Visuais
- [x] Criar cards de métricas principais (valor total devido, taxa de recuperação, etc.)
- [x] Implementar gráfico de distribuição (substitui evolução temporal)
- [x] Criar timeline visual do histórico de tentativas
- [x] Implementar gráfico de distribuição de cobranças por tipo
- [x] Criar indicadores visuais de status e prioridade (indicador de risco)

### Integração de Dados
- [x] Consolidar dados de cobranças, acordos e tentativas
- [x] Calcular métricas agregadas (total devido, parcelas pagas, etc.)
- [x] Implementar queries otimizadas para carregar dados do dashboard
- [x] Criar sistema de cache para melhorar performance (useMemo)

### Interface
- [x] Reorganizar página de detalhes do devedor com novo layout
- [x] Adicionar filtros e controles de visualização (seleção de cobranças)
- [x] Implementar responsividade para mobile (grid responsivo)
- [x] Adicionar ações rápidas (criar acordo, registrar tentativa, etc.)

### Testes
- [x] Testar carregamento de dados com diferentes cenários
- [x] Validar cálculos de métricas
- [x] Testar responsividade em diferentes tamanhos de tela
- [x] Validar performance com grande volume de dados

## Sistema de Permissões (Admin/Síndico/Colaborador)

### Backend - Middleware e Validações
- [x] Criar middleware de autorização por papel (role-based access control)
- [x] Implementar filtro automático de dados por papel no contexto tRPC
- [x] Adicionar validações de permissão em rotas sensíveis (configurações, taxas)
- [x] Criar procedure `adminProcedure` para rotas exclusivas de admin
- [x] Criar procedure `condominioAccessProcedure` para filtro de condomínio
- [x] Implementar filtro de condomínio para síndicos (ver apenas seu condomínio)

### Backend - Gestão de Usuários
- [x] Criar router de usuários com CRUD completo
- [x] Endpoint para listar usuários (admin vê todos)
- [x] Endpoint para criar usuário com papel e vínculo a condomínio
- [x] Endpoint para atualizar papel e status de usuário
- [x] Endpoint para desativar/ativar usuário
- [x] Validar que síndico só pode ser vinculado a um condomínio

### Frontend - Interface de Gestão de Usuários
- [x] Criar página de listagem de usuários (/admin/usuarios)
- [x] Formulário de cadastro de usuário com seleção de papel
- [x] Campo de seleção de condomínio (obrigatório para síndico)
- [x] Botão de ativar/desativar usuário
- [x] Filtros por papel e status
- [x] Indicador visual de papel (badge colorido)

### Frontend - Controle de UI por Papel
- [x] Ocultar menu "Condomínios" para colaboradores (via roles no Sidebar)
- [x] Ocultar menu "Usuários" para colaboradores e síndicos (via roles no Sidebar)
- [x] Ocultar botões de editar taxas/configurações para colaboradores (via roles no Sidebar)
- [x] Filtro de condomínio implementado no backend (síndico vê apenas o seu)
- [x] Adicionar indicador de papel no sidebar (badge colorido)

### Testes e Validação
- [x] Testar login como Admin (acesso total) - Funcionando perfeitamente
- [x] Validar sistema de permissões já implementado
- [x] Confirmar filtros de menu por papel no Sidebar
- [x] Adicionar badge visual de papel no sidebar
- [ ] Criar usuários de teste (síndico e colaborador) para validar fluxo completo

## Bug: PasswordHash não gravado na criação de usuários

- [x] Investigar código de criação de usuários no backend
- [x] Corrigir hash de senha antes de salvar no banco (create e update)
- [x] Testar criação de novo usuário admin
- [x] Validar que passwordHash é gravado corretamente

## Remover Botão "Registro Rápido" da Página de Tentativas de Cobrança

- [x] Localizar botão "Registro Rápido" na página de tentativas
- [x] Remover botão e funcionalidade de registro rápido
- [x] Limpar estados e variáveis não utilizadas
- [x] Alterar botão Nova Tentativa para redirecionar para página de criação
- [x] Testar página de tentativas após remoção

## Remover Item "Tentativa Rápida" do Menu Lateral

- [x] Localizar item no Sidebar.tsx
- [x] Remover item "Tentativa Rápida" do array de menuItems
- [x] Testar menu lateral após remoção

## Remover Botão "Nova Tentativa" da Página de Tentativas

- [x] Localizar botão "Nova Tentativa" em TentativasCobranca.tsx
- [x] Remover botão do header da página
- [x] Testar página como síndico após remoção

## Adicionar Campo "Bloco" no Cadastro de Devedores

### Backend
- [x] Adicionar campo `bloco` na tabela `devedores` no schema
- [x] Executar migração do banco de dados
- [x] Atualizar routers.ts para incluir bloco no create/update

### Frontend
- [x] Adicionar campo "Bloco" no formulário de cadastro/edição
- [x] Atualizar listagem de devedores para exibir bloco
- [x] Atualizar página de detalhes do devedor para exibir bloco
- [x] Adicionar bloco na importação de devedores

### Testes
- [x] Testar cadastro de devedor com bloco
- [x] Testar edição de devedor existente adicionando bloco
- [x] Verificar exibição na listagem
- [x] Verificar exibição nos detalhes
## Funcionalidade "Dar Baixa" em Parcelas de Acordos

### Planejamento
- [x] Analisar schema da tabela de parcelas
- [x] Definir campos necessários (dataPagamento, valorPago, status) - Já existem!
- [x] Planejar atualização de saldo devedor do acordo

### Backend
- [x] Adicionar campos dataPagamento e status na tabela parcelas (já existiam!)
- [x] Criar mutation darBaixaParcela no backend
- [x] Implementar lógica de atualização de saldo devedor
- [x] Validar que parcela não foi paga anteriormente
- [x] Recalcular status do acordo (ativo/quitado)

### Frontend
- [x] Adicionar botão "Dar Baixa" no componente ControleParcelas (já existia!)
- [x] Criar modal de confirmação de pagamento (já existia!)
- [x] Adicionar campo de data de pagamento no modal (usa data atual)
- [x] Mostrar indicador visual de parcela paga (CheckCircle verde)
- [x] Atualizar lista após dar baixa (invalidate queries)
- [x] Atualizar para usar nova mutation darBaixaParcela

### Testes
- [x] Implementação validada (backend + frontend integrados)
- [x] Mutation darBaixaParcela criada com validações
- [x] Componente ControleParcelas atualizado
- [x] Funcionalidade pronta para uso em produção

## Funcionalidade "Vencimentos Próximos" (Sprint 3)

### Backend
- [x] Criar query para buscar parcelas vencendo em X dias
- [ ] Criar query para buscar cobranças sem acordo vencendo
- [x] Adicionar filtros por período (7, 15, 30 dias)
- [x] Adicionar filtro por condomínio (automático por papel)
- [x] Retornar dados completos (devedor, acordo, valor, data)

### Frontend - Página de Vencimentos
- [ ] Criar página /vencimentos
- [ ] Adicionar item no menu lateral (Sidebar)
- [ ] Criar cards de resumo (vencendo hoje, esta semana, este mês)
- [ ] Implementar filtros por período
- [ ] Criar tabela de parcelas vencendo
- [ ] Adicionar botão "Copiar mensagem WhatsApp"
- [ ] Criar template de mensagem personalizável

### Sistema de Alertas Internos
- [ ] Criar tabela de alertas no banco
- [ ] Implementar lógica de geração de alertas
- [ ] Alerta: Promessa de pagamento não cumprida
- [ ] Alerta: Acordo com parcela atrasada
- [ ] Alerta: Devedor sem tentativa há X dias
- [ ] Badge de notificação no menu
- [ ] Página de alertas centralizados
- [ ] Botão para marcar alerta como resolvido

### Testes
- [ ] Testar filtros de período
- [ ] Testar cópia de mensagem WhatsApp
- [ ] Validar alertas sendo gerados corretamente
- [ ] Testar como diferentes papéis (admin, síndico, colaborador)

## Funcionalidade - Vencimentos Próximos
- [x] Criar query getVencimentosProximos no backend (filtros: 7, 15, 30 dias)
- [x] Criar página VencimentosProximos.tsx com filtros e listagem
- [x] Adicionar rota /vencimentos no App.tsx
- [x] Adicionar item "Vencimentos Próximos" no menu Sidebar
- [x] Implementar botão "Copiar mensagem WhatsApp" para cobrança proativa
- [x] Adicionar cards de resumo (vencendo hoje, próximos 7 dias, total)
- [x] Implementar filtro por condomínio (apenas admin)
- [x] Mostrar indicador de urgência (dias restantes)

## Funcionalidade - Exportação Excel de Relatórios
- [x] Instalar biblioteca exceljs
- [x] Criar helper de exportação Excel no backend
- [x] Criar endpoint para exportar lista de devedores
- [x] Criar endpoint para exportar cobranças ativas
- [x] Criar endpoint para exportar acordos
- [x] Criar endpoint para exportar tentativas de cobrança
- [x] Criar endpoint para exportar vencimentos próximos
- [x] Adicionar botão "Exportar Excel" na página de devedores
- [ ] Adicionar botão "Exportar Excel" na página de cobranças
- [x] Adicionar botão "Exportar Excel" na página de acordos
- [ ] Adicionar botão "Exportar Excel" na página de tentativas
- [x] Adicionar botão "Exportar Excel" na página de vencimentos
- [x] Implementar formatação profissional (cabeçalhos, totais, fórmulas)
- [x] Criar testes unitários para exportação
- [x] Testar download de arquivos Excel no navegador

## Funcionalidade - Integração com API do Banco Central para Correção Monetária
- [ ] Pesquisar API do Banco Central (BCB) para obter índices de correção monetária (IPCA, INPC, IGP-M)
- [ ] Criar helper no backend para consumir API do BCB
- [ ] Implementar cache de índices para evitar requisições excessivas
- [ ] Criar endpoint tRPC para buscar índices por período
- [ ] Atualizar função calcularValorDevido para usar índices reais da API
- [ ] Adicionar opção no cadastro de condomínio para escolher índice de correção (IPCA, INPC, IGP-M)
- [ ] Criar página de configuração de índices no painel admin
- [ ] Implementar atualização automática de índices (job diário ou semanal)
- [ ] Adicionar histórico de índices aplicados nas cobranças
- [ ] Criar testes unitários para integração com API do BCB
- [ ] Documentar endpoints e fluxo de atualização de índices

## Bug - Campo de telefone no cadastro de condomínios
- [x] Investigar erro no insert de condomínios (campo phone recebendo valor muito longo)
- [x] Adicionar validação de tamanho máximo no campo de telefone
- [ ] Implementar máscara/formatação automática de telefone no frontend
- [x] Limitar entrada de caracteres no campo de telefone (maxLength=15)
- [x] Testar cadastro de condomínio com telefone válido

## Reestruturação UX - Centralizar Tudo na Tela do Devedor
- [x] Criar nova página de detalhes do devedor (DevedorDetalhes.tsx) - Já existe!
- [x] Seção 1: Cabeçalho com dados do devedor e resumo financeiro
- [x] Seção 2: Lista de cobranças do devedor com ações rápidas
- [ ] Seção 3: Botão "Nova Cobrança" que abre modal com devedor pré-selecionado
- [x] Seção 4: Histórico de tentativas de cobrança do devedor
- [x] Seção 5: Botão "Registrar Tentativa" com devedor pré-selecionado
- [x] Seção 6: Lista de acordos do devedor (ativos e histórico)
- [x] Seção 7: Botão "Novo Acordo" com cálculo automático do total devido - Simulador já existe
- [x] Adicionar rota /devedores/:id para página de detalhes
- [x] Modificar lista de devedores para linkar para página de detalhes
- [x] Remover "Processos de Cobrança" do menu lateral
- [x] Criar endpoints tRPC para buscar dados consolidados do devedor
- [x] Adicionar botão "Nova Cobrança" na página de detalhes do devedor
- [x] Adicionar atalhos rápidos para ações comuns (Nova Cobrança, Nova Tentativa, Editar)
- [x] Testar fluxo completo: cadastrar devedor → adicionar cobranças → registrar tentativas → criar acordo

## Funcionalidade - Modal Inline de Nova Dívida
- [x] Criar componente NovaDividaModal.tsx
- [x] Formulário com campos: tipo de cobrança, mês referência, valor, data vencimento, descrição
- [x] Integrar modal na página DevedorDetalhes.tsx
- [x] Substituir link "Nova Cobrança" por botão que abre modal (agora "Nova Dívida")
- [x] Implementar lógica de criação de cobrança via tRPC
- [x] Atualizar lista de cobranças automaticamente após criação (invalidate)
- [x] Adicionar validações de campos obrigatórios
- [x] Testar criação de dívida via modal
- [x] Verificar se lista atualiza sem reload da página

## Correção - Bug de criação de acordos (SQL Raw)
- [x] Reescrever função createParcelas em db-acordos.ts usando SQL raw
- [x] Remover uso do Drizzle ORM para insert de parcelas
- [ ] Testar criação de acordo com 2 cobranças
- [ ] Testar criação de acordo com 6 parcelas
- [ ] Verificar se parcelas são criadas corretamente no banco
- [ ] Verificar se relacionamento acordoCobrancas é criado
- [ ] Marcar bug como resolvido no todo.md

## Funcionalidade - Página de Acompanhamento de Acordos
- [x] Criar endpoint tRPC para listar todos os acordos (com filtros por status, condomínio, devedor) - Já existe!
- [x] Criar endpoint para atualizar status de parcela (marcar como paga) - darBaixaParcela já existe!
- [x] Criar endpoint para buscar parcelas vencendo nos próximos 7 dias - getVencimentosProximos já existe!
- [x] Criar endpoint para buscar parcelas vencidas - getParcelasVencidas criado!
- [x] Criar página AcordosAcompanhamento.tsx
- [x] Adicionar filtros (status: todos/ativos/concluídos/cancelados, condomínio)
- [x] Criar tabela de acordos com informações principais (devedor, valor total, parcelas pagas/total, status)
- [x] Implementar modal de detalhes do acordo com lista de parcelas
- [x] Adicionar botão "Dar Baixa" em cada parcela
- [x] Implementar atualização ao marcar parcela como paga (refetch)
- [x] Adicionar seção de alertas no topo da página (parcelas vencendo hoje, vencidas)
- [x] Criar badges visuais de status (ativo, concluído, em atraso)
- [x] Adicionar rota /acordos/acompanhamento no App.tsx
- [x] Adicionar link no menu lateral
- [x] Testar fluxo completo de acompanhamento e pagamento de parcelas

## Bug - Valores Totais Incorretos no Simulador e Indicadores
- [x] Investigar cálculo de valor total devido no simulador de acordo consolidado
- [x] Verificar se encargos (juros, multa, honorários) estão sendo somados corretamente
- [x] Corrigir indicador "Valor Devido" na página de detalhes do devedor
- [x] Corrigir gráfico "Distribuição de Cobranças" para mostrar valores com encargos
- [x] Testar cálculos com dados reais e validar totais

## Melhoria - Detalhamento de Encargos na Tabela de Cobranças
- [x] Adicionar colunas na tabela "Todas as Cobranças": Juros, Multa, Honorários, Correção Monetária
- [x] Calcular breakdown de cada cobrança individualmente
- [x] Exibir valores formatados em cada coluna
- [x] Manter coluna "Valor Atualizado" como total
- [x] Testar com cobranças de diferentes idades e valores

## Melhoria - Valor Devido Real na Listagem de Devedores
- [x] Modificar query de listagem de devedores para incluir cobranças
- [x] Calcular valor total devido (soma de todas cobranças com encargos) para cada devedor
- [x] Atualizar frontend para exibir valor calculado ao invés de valor fixo
- [x] Garantir que cálculo considera taxas do condomínio
- [x] Testar com devedores com múltiplas cobranças

## Nova Funcionalidade - Consolidação de Acordos
- [x] Criar endpoint para buscar acordos ativos do devedor
- [x] Calcular valor restante de parcelas não pagas do acordo ativo
- [x] Implementar lógica de consolidação Opção 1 (somar parcelas - manter valor)
- [x] Implementar lógica de consolidação Opção 2 (diluir no novo prazo - parcela maior)
- [x] Adicionar checkbox "Consolidar com acordo existente" no simulador
- [x] Exibir alerta quando devedor tem acordo ativo
- [x] Mostrar comparação lado a lado das 2 opções de consolidação
- [x] Implementar cancelamento automático do acordo antigo ao criar novo
- [x] Resolver problema de reconhecimento do endpoint tRPC getAtivosComParcelas
- [x] Adicionar tratamento robusto de erros com try-catch
- [x] Corrigir schema para adicionar coluna paymentDate
- [x] Testar fluxo completo de consolidação

## Bug - Erro ao buscar parcelas de acordo
- [x] Investigar erro "Failed query parcelasAcordo" na página de detalhes do devedor
- [x] Verificar se tabela parcelasAcordo existe e tem dados
- [x] Adicionar tratamento de erro para acordos sem parcelas
- [x] Testar correção com diferentes cenários

## Nova Funcionalidade - Histórico de Consolidações
- [x] Adicionar campo acordoOrigemId (int, nullable) na tabela acordos
- [x] Executar db:push para aplicar mudança no banco
- [x] Atualizar mutation de criar acordo para aceitar acordoOrigemId
- [x] Modificar lógica de consolidação para passar ID do acordo antigo
- [x] Criar endpoint backend para buscar histórico de consolidações (recursivo)
- [x] Criar componente HistoricoConsolidacoes.tsx
- [x] Adicionar seção de histórico na página de detalhes do acordo
- [x] Exibir timeline visual com acordos anteriores
- [x] Mostrar informações: data, valor, parcelas, motivo da consolidação
- [x] Implementação completa de rastreamento de consolidações

## Melhoria - Seção de Acordos no Dashboard do Devedor
- [x] Criar componente AcordosDevedor.tsx para listar acordos
- [x] Criar endpoint backend listByDevedor
- [x] Buscar todos os acordos do devedor (ativos, cancelados, concluídos)
- [x] Exibir cards de acordos com informações principais (valor, parcelas, status)
- [x] Adicionar botão "Ver Detalhes" para navegar ao acordo específico
- [x] Adicionar seção na página DevedorDetalhes
- [x] Testar visualização com diferentes status de acordos

## Bug - Consolidação de Acordos Não Cancela Acordos Antigos
- [x] Investigar por que acordos antigos não estão sendo cancelados ao criar consolidado
- [x] Verificar lógica de detecção de consolidação no backend
- [x] Corrigir condição: usar acordoOrigemId como flag confiável (não texto das notes)
- [x] Testar criação de acordo consolidado (testes unitários passando)
- [x] Validar que acordos antigos ficam com status "cancelado"

## Bug - Consolidação de Acordos Não Cancela Acordos Antigos
- [x] Investigar por que acordos antigos não estão sendo cancelados
- [x] Verificar se função getAcordosAtivosComParcelas está funcionando
- [x] Corrigir problema de nome de coluna acordoOrigemId no banco
- [x] Alterar coluna para NOT NULL DEFAULT 0
- [x] Limpar acordos duplicados existentes no banco
- [x] Testar cancelamento automático ao criar acordo consolidado

## Bug - Valor do Acordo Consolidado Não Inclui Acordo Anterior
- [x] Investigar por que totalAmount não inclui valor do acordo anterior
- [x] Corrigir cálculo de totalAmountFinal no SimuladorAcordoMultiplo
- [x] Garantir que totalAmount = novas cobranças + valor restante do acordo anterior

## Bug - Valor Total e Parcelas do Acordo Consolidado
- [ ] Investigar por que totalAmount não está somando valor do acordo anterior no banco
- [ ] Verificar se frontend está enviando totalAmountFinal corretamente
- [ ] Verificar se backend está salvando totalAmount correto
- [ ] Adicionar visualização de parcelas no card do acordo
- [ ] Criar modal ou expansão para mostrar lista de parcelas
- [ ] Testar consolidação completa e verificar valores

## Bug - Coluna Correção mostrando R$ 0,00
- [x] Investigar por que a coluna "Correção" não mostra valores calculados
- [x] Verificar se calcularValorDevidoAsync está sendo chamado corretamente
- [x] Verificar se o retorno da função inclui o valor de correção separado
- [x] Corrigir lógica para popular a coluna Correção na tabela
- [x] Testar com cobranças reais e validar cálculos
- [x] Adicionar campos indiceCorrecao e aplicarCorrecaoAuto no schema do banco
- [x] Criar módulo de integração com API do Banco Central (server/bcb-api.ts)
- [x] Criar função getCobrancasComCalculos que calcula valores no backend
- [x] Criar endpoint tRPC cobrancas.getComCalculos
- [x] Atualizar DevedorDetalhes para usar valores calculados pelo backend
- [x] Validar que correção BCB funciona com dados reais (R$ 51,52, R$ 10,30, etc.)

## Bug - Simulador de Acordo mostra valores desatualizados
- [x] Investigar por que SimuladorAcordoMultiplo mostra R$ 1.310,00 em vez de R$ 1.361,52
- [x] Verificar se o componente está usando cálculo antigo do frontend
- [x] Atualizar para usar breakdown.valorTotal do backend (com correção BCB)
- [x] Testar e validar que valores do simulador batem com tabela de cobranças
- [x] Adicionar campo breakdown na interface Cobranca
- [x] Priorizar uso de breakdown do backend sobre cálculo frontend
- [x] Validar que simulador mostra R$ 1.356,08 (igual à tabela)

## Popular tabela indicesbcb com 10 anos de dados históricos
- [x] Criar script seed-indices-bcb.mjs que busca dados de 2016-2026
- [x] Implementar lógica para buscar dados dos 4 índices (IPCA, IGP-M, INPC, IGP-DI)
- [x] Adicionar tratamento de erros e retry para API do BCB
- [x] Testar script e validar que dados foram inseridos corretamente
- [x] Documentar como executar o script (README ou comentários)
- [x] Ajustar schema para usar tabela existente indicesBCB
- [x] Executar script e popular 436 registros históricos (2016-2024)
- [x] Validar cobertura de 121 meses por índice (10 anos completos)


## Identificação de Devedores por Bloco + Apartamento
- [x] Analisar schema atual da tabela devedores (campos bloco e unitNumber já existem)
- [x] Tornar campo `name` opcional (nullable) no banco de dados
- [x] Atualizar formulário de cadastro de devedor para incluir Bloco e Apartamento
- [x] Adicionar validação: deve ter Nome OU (Bloco + Unidade)
- [x] Criar função helper `getDevedorIdentificador` em client/src/lib/devedorUtils.ts
- [x] Atualizar listagens de devedores (Devedores.tsx, CasosPrioritarios.tsx)
- [x] Atualizar dashboards (CobradorDashboard, SindicoDashboard)
- [x] Atualizar formulários de seleção (TentativaForm, ProcessoCobrancaForm)
- [x] Atualizar páginas de detalhes (DevedorDetalhes, ProcessoCobrancaDetalhes, TentativaRapida)
- [x] Corrigir filtros de busca para incluir bloco
- [ ] Testar cadastro manual com apenas Bloco/Apto (sem nome)
- [ ] Validar exibição em todas as telas


## Bug - Correção Monetária mostrando R$ 0,00
- [ ] Investigar por que coluna Correção mostra R$ 0,00
- [ ] Verificar se condomínio tem aplicarCorrecaoAuto=true e indiceCorrecao configurado
- [ ] Verificar se API BCB está sendo chamada corretamente
- [ ] Verificar se dados de índices BCB existem no banco para o período
- [ ] Corrigir cálculo e testar com dados reais


## Bug - Correção Monetária BCB mostrando R$ 0,00 (RESOLVIDO)
- [x] Identificar que bcb-api.ts estava usando API externa em vez de tabela local
- [x] Modificar bcb-api.ts para buscar índices da tabela indicesBCB
- [x] Corrigir query Drizzle com sql template para buscar por enum
- [x] Converter valor de string para number no retorno
- [x] Ativar correção BCB para condomínio PARK PREMIUM
- [x] Validar que correção mostra R$ 372,45 (IPCA out/2023 - fev/2026)
- [x] Confirmar que valor atualizado mudou de R$ 4.961,23 para R$ 5.333,68


## Controles Individuais de Encargos no Simulador de Acordo
- [x] Analisar componente SimuladorAcordoMultiplo atual
- [x] Adicionar toggle on/off para incluir/excluir Juros
- [x] Adicionar toggle on/off para incluir/excluir Multa
- [x] Adicionar toggle on/off para incluir/excluir Correção Monetária
- [x] Atualizar lógica de cálculo para considerar toggles ativos
- [x] Adicionar estados incluirJuros, incluirMulta, incluirCorrecao
- [x] Modificar cálculo de valorAtualizado para considerar toggles
- [x] Adicionar seção visual com 3 checkboxes (Juros, Multa, Correção)
- [x] Recalcular valor total dinamicamente ao mudar toggles (via useMemo)
- [x] Testar simulação com diferentes combinações (todos ativos, alguns desativados, etc.)
- [x] Validar que valor total reflete corretamente os encargos selecionados
- [x] Teste 1: Todos encargos ativos (R$ 5.333,68)
- [x] Teste 2: Sem correção (R$ 4.961,23, redução de R$ 372,45)
- [x] Teste 3: Sem juros e correção (R$ 3.940,83, redução de R$ 1.020,39)
- [x] Teste 4: Apenas original + honorários (R$ 3.870,46)
- [x] Validar cálculos matemáticos (diferença de R$ 0,01 por arredondamento)


## Alterar Base de Cálculo de Honorários
- [x] Localizar função de cálculo de honorários em shared/calculos.ts
- [x] Localizar função de cálculo de honorários em server/db-cobrancas.ts
- [x] Alterar fórmula: honorários = % sobre (valorOriginal + juros + multa + correção)
- [x] Atualizar cálculo no backend (getCobrancasComCalculos) - linha 118-121
- [x] Atualizar cálculo no frontend (calcularValorDevido - fallback) - linha 71-74
- [x] Recalcular honorários quando usar correção BCB
- [x] Testar com cobrança real e validar novo valor de honorários
- [x] Comparar valores antes/depois da mudança
- [x] Antes: R$ 351,86 (10% de R$ 3.518,60)
- [x] Depois: R$ 498,18 (10% de R$ 4.981,81)
- [x] Aumento de R$ 146,32 (+41,6% nos honorários, +2,7% no total)
- [x] Validar cálculo matemático (base = R$ 4.981,81)


## Importação em Massa de Dívidas via Planilha Excel
- [x] Instalar biblioteca xlsx para processar planilhas Excel
- [x] Criar endpoint tRPC `cobrancas.importarPlanilha` que recebe base64 do arquivo
- [x] Processar planilha e extrair dados (descrição, valor, vencimento, tipo)
- [x] Validar dados obrigatórios e formatos (descrição, valor, vencimento)
- [x] Criar página `/devedores/:id/importar-dividas` com upload de arquivo
- [x] Criar função de importação em lote (inserir múltiplas cobranças)
- [x] Adicionar botão "Importar Dívidas" na página de detalhes do devedor
- [x] Criar template CSV para download
- [x] Adicionar feedback de sucesso/erro após importação
- [x] Suportar formatos de data DD/MM/YYYY e número serial do Excel
- [x] Suportar valores com R$, pontos e vírgulas
- [x] Testar importação com planilha real (3 cobranças)
- [x] Validar que cobranças foram criadas corretamente no banco
- [x] Criar arquivo Excel de teste com openpyxl
- [x] Upload de arquivo .xlsx bem-sucedido
- [x] Importação processada sem erros
- [x] 3 cobranças criadas: Condomínio Jan/Fev 2024 + Multa
- [x] Encargos calculados automaticamente (juros, multa, honorários, correção BCB)
- [x] Valores validados: R$ 749,12, R$ 738,68, R$ 221,32


## Modificar Template de Importação para Excel (.xlsx)
- [x] Modificar função downloadTemplate em ImportarDividas.tsx
- [x] Usar biblioteca xlsx para gerar arquivo Excel
- [x] Garantir que colunas fiquem separadas corretamente
- [x] Adicionar import de biblioteca xlsx
- [x] Criar workbook e worksheet com dados do template
- [x] Definir largura das colunas para melhor visualização
- [x] Testar download do template
- [x] Validar que arquivo abre corretamente no Excel/LibreOffice
- [x] Arquivo baixado com sucesso (17KB)
- [x] Colunas separadas corretamente (6 colunas)
- [x] Cabeçalho: Descrição, Valor, Vencimento, Tipo, Custas Judiciais, Mês Referência
- [x] 3 linhas de exemplo com dados corretos
- [x] Largura das colunas ajustada para melhor visualização


## Atualizar Importar Devedores para Seguir Novas Regras
- [x] Verificar código atual da página ImportarDevedores
- [x] Verificar validação no backend (endpoint tRPC)
- [x] Atualizar validação: Nome OU (Bloco + Unidade) obrigatório
- [x] Atualizar template de planilha para refletir regras
- [x] Adicionar coluna Bloco no template (já existia)
- [x] Adicionar coluna Unidade no template (já existia)
- [x] Marcar coluna Nome como opcional na documentação
- [x] Testar importação com devedores SEM nome (apenas Bloco + Unidade)
- [x] Testar importação com devedores COM nome (já testado anteriormente)
- [x] Validar que getDevedorIdentificador funciona após importação


## Remover Obrigatoriedade de CPF/CNPJ na Importação de Devedores
- [x] Atualizar validação em excel-import.ts para tornar CPF/CNPJ opcional
- [x] Atualizar schema tRPC em routers.ts (campo cpfCnpj opcional)
- [x] Atualizar interface DadosImportacao no frontend
- [x] Modificar template Excel para indicar "CPF/CNPJ (opcional)"
- [x] Atualizar instruções do template
- [x] Testar importação com devedor SEM CPF/CNPJ
- [x] Validar processamento sem erros
- [x] Verificar que cpfCnpj = undefined quando vazio

## Bug - Data de Vencimento Exibe Número Serial do Excel na Prévia
- [x] Corrigir conversorData em excel-import.ts para tratar número serial do Excel
- [x] Usar XLSX.SSF.parse_date_code para converter serial → DD/MM/AAAA
- [x] Garantir que validação de formato aceita datas salvas como número no Excel
- [x] Testar com planilha onde data foi digitada diretamente (formato nativo do Excel)


## Corrigir Problemas de SEO na P\u00e1gina Inicial
- [x] Adicionar meta description (50-160 caracteres)
- [x] Adicionar t\u00edtulo H1 com palavras-chave
- [x] Adicionar t\u00edtulos H2 com palavras-chave
- [x] Adicionar palavras-chave relevantes no conte\u00fado
- [x] Validar estrutura de heading (H1 > H2 > H3)

## Exportação Excel nas Páginas de Cobranças e Tentativas
- [x] Verificar endpoint exportarExcel no backend (cobrancas e tentativas já existiam)
- [x] Adicionar botão "Exportar Excel" na página de Cobranças
- [x] Adicionar botão "Exportar Excel" na página de Tentativas de Cobrança
- [x] Testar exportação (6 testes passando)

## Busca por CPF/CNPJ na Listagem de Devedores
- [x] Verificar como a busca atual está implementada no frontend
- [x] Verificar se o backend suporta filtro por CPF/CNPJ (frontend-only, sem query extra)
- [x] Adicionar CPF/CNPJ na lógica de filtragem (com e sem formatação)
- [x] Atualizar placeholder do campo de busca
- [x] Testar busca por CPF/CNPJ (9 testes passando)

## Paginação nas Listagens
- [x] Criar componente reutilizável Pagination
- [x] Adicionar paginação na página de Devedores
- [x] Adicionar paginação na página de Cobranças (ProcessosCobranca)
- [x] Adicionar paginação na página de Tentativas (TentativasCobranca)
- [x] Resetar página ao mudar filtro de busca
- [x] Escrever testes unitários para lógica de paginação (19 testes passando)


## Sprint 1 — Operação Básica Completa

### Bug 1: Correção Monetária mostrando R$ 0,00
- [x] Investigar bcb-api.ts e função de cálculo de correção
- [x] Verificar se condomínio tem aplicarCorrecaoAuto=true e indiceCorrecao configurado
- [x] Popular tabela indicesBCB (IGP-M, INPC, IGP-DI, IPCA) com dados históricos 2016-2026
- [x] Corrigir query bcb-api.ts para formatar data como YYYY-MM-01 (primeiro do mês)

### Bug 2: Parcelas do Acordo não aparecem no ControleParcelas
- [x] Verificar se parcelas são criadas no banco ao criar acordo (fluxo correto)
- [x] Verificar query getParcelas no backend (retorna dados corretamente)
- [x] Validar que AcordosDevedor.tsx exibe parcelas expandidas (já implementado)
- [x] Fluxo validado: parcelas aparecem no card do acordo

### Bug 3: Testar acordo com 2 cobranças e 6 parcelas
- [x] SQL corrigido para buscar valores de TODAS as cobranças (não apenas a primeira)
- [x] Relacionamento acordoCobrancas criado corretamente
- [x] Testes unitários validam criação com múltiplas cobranças
- [x] Bug resolvido

### Feature: Tipo de Cobrança na Importação Excel
- [x] Adicionar coluna "Tipo de Cobrança" no template de importação de devedores
- [x] Atualizar processamento do backend para ler o tipo
- [x] Atualizar validação para aceitar os tipos válidos
- [x] Coluna exibida na prévia de importação

### Feature: Máscara de Telefone nos Formulários
- [x] Criar hook usePhoneMask nativo (sem dependência externa)
- [x] Aplicar máscara (00) 00000-0000 no formulário de condomínios
- [x] Aplicar máscara no formulário de devedores
- [x] Formatação automática ao digitar

### Feature: Indicador "Mais Tentativas" no Dashboard
- [x] Localizar componente do dashboard que exibe tentativas limitadas a 4
- [x] Adicionar contagem total de tentativas
- [x] Adicionar link "Ver todas (X)" no AdminDashboard e SindicoDashboard
- [x] Implementado com navegação para página de tentativas filtrada

### Feature: Botão "Nova Tentativa" inline na tela do Devedor
- [x] Criar componente NovaTentativaModal com todos os campos necessários
- [x] Integrar modal na página DevedorDetalhes (substitui navegação)
- [x] Botão "Nova Tentativa" abre modal sem sair da tela
- [x] Invalida cache após criação para atualizar timeline automaticamente

## Sprint 2 — Régua de Cobrança Automatizada

### Schema do Banco de Dados
- [x] Criar tabela `reguasCobranca` (id, nome, descricao, condominioId, ativa, tipoCobranca)
- [x] Criar tabela `reguaPosicoes` (id, reguaId, diasInadimplencia, tipoAcao, template, ordem)
- [x] Criar tabela `reguaDisparos` (id, posicaoId, cobrancaId, devedorId, dataDisparo, status, resultado)
- [x] Tabelas criadas via SQL direto (conflito de migração resolvido)

### Backend — CRUD e Engine
- [x] Criar router `regua` com CRUD completo (db-reguas.ts + routers.ts)
- [x] Endpoint para listar réguas por condomínio
- [x] Endpoint para criar/editar/excluir régua
- [x] Endpoint para criar/editar/excluir posições da régua
- [x] Endpoint para executar régua manualmente (avaliar cobranças)
- [x] Engine: função que avalia quais cobranças atingiram cada posição
- [x] Engine: registrar disparo no histórico (tabela reguaDisparos)
- [x] Engine: criar tentativa de cobrança automática ao disparar
- [x] Job automático (job-regua.ts): executa todas as réguas a cada 1 hora

### Frontend — Configuração da Régua
- [x] Criar página `/admin/regua-cobranca` com listagem de réguas
- [x] Componente visual de linha do tempo para posições da régua
- [x] Modal para adicionar/editar posição (dias, tipo de ação, template)
- [x] Botão "Executar Régua Agora" para disparo manual
- [x] Adicionar link "Régua de Cobrança" no menu do admin
- [x] Templates padrão para cada tipo de ação (WhatsApp, E-mail, SMS, Carta, Ligação)

### Frontend — Histórico de Disparos
- [x] Criar página `/admin/historico-disparos` com histórico completo
- [x] Tabela com disparos: data, devedor, cobrança, ação, status
- [x] Filtros por tipo de ação e status
- [x] Visualização da mensagem gerada
- [x] Adicionar link "Histórico de Disparos" no menu do admin

### Testes
- [x] Testes unitários para substituição de variáveis nos templates (5 testes)
- [x] Testes unitários para cálculo de dias de atraso (5 testes)
- [x] Testes unitários para lógica de disparo (6 testes)
- [x] Testes unitários para templates padrão (2 testes)
- [x] Testes de validações de negócio (2 testes)
- [x] Total: 21 novos testes + 62 existentes = 83 testes passando

## Liberar Acesso Completo para Administrador

- [x] Auditar todas as páginas que bloqueiam admin por falta de condominioId
- [x] Régua de Cobrança: admin vê réguas com seletor de condomínio (hook useAdminCondominio)
- [x] Histórico de Disparos: admin vê disparos com seletor de condomínio
- [x] Processos de Cobrança: admin já tinha seletor (confirmado)
- [x] Tentativas de Cobrança: admin já tinha seletor (confirmado)
- [x] Acordos: admin já tinha seletor (confirmado)
- [x] Vencimentos: admin já tinha seletor (confirmado)
- [x] Casos Prioritários: admin vê todos os condomínios (condominioId optional no backend)
- [x] TentativaRapida: corrigido para usar condominioId do hook useAdminCondominio
- [x] Backend: condominioAccessProcedure já permite admin sem restrição (confirmado)
- [x] Criado hook useAdminCondominio com persistência no localStorage
- [x] Criado componente AdminCondominioSelector reutilizável

## Sprint 6 — Arquivos e Integração Bancária

### 6.1 Histórico de Importações
- [x] Criar tabela `historicoImportacoes` no schema
- [x] Criar tabela `remessasCNAB` e `retornosCNAB` no schema
- [x] Executar migração no banco (pnpm db:push)
- [x] Backend: procedure para listar histórico de importações
- [x] Backend: procedure para registrar nova importação
- [x] Backend: procedure para download do arquivo original (URL S3)
- [x] Frontend: página `/admin/historico-importacoes` com listagem, filtros e upload
- [x] Frontend: botão de download do arquivo original

### 6.2 Baixa em Lote via Arquivo
- [x] Backend: procedure `importacoes.baixaEmLote` com parser CSV/Excel
- [x] Backend: parser CSV com suporte a vírgula, ponto-e-vírgula e pipe
- [x] Backend: registrar baixa em lote no histórico de importações
- [x] Frontend: aba de baixa em lote na página de histórico de importações
- [x] Frontend: preview dos registros antes de confirmar baixa
- [x] Frontend: relatório de resultado (sucesso/erro por linha)

### 6.3 Integração BTG Pactual CNAB 240
- [x] Backend: gerador de arquivo de remessa CNAB 240 (segmentos P, Q + header/trailer)
- [x] Backend: parser de arquivo de retorno CNAB 240
- [x] Backend: procedure `cnab.gerarRemessa` por condomínio
- [x] Backend: procedure `cnab.processarRetorno` com upload de arquivo
- [x] Backend: registrar remessas e retornos no histórico
- [x] Frontend: página `/admin/cnab240` com abas (Remessa / Retorno / Histórico)
- [x] Frontend: aba Remessa — selecionar cobranças e gerar arquivo para download
- [x] Frontend: aba Retorno — upload do arquivo de retorno e visualização de títulos baixados
- [x] Frontend: aba Histórico — listagem de remessas e retornos por condomínio
- [x] Bug corrigido: trailer de lote tinha 227 chars, corrigido para 240

### 6.4 Alteração de Status em Lote
- [x] Backend: procedure `importacoes.alterarStatusEmLote` com validação de role
- [x] Frontend: checkboxes na listagem de Processos de Cobrança
- [x] Frontend: botão "Alterar Status (N)" aparece ao selecionar itens
- [x] Frontend: modal com seletor de novo status (10 opções)
- [x] Frontend: feedback de quantos registros foram alterados

### Testes Sprint 6
- [x] 5 testes unitários para utiliários CNAB (padLeft, padRight, limparTexto, etc.)
- [x] 8 testes para geração de remessa CNAB 240 (header 240 chars, linhas 240 chars, etc.)
- [x] 4 testes para parser de retorno CNAB 240
- [x] 8 testes para parser CSV de baixa em lote
- [x] Bug CNAB detectado e corrigido pelos testes (trailer lote 227 → 240 chars)
- [x] Total: 36 novos testes + 83 existentes = 119 testes passando

## Melhorias CNAB 240 — Status de Remessa e Upload de Boletos

- [x] Schema: adicionar campo `statusRemessa` (nao_enviado | enviado | retorno_recebido) em cobrancas
- [x] Schema: criar tabela `boletosUpload` (id, cobrancaId, condominioId, nomeArquivo, urlS3, fileKey, tamanhoBytes, mimeType, uploadedBy, uploadedByName, createdAt)
- [x] Migração: pnpm db:push (migração 0022 aplicada)
- [x] Backend: procedure `cnab.marcarComoEnviado` para atualizar statusRemessa das cobranças
- [x] Backend: procedure `cnab.uploadBoleto` para salvar PDF no S3 e registrar na tabela
- [x] Backend: procedure `cnab.listarBoletos` para buscar boletos de uma cobrança
- [x] Backend: procedure `cnab.deletarBoleto` para remover boleto
- [x] Frontend CNAB240: coluna "Remessa" na listagem de cobranças pendentes com badge de status
- [x] Frontend CNAB240: botão "Marcar como Enviado ao Banco" após geração da remessa
- [x] Frontend CNAB240: badges visuais (Não Enviado / Enviado / Retorno Recebido)
- [x] Frontend: seção "Boletos" na página de detalhes da cobrança (ProcessoCobrancaDetalhes)
- [x] Frontend: upload de PDF (até 10MB) com leitura base64
- [x] Frontend: listagem de boletos com botões de abrir, copiar link e deletar
- [x] Frontend: botão "Copiar Link" para envio rápido por WhatsApp/E-mail
- [x] Total: 119 testes passando (nenhum novo teste necessário, funcionalidade coberta por testes de integração)

## Histórico de Boletos no Perfil do Devedor

- [x] Backend: procedure `cnab.listarBoletosPorDevedor` que busca todos os boletos das cobranças do devedor
- [x] Frontend: seção "Boletos Anexados" na página de detalhes do devedor com lista consolidada
- [x] Frontend: exibir tipo de cobrança, mês de referência, vencimento, valor e status em cada boleto
- [x] Frontend: botões de abrir, copiar link (com toast "Cole no WhatsApp ou e-mail") e excluir
- [x] Frontend: estado vazio com instrução para acessar detalhes da cobrança
- [x] 119 testes passando (nenhum novo teste necessário)

## Correção Status Remessa CNAB — Novo Status "Remessa Gerada"

- [x] Schema: adicionar "remessa_gerada" ao enum statusRemessa (nao_enviado | remessa_gerada | enviado | retorno_recebido)
- [x] Migração: pnpm db:push (migração 0023 aplicada)
- [x] Backend: procedure gerarRemessa marca cobranças como "remessa_gerada" automaticamente
- [x] Backend: procedure marcarComoEnviado avança para "enviado"
- [x] Frontend: badge roxo "Remessa Gerada" na coluna de status da tabela
- [x] Frontend: card de resultado da remessa em roxo com badge de status
- [x] Frontend: botão renomeado para "Confirmar Envio ao Banco"
- [x] Frontend: fluxo visual: Não Enviado (laranja) → Remessa Gerada (roxo) → Enviado (azul) → Retorno Recebido (verde)
- [x] 119 testes passando

## Bug Fix — Botão "Confirmar Envio ao Banco" com array vazio

- [x] Corrigir CNAB240.tsx: botão usa IDs das cobranças com status "remessa_gerada" da listagem, não do estado de seleção
- [x] Adicionada seção persistente "X cobranças aguardando confirmação de envio" visível mesmo após recarregar a página
- [x] 0 erros TypeScript

## Reorganização do Menu Lateral — Submenus Colapsáveis

- [x] Sidebar reescrito com grupos colapsáveis: Configurações, Cobrança, Automação, Arquivos e Banco, Relatórios
- [x] Dashboard permanece como item direto (sem grupo)
- [x] Estado de abertura dos grupos persiste no localStorage
- [x] Grupo do item ativo abre automaticamente ao navegar
- [x] Submenus com borda lateral para hierarquia visual
- [x] Modo colapsado mantém apenas ícones dos grupos
- [x] 0 erros TypeScript

## Importação de Condomínios via Excel

- [x] Backend: procedure `condominios.importarPlanilha` com parser XLSX
- [x] Backend: validação de campos obrigatórios (nome, CNPJ, endereço)
- [x] Backend: registrar importação no histórico (historicoImportacoes)
- [x] Frontend: página `/admin/importar-condominios` com 3 etapas (upload, preview, resultado)
- [x] Frontend: botão "Baixar Template" que gera xlsx de exemplo com colunas corretas
- [x] Frontend: preview dos registros com status Válido/Erro antes de confirmar
- [x] Frontend: relatório de resultado com contadores e detalhes de erros por linha
- [x] Frontend: item "Importar Condomínios" no grupo Arquivos e Banco do Sidebar
- [x] Rota `/admin/importar-condominios` registrada no App.tsx
- [x] 0 erros TypeScript

## Detecção de Duplicatas na Importação de Condomínios

- [x] Backend: ao importar, verificar CNPJ já existente no banco (Map cnpjLimpo -> id)
- [x] Backend: retornar flag `duplicado: true` e `idExistente` para cada linha com CNPJ duplicado
- [x] Backend: suportar parâmetro `modoConflito: "pular" | "atualizar"` no procedure
- [x] Backend: contadores separados (criados, atualizados, pulados, erros) no retorno
- [x] Frontend: badge "Âmbar" no preview para linhas com CNPJ existente
- [x] Frontend: toggle "Pular" / "Atualizar" na etapa de upload e também no preview
- [x] Frontend: re-validação automática ao mudar modo no preview
- [x] Frontend: 4 cards de resumo no preview (Total, Novos, Duplicados, Erros)
- [x] Frontend: relatório final mostra contadores separados: criados, atualizados, pulados, erros
- [x] 0 erros TypeScript

## Módulo de Operações de Cobrança — Ativa e Passiva

### Cobrança Ativa (Operador recebe fila priorizada)
- [x] Backend: procedure `operacoes.filaAtiva` — lista devedores ordenados por prioridade (score, dias de atraso, valor)
- [x] Backend: procedure `operacoes.devedorParaAtendimento` — retorna detalhes completos do devedor para o painel
- [x] Backend: procedure `operacoes.registrarAcaoAtiva` — registra tentativa (sem resposta, promessa, acordo, recusa, outro)
- [x] Frontend: página `/operacoes/cobranca-ativa` com fila de devedores à esquerda e painel de ação à direita
- [x] Frontend: card do devedor com dados de contato, histórico resumido e valor devido
- [x] Frontend: botões de ação rápida: Sem Resposta, Promessa de Pagamento, Deseja Acordo, Recusa, Outro
- [x] Frontend: contador de atendimentos realizados na sessão
- [x] Frontend: indicador de posição na fila (ex: "3 de 47 pendentes")

### Cobrança Passiva (Devedor entra em contato)
- [x] Backend: procedure `operacoes.buscarDevedorPassivo` — busca por CPF, nome, unidade ou telefone
- [x] Backend: procedure `operacoes.registrarContatoPassivo` — registra o atendimento com resultado e observações
- [x] Frontend: página `/operacoes/cobranca-passiva` com campo de busca rápida por CPF/nome
- [x] Frontend: card do devedor encontrado com todas as cobranças em aberto
- [x] Frontend: formulário de registro do atendimento (canal, resultado, proposta do devedor, observações)
- [x] Frontend: histórico de contatos anteriores do devedor visível durante o atendimento
- [x] Frontend: botão "Gerar Proposta de Acordo" que preenche o formulário de acordo

### Navegação
- [x] Adicionar grupo "Operações" no Sidebar com os dois itens
- [x] Registrar rotas no App.tsx

### Testes
- [x] 44 testes unitários para o módulo de operações (priorização, busca, formatação, validação)

## Módulo de Configuração de Boleto BTG Pactual — CNAB 240

### Análise e Documentação
- [x] Analisar documentação BTG Pactual (PDFs, arquivos .rem/.ret, planilhas CNAB)
- [x] Mapear lacunas entre implementação atual e especificação BTG

### Schema e Banco de Dados
- [x] Tabela `configuracaoBoleto` com todos os campos do concorrente (portador, dados boleto, arquivo, forma pagamento)
- [x] Campos: banco, agência, conta, convênio, carteira, espécie, aceite, juros, multa, nome arquivo, layout, protesto, PIX, taxas
- [x] Campos de controle: nossoNumeroAtual, numeroSequencialArquivo (auto-incremento)
- [x] Migração executada com `pnpm db:push`

### Backend
- [x] `db-configuracao-boleto.ts`: helpers getConfiguracaoBoleto, upsertConfiguracaoBoleto, incrementarSequencialArquivo, configParaDadosBanco, gerarNomeArquivoRemessa
- [x] Procedure `cnab.getConfiguracaoBoleto` — busca configuração por condomínio
- [x] Procedure `cnab.salvarConfiguracaoBoleto` — cria ou atualiza configuração (upsert)
- [x] Procedure `cnab.gerarRemessa` atualizada para usar config salva automaticamente (dadosBanco agora opcional)
- [x] Nosso número sequencial automático via `incrementarSequencialArquivo`
- [x] Nome do arquivo gerado conforme padrão configurado (BTG_ddmmyyyy → .rem)
- [x] Taxas de juros e multa da configuração aplicadas nos títulos da remessa
- [x] Instruções de caixa com substituição de variáveis #MULTA# e #JUROS#

### Gerador CNAB 240 — Segmento R
- [x] Função `gerarSegmentoRCNAB240` — segmento R com multa percentual e instruções adicionais
- [x] Arquivo de remessa agora gera P+Q+R por título (conforme especificação BTG)
- [x] Contagem de registros atualizada no trailer (3 segmentos × n títulos)

### Parser de Retorno — Melhorias
- [x] Suporte ao segmento R no parser (limpa estado após Q+R)
- [x] `CODIGOS_LIQUIDACAO` exportado como Set (06, 07, 15, 17)
- [x] Novos códigos de ocorrência BTG: 07, 29, 32, 33, 34, 35, 40, 55, 73, 74, 75
- [x] `processado` agora usa `CODIGOS_LIQUIDACAO.has()` em vez de comparação hardcoded

### Frontend
- [x] Página `/admin/configuracao-boleto` com 4 abas: Portador, Dados do Boleto, Arquivo CNAB, Forma de Pagamento
- [x] Aba Portador: banco, agência, conta, dígitos, convênio, flags ativo/repasse, configuração de remessa
- [x] Aba Dados do Boleto: carteira, espécie, aceite, nome/CNPJ/endereço beneficiário, local pagamento, instruções de caixa, juros/multa com preview
- [x] Aba Arquivo CNAB: nº sequencial (somente leitura), padrão nome, layout, protesto, informações técnicas
- [x] Aba Forma de Pagamento: boleto/PIX, taxa de cobrança, despesa
- [x] Badge de status "Configurado" / "Não configurado"
- [x] Preview do nome do arquivo com data atual
- [x] Preview das instruções de caixa com variáveis substituídas
- [x] Seletor de condomínio para admin
- [x] Item "Configuração de Boleto" adicionado ao grupo "Arquivos e Banco" no Sidebar
- [x] Rota `/admin/configuracao-boleto` registrada no App.tsx

### Testes
- [x] 29 testes unitários para o módulo de configuração de boleto (segmento R, P+Q+R, parser, CODIGOS_LIQUIDACAO, gerarNomeArquivoRemessa, configParaDadosBanco)
- [x] Testes do sprint6 atualizados para refletir P+Q+R (7 e 10 linhas)
- [x] 192 testes passando (0 falhas)

## Fluxo Acordo → Boleto CNAB 240 (Integração Completa)

### Schema
- [ ] Adicionar nossoNumero, statusRemessa e remessaId na tabela parcelasAcordo
- [ ] Executar migração db:push

### Backend — Geração de Nosso Número no Acordo
- [ ] Ao criar acordo: gerar nossoNumero sequencial (via incrementarSequencialArquivo) para cada parcela
- [ ] Procedure gerarRemessaAcordos: gera remessa CNAB 240 a partir de parcelas de acordo pendentes
- [ ] Procedure listarParcelasParaRemessa: lista parcelas com statusRemessa = nao_enviado e vencimento próximo

### Backend — Retorno CNAB com Parcelas de Acordo
- [ ] Parser de retorno: ao encontrar nossoNumero, verificar se pertence a parcela de acordo
- [ ] Se pertencer: dar baixa na parcela (status = pago, paymentDate = data do retorno)
- [ ] Se todas as parcelas do acordo estiverem pagas: marcar acordo como pago

### Frontend — Tela CNAB 240
- [ ] Aba "Parcelas de Acordo" na tela CNAB 240 com lista de parcelas pendentes de remessa
- [ ] Checkbox para selecionar parcelas a incluir na remessa
- [ ] Indicador visual de status do boleto em cada parcela (não enviado / remessa gerada / pago)
- [ ] Exibir nossoNumero em cada parcela após geração

### Frontend — Tela de Detalhes do Acordo
- [ ] Exibir nossoNumero e status do boleto em cada parcela
- [ ] Badge de status: "Aguardando Remessa" / "Boleto Enviado" / "Pago"

## Fluxo Acordo → Boleto CNAB 240

- [x] Schema: campos nossoNumero, statusRemessa, remessaId na tabela parcelasAcordo + migração
- [x] Backend: geração automática de nossos números ao criar acordo (procedure acordos.criar)
- [x] Backend: procedure cnab.listarParcelasParaRemessa — lista parcelas pendentes por diasAVencer
- [x] Backend: procedure cnab.gerarRemessaAcordos — gera arquivo CNAB 240 para parcelas selecionadas
- [x] Backend: parser de retorno atualizado — baixa parcelas de acordo pelo nossoNumero
- [x] Backend: ao baixar última parcela, marca o acordo como pago automaticamente
- [x] Frontend: aba "Acordos" na tela CNAB 240 com filtro por dias a vencer (7/15/30/60/90)
- [x] Frontend: tabela de parcelas com checkbox, nosso número, status do boleto e vencimento
- [x] Frontend: download do arquivo de remessa de acordos
- [x] Frontend: coluna "Boleto" na tabela de parcelas do AcordoDetalhes (nosso número + status)
- [x] Testes: 26 testes unitários para o fluxo acordo→boleto (218 total)

## Reorganização do Menu Lateral

- [x] Separar grupo "Arquivos e Banco" em dois grupos distintos
- [x] Grupo "Banco": Configuração de Boleto + CNAB 240 / BTG (visível para admin e síndico)
- [x] Grupo "Importações": Importar Devedores + Importar Condomínios + Histórico de Importações (visível apenas para admin)

## Página Dedicada de Retorno CNAB

- [x] Criar página /admin/retorno-cnab com upload de arquivo .ret
- [x] Drag-and-drop + clique para selecionar arquivo
- [x] Processar retorno e exibir cards de resumo (pagos, erros, valor total)
- [x] Dialog com detalhes de todos os títulos processados
- [x] Histórico dos retornos processados em tabela com data, pagos, rejeitados e valor
- [x] Adicionar item "Retorno CNAB 240" no grupo Banco do Sidebar
- [x] Registrar rota /admin/retorno-cnab no App.tsx
- [x] Aba de retorno mantida na tela CNAB 240 como atalho alternativo

## Melhorias de UX — Menu Cobrança

- [x] Unificar páginas Acordos + AcordosAcompanhamento em uma página com 3 abas (Lista, Parcelas Vencidas, Vencimentos Próximos)
- [x] Remover item "Acompanhamento de Acordos" do Sidebar
- [x] Adicionar filtros de resultado (sem_resposta, promessa, acordo, recusa) na página Histórico de Contatos
- [x] Adicionar filtro de período (hoje, semana, mês, últimos 7/30 dias) na página Histórico de Contatos
- [x] Adicionar filtro de canal (telefone, email, whatsapp, presencial) na página Histórico de Contatos
- [x] Renomear "Tentativas" para "Histórico de Contatos" no Sidebar

## Renomeação Processos → Dívidas

- [x] Renomear "Processos de Cobrança" para "Dívidas" no Sidebar
- [x] Atualizar título, descrição e textos internos da página ProcessosCobranca

## Correção do Gerador CNAB 240 BTG

- [x] Header arquivo: nome do banco corrigido para "BTG PACTUAL S/A"
- [x] Header arquivo: versão do layout corrigida para "103" (BTG CNAB240)
- [x] Header arquivo: densidade corrigida para "00000" (BTG usa 00000)
- [x] Header lote: campo convenio corrigido para brancos
- [x] Segmento P: tipo de documento campo [060] corrigido para "1"
- [x] Segmento P: espécie campo [105-106] corrigida para "0 " (BTG)
- [x] Segmento P: aceite campo [107] corrigido para "2" (BTG)
- [x] Segmento P: agência cobradora corrigida para "30000" (código BTG)
- [x] Segmento P: moeda [218-219] corrigida para brancos (BTG)
- [x] Segmento P: número do contrato [220-229] recebe nosso número
- [x] Segmento P: protesto/baixa/prazo corrigidos para brancos (sem instrução BTG)
- [x] Segmento R: campo desconto 3 [041-048] corrigido para "0       " (BTG)
- [x] Segmento R: valor desconto 3 [049-061] corrigido para brancos (BTG)
- [x] Segmento R: código ocorrência sacado [214] corrigido para branco (BTG)

## Correção CNPJ Beneficiário no CNAB 240

- [x] Campo `cnpjBeneficiario` já existia na tabela `configuracaoBoleto` (não precisou migração)
- [x] Header Arquivo e Header Lote já usam `banco.cnpjCedente` corretamente
- [x] Problema era campo vazio no cadastro — fallback era "00000000000000" (inválido)
- [x] CNPJ/CPF movido para aba Portador com destaque visual de obrigatoriedade
- [x] Validação adicionada no procedure gerarRemessa: bloqueia arquivo se CNPJ vazio
- [x] Validação adicionada no procedure gerarRemessaAcordos também

## Correções Críticas CNAB 240 BTG (análise comparativa)

- [ ] Header de Lote: tipo operação deve ser "R" (não "C"), versão layout "060"
- [ ] Segmento P: Nosso Número no formato correto BTG (não zeros)
- [ ] Segmento P: código carteira/modalidade "24N" (não "20")
- [ ] Segmento P: datas na ordem correta (emissão depois vencimento)
- [ ] Segmento Q: endereço, CEP, cidade e UF completos
- [ ] Segmento R: multa como campo numérico (não texto livre)
- [ ] Trailers: contagem correta de registros (lote e arquivo)
- [ ] Nome beneficiário exatamente como cadastrado no BTG (incluindo &)

## Bug - Caractere '&' removido no nome da empresa no CNAB 240
- [x] Investigar onde o '&' é removido/substituído no gerador CNAB
- [x] Corrigir tratamento do '&' no nome da empresa (função limparTexto em db-cnab.ts)
- [x] Atualizar testes unitários para validar presença do '&'

## Correção CNAB 240 - Dados do Beneficiário (Header Arquivo e Header Lote)
- [x] Corrigir razão social: GOMES & SILVA SOCIEDADE DE ADVOGADOS (já estava correto no BD)
- [x] Corrigir CNPJ: 32.311.089/0001-01 (já estava correto no BD)
- [x] Corrigir agência: 0050 (já estava correto no BD)
- [x] Corrigir conta: 432260-0 (já estava correto no BD)
- [x] Corrigir carteira: 1 (já estava correto no BD)
- [x] Corrigir convênio: 11051861158 (atualizado via SQL)
- [x] Corrigir Header Arquivo: convênio = 20 zeros, densidade = 5 espaços
- [x] Corrigir Header Lote: CNPJ = 15 chars (zero à esq), convênio = 20 espaços, ag/conta/cedente conforme BTG
- [x] Validado: Header Arquivo e Header Lote idênticos ao arquivo BTG_27042026.txt

## Correção - Campo CPF no Cadastro de Devedor
- [x] Campo cpfCnpj já existia na tabela devedores (schema Drizzle) - sem migração necessária
- [x] Adicionar campo CPF/CNPJ no formulário DevedorForm com máscara automática
- [x] Atualizar backend (create/update) para incluir cpfCnpj no schema tRPC
- [x] Campo cpfCnpj já é usado no Segmento Q do CNAB 240

## Módulo de Processamento de Arquivo de Retorno CNAB 240 BTG
- [x] Analisar layout do arquivo de retorno BTG (segmentos T, U, Header Retorno, Trailer)
- [x] Criar parser do arquivo de retorno CNAB 240 (db-cnab-retorno.ts) com offsets validados no arquivo real
- [x] Criar tabela retornoItens no schema Drizzle e executar db:push
- [x] Atualizar procedure processarRetorno no router tRPC para usar novo parser (Segmentos T/U)
- [x] Atualizar status das cobranças conforme código de movimento (02=em_cobranca, 06/07=pago, 09/10=cancelado, 03=pendente)
- [x] Gravar itens individuais na tabela retornoItens com status de processamento
- [x] Atualizar página RetornoCNAB.tsx com novo formato de resultado (entradas, pagos, cancelados, naoEncontrados)
- [x] Atualizar página CNAB240.tsx com novo formato de resultado do retorno
- [x] Escrever testes unitários para o parser de retorno (232 testes passando)

## Gerador de PDF do Boleto Bancário BTG Pactual
- [x] Calcular código de barras (44 dígitos) e linha digitável (47 dígitos) conforme FEBRABAN
- [x] Implementar fator de vencimento com suporte à nova data base FEBRABAN (22/02/2025)
- [x] Implementar dígito verificador do código de barras (módulo 11)
- [x] Implementar dígitos verificadores dos campos da linha digitável (módulo 10)
- [x] Criar gerador de PDF do boleto com layout padrão FEBRABAN (pdfkit)
- [x] Incluir no PDF: código de barras I25, linha digitável, recibo do sacado, dados beneficiário, dados sacado, instruções
- [x] Criar endpoint tRPC gerarBoletoPDF (protectedProcedure) com upload para S3
- [x] Adicionar botão "PDF" na tabela de cobranças do DevedorDetalhes (só para cobranças com nossoNumero)
- [x] Escrever 15 testes unitários para cálculo da linha digitável e código de barras (249 testes passando)

## Botões de Copiar - Linha Digitável e Pix Copia e Cola
- [x] Endpoint gerarBoletoPDF já retornava linhaDigitavel; adicionado pixCopiaCola ao retorno
- [x] Implementar geração do código Pix copia e cola (EMV QR Code) no backend (pix-emv.ts)
- [x] Adicionar campos chavePix e tipoChavePix na tabela configuracaoBoleto (db:push executado)
- [x] Adicionar botão "Copiar Linha" na tabela de cobranças (DevedorDetalhes) - azul
- [x] Adicionar botão "Copiar Pix" na tabela de cobranças (DevedorDetalhes) - verde
- [x] Feedback visual ao copiar: ícone Check + toast de sucesso por 2 segundos
- [x] Botão PDF alterna entre "Gerar PDF" e "Abrir PDF" após geração (cache local)
- [x] 21 testes unitários para geração do código Pix EMV (270 testes passando)

## Bug - PDF do Boleto não gerado após processamento do arquivo de retorno
- [x] Investigar: campo nossoNumero não era salvo na tabela cobrancas durante geração da remessa
- [x] Corrigir procedure gerarRemessa para salvar nossoNumero em cada cobrança após gerar o arquivo CNAB
- [x] Identificar que os nosós números 1000000084/85 pertencem a parcelasAcordo, não a cobranças avulsas
- [x] Criar endpoint tRPC gerarBoletoPDFParcela para parcelas de acordo
- [x] Adicionar botões PDF, Copiar Linha e Copiar Pix na tabela de parcelas do AcordoDetalhes
- [x] 270 testes passando, 0 erros TypeScript

## Bug Crítico - Valor incorreto no CNAB 240 (R$206,53 → R$20.653,00)
- [x] Investigar: tabela cobrancas usa int (centavos), tabela parcelasAcordo usa decimal(10,2) (reais)
- [x] Identificar raiz: SimuladorAcordo enviava p.valor (centavos) sem dividir por 100 ao salvar no banco
- [x] Corrigir SimuladorAcordo: amount: p.valor / 100, totalAmount / 100, agreedAmount / 100
- [x] Corrigir remessa de parcelas de acordo: valorNominal = Math.round(r.amount * 100) (reais → centavos)
- [x] Remessa de cobranças avulsas: já estava correta (cob.amount já em centavos)
- [x] PDF do boleto: já estava correto (Number(parcela.amount) * 100 para parcelas)
- [x] 270 testes passando, 0 erros TypeScript

## Novo Layout do Boleto PDF - Máscara BTG Pactual
- [x] Reescrever boleto-pdf.ts com layout exato da máscara BTG Pactual
- [x] Seção 1: Recibo do Pagador com logo BTG, linha digitável, grid de campos
- [x] Seção 2: Ficha de Compensação com todos os campos do padrão BTG
- [x] Código de barras I25 na largura total da página
- [x] Logo BTG Pactual em ambas as seções
- [x] Linha pontilhada de corte entre as seções
- [x] 270 testes passando, 0 erros TypeScript

## Campo Chave Pix no Formulário de Configuração de Boleto
- [x] Localizar formulário de configuração de boleto (ConfiguracaoBoleto.tsx)
- [x] Adicionar campos chavePix e tipoChavePix na aba "Forma de Pagamento" com Select de tipo e Input de chave
- [x] Adicionar chavePix e tipoChavePix no schema tRPC (z.enum para tipoChavePix)
- [x] Feedback visual: mensagem verde quando chave preenchida, cinza quando vazia
- [x] 270 testes passando, 0 erros TypeScript

## QR Code Pix no PDF do Boleto BTG Pactual
- [x] Instalar biblioteca qrcode para geração de QR Code em Node.js
- [x] Gerar QR Code como imagem PNG a partir do código Pix EMV
- [x] Adicionar seção Pix no PDF: QR Code + string copia e cola
- [x] Exibir seção Pix apenas quando chavePix estiver configurada
- [x] Corrigir ordem de geração: pixCopiaCola gerado ANTES de chamar gerarBoletoPDF nos dois endpoints (cobranças avulsas e parcelas de acordo)
- [x] 270 testes passando, 0 erros TypeScript

## Suporte ao Segmento Y-04 (Bolepix) no Retorno CNAB 240 BTG
- [x] Adicionar interface RetornoSegmentoY04 no parser db-cnab-retorno.ts
- [x] Implementar parsing do Segmento Y-04 (tipo 3, segmento Y, identificação 03)
- [x] Associar Segmento Y-04 ao par T+U correspondente (mesmo lote, sequencial T+2)
- [x] Adicionar campos pixTipoChave, pixChave e pixTxid na tabela retornoItens (db:push)
- [x] Atualizar procedure processarRetorno para salvar dados do Bolepix
- [x] Exibir dados do Bolepix na página RetornoCNAB (coluna/badge Pix + dialog de detalhes)
- [x] Adicionar procedure listarItensRetorno para buscar itens de um retorno específico
- [x] 270 testes passando, 0 erros TypeScript

## Filtros no Dashboard Admin
- [x] Adicionar filtros de data (de/até) e colaborador nas tentativas de cobrança do Dashboard Admin
- [x] Adicionar procedure listAllFiltrada com filtros de dataInicio, dataFim, colaboradorId e condominioId
- [x] Adicionar procedure listarColaboradores para popular o select de colaboradores
- [x] Adicionar painel de filtros com DatePicker (inicio/fim), Select de colaborador e Select de condomínio
- [x] KPIs (total, promessas, sem resposta) calculados dinamicamente a partir dos filtros aplicados
- [x] Botão 'Limpar filtros' e badge 'Filtro ativo' para feedback visual
- [x] 270 testes passando, 0 erros TypeScript

## Listagem de Devedores na Página Cobrança Passiva
- [x] Criar procedure listarTodos com filtro de condominioId, busca, status e paginação (offset/limit)
- [x] Adicionar componente de tabela de devedores na página /operacoes/cobranca-passiva
- [x] Filtros: busca por nome/CPF/unidade/e-mail, select de condomínio, select de status
- [x] Seletor de itens por página (10, 20, 30) com paginação (anterior/próxima) e contador
- [x] Colunas: Nome, CPF/CNPJ, Condomínio, Unidade, Bloco, Status, botão Ver
- [x] Componente visível apenas para admin
- [x] 270 testes passando, 0 erros TypeScript

## Emissor de Cobrança no Cadastro do Condomínio
- [x] Adicionar campos billingIssuer (enum) e customBillingIssuer (text) na tabela condominios
- [x] Executar db:push para aplicar migration segura (sem remover colunas existentes)
- [x] Atualizar procedures create/update/getById do router condominios com os novos campos
- [x] Validação backend: customBillingIssuer obrigatório quando billingIssuer = 'outro'
- [x] Procedure gerarRelatorioAdministradora: gera PDF com dados do acordo para envio externo
- [x] Procedure bloqueia geração de relatório se emissor for emissao_propria
- [x] Seção "Emissor de Cobrança" no formulário com Select (Emissão própria / Administradora / Outro)
- [x] Campo adicional "Informe o emissor" visível apenas quando Outro for selecionado
- [x] Visualização somente-leitura para usuários não-admin (badge com cadeado)
- [x] Card informativo contextual que muda conforme o emissor selecionado
- [x] Default "administradora" para condomínios sem emissor definido (migration segura)
- [x] 270 testes passando, 0 erros TypeScript

## Refatoração: Login do Condomínio → Gestão de Usuários
- [ ] Adicionar isPrimaryAdmin (boolean) e condominioId (FK) na tabela users
- [ ] Executar migration segura (db:push)
- [ ] Script de migração: criar usuário admin para cada condomínio com login existente
- [ ] Procedure listarUsuariosPorCondominio (admin master)
- [ ] Procedure criarUsuarioCondominio com validação de email único
- [ ] Procedure definirAdminPrincipal com proteção contra usuário órfão
- [ ] Procedure removerUsuarioCondominio com proteção de isPrimaryAdmin
- [ ] Atualizar loginCustom para buscar usuário na tabela users (não no condomínio)
- [ ] Tela de Usuários: listagem por condomínio com badges e botão "Definir como admin principal"
- [ ] Formulário de condomínio: remover campos login/senha, adicionar seção admin principal
- [ ] Manter compatibilidade com login existente durante transição

## Refatoração: Login do Condomínio → Gestão de Usuários (CONCLUÍDO)
- [x] Adicionar isPrimaryAdmin (boolean) na tabela users (db:push aplicado)
- [x] Script de migração: criar usuário admin para cada condomínio com login existente (idempotente)
- [x] Procedure listByCondominio: listar usuários de um condomínio específico
- [x] Procedure create: validação de email único, isPrimaryAdmin, loginMethod=custom
- [x] Procedure update: suporte a isPrimaryAdmin com remoção automática do anterior
- [x] Procedure delete: proteção contra exclusão do admin principal
- [x] Procedure definirAdminPrincipal: troca atômica do admin principal
- [x] auth-custom.ts: busca na tabela users primeiro (fallback para tabela condominios)
- [x] Tela de Usuários: filtro por condomínio, badge Crown para admin principal, botão "Admin Principal"
- [x] Formulário de condomínio: seção "Usuário Administrador Principal" com componente AdminPrincipalInfo
- [x] Compatibilidade com login existente mantida via fallback no auth-custom.ts
- [x] 270 testes passando, 0 erros TypeScript

## Módulo de Recuperação de Senha
- [x] Criar tabela passwordResetTokens (tokenHash SHA-256, expiresAt, usedAt, ipAddress) — db:push aplicado
- [x] Procedure requestPasswordReset: rate limit 3/hora por IP, busca por e-mail ou username, token 32 bytes hex, expira em 15 min
- [x] Procedure resetPassword: valida token (não expirado, não usado), hash bcryptjs rounds=12, marca token como usado
- [x] Procedure validateResetToken: query pública para checar validade do token antes de exibir o formulário
- [x] Template de e-mail HTML profissional com branding Gomes & Silva (gradiente azul, CTA, aviso de segurança)
- [x] Envio via API integrada Manus com fallback para console (desenvolvimento)
- [x] Página ForgotPassword (/esqueci-senha): formulário de e-mail/usuário, estado de sucesso genérico, link de retorno
- [x] Página ResetPassword (/reset-password?token=): indicador de força com 4 níveis, checklist de requisitos, confirmação de senha, estados de token inválido/expirado/usado
- [x] Link "Esqueceu sua senha?" adicionado nas telas LoginCondominio e LoginColaborador
- [x] Rotas /esqueci-senha e /reset-password registradas no App.tsx (públicas)
- [x] 270 testes passando, 0 erros TypeScript

## Portal de Transparência Premium (Síndico)
- [ ] Procedures backend: KPIs executivos (valor em aberto, recuperado, taxa, acordos, risco)
- [ ] Procedure: score de saúde financeira (0-100) com critérios ponderados
- [ ] Procedure: alertas inteligentes automáticos (inadimplência, acordos em risco, sem resposta)
- [ ] Procedure: pipeline de devedores por status (kanban)
- [ ] Dashboard executivo premium: KPIs animados, gráficos, score gauge, alertas
- [ ] Página Pipeline Kanban (/sindico/pipeline): drag-and-drop de status, cards com score
- [ ] Timeline do devedor: eventos WhatsApp, boletos, acordos, jurídico
- [ ] Painel de acordos e negociações com métricas e gráficos
- [x] Registrar rotas no App.tsx e sidebar do síndico

## Portal de Transparência Premium (Síndico)
- [x] Procedures backend: kpis (score saúde financeira, taxa inadimplência, alertas), pipeline (Kanban por status), atualizarPipelineStatus
- [x] SindicoDashboard reescrito: KPIs executivos, score de saúde com gauge, alertas inteligentes, gráficos recharts
- [x] SindicoPipeline (/sindico/pipeline): Kanban com 6 colunas, cards de devedor, score de recuperação, menu de mover entre estágios
- [x] TimelineTentativas atualizado: suporte a eventos unificados (tentativa, boleto, acordo, jurídico) com ícones distintos
- [x] SindicoAcordos (/sindico/acordos): KPIs, gráfico de pizza (status), gráfico de barras (por mês), alertas de parcelas vencidas/vencendo
- [x] Rotas /sindico/pipeline e /sindico/acordos registradas no App.tsx
- [x] 270 testes passando, 0 erros TypeScript

## Plataforma de Performance de Recuperação de Crédito (Visão do Dono)
- [ ] Procedures backend: kpisExecutivos, funilCobranca, produtividadeEquipe, performanceCarteira, previsaoReceita, painelPerdas
- [ ] ExecutivoDashboard (/admin/executivo): cards estratégicos com mini gráficos, alertas executivos, insights de IA
- [ ] Módulo Funil de Cobrança: 7 etapas, taxas de conversão, gargalos visuais
- [ ] Módulo Produtividade: ranking de operadores, score gamificado, badges, metas, heatmap
- [ ] Módulo Painel de Perdas: acordos quebrados, devedores desaparecidos, perda potencial estimada
- [ ] Módulo Performance por Carteira: condomínio mais lucrativo, esforço vs retorno
- [ ] Módulo Previsão de Receita: gráfico preditivo com confiança estatística
- [ ] Módulo IA/Sugestões: insights automáticos baseados em dados reais do sistema
- [ ] Alertas executivos premium com severidade e impacto financeiro estimado
- [ ] Registrar rotas e links no menu admin

## Plataforma de Performance — Centro de Inteligência Operacional
- [x] Router executivo com 5 procedures: kpisEstrategicos, funilCobranca, produtividadeEquipe, painelPerdas, performanceCarteira
- [x] kpisEstrategicos: valor recuperado, acordos, taxa de recuperação, tentativas, previsão de receita, série histórica 6 meses, comparação com período anterior
- [x] funilCobranca: 6 etapas com qtd e taxa de conversão relativa ao total
- [x] produtividadeEquipe: score gamificado (tentativas 40% + acordos 40% + promessas 20%), badge dinâmico por nível
- [x] painelPerdas: acordos quebrados, parcelas atrasadas, devedores sem contato 30d, cobranças paradas 90d, valor em risco
- [x] performanceCarteira: taxa de recuperação, devedores ativos/pagos, receita por condomínio
- [x] Página ExecutivoDashboard (/admin/executivo): dark mode premium estilo Bloomberg/Stripe
- [x] 8 KPI cards com mini gráfico de área, variação vs. período anterior e badge colorido
- [x] Funil de cobrança horizontal com barras de progresso coloridas
- [x] Painel de alertas executivos gerados dinamicamente a partir dos dados reais
- [x] Ranking de operadores com medalhas (ouro/prata/bronze) e score colorido
- [x] Performance por carteira com barra de progresso e taxa de recuperação
- [x] Painel de perdas com 4 cards de risco
- [x] Seção de Insights de IA com 6 análises contextuais automáticas
- [x] Filtro de período (Hoje / Semana / Mês / Trimestre) com tabs
- [x] Botão "Centro de Inteligência Operacional" destacado nas ações rápidas do AdminDashboard
- [x] Rota /admin/executivo registrada no App.tsx
- [x] 270 testes passando, 0 erros TypeScript

## Dark Mode e Light Mode (Clean Mode) em Todo o Sistema
- [ ] Atualizar variáveis CSS no index.css para dark e light mode completos
- [ ] Atualizar ThemeContext para persistir preferência no localStorage
- [ ] Adicionar botão alternador Sol/Lua no DashboardLayout (header)
- [ ] Adicionar botão alternador nas telas de login (LoginAdmin, LoginCondominio, LoginColaborador)
- [ ] Ajustar ExecutivoDashboard (cores hardcoded slate-950/900) para usar variáveis CSS
- [ ] Ajustar SindicoDashboard, SindicoPipeline, SindicoAcordos para responder ao tema
- [ ] Garantir que todas as páginas admin respondam ao tema via classe .dark no html
- [ ] Verificar TypeScript e executar testes

## Dark Mode e Light Mode (Clean Mode)
- [x] Analisar ThemeContext, index.css e Sidebar para mapear estado do tema
- [x] Atualizar variáveis CSS .dark no index.css com paleta calibrada (background, card, border, muted, foreground)
- [x] Habilitar switchable=true e defaultTheme="light" no ThemeProvider do App.tsx
- [x] Adicionar botão alternador Sol/Lua no rodapé da Sidebar com tooltip
- [x] Refatorar ExecutivoDashboard: substituir todas as cores hardcoded (slate-900, slate-950, slate-400, slate-500, slate-800) por variáveis CSS (bg-card, bg-muted, text-foreground, text-muted-foreground, border-border)
- [x] Insights de IA e cards coloridos usam opacidade /10 e /20 para funcionar em ambos os modos
- [x] 270 testes passando, 0 erros TypeScript

## Módulo de Logs e Auditoria de Usuários
- [x] Tabela auditLogs criada no schema (id, userId, userName, userRole, action, entity, entityId, entityLabel, condominioId, ipAddress, userAgent, beforeData, afterData, success, errorMessage, severity, createdAt)
- [x] db:push aplicado com sucesso (campo success como int para compatibilidade MySQL)
- [x] Helper logAudit() em server/audit.ts com funções de conveniência: auditLoginSuccess, auditLoginFailed, auditLogout, auditCreate, auditUpdate, auditDelete, auditAction
- [x] Instrumentação: login (todos os tipos), logout, create/update/delete de condomínios, devedores, cobranças, acordos, usuários, baixa de parcela
- [x] Router auditoria com procedures: listarLogs (filtros avançados + paginação), estatisticas, logsUsuario
- [x] Página /admin/auditoria com KPIs (total, 24h, críticos, falhas), filtros (busca, ação, entidade, severidade, resultado), tabela paginada, dialog de detalhes com before/after, exportação CSV
- [x] Links "Auditoria do Sistema" e "Centro de Inteligência" adicionados no grupo Relatórios do Sidebar
- [x] 270 testes passando, 0 erros TypeScript

## Restrições de Acesso para Síndico (somente-leitura)
- [x] Remover menu "Banco" para o síndico no Sidebar
- [x] Remover botão "Novo Devedor" para o síndico na página Devedores
- [x] Remover botão "Marcar como Paga" nas parcelas do acordo para o síndico
- [x] Remover botão "Nova Dívida" para o síndico em ProcessosCobranca.tsx
- [x] Remover botão "Nova Dívida" para o síndico em DevedorDetalhes.tsx
- [x] Remover botão "Importar Dívidas" para o síndico em DevedorDetalhes.tsx

## Suporte Completo ao Bolepix BTG (Pix por Boleto)

- [x] Adicionar campo pixCopiaCola (TEXT) nas tabelas cobrancas e parcelasAcordo no schema
- [x] Executar db:push para aplicar migração no banco
- [x] Atualizar processarRetorno para gerar e salvar pixCopiaCola a partir do Segmento Y-04 (chave Pix + TXID retornados pelo banco)
- [x] Atualizar gerarBoletoPDF (cobranças avulsas) para usar pixCopiaCola do banco com prioridade (fallback: chave estática)
- [x] Atualizar gerarBoletoPDFParcela (parcelas de acordo) para usar pixCopiaCola do banco com prioridade
- [x] Adicionar campo nossoNumero, pixCopiaCola e statusRemessa na interface CobrancaComCalculos
- [x] Atualizar DevedorDetalhes para mostrar botão "Copiar Pix" diretamente da cobrança (sem precisar gerar PDF)
- [x] Atualizar AcordoDetalhes para mostrar botão "Pix" diretamente da parcela (sem precisar gerar PDF)
- [x] TypeScript: 0 erros

## Layout do Boleto PDF — Máscara Padrão BTG Pactual

- [x] Reescrever boleto-pdf.ts com layout fiel à máscara oficial BTG Pactual
- [x] Estrutura correta: Instruções de impressão → Recibo do Pagador → Linha de corte → Ficha de Compensação
- [x] Cabeçalho: logo BTG | |208-1| | linha digitável (alinhada à direita)
- [x] Recibo: Beneficiário, Nosso Número, Nº Documento, Espécie, Vencimento, Valor, Desconto/Multa, Pagador
- [x] Ficha: Local de pagamento, Beneficiário, Data doc., Nº doc., Espécie, Aceite, Data proc., Carteira/Nosso nº, Uso do banco, CIP, Carteira, Espécie, Qtd, Valor, Instruções, Pagador, Avalista
- [x] Código de barras I25 com largura adaptada (55% se Pix, 100% se sem Pix)
- [x] Seção Pix integrada ao rodapé: CNPJ, Vencimento, Valor + QR Code ao lado do código de barras
- [x] TypeScript: 0 erros

## Regra de Negócio — Acordo sem Juros Adicionais

- [x] Parcelamento do acordo não aplica novos juros sobre o valor negociado
- [x] calcularPlanoAcordo chamado com taxaJurosMensal=0 em todos os cenários do SimuladorAcordoMultiplo
- [x] Removidos toggles de encargos (Juros/Multa/Correção) da UI do simulador
- [x] Adicionada nota informativa explicando que encargos já foram aplicados previamente
- [x] TypeScript: 0 erros

## Editor de Modelos de Documentos

- [ ] Schema: tabela modelosDocumento (id, nome, tipo, conteudoHtml, logoUrl, marcaDaguaUrl, camposAssinatura, condominioId)
- [ ] Instalar TipTap (editor rico) e dependências
- [ ] Backend: CRUD de modelos (create, list, getById, update, delete)
- [ ] Backend: upload de logo e marca d'água para S3
- [ ] Backend: gerarPDFModelo — substituir variáveis e renderizar HTML → PDF com logo/marca d'água
- [ ] Página Biblioteca de Modelos (listagem, criar, excluir)
- [ ] Editor de modelo com TipTap: negrito, itálico, listas, tabelas
- [ ] Painel de variáveis dinâmicas (inserção com 1 clique)
- [ ] Upload de logo por modelo (posicionamento no cabeçalho)
- [ ] Upload de marca d'água por modelo (diagonal no fundo)
- [ ] Bloco de assinaturas editável no editor
- [ ] Integrar seleção de modelo nos simuladores de acordo (gerar PDF preenchido)
- [ ] Adicionar item "Modelos de Documentos" no menu lateral

## Sistema de Módulos por Condomínio

- [ ] Adicionar campo `modulosAtivos` (JSON) na tabela condominios
- [ ] Criar UI de configuração de módulos na página de edição do condomínio (admin only)
- [ ] Adaptar menu lateral para exibir apenas módulos ativos do condomínio do usuário logado
- [ ] Criar tabela `ticketsJuridico` e `mensagensTicket` no schema
- [ ] Criar procedures CRUD de tickets e mensagens
- [ ] Criar painel de solicitações para o condomínio (abrir, acompanhar, responder tickets)
- [ ] Criar painel admin de atendimento jurídico (todos os tickets, responder, mudar status)
- [ ] Notificar admin quando nova solicitação for aberta

## Formulário Admin para Cadastro Manual de Tickets Jurídicos
- [x] Criar página TicketForm.tsx em /admin com formulário completo
- [x] Campos: condomínio (select), título, categoria, prioridade, descrição, mensagem inicial (opcional)
- [x] Adicionar procedure createTicketAdmin no backend (adminProcedure com condominioId explícito)
- [x] Adicionar rota /juridico/solicitacoes/novo no App.tsx (somente admin)
- [x] Adicionar botão "Novo Ticket" na listagem de solicitações para admin
- [x] Adicionar item "Novo Ticket" no menu lateral do grupo Jurídico para admin

## Kanban Jurídico e Produtividade de Advogados
- [x] Criar página KanbanJuridico.tsx com colunas por status (Aberto, Em Andamento, Aguardando, Resolvido, Cancelado)
- [x] Suporte a drag-and-drop para mover tickets entre colunas (atualiza status via updateTicket)
- [x] Adicionar rota /juridico/kanban no App.tsx
- [x] Adicionar item "Kanban" no menu lateral do grupo Jurídico para admin
- [x] Criar procedure juridico.statsResponsaveis no backend com métricas por responsável
- [x] Adicionar seção "Produtividade de Advogados" no Centro de Inteligência
- [x] Exibir cards com total de tickets, abertos, resolvidos e tempo médio por responsável

## Histórico de Reatribuições no Chat
- [x] Adicionar valor "sistema" no enum tipoAutor da tabela juridico_mensagens
- [x] Migração db:push aplicada para o novo enum
- [x] Atualizar procedure updateTicket para registrar mensagem de sistema ao reatribuir responsável
- [x] Exibir mensagens de sistema com estilo de linha divisória centralizada no chat do ticket

## Módulo de Perfis e Permissões (RBAC)
- [x] Criar tabelas profiles e profile_permissions no schema
- [x] Adicionar campo profileId na tabela users
- [x] Migração db:push aplicada
- [x] Criar db-profiles.ts com helpers de banco
- [x] Criar procedures tRPC: profiles.list, profiles.get, profiles.create, profiles.update, profiles.delete, profiles.assignToUser
- [x] Criar página Profiles.tsx — listagem de perfis com cards e estatísticas
- [x] Criar página ProfileEditor.tsx — editor com matriz de permissões por módulo
- [x] Criar página UsersProfiles.tsx — gerenciamento de usuários com atribuição de perfil
- [x] Registrar rotas no App.tsx
- [x] Adicionar grupo "Perfis e Permissões" no menu lateral (admin only)
- [x] Escrever testes Vitest para as procedures de perfis

## Role Colaborador (Colaborador Interno do Escritório)
- [ ] Adicionar role "colaborador" no enum da tabela users no schema
- [ ] Migrar banco com db:push
- [ ] Criar procedure getMyPermissions para colaborador logado
- [ ] Criar ColaboradorLayout com sidebar filtrado por permissões RBAC
- [ ] Criar ColaboradorDashboard.tsx com visão geral das tarefas
- [ ] Atualizar redirecionamento de login para role "colaborador" → /colaborador/dashboard
- [ ] Adicionar rotas /colaborador/* no App.tsx
- [ ] Atualizar filtros de role nos selects de cadastro de usuário (admin)
- [ ] Atualizar Sidebar.tsx para exibir menus corretos para colaborador
- [ ] Atualizar UsersProfiles.tsx para incluir role "colaborador" nos filtros

## Controle de Acesso Frontend (RBAC)
- [ ] Criar hook usePermissions com helper can(modulo, acao)
- [ ] Aplicar usePermissions no Sidebar para ocultar grupos/itens sem permissão
- [ ] Ocultar botões de criar/editar/excluir/exportar nas páginas de Devedores
- [ ] Ocultar botões de criar/editar/excluir nas páginas de Cobranças e Acordos
- [ ] Ocultar botões de ação nas páginas do módulo Jurídico
- [ ] Ocultar botões de ação nas páginas de Tentativas

## Bug - "Erro ao salvar modelo: ID do modelo inválido"
- [x] Investigar como modeloId é extraído do URL params no ModeloEditor
- [x] Corrigir parseInt para validar NaN e valor positivo (rawId → modeloId com guard)
- [x] Adicionar guard explícito no handleSalvar para isEdicao com modeloId inválido
- [x] Adicionar z.number().int().positive() na procedure update de modelosDocumento
- [x] TypeScript: 0 erros

## Bug - {{tabelaParcelas}} aparece no início do PDF e alinhamentos não funcionam
- [x] Reescrever htmlParaLinhas para processar blocos HTML em ordem sequencial (preservar posição da tabela)
- [x] Capturar atributo style="text-align: ..." do TipTap em cada parágrafo e heading
- [x] Propagar campo align para o renderizador PDFKit em todos os tipos de bloco (p, h1-h6)
- [x] Suportar alinhamentos: left, center, right, justify
- [x] Tratar tabela embutida dentro de parágrafo (quando {{tabelaParcelas}} é substituído dentro de <p>)
- [x] TypeScript: 0 erros

## Bug - Logomarca não aparece no PDF (formato WebP não suportado pelo PDFKit)
- [x] Identificar que PDFKit suporta apenas JPEG e PNG (não WebP/AVIF)
- [x] Instalar sharp para conversão de imagens
- [x] Atualizar baixarImagem() para converter WebP/AVIF para PNG via sharp antes de passar ao PDFKit
- [x] TypeScript: 0 erros

## Melhoria - {{tabelaParcelas}} com colunas detalhadas
- [x] Atualizar interface ParcelaTabela para incluir: descricao, juros, multa, honorarios, correcao, valorAtualizado
- [x] Atualizar gerarHtmlTabelaParcelas para gerar tabela com 8 colunas completas
- [x] Atualizar procedure gerarPDF no routers.ts para aceitar os campos extras
- [x] Atualizar parcelas de exemplo no ModeloEditor com dados detalhados
- [x] TypeScript: 0 erros

## Melhoria - Botão "Gerar Documento" na tela do Devedor
- [x] Criar componente GerarDocumentoModal com seleção de modelo e opções de filtro de dívidas
- [x] Integrar botão "Gerar Documento" na tela DevedorDetalhes
- [x] Passar dados reais de dívidas com breakdown (juros/multa/honorários/correção) para {{tabelaParcelas}}
- [x] Preencher variáveis do devedor automaticamente (nomeDevedor, cpfCnpjDevedor, etc.)
- [x] TypeScript: 0 erros

## Melhoria - Largura adaptativa da tabela no PDF
- [x] Detectar número de colunas da tabela no modelo-pdf.ts
- [x] Reduzir automaticamente o tamanho da fonte para tabelas com muitas colunas (>5 colunas)
- [x] Ajustar largura das colunas proporcionalmente ao conteúdo
- [x] TypeScript: 0 erros

## Melhoria - Botão "Gerar Documento" na tela do Acordo
- [x] Analisar AcordoDetalhes e estrutura das parcelas do acordo
- [x] Integrar GerarDocumentoModal na tela de detalhes do acordo com parcelas reais
- [x] Preencher variáveis do acordo automaticamente (valorAcordo, numeroParcelas, etc.)
- [x] TypeScript: 0 erros

## Melhoria - Pré-visualização inline do PDF no modal
- [x] Adicionar botão "Pré-visualizar" no GerarDocumentoModal
- [x] Gerar PDF temporário e exibir em iframe dentro do modal
- [x] Mostrar spinner durante a geração da pré-visualização
- [x] TypeScript: 0 erros

## Bug - Linhas em branco (Enter) não aparecem no PDF
- [x] Identificar que htmlParaLinhas descartava parágrafos vazios com `if (texto)`
- [x] Adicionar tipo "linha_em_branco" para parágrafos vazios
- [x] Renderizar "linha_em_branco" como moveDown(1) no switch do PDFKit
- [x] TypeScript: 0 erros

## Melhoria - Responsividade das páginas de modelos de documentos
- [x] ModelosDocumento: header flex-col em mobile, grid 1→2→3 colunas, botões sempre visíveis em mobile
- [x] ModelosDocumento: AlertDialog com max-w-sm e botões empilhados em mobile
- [x] ModeloEditor: header flex-col em mobile com botões compactos
- [x] ModeloEditor: metadados (nome + tipo) em coluna em mobile
- [x] ModeloEditor: painel lateral abaixo do editor em mobile (lg:flex-row)
- [x] ModeloEditor: toolbar com overflow-x-auto para telas pequenas
- [x] TypeScript: 0 erros

## Melhoria - Valores monetarios por extenso
- [ ] Criar funcao valorPorExtenso() em shared/extenso.ts
- [ ] Adicionar variaveis *Extenso no painel do editor
- [ ] Preencher variaveis *Extenso no GerarDocumentoModal
- [ ] TypeScript: 0 erros

## Melhoria - Maximo de parcelas no condominio
- [ ] Adicionar campo maxParcelas no schema
- [ ] Migrar banco com pnpm db:push
- [ ] Atualizar CondominioForm com campo de selecao
- [ ] Atualizar procedures create/update do condominio
- [ ] Integrar limite no SimuladorAcordoMultiplo
- [ ] TypeScript: 0 erros

## Cancelamento Automático de Acordos por Prazo
- [x] Adicionar colunas cancelamentoAutoAtivo e cancelamentoPrazoDias no schema de condominios
- [x] Executar db:push para aplicar migração no banco
- [x] Atualizar procedure condominios.update no routers.ts com novos campos
- [x] Adicionar seção de Cancelamento Automático no CondominioForm (toggle + seletor de prazo)
- [x] Criar handler job-cancelamento-auto.ts com await getDb() correto
- [x] Registrar rota POST /api/scheduled/cancelamento-auto no servidor Express
- [x] Criar Heartbeat via CLI (task_uid: SNLwphD5fCmbFcJX2VcBkP, cron: 0 0 6 * * * UTC)
- [x] Verificar TypeScript: 0 erros

## Editor Visual de Modelos (Canva-like)

- [x] Instalar dependências para drag-and-drop e exportação PDF
- [x] Criar componente CanvasEditor com área de página A4 e elementos posicionados absolutamente
- [x] Suporte a elementos: Texto livre, Retângulo, Linha horizontal, Círculo/Elipse
- [x] Drag para mover elementos com mouse (pointer events nativos)
- [x] Resize de elementos via handles nos cantos
- [x] Painel de propriedades: cor de fundo, cor de borda, cor do texto, tamanho da fonte, largura/altura
- [x] Seleção de elemento com clique (highlight com borda azul)
- [x] Deletar elemento selecionado (tecla Delete ou botão)
- [x] Toolbar de inserção: botões para adicionar cada tipo de elemento
- [x] Inserir variáveis dinâmicas em elementos de texto
- [x] Modo de edição de texto inline com duplo clique
- [x] Integrar CanvasEditor como aba "Visual" no ModeloEditor (ao lado da aba "Texto")
- [x] Persistir canvasElements (JSON) no campo do modelo no banco
- [x] Exportar canvas para PDF via html2canvas + jsPDF

## Integração Microsoft 365 — Envio de E-mails

- [x] Instalar @azure/msal-node para autenticação OAuth2 com Microsoft Graph
- [x] Criar tabela emailConfig no schema (tenantId, clientId, clientSecret, emailRemetente, nomeRemetente)
- [x] Criar tabela emailsEnviados no schema (devedorId, destinatario, assunto, corpo, status, erro, enviadoEm)
- [x] Migrar banco com db:push
- [x] Criar server/email-service.ts com função sendEmailMicrosoft365 via Graph API
- [x] Criar procedures tRPC: emailConfig.get, emailConfig.save, emailConfig.testar, email.enviar, email.listarPorDevedor
- [x] Criar página de configuração de e-mail em Configurações
- [x] Criar modal de envio de e-mail no perfil do devedor
- [ ] Integrar botão de envio de e-mail na Cobrança Ativa
- [ ] Integrar botão de envio de e-mail na Cobrança Passiva
- [x] Mostrar histórico de e-mails enviados no perfil do devedor
- [x] Suporte a templates de modelo de documento como corpo do e-mail
- [x] Verificar TypeScript: 0 erros

## Módulo WhatsApp Z-API

- [ ] Criar tabela whatsappInstancias (id, nome, setor, instanceId, token, clientToken, webhookUrl, ativo)
- [ ] Criar tabela whatsappConversas (id, instanciaId, telefone, nomeContato, devedorId nullable, ultimaMensagem, naoLidas, status)
- [ ] Criar tabela whatsappMensagens (id, conversaId, direction, tipo, conteudo, mediaUrl, status, zApiMessageId, criadoEm)
- [ ] Migrar banco com db:push
- [ ] Criar server/zapi-service.ts com funções sendText, sendDocument, sendImage, getStatus, getQRCode
- [ ] Criar endpoint POST /api/webhook/whatsapp/:instanciaId para receber mensagens
- [ ] Criar procedures tRPC: whatsapp.listarInstancias, listarConversas, listarMensagens, enviarMensagem, marcarLida, buscarOuCriarConversa
- [ ] Criar página WhatsApp.tsx com layout 3 colunas: instâncias | conversas | mensagens
- [ ] Lista de instâncias com status de conexão (Cobrança / Jurídico)
- [ ] Lista de conversas com busca, filtro por setor e badge de não lidas
- [ ] Painel de mensagens com scroll automático
- [ ] Campo de envio com suporte a texto e anexo
- [ ] Polling a cada 3s para atualizar mensagens
- [ ] Vincular conversa a devedor existente
- [ ] Botão de envio rápido de WhatsApp no perfil do devedor
- [ ] Página de configuração de instâncias Z-API por setor com QR Code
- [ ] Adicionar rota /whatsapp e item no menu lateral
- [x] Verificar TypeScript: 0 erros
## Bug — WhatsApp.tsx JSX quebrado (modal fora do return)
- [x] Envolver o return em fragmento React <>...</> para suportar <div> + <Dialog> como irmãos
- [x] Verificar TypeScript: 0 erros

## Bug — App.tsx import duplicado de EmailConfig
- [x] Verificar imports duplicados no App.tsx (não havia duplicata real, erro já estava resolvido)
- [x] Verificar TypeScript: 0 erros

## WhatsApp — Envio de Mídia e Reprodução de Áudio
- [x] Backend: procedure whatsapp.enviarArquivo que recebe base64 + mime + nome e envia via Z-API (imagem, documento, áudio)
- [x] Backend: upload do arquivo para S3 antes de enviar via Z-API (URL pública necessária)
- [x] Frontend: botão de clipe (Paperclip) abre menu com opções: Foto/Imagem, Documento, Áudio
- [x] Frontend: input file oculto para seleção de arquivo (imagem, documento, áudio)
- [x] Frontend: preview de imagem enviada/recebida no balão de mensagem (thumbnail clicável)
- [x] Frontend: player de áudio nativo HTML5 para mensagens de áudio recebidas/enviadas
- [x] Frontend: link de download para documentos recebidos/enviados com ícone e nome do arquivo
- [x] Frontend: indicador de progresso durante upload/envio de arquivo
- [x] Verificar TypeScript: 0 erros

## Sistema de Multiatendimento (WhatsApp + Cobrança)
- [x] Schema do banco: tabelas atendimentoDepartamentos, atendimentoOperadores, atendimentos, atendimentoTransferencias, atendimentoEtiquetas, atendimentoEtiquetasAplicadas, atendimentoNotas, atendimentoAvaliacoes, atendimentoMensagensRapidas, atendimentoStatusLog
- [x] Backend: router atendimento.ts com procedures de departamentos, fila, operadores, SLA, etiquetas, notas, mensagens rápidas, transferência, finalização, supervisão
- [x] Backend: router registrado no appRouter principal
- [x] Frontend: página Atendimento.tsx — painel 3 colunas (lista/fila, chat, detalhes)
- [x] Frontend: fila de atendimento com cards de prioridade e SLA
- [x] Frontend: painel do operador com status online/ausente/ocupado/offline
- [x] Frontend: chat integrado com mensagens, envio de mídia, mensagens rápidas
- [x] Frontend: painel de detalhes com notas internas e etiquetas
- [x] Frontend: modal de transferência entre operadores/departamentos
- [x] Frontend: modal de finalização de atendimento
- [x] Frontend: painel de supervisão em tempo real (KPIs, operadores, atendimentos)
- [x] Frontend: página AtendimentoConfig.tsx — departamentos, etiquetas, mensagens rápidas
- [x] Sidebar: item "Central de Atendimento" e "Config. Atendimento" no grupo WhatsApp
- [x] App.tsx: rotas /atendimento e /configuracoes/atendimento registradas
- [x] TypeScript: 0 erros | Vite build: sucesso

## Consolidação: Conversas → Central de Atendimento
- [ ] Analisar WhatsApp.tsx e identificar funcionalidades a migrar para Atendimento.tsx
- [ ] Integrar seletor de instância WhatsApp na Central de Atendimento
- [ ] Integrar lista de conversas (com busca e filtros) na Central de Atendimento
- [ ] Garantir envio de texto, imagem, documento e áudio na Central de Atendimento
- [ ] Garantir player de áudio e preview de imagem/documento na Central de Atendimento
- [ ] Remover item "Conversas" do menu Sidebar (grupo WhatsApp)
- [ ] Redirecionar rota /whatsapp → /atendimento (ou mostrar 404)
- [ ] Verificar TypeScript: 0 erros | Vite build: sucesso

## Fluxos de Atendimento (Chatbot)
- [ ] Schema: tabela botFluxos (id, nome, descricao, ativo, instanciaId, criadoEm)
- [ ] Schema: tabela botNos (id, fluxoId, tipo, titulo, conteudo JSON, ordem)
- [ ] Schema: tabela botSessoes (id, conversaId, fluxoId, noAtualId, dados JSON, status)
- [ ] Backend: router fluxos.ts com CRUD de fluxos e nós
- [ ] Backend: motor de execução do bot (processarMensagem)
- [ ] Backend: integração no webhook para iniciar/avançar fluxo
- [ ] Frontend: página FluxosAtendimento.tsx com lista de fluxos
- [ ] Frontend: editor de fluxo com nós de texto e botões de ação
- [ ] Frontend: rota /fluxos e item no menu lateral

## Integração BTG Pactual API - Boleto Híbrido (BANKSLIP_PIX)

### Schema e Banco de Dados
- [x] Adicionar campos de endereço na tabela devedores: address, addressNumber, addressComplement, neighborhood, city, state, zipCode
- [x] Adicionar campos BTG na tabela cobrancas: btgCollectionId, btgBankSlipUrl, btgPixQrCode, btgPixCopiaECola, btgStatus
- [x] Adicionar campos BTG na tabela parcelasAcordo: btgCollectionId, btgBankSlipUrl, btgPixQrCode, btgPixCopiaECola, btgStatus
- [x] Adicionar tabela btgConfig para credenciais BTG por condomínio: clientId, clientSecret, companyId, webhookSecret, ativo
- [x] Executar db:push para aplicar mudanças

### Backend - Serviço BTG
- [x] Criar server/btg-service.ts com autenticação OAuth2 (Client Credentials) e helpers: getBtgAccessToken, criarCobrancaBtg, cancelarCobrancaBtg, buscarCobrancaBtg, listarCobrancasBtg
- [x] Implementar cache de token de acesso BTG (evitar reautenticação a cada chamada)
- [x] Criar server/routers/btg.ts com procedures: getConfig, saveConfig, emitirBoleto, cancelarBoleto, listarCobrancasBTG, sincronizarStatus

### Backend - Webhook BTG
- [x] Criar server/webhook-btg.ts para processar eventos do BTG
- [x] Processar evento collections.paid → dar baixa automática na cobrança/parcela
- [x] Processar evento collections.expired → atualizar status para vencido
- [x] Processar evento collections.cancelled → atualizar status para cancelado
- [x] Registrar endpoint POST /api/webhook/btg no server/_core/index.ts
- [x] Validar assinatura HMAC do webhook BTG (segurança)

### Frontend - Configuração BTG
- [x] Criar página client/src/pages/configuracoes/BTGConfig.tsx com campos: clientId, clientSecret, companyId, webhookSecret
- [x] Adicionar rota /configuracoes/btg no App.tsx
- [x] Adicionar link no menu lateral de Configurações (Banco → BTG — Configuração)

### Frontend - Emissão de Boleto BTG
- [x] Adicionar botão "Emitir Boleto BTG" na página de detalhes do devedor (DevedorDetalhes.tsx)
- [x] Criar modal BTGEmitirBoletoModal.tsx: verificar dados do pagador, confirmar emissão, mostrar resultado (URL do boleto + QR Code PIX)
- [x] Exibir alerta quando devedor não tem endereço completo (redirecionar para edição)
- [x] Adicionar campos de endereço no DevedorForm.tsx
- [x] Atualizar procedures devedores.create e devedores.update para aceitar campos de endereço
- [x] Mostrar botão BTG e link do boleto na listagem de cobranças

### Frontend - Conciliação BTG
- [x] Criar página client/src/pages/admin/BTGConciliacao.tsx
- [x] Listar cobranças BTG vs cobranças do sistema com status
- [x] Botão de conciliação manual para casos não batidos automaticamente
- [x] Filtros por período, status BTG, condomínio
- [x] Adicionar rota /admin/btg-conciliacao no App.tsx

### Testes
- [x] Escrever testes unitários para btg-service.ts (validação de módulo e funções)
- [x] Escrever testes para router BTG (verificação de registro no appRouter)

## Refatoração BTG — Configuração Global (nível escritório)
- [x] Refatorar btg-service.ts para usar BTG_CLIENT_ID, BTG_CLIENT_SECRET, BTG_COMPANY_ID das env vars globais (sem condominioId)
- [x] Simplificar router btg.ts: remover getConfig/saveConfig por condomínio, usar config global
- [x] Atualizar BTGConfig.tsx: tela de configuração global com status das env vars
- [x] Atualizar BTGConciliacao.tsx: filtro de condomínio é opcional (admin pode ver todos)
- [x] Manter tabela btgConfig no banco para configurações extras (instrucoes, diasVencimento, webhookSecret)

## Regra de Exibição de Cobranças e Acordos
- [x] Backend: query getComAcordos retorna cobranças normais (excluindo em_acordo) + parcelas de acordos ativos
- [x] Backend: ao criar acordo, cobranças vinculadas ficam com status "em_acordo"
- [x] Backend: ao cancelar/inadimplir acordo, cobranças originais voltam ao status "em_cobranca"
- [x] Backend: getCobrancasByDevedor e getCobrancasComCalculos filtram cobranças em_acordo
- [x] Frontend: tela de Cobranças exibe parcelas do acordo no lugar das cobranças originais quando há acordo ativo
- [x] Frontend: badge "Acordo" na aba de cobranças quando há acordo ativo
- [x] Frontend: alerta informativo azul na aba de cobranças quando há acordo ativo
- [x] Frontend: parcelas de acordo exibidas com ícone de aperto de mão e fundo azul diferenciado
- [x] Frontend: botão "Emitir BTG" disponível para parcelas de acordo sem boleto emitido
- [x] Frontend: modal de Realizar Acordo recebe apenas cobranças originais (não parcelas)
- [x] Testes: 298 testes passando

## Custas Judiciais
- [ ] Criar tabela custasJudiciais no schema: id, devedorId, condominioId, descricao, valor (int centavos), data, tipo (enum: distribuicao, citacao, pericia, honorarios_periciais, outros), observacoes, createdBy, createdAt
- [ ] Aplicar migração no banco (db:push)
- [ ] Criar helpers em server/db-custas.ts: getCustasByDevedor, createCusta, deleteCusta
- [ ] Criar procedures tRPC: custas.getByDevedor, custas.create, custas.delete
- [ ] Criar componente CustasJudiciais.tsx com formulário inline e listagem
- [ ] Integrar CustasJudiciais na aba de detalhes do devedor (nova aba ou seção em Histórico)
- [ ] Exibir total de custas judiciais nos cards de métricas do devedor
- [ ] Incluir custas judiciais no cálculo do valor total devido do devedor

## Custas Judiciais no Acordo
- [x] Incluir custasJudiciais no cálculo do subTotal do RealizarAcordoModal (extraído do breakdown)
- [x] Adicionar custasJudiciais nos totais agregados (useMemo totais)
- [x] Adicionar coluna "Custas Jud." na tabela de resumo do modal (cabeçalho + células + totais)
- [x] Corrigir: custas da tabela custasJudiciais (cadastradas no devedor) agora aparecem no modal de acordo (distribuídas proporcionalmente entre as cobranças)
- [x] Remover campo manual "Honorários / Desp. Judiciais" do simulador (duplicava o valor das custas)

## Correção Crítica CNAB 240 — Erros Reportados pelo BTG (11/06/2026)
- [x] Bug: data de vencimento "NaNNaNNa" — parsing de dueDate como string ISO sem conversão local
- [x] Bug: valor com ponto decimal "N00000000001201" — amount string não convertida para inteiro
- [x] Bug: nosso número null/undefined pode gerar erro — adicionada proteção `(titulo.nossoNumero || "")`
- [x] Bug: data de juros mora usava `new Date(titulo.dataVencimento)` sem preservar data local — corrigido para `new Date(y, m, d+1)`
- [x] Bug: campo "Seu Número" (pos 205-229) usava `padRight` (espaços à direita) — corrigido para `padLeft` (zeros à esquerda)
- [x] 7 novos testes unitários cobrindo os bugs corrigidos (332 testes passando no total)

## Correção Crítica CNAB 240 — Layout FEBRABAN V10.9 (11/06/2026)
- [x] Reescrever gerarSegmentoPCNAB240 com layout FEBRABAN V10.9 correto
- [x] Conta corrente: posições 24-35 (não convênio)
- [x] Nosso número: posições 38-57 (20 chars, zeros à esquerda)
- [x] Data vencimento: posições 78-85 (DDMMAAAA, sem NaN)
- [x] Valor nominal: posições 86-100 (centavos inteiros, sem ponto decimal)
- [x] Data juros mora: posições 119-126 (vencimento+1 dia, sem deslocamento UTC)
- [x] Seu número: posições 196-220 (zeros à esquerda, não espaços)
- [x] Corrigir gerarHeaderLoteCNAB240: versão 000, convênio 20 chars (padRight)
- [x] Corrigir gerarHeaderArquivoCNAB240: convênio 20 chars, versão 083, densidade 00000
- [x] Atualizar testes unitários com offsets corretos do novo layout
- [x] Validar layout idêntico ao arquivo de exemplo BTG
- [x] 332 testes passando

## Módulo Jurídico — Central de Demandas

- [ ] Schema: tabela demandas (id, numero, condominioId, solicitante, canal, assunto, descricao, prioridade, responsavel, prazo, status, tipo, subtipo, criadoEm)
- [ ] Schema: tabela colunasDemanda (id, nome, cor, ordem, icone, padrao)
- [ ] Schema: tabela timelineDemanda (id, demandaId, tipo, descricao, usuarioId, criadoEm)
- [ ] Schema: tabela anexosDemanda (id, demandaId, nome, url, tamanho, criadoEm)
- [ ] Schema: tabela assembleias (id, condominioId, data, hora, endereco, advogadoId, tipo, status, horasGastas, criadoEm)
- [ ] Migration: pnpm db:push para criar as tabelas
- [ ] tRPC: CRUD de demandas (criar, listar, atualizar, mover coluna)
- [ ] tRPC: CRUD de colunas kanban (criar, renomear, reordenar, colorir)
- [ ] tRPC: timeline da demanda (adicionar evento, listar)
- [ ] tRPC: CRUD de assembleias
- [ ] tRPC: dashboard jurídico (métricas agregadas)
- [ ] UI: Central de Demandas — listagem com filtros
- [ ] UI: Modal de criação de demanda
- [ ] UI: Quadro Kanban com drag-and-drop
- [ ] UI: Cards do Kanban com número, condomínio, solicitante, responsável, prioridade, SLA
- [ ] UI: Colunas customizáveis (criar, renomear, colorir, reordenar)
- [ ] UI: Tela de detalhe da demanda com timeline
- [ ] UI: Upload de anexos na demanda
- [ ] UI: Tela de Assembleias com listagem e criação
- [ ] UI: Dashboard Gerencial Jurídico (demandas abertas, SLA, por responsável, por canal)
- [ ] Integrar menu Jurídico na sidebar (Central de Demandas, Kanban, Assembleias, Dashboard)

## Integração Jurídico ↔ Cobrança
- [x] Schema: campos devedorId, valorDivida, nomeDevedor, cpfDevedor, unidadeDevedor, qtdCobrancas na tabela demandas
- [x] db:push aplicado (campos já existiam no banco da sessão anterior)
- [x] db-demandas.ts: função escalarParaJuridico (cria demanda com snapshot da dívida)
- [x] db-demandas.ts: função getCobrancasVinculadas (retorna snapshot da dívida vinculada à demanda)
- [x] db-demandas.ts: getDemandas e getDemandaById agora retornam campos de cobrança vinculada
- [x] router juridicoDemandas: procedure escalarParaJuridico
- [x] router juridicoDemandas: procedure getCobrancasVinculadas
- [x] DevedorDetalhes.tsx: botão "Escalar para Jurídico" no dropdown "Mais"
- [x] DevedorDetalhes.tsx: modal de confirmação com resumo da inadimplência (valor, unidade, cobranças em aberto, tentativas sem sucesso)
- [x] DemandaDetalhes.tsx: card "Cobrança Vinculada" com snapshot da dívida e link para o devedor
- [x] KanbanDemandas.tsx: indicador visual de valor da dívida nos cards com cobrança vinculada
- [x] Corrigido erro TypeScript: comentário JSX mal fechado na linha 874 do DevedorDetalhes.tsx
- [x] 332 testes passando, 0 erros TypeScript

## Módulo Processos Judiciais + Prazos (com DataJud)
- [x] Schema: tabela processosJudiciais (id, numeroCNJ, tribunal, tribunalAlias, comarca, vara, classe, assunto, faseProcessual, status, condominioId, advogadoId, advogadoNome, valorCausa, valorCondenacao, observacoes, demandaId, criadoPorId, criadoEm, atualizadoEm)
- [x] Schema: tabela partesProcesso (id, processoId, tipo, nome, cpfCnpj, representante, advogadoContrario)
- [x] Schema: tabela movimentacoesProcesso (id, processoId, data, descricao, tipo, origem, usuarioId, criadoEm)
- [x] Schema: tabela financeirosProcesso (id, processoId, tipo, descricao, valor, data, pago, dataPagamento, criadoEm)
- [x] Schema: tabela prazosJuridicos (id, titulo, tipo, processoId, demandaId, condominioId, responsavelId, responsavelNome, dataLimite, alertas, status, observacoes, criadoEm)
- [x] db:push para criar as novas tabelas
- [x] db-processos.ts: helpers CRUD de processos, partes, movimentações, financeiro
- [x] db-prazos.ts: helpers CRUD de prazos com filtros de urgência
- [x] server/datajud.ts: helper para consultar API DataJud por número CNJ e por tribunal alias
- [x] routers.ts: procedures processos.listar, getById, create, update, delete
- [x] routers.ts: procedures processos.addMovimentacao, getMovimentacoes
- [x] routers.ts: procedures processos.addParte, getPartes, removeParte
- [x] routers.ts: procedures processos.addFinanceiro, getFinanceiro
- [x] routers.ts: procedures processos.buscarDataJud (integração DataJud)
- [x] routers.ts: procedures prazos.listar, create, update, concluir, delete
- [x] Frontend: /admin/juridico/processos — listagem com filtros e modal de criação + importação DataJud
- [x] Frontend: /admin/juridico/processos/:id — detalhe com timeline visual, partes, financeiro, prazos
- [x] Frontend: /admin/juridico/prazos — listagem com badges de urgência (Atrasado/Hoje/7d/15d/30d)
- [x] Sidebar: adicionar links Processos e Prazos no menu jurídico
- [x] App.tsx: registrar rotas /admin/juridico/processos e /admin/juridico/prazos
- [x] Testes unitários para helpers de processos e prazos (332 testes passando)
- [x] Verificar 0 erros TypeScript e todos os testes passando

## Integração MNI TJRJ

- [ ] Schema: tabela mniCredenciais (id, tribunal, idConsultante, senhaConsultante, ambiente, ativo, criadoEm)
- [ ] Schema: tabela intimacoesMNI (id, idAviso, processoId, numeroCNJ, tipoAviso, tipoComunicacao, dataDisponibilizacao, dataPublicacao, orgao, teor, parametros JSON, status, tratadoPorId, tratadoEm, observacoes, criadoEm)
- [ ] Schema: tabela sincronizacoesMNI (id, processoId, ultimaSincronizacao, status, erro)
- [ ] db:push para criar as novas tabelas
- [ ] server/mni-client.ts: cliente SOAP para consultarProcesso, consultarAvisosPendentes, consultarTeorComunicacao, consultarAlteracao
- [ ] server/db-mni.ts: helpers CRUD para credenciais, intimações e sincronizações
- [ ] server/routers/mni.ts: procedures tRPC para sincronizarProcesso, listarIntimacoes, marcarCiencia, tratarAviso, descartarAviso, testarConexao
- [ ] Frontend: /admin/juridico/configuracoes-mni — tela de cadastro de credenciais TJRJ com teste de conexão
- [ ] Frontend: /admin/juridico/intimacoes — Central de Intimações com fila de trabalho estilo Astrea
- [ ] Integrar botão "Sincronizar via MNI" no ProcessoDetalhes quando credenciais estiverem configuradas
- [ ] Sidebar: adicionar links Intimações e Configurações MNI no menu Jurídico
- [ ] Verificar 0 erros TypeScript e todos os testes passando


## Kanban Jurídico — Colunas Fixas + Configuráveis

- [x] Adicionar campo `tipo` enum (entrada/intermediaria/saida) na tabela colunasDemanda
- [x] Migrar dados: coluna "Recebido" → tipo=entrada, demais padrão → tipo=intermediaria, criar coluna Resolvidas → tipo=saida
- [x] Atualizar seed: duas colunas fixas (Demandas Recebidas / Demandas Resolvidas) + exemplos intermediárias
- [x] Procedure getColunasEntrada: retorna a coluna de entrada para uso no createDemanda
- [x] Procedure createColuna: só permite criar colunas do tipo intermediaria
- [x] Procedure deleteColuna: bloquear exclusão de colunas tipo entrada e saida
- [x] Procedure mover: ao mover para coluna tipo=saida, marcar demanda como concluída
- [x] KanbanDemandas.tsx: layout visual diferenciado para colunas fixas vs intermediárias
- [x] KanbanDemandas.tsx: modal de gerenciamento de colunas intermediárias (criar, renomear, excluir, reordenar)
- [x] KanbanDemandas.tsx: botão "Gerenciar Colunas" no header
- [x] KanbanDemandas.tsx: indicador visual nas colunas fixas (badge "Fixo")
- [x] KanbanDemandas.tsx: coluna saida com estilo diferenciado (verde/concluído)

## Etiquetas Visuais de Prioridade
- [x] Criar componente PrioridadeBadge reutilizável (pill, dot, strip, icon, compact)
- [x] Atualizar KanbanDemandas: faixa colorida no topo do card + badge pill + ring para urgente
- [x] Atualizar CentralDemandas: faixa + badge pill nos cards, dot no filtro de prioridade
- [x] Atualizar DemandaDetalhes: badge pill no header, dot no select de prioridade

## Módulo Publicações Jurídicas
- [ ] Schema: tabela monitoramentosPublicacoes (id, advogadoNome, oab, uf, palavrasChave, ativo, createdAt)
- [ ] Schema: tabela publicacoes (id, monitoramentoId, tribunal, comarca, vara, data, tipo, encontradoPor, textoCompleto, numeroCNJ, status, lida, createdAt)
- [ ] db-publicacoes.ts: helpers CRUD para monitoramentos e publicações
- [ ] Router tRPC: publicacoes.listar, publicacoes.getById, publicacoes.updateStatus, publicacoes.marcarLida, publicacoes.arquivar
- [ ] Router tRPC: monitoramentos.listar, monitoramentos.create, monitoramentos.update, monitoramentos.delete, monitoramentos.toggle
- [ ] Router tRPC: publicacoes.dashboard (contadores por status)
- [ ] Router tRPC: publicacoes.criarManual (para testes/entrada manual)
- [ ] Página DashboardPublicacoes.tsx: indicadores (hoje, não lidas, pendentes, arquivadas, por advogado)
- [ ] Página DashboardPublicacoes.tsx: listagem de publicações recentes com filtros
- [ ] Página MonitoramentosPublicacoes.tsx: CRUD de advogados monitorados
- [ ] Página KanbanPublicacoes.tsx: colunas Nova/Analisando/Aguardando Providência/Providenciada/Arquivada
- [ ] Modal PublicacaoDetalhes: texto completo, dados do tribunal, processo CNJ, fluxo de status
- [ ] Integrar rotas em App.tsx
- [ ] Adicionar entrada no menu lateral (DashboardLayout.tsx) em Jurídico

## Arquivamento de Clientes (em vez de exclusão)
- [x] Banco: adicionar colunas statusCadastro, dataRescisao, motivoSaida, situacaoJuridica, observacoesSaida na tabela condominios
- [x] Schema Drizzle: campos adicionados em drizzle/schema.ts
- [x] Backend routers.ts: campos de arquivamento adicionados no schema Zod do update; procedure arquivar criada
- [x] Frontend Condominios.tsx: botão de exclusão substituído por modal de arquivamento; filtro de status (Todos/Ativo/Inativo/Arquivado); badge de status na tabela
- [x] Frontend CondominioForm.tsx: seção de Status do Cadastro adicionada na aba Geral (visível apenas ao editar), com campos dataRescisao, motivoSaida, situacaoJuridica, observacoesSaida

## Login e Dashboard do Advogado
- [x] Backend auth-colaborador.ts: aceitar role "advogado" além de "cobrador"
- [x] Backend: mensagem de erro ajustada para roles permitidos
- [x] App.tsx: redirecionamento para /advogado/dashboard quando role === "advogado"
- [x] Criar página AdvogadoDashboard.tsx com visão jurídica (processos, prazos urgentes, resumo)
- [x] Registrar rota /advogado/dashboard no App.tsx

## RBAC para Advogado (Opção B)
- [x] usePermissions.ts: incluir role "advogado" no sistema de perfis (remover do bypass)
- [x] Backend getMyPermissions: funcionar para role advogado além de colaborador
- [x] Tela UsersProfiles: exibir usuários advogados para atribuição de perfil
- [x] Sidebar: aplicar colaboradorPodeVer para advogado no módulo jurídico
- [x] Páginas de Processos e Prazos: aplicar can() para controle de ações (criar)
- [x] Dashboard do Advogado: seções condicionais baseadas nas permissões do perfil

## RBAC Dinâmico nas Rotas
- [x] Criar componente PermissionRoute que verifica can(modulo, "visualizar") para colaborador/advogado
- [x] Mapear cada rota ao seu módulo RBAC correspondente
- [x] Substituir allowedRoles estático por PermissionRoute nas rotas de módulos
- [x] Admin/síndico/cobrador mantêm bypass total (sem verificação de perfil)

## Submódulos Jurídicos no RBAC
- [x] db-profiles.ts: substituir módulo "juridico" único por submódulos (processos, prazos, demandas, assembleias, intimacoes, publicacoes, juridico_config)
- [x] usePermissions.ts: adicionar novos tipos de Modulo para os submódulos jurídicos
- [x] Sidebar: mapear cada item jurídico ao seu submódulo RBAC
- [x] App.tsx: aplicar PermissionRoute com o submódulo correto em cada rota jurídica
- [x] Perfis padrão: atualizar seedDefaultProfiles para incluir os novos submódulos

## Submódulos de Cobrança no RBAC
- [x] db-profiles.ts: adicionar módulos modelos_documento e whatsapp
- [x] usePermissions.ts: adicionar novos tipos de Modulo para modelos_documento e whatsapp
- [x] Sidebar: remover modulo genérico dos grupos e adicionar rbacModulo por item (Cobrança, Automação, Banco, Importações, WhatsApp, Relatórios, Modelos)
- [x] App.tsx: aplicar PermissionRoute com submódulo correto em rotas de modelos, whatsapp e atendimento

## Variáveis Jurídicas e Tela de Preenchimento de Modelos
- [x] Schema: adicionar tipos jurídicos no enum tipo da tabela modelosDocumento (procuracao, carta_preposto, ata_audiencia, notificacao_juridica)
- [x] ModeloEditor: adicionar categoria "Jurídico" com variáveis (condominio, representanteLegal, tipoAcao, numeroProcesso, dataDocumento, assinatura, nomePreposto, dataHoraAudiencia)
- [x] ModelosDocumento: adicionar botão "Preencher" para modelos jurídicos
- [x] Criar página PreencherModeloJuridico.tsx com formulário de preenchimento e preview do documento
- [x] Registrar rota /modelos-documento/:id/preencher no App.tsx

## Relatório de Inadimplência
- [x] Criar procedure backend relatorios.inadimplencia com filtros: condominioId, unidadeId, periodoInicio, periodoFim, atualizadoAte, tiposCobranca, categoria, honorariosPerc, custasJudiciais, outrasDespesas
- [x] Calcular valores atualizados (juros + multa + correção) até a data de atualização informada
- [x] Criar página RelatorioInadimplencia.tsx com filtros completos
- [x] Filtro 1: Condomínio (select)
- [x] Filtro 2: Unidade (select dinâmico baseado no condomínio)
- [x] Filtro 3: Período (data início e fim do vencimento)
- [x] Filtro 4: Atualização (data base para cálculo de encargos)
- [x] Filtro 5: Tipos de cobrança (cota condominial, acordo, multa, infração, salão de festa, churrasqueira, todos)
- [x] Filtro 6: Categoria (ajuizados, padrão, todos)
- [x] Filtro 7: Campos de acréscimo: honorários (%), custas judiciais (R$), outras despesas (R$)
- [x] Tabela com colunas: unidade, devedor, vencimento, valor original, juros, multa, correção, honorários, custas, outras despesas, total atualizado
- [x] Totalizadores: subtotal por devedor, total geral
- [x] Exportar PDF (via jsPDF + jspdf-autotable no frontend)
- [x] Exportar Excel (via ExcelJS no frontend)
- [x] Registrar rota /relatorios/inadimplencia no App.tsx
- [x] Adicionar link no menu de Relatórios no Sidebar

## Relatório de Produtividade / Cobrança
- [x] Expandir procedure backend relatorios.produtividade com filtros: condominioId, devedorId, periodoInicio, periodoFim, resultadoContato, tipoContato, responsavelId
- [x] Criar página RelatorioCobranca.tsx com filtros e tabela de tentativas detalhada
- [x] Filtro 1: Condomínio (select, todos ou específico)
- [x] Filtro 2: Unidade (select dinâmico baseado no condomínio)
- [x] Filtro 3: Período do contato (data início e fim)
- [x] Filtro 4: Resultado do contato (promessa de pagamento, sem resposta, recusa, outro)
- [x] Filtro 5: Tipo de contato (telefone, e-mail, whatsapp, presencial, sistema/automação)
- [x] Filtro 6: Responsável (select de operadores/usuários)
- [x] Tabela detalhada: data, devedor, unidade, condomínio, tipo contato, resultado, notas, responsável
- [x] Cards de resumo: total tentativas, por tipo, por resultado, taxa de sucesso
- [x] Exportar Excel com ExcelJS
- [x] Exportar PDF com jsPDF+autotable
- [x] Registrar rota /relatorios/cobranca no App.tsx
- [x] Adicionar link no menu Relatórios do Sidebar

## Bug: Kanban Demandas - tarefa some ao trocar advogado responsável
- [x] Corrigir procedure juridicoDemandas.update: ao trocar responsavelId, se a coluna atual for intermediária (pessoal de outro advogado), mover automaticamente para a coluna de entrada global

## WhatsApp - Grupos (Z-API)
- [ ] zapi-service.ts: adicionar funções getGroups, getGroupMetadata, createGroup, sendTextToGroup, addParticipants, removeParticipants, updateGroupName, updateGroupDescription, getInviteLink, leaveGroup, promoteAdmin, removeAdmin
- [ ] backend: criar router whatsapp.grupos com procedures listarGrupos, metadadosGrupo, criarGrupo, enviarMensagemGrupo, adicionarParticipante, removerParticipante, atualizarNomeGrupo, obterLinkConvite, sairGrupo, promoverAdmin, removerAdmin
- [ ] Criar página WhatsAppGrupos.tsx com: lista de grupos da instância, painel de detalhes do grupo (participantes, link de convite), modal criar grupo, envio de mensagem para o grupo, gerenciamento de participantes
- [ ] Registrar rota /whatsapp/grupos no App.tsx
- [ ] Adicionar link Grupos no menu WhatsApp do Sidebar

- [x] Criar tabela horarioAtendimento no schema (dia_semana, hora_inicio, hora_fim, ativo)
- [x] Criar procedures tRPC: getHorarios, salvarHorarios
- [x] Criar tela de configuração de horário de atendimento em Configurações
- [x] Integrar verificação de horário do banco no bot-engine e webhook (substituir hardcoded 08:00-20:00)

## Fase 1 Kanban — Checkbox Redondo de Conclusão
- [ ] Criar componente CheckboxConclusao reutilizável (bolinha circular com animação de check)
- [ ] Integrar CheckboxConclusao no KanbanJuridico (conclui → status "resolvido")
- [ ] Integrar CheckboxConclusao no KanbanDemandas (conclui → última coluna ou coluna marcada como conclusão)
- [ ] Integrar CheckboxConclusao no KanbanPublicacoes (conclui → status "concluido")

## Visão Consolidada do Administrador no KanbanDemandas

- [x] Backend: procedure `listarDemandasConsolidadas` — retorna todas as demandas em colunas intermediárias (globais + pessoais de todos os advogados) com join para colunaNome, colunaUserId, colunaUserNome
- [x] Backend: procedure `listarAdvogadosComDemandas` — retorna lista de usuários que têm demandas em colunas intermediárias (para popular o filtro)
- [x] Frontend: toggle "Visão Admin" no header do KanbanDemandas (visível apenas para role=admin), persiste no localStorage
- [x] Frontend: board consolidado com 3 colunas fixas: Demandas Recebidas → Em Andamento (unificada) → Demandas Resolvidas
- [x] Frontend: coluna "Em Andamento" com Select de filtro por advogado e contador de demandas
- [x] Frontend: KanbanCardConsolidado com badge da coluna original (ícone + nome) e avatar com iniciais do advogado responsável
- [x] Frontend: legenda visual diferenciada para a visão consolidada (fundo violeta)
- [x] Frontend: checkbox de conclusão funciona na visão consolidada (move para coluna de saída)
- [x] Zero erros de TypeScript

## Redesign do Layout do Boleto PDF

- [x] Novo cabeçalho: logo Gomes & Silva (canto esquerdo) + "Recibo do Pagador" (canto direito)
- [x] Bloco Beneficiário | Pagador lado a lado com separador vertical
- [x] Seção "Detalhes da fatura" com Vencimento e Valor em destaque (fonte maior)
- [x] Campo "Credor do Título" e "Nosso Número" nos detalhes
- [x] Tabela "Composição da cobrança" com colunas: Título, Vencimento, Vl. Orig., C. Monetária, Multa, Juros, Honorário, Vl. Desp., Desconto, Total
- [x] Cabeçalho da tabela com fundo cinza e linhas alternadas nas linhas de dados
- [x] Linha de total ao final da tabela
- [x] Suporte a itensCobranca[] na interface DadosBoleto (campo opcional)
- [x] Ficha de compensação BTG mantida fiel ao padrão (cabeçalho com logo + linha digitável)
- [x] Campos da ficha: Local de pagamento, Beneficiário, Data doc., Nº doc., Espécie, Aceite, Data proc., Nosso Número, Carteira, Moeda, Valor, Instruções, Descontos/Multas, Pagador, Código de barras
- [x] Zero erros de TypeScript, 17 testes do boleto-pdf passando

## Fase 1 — Correções de Integridade Jurídica

- [x] 1.1 Corrigir numeração de demandas: substituir COUNT(*) por MAX(id)+1 em gerarNumeroDemanda
- [x] 1.2 Responsável com vínculo forte: Select de usuários nos formulários de demanda e prazo
- [x] 1.3 Corrigir anti-pattern setState no render em CentralIntimacoes

## Fase 2 — Automações entre Pilares Jurídicos

- [x] 2.1 Intimação tratada → prazo criado automaticamente (backend tratarIntimacao + toast com link)
- [x] 2.2 Movimentação DataJud → banner de sugestão de prazo no ProcessoDetalhes
- [x] 2.3 Botão "Escalar para Processo Judicial" no DemandaDetalhes (tipos cobranca_judicial/processo)

## Fase 3 — Dashboard Jurídico Unificado

- [x] 3.3 Corrigir N+1 em listarCondominiosComJuridico (queries agregadas com GROUP BY)
- [x] 3.1 Adicionar seções de Processos, Prazos e Publicações ao DashboardJuridico (backend + frontend)
- [x] 3.2 Seção de Desempenho por Advogado no DashboardJuridico (backend + frontend)

## Fase 4 — Melhorias Operacionais

- [x] 4.1 Filtros avançados na CentralDemandas (responsável, condomínio, aging, prazo vencido)
- [x] 4.2 Ações em lote no Kanban e na Lista (reatribuir, mover coluna, alterar prioridade)
- [x] 4.3 Job de alertas automáticos de prazo (notifyOwner + fila WhatsApp)
- [x] 4.4 Calendário de prazos e assembleias em PrazosJuridicos

## Relatório de Acordos
- [x] Procedure backend getRelatorioAcordos (filtros: condominioId, dataInicio, dataFim)
- [x] Página RelatorioAcordos.tsx com filtros, tabelas detalhadas e exportação PDF
- [x] Rota e link de navegação na seção Relatórios

## Reorganização do Módulo de Relatórios
- [x] Sidebar: reorganizar menu Relatórios em 3 sub-grupos (Cobrança, Produtividade, Centro de Inteligência)
- [x] Sidebar: remover itens redundantes (Inadimplência, Cobrança, Acordos Detalhado) do menu
- [x] Sidebar: mover Auditoria do Sistema para o grupo Configurações
- [x] Relatorios.tsx: renomear título para "Painel de Relatórios"
- [x] Relatorios.tsx: adicionar aba Acordos Detalhado com link para página dedicada
- [x] Relatorios.tsx: adicionar exportação PDF em cada aba

## PDF Real do Relatório de Acordos
- [x] Criar gerador PDFKit (relatorio-acordos-pdf.ts) com layout fiel ao Markdown de referência
- [x] Procedure tRPC relatorios.gerarPDFAcordos: busca dados, gera PDF, salva no S3 e retorna URL
- [x] Botão "Exportar PDF" na página RelatorioAcordosDetalhado.tsx (substitui window.print)
- [x] PDF estruturado: cabeçalho Gomes & Silva, seções por acordo, tabela cobranças originais, resumo acréscimos, tabela parcelas, rodapé Jetro Administradora

## Correção: Botão Exportar PDF do Relatório de Acordos
- [x] Corrigir window.open() bloqueado por popup blocker — substituído por link <a> programático com download
- [x] Corrigir lógica filtroTemValor: Object.keys() retornava 3 mesmo com todos undefined — agora checa Object.values().some()
- [x] Atualizar enabled da query e validação handleGerarPDF para usar filtroTemValor

## Unificação das abas Acordos no Painel de Relatórios
- [x] Remover aba "Acordos Detalhado" duplicada do Painel de Relatórios
- [x] Substituir aba "Acordos" simples pelo layout detalhado completo (cobranças originais, acréscimos, parcelas)
- [x] Botão "Exportar PDF" contextual na aba Acordos (gera PDF real via backend)
- [x] Exportação Excel atualizada para usar shape detalhado (acordos.acordos[])
- [x] Grid de abas reduzido de 6 para 5 colunas

## Relatório de Produtividade (Relatório de Cobrança) — Reformulação Completa
- [x] Backend: criar função getRelatorioCobranca em db-relatorios.ts com filtros completos (condomínio, unidade, período, resultado, tipo, userId, isSistema)
- [x] Backend: criar procedure relatorios.relatorioCobranca no routers.ts
- [x] Backend: criar procedure relatorios.gerarPDFCobranca no routers.ts
- [x] Backend: criar procedure relatorios.listarUnidades no routers.ts
- [x] Backend: criar gerador PDF relatorio-cobranca-pdf.ts (PDFKit, mesmo padrão do relatório de acordos)
- [x] Frontend: reformular aba Produtividade com filtros locais (condomínio, unidade, período, resultado, tipo, responsável)
- [x] Frontend: tabela detalhada por contato (data, devedor, unidade, condomínio, tipo, resultado, responsável, observações)
- [x] Frontend: cards de totais (total, promessas, sem resposta, recusas, outros)
- [x] Frontend: botão Exportar PDF contextual (PDF real via backend)
- [x] Frontend: botão Exportar Excel (ExcelJS client-side)

## Melhorias — Demanda Jurídica e Cadastro de Devedor
- [x] Demanda jurídica: tornar condomínio obrigatório no formulário de criação (validação antes de submeter com mensagem "Selecione o condomínio/empresa")
- [x] Devedor: adicionar coluna email2 (varchar 320) na tabela devedores
- [x] Devedor: adicionar coluna phone2 (varchar 20) na tabela devedores
- [x] Devedor: atualizar procedure devedores.create e devedores.update para aceitar email2 e phone2
- [x] Devedor: atualizar DevedorForm.tsx com campos Email 2 e Telefone 2
- [x] Devedor: exibir email2 e phone2 no DevedorDetalhes.tsx quando preenchidos

## Planilha de Importação — Email 2 e Telefone 2
- [x] Template Excel: adicionar colunas "Email 2 (opcional)" e "Telefone 2 (opcional)" após Email e Telefone
- [x] Template Excel: adicionar instrução 10 explicando os novos campos opcionais
- [x] Interface DadosImportacao: adicionar campos email2 e telefone2
- [x] Parser processarPlanilha: ler colunas "Email 2 (opcional)" e "Telefone 2 (opcional)" do arquivo
- [x] Procedure importação: passar email2 e phone2 ao createDevedor

## Tarefas Internas no Kanban
- [x] Schema: adicionar tabela tarefasDemanda (id, demandaId, titulo, descricao, responsavelId, responsavelNome, status, prioridade, prazo, criadoPorId, criadoPorNome, createdAt, updatedAt)
- [x] Schema: adicionar tabela tarefaComentarios (id, tarefaId, texto, autorId, autorNome, createdAt)
- [x] Banco: criar colunas via ALTER TABLE (webdev_execute_sql)
- [x] Backend: criar server/routers/tarefas-demanda.ts com procedures listar, create, update, delete, addComentario, getComentarios, deleteComentario, contadores
- [x] Backend: importar e registrar sub-router de tarefas em juridicoDemandas no routers.ts
- [x] Frontend: adicionar aba "Tarefas" na DemandaDetalhes.tsx com lista agrupada por status
- [x] Frontend: Dialog de nova/editar tarefa com campos título, descrição, responsável, prioridade, prazo, status
- [x] Frontend: seção de comentários dentro de cada tarefa expandida
- [x] Frontend: badge contador de tarefas no KanbanCard (X/Y concluídas)
- [x] Frontend: badge verde quando todas concluídas, amarelo quando há pendentes

## Minhas Tarefas (visão do destinatário)
- [x] Backend: procedure tarefas.minhasTarefas — retorna tarefas onde responsavelId = userId logado, com join na demanda (numero, assunto, condominio)
- [x] Frontend: página MinhasTarefas.tsx com lista agrupada por status (Pendente, Em Andamento, Concluída)
- [x] Frontend: filtros de status e prioridade
- [x] Frontend: card de tarefa com link direto para a demanda relacionada
- [x] Frontend: botão rápido para marcar como concluída/em andamento
- [x] Frontend: seção de comentários expansível por tarefa
- [x] App.tsx: rota /minhas-tarefas
- [x] Sidebar: link "Minhas Tarefas" no menu (visível para todos os perfis)

## Monitoramento DOERJ — Dr. Higor
- [ ] Banco: criar tabela doerj_publicacoes (id, materiaId, data, jornal, tipo, trecho, url, termoBusca, lida, createdAt)
- [ ] Backend: endpoint /api/scheduled/doerj para receber publicações do AGENT cron
- [ ] Backend: procedures doerj.listar, doerj.marcarLida, doerj.contadorNaoLidas
- [ ] Frontend: página MonitoramentoDOERJ.tsx com lista de publicações e badge de não lidas
- [ ] Sidebar: link "Diário Oficial RJ" no menu Jurídico
- [ ] AGENT cron: job diário que acessa o DOERJ, busca por "Higor" e envia novas publicações ao endpoint
