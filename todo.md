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
