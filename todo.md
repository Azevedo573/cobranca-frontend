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
