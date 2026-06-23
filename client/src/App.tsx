import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Layout from "./components/Layout";
import { useAuth } from "./_core/hooks/useAuth";
import Login from "./pages/Login";
import LoginCondominio from "./pages/LoginCondominio";
import LoginColaborador from "./pages/LoginColaborador";
import LoginAdmin from "./pages/LoginAdmin";
import AdminDashboard from "./pages/AdminDashboard";
import SindicoDashboard from "./pages/SindicoDashboard";
import CobradorDashboard from "./pages/CobradorDashboard";
import Condominios from "./pages/admin/Condominios";
import CondominioForm from "./pages/admin/CondominioForm";
import Users from "./pages/admin/Users";
import UserForm from "./pages/admin/UserForm";
import Devedores from "./pages/Devedores";
import DevedorForm from "./pages/DevedorForm";
import DevedorDetalhes from "./pages/DevedorDetalhes";
import ImportarDividas from "./pages/ImportarDividas";
import TentativaForm from "./pages/TentativaForm";
import TentativaRapida from "./pages/TentativaRapida";
import ProcessosCobranca from "./pages/ProcessosCobranca";
import ProcessoCobrancaForm from "./pages/ProcessoCobrancaForm";
import ProcessoCobrancaDetalhes from "./pages/ProcessoCobrancaDetalhes";
import RelatorioProdutividade from "./pages/admin/RelatorioProdutividade";
import Relatorios from "./pages/Relatorios";
import RelatorioInadimplencia from "./pages/RelatorioInadimplencia";
import ImportarDevedores from "./pages/admin/ImportarDevedores";
import ImportarCondominios from "./pages/admin/ImportarCondominios";
import ReguaCobranca from "./pages/admin/ReguaCobranca";
import HistoricoDisparos from "./pages/admin/HistoricoDisparos";
import CNAB240 from "./pages/admin/CNAB240";
import HistoricoImportacoes from "./pages/admin/HistoricoImportacoes";
import CasosPrioritarios from "./pages/CasosPrioritarios";
import Acordos from "./pages/Acordos";
import AcordosAcompanhamento from "./pages/AcordosAcompanhamento";
import AcordoDetalhes from "./pages/AcordoDetalhes";
import TentativasCobranca from "./pages/TentativasCobranca";
import Vencimentos from "./pages/Vencimentos";
import CobrancaAtiva from "./pages/operacoes/CobrancaAtiva";
import CobrancaPassiva from "./pages/operacoes/CobrancaPassiva";
import Operacoes from "./pages/operacoes/Operacoes";
import ConfiguracaoBoleto from "./pages/admin/ConfiguracaoBoleto";
import EmailConfig from "./pages/configuracoes/EmailConfig";
import RetornoCNAB from "./pages/admin/RetornoCNAB";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import SindicoPipeline from "./pages/SindicoPipeline";
import SindicoAcordos from "./pages/SindicoAcordos";
import ExecutivoDashboard from "./pages/admin/ExecutivoDashboard";
import Auditoria from "./pages/admin/Auditoria";
import ModelosDocumento from "./pages/ModelosDocumento";
import ModeloEditor from "./pages/ModeloEditor";
import PreencherModeloJuridico from "./pages/PreencherModeloJuridico";
import Solicitacoes from "./pages/juridico/Solicitacoes";
import TicketDetalhes from "./pages/juridico/TicketDetalhes";
import TicketForm from "./pages/admin/TicketForm";
import KanbanJuridico from "./pages/juridico/KanbanJuridico";
import Profiles from "./pages/admin/Profiles";
import ProfileEditor from "./pages/admin/ProfileEditor";
import UsersProfiles from "./pages/admin/UsersProfiles";
import ColaboradorDashboard from "./pages/colaborador/ColaboradorDashboard";
import AdvogadoDashboard from "./pages/advogado/AdvogadoDashboard";
import WhatsApp from "./pages/WhatsApp";
import WhatsAppConfig from "./pages/configuracoes/WhatsAppConfig";
import WhatsAppFilaConfig from "./pages/configuracoes/WhatsAppFilaConfig";
import Atendimento from "./pages/Atendimento";
import AtendimentoConfig from "./pages/AtendimentoConfig";
import FluxosAtendimento from "./pages/FluxosAtendimento";
import BTGConfig from "./pages/configuracoes/BTGConfig";
import BTGConciliacao from "./pages/admin/BTGConciliacao";
import CentralDemandas from "./pages/admin/juridico/CentralDemandas";
import KanbanDemandas from "./pages/admin/juridico/KanbanDemandas";
import DemandaDetalhes from "./pages/admin/juridico/DemandaDetalhes";
import Assembleias from "./pages/admin/juridico/Assembleias";
import DashboardJuridico from "./pages/admin/juridico/DashboardJuridico";
import ProcessosJudiciais from "./pages/admin/juridico/ProcessosJudiciais";
import ProcessoDetalhes from "./pages/admin/juridico/ProcessoDetalhes";
import PrazosJuridicos from "./pages/admin/juridico/PrazosJuridicos";
import BuscaAdvogado from "./pages/admin/juridico/BuscaAdvogado";
import CentralIntimacoes from "./pages/admin/juridico/CentralIntimacoes";
import ConfiguracoesMNI from "./pages/admin/juridico/ConfiguracoesMNI";
import CondominiosJuridico from "./pages/admin/juridico/CondominiosJuridico";
import DashboardJuridicoCondominio from "./pages/admin/juridico/DashboardJuridicoCondominio";
import DashboardPublicacoes from "./pages/admin/juridico/DashboardPublicacoes";
import MonitoramentosPublicacoes from "./pages/admin/juridico/MonitoramentosPublicacoes";
import KanbanPublicacoes from "./pages/admin/juridico/KanbanPublicacoes";
import AlertasInadimplencia from "./pages/AlertasInadimplencia";
import PermissionRoute from "./components/PermissionRoute";

function ProtectedRoute({ component: Component, allowedRoles }: { component: React.ComponentType; allowedRoles?: string[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Redirect to="/" />;
  }

  return <Component />;
}

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/login-condominio" component={LoginCondominio} />
      <Route path="/login-colaborador" component={LoginColaborador} />
      <Route path="/login-admin" component={LoginAdmin} />
      <Route path="/esqueci-senha" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      
      {/* Rota raiz redireciona baseado no role */}
      <Route path="/">
        {() => {
          if (!user) return <Redirect to="/login" />;
          if (user.role === "admin") return <Redirect to="/admin/dashboard" />;
          if (user.role === "sindico") return <Redirect to="/sindico/dashboard" />;
          if (user.role === "cobrador") return <Redirect to="/cobrador/dashboard" />;
          if (user.role === "colaborador") return <Redirect to="/colaborador/dashboard" />;
          if (user.role === "advogado") return <Redirect to="/advogado/dashboard" />;
          return <Redirect to="/login" />;
        }}
      </Route>

      {/* Rotas do Admin */}
      <Route path="/admin/dashboard">
        {() => <ProtectedRoute component={AdminDashboard} allowedRoles={["admin"]} />}
      </Route>

      {/* Rotas do Síndico */}
      <Route path="/sindico/dashboard">
        {() => <ProtectedRoute component={SindicoDashboard} allowedRoles={["sindico"]} />}
      </Route>
      <Route path="/sindico/pipeline">
        {() => <ProtectedRoute component={SindicoPipeline} allowedRoles={["sindico", "admin"]} />}
      </Route>
      <Route path="/sindico/acordos">
        {() => <ProtectedRoute component={SindicoAcordos} allowedRoles={["sindico", "admin"]} />}
      </Route>

      {/* Rotas do Cobrador */}
      <Route path="/cobrador/dashboard">
        {() => <ProtectedRoute component={CobradorDashboard} allowedRoles={["cobrador"]} />}
      </Route>

      {/* Rotas do Colaborador Interno */}
      <Route path="/colaborador/dashboard">
        {() => <ProtectedRoute component={ColaboradorDashboard} allowedRoles={["colaborador"]} />}
      </Route>

      {/* Rotas do Advogado */}
      <Route path="/advogado/dashboard">
        {() => <ProtectedRoute component={AdvogadoDashboard} allowedRoles={["advogado"]} />}
      </Route>

      {/* Rotas de Condomínios (Admin) */}
      <Route path="/admin/condominios">
        {() => <ProtectedRoute component={Condominios} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/admin/condominios/:id">
        {() => <ProtectedRoute component={CondominioForm} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/admin/importar-devedores">
        {() => <PermissionRoute component={ImportarDevedores} allowedRoles={["admin", "colaborador"]} requiredModulo="importacoes" />}
      </Route>
      <Route path="/admin/importar-condominios">
        {() => <ProtectedRoute component={ImportarCondominios} allowedRoles={["admin"]} />}
      </Route>

      {/* Rotas de Usuários (Admin) */}
      <Route path="/admin/usuarios">
        {() => <ProtectedRoute component={Users} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/admin/usuarios/:id">
        {() => <ProtectedRoute component={UserForm} allowedRoles={["admin"]} />}
      </Route>

      {/* Dashboard Executivo - Centro de Inteligência Operacional */}
      <Route path="/admin/executivo">
        {() => <ProtectedRoute component={ExecutivoDashboard} allowedRoles={["admin"]} />}
      </Route>

      {/* Auditoria do Sistema */}
      <Route path="/admin/auditoria">
        {() => <ProtectedRoute component={Auditoria} allowedRoles={["admin"]} />}
      </Route>

      {/* Rotas de Relatórios (Admin) */}
      <Route path="/admin/relatorios/produtividade">
        {() => <ProtectedRoute component={RelatorioProdutividade} allowedRoles={["admin"]} />}
      </Route>

      {/* Relatórios Consolidados */}
      <Route path="/relatorios">
        {() => <PermissionRoute component={Relatorios} allowedRoles={["admin", "colaborador", "advogado"]} requiredModulo="relatorios" />}
      </Route>
      <Route path="/relatorios/inadimplencia">
        {() => <PermissionRoute component={RelatorioInadimplencia} allowedRoles={["admin", "colaborador", "advogado"]} requiredModulo="relatorios" />}
      </Route>

      {/* Régua de Cobrança */}
      <Route path="/admin/regua-cobranca">
        {() => <PermissionRoute component={ReguaCobranca} allowedRoles={["admin", "colaborador"]} requiredModulo="automacao" />}
      </Route>

      {/* Histórico de Disparos */}
      <Route path="/admin/historico-disparos">
        {() => <PermissionRoute component={HistoricoDisparos} allowedRoles={["admin", "colaborador"]} requiredModulo="automacao" />}
      </Route>
      {/* CNAB 240 */}
      <Route path="/admin/cnab240">
        {() => <PermissionRoute component={CNAB240} allowedRoles={["admin", "sindico", "colaborador"]} requiredModulo="banco" />}
      </Route>
      {/* Configuração de Boleto */}
      <Route path="/admin/configuracao-boleto">
        {() => <ProtectedRoute component={ConfiguracaoBoleto} allowedRoles={["admin", "sindico"]} />}
      </Route>
      <Route path="/admin/email-config">
        {() => <ProtectedRoute component={EmailConfig} allowedRoles={["admin"]} />}
      </Route>
      {/* Histórico de Importações */}
      <Route path="/admin/historico-importacoes">
        {() => <PermissionRoute component={HistoricoImportacoes} allowedRoles={["admin", "sindico", "colaborador"]} requiredModulo="importacoes" />}
      </Route>
      {/* Retorno CNAB 240 */}
      <Route path="/admin/retorno-cnab">
        {() => <PermissionRoute component={RetornoCNAB} allowedRoles={["admin", "sindico", "colaborador"]} requiredModulo="banco" />}
      </Route>

      {/* Rota de Casos Prioritários */}
      <Route path="/casos-prioritarios">
        {() => <ProtectedRoute component={CasosPrioritarios} />}
      </Route>

      {/* Rotas de Devedores */}
      <Route path="/devedores">
        {() => <PermissionRoute component={Devedores} requiredModulo="devedores" />}
      </Route>
      <Route path="/devedores/:id/detalhes">
        {() => <PermissionRoute component={DevedorDetalhes} requiredModulo="devedores" />}
      </Route>
      <Route path="/devedores/:id/importar-dividas">
        {() => <PermissionRoute component={ImportarDividas} requiredModulo="devedores" />}
      </Route>
      <Route path="/devedores/:devedorId/tentativa/nova">
        {() => <PermissionRoute component={TentativaForm} requiredModulo="tentativas" />}
      </Route>
      <Route path="/tentativas/nova">
        {() => <ProtectedRoute component={TentativaRapida} allowedRoles={["cobrador", "sindico"]} />}
      </Route>
      <Route path="/devedores/novo">
        {() => <PermissionRoute component={DevedorForm} requiredModulo="devedores" />}
      </Route>
      <Route path="/devedores/:id/editar">
        {() => <PermissionRoute component={DevedorForm} requiredModulo="devedores" />}
      </Route>

      {/* Rotas de Processos de Cobrança */}
      <Route path="/processos">
        {() => <ProtectedRoute component={ProcessosCobranca} allowedRoles={["admin", "sindico", "cobrador"]} />}
      </Route>
      <Route path="/processos/novo">
        {() => <ProtectedRoute component={ProcessoCobrancaForm} allowedRoles={["admin", "sindico"]} />}
      </Route>
      <Route path="/processos/:id">
        {() => <ProtectedRoute component={ProcessoCobrancaDetalhes} allowedRoles={["admin", "sindico", "cobrador"]} />}
      </Route>

      {/* Rotas de Acordos */}
      <Route path="/acordos">
        {() => <PermissionRoute component={Acordos} requiredModulo="acordos" />}
      </Route>
      <Route path="/acordos/acompanhamento">
        {() => <PermissionRoute component={AcordosAcompanhamento} requiredModulo="acordos" />}
      </Route>
      <Route path="/acordos/:id">
        {() => <PermissionRoute component={AcordoDetalhes} requiredModulo="acordos" />}
      </Route>
      
      {/* Rotas de Vencimentos */}
      <Route path="/vencimentos">
        {() => <PermissionRoute component={Vencimentos} requiredModulo="cobrancas" />}
      </Route>
      <Route path="/alertas-inadimplencia">
        {() => <PermissionRoute component={AlertasInadimplencia} allowedRoles={["admin", "cobrador", "colaborador", "advogado"]} requiredModulo="cobrancas" />}
      </Route>

      {/* Rotas de Operações de Cobrança */}
      <Route path="/operacoes">
        {() => <PermissionRoute component={Operacoes} allowedRoles={["admin", "cobrador", "colaborador", "advogado"]} requiredModulo="cobrancas" />}
      </Route>
      {/* Rotas legadas — redirecionam para a tela unificada */}
      <Route path="/operacoes/cobranca-ativa">
        {() => <PermissionRoute component={Operacoes} allowedRoles={["admin", "cobrador", "colaborador", "advogado"]} requiredModulo="cobrancas" />}
      </Route>
      <Route path="/operacoes/cobranca-passiva">
        {() => <PermissionRoute component={Operacoes} allowedRoles={["admin", "cobrador", "colaborador", "advogado"]} requiredModulo="cobrancas" />}
      </Route>

      {/* Rotas de Tentativas */}
      <Route path="/tentativas">
        {() => <PermissionRoute component={TentativasCobranca} allowedRoles={["admin", "sindico", "cobrador", "colaborador"]} requiredModulo="tentativas" />}
      </Route>

      {/* Rotas de Modelos de Documentos */}
      <Route path="/modelos-documento">
        {() => <PermissionRoute component={ModelosDocumento} allowedRoles={["admin", "cobrador", "colaborador", "advogado"]} requiredModulo="modelos_documento" />}
      </Route>
      <Route path="/modelos-documento/novo">
        {() => <PermissionRoute component={ModeloEditor} allowedRoles={["admin", "cobrador", "colaborador"]} requiredModulo="modelos_documento" />}
      </Route>
      <Route path="/modelos-documento/:id/editar">
        {() => <PermissionRoute component={ModeloEditor} allowedRoles={["admin", "cobrador", "colaborador"]} requiredModulo="modelos_documento" />}
      </Route>
      <Route path="/modelos-documento/:id/preencher">
        {() => <PermissionRoute component={PreencherModeloJuridico} allowedRoles={["admin", "cobrador", "colaborador", "advogado"]} requiredModulo="modelos_documento" />}
      </Route>

      {/* Módulo Jurídico — Central de Demandas */}
      <Route path="/admin/juridico">
        {() => <PermissionRoute component={CentralDemandas} allowedRoles={["admin", "advogado", "colaborador"]} requiredModulo="juridico_demandas" />}
      </Route>
      <Route path="/admin/juridico/kanban">
        {() => <PermissionRoute component={KanbanDemandas} allowedRoles={["admin", "advogado", "colaborador"]} requiredModulo="juridico_demandas" />}
      </Route>
      <Route path="/admin/juridico/demanda/:id">
        {() => <PermissionRoute component={DemandaDetalhes} allowedRoles={["admin", "advogado", "colaborador"]} requiredModulo="juridico_demandas" />}
      </Route>
      <Route path="/admin/juridico/assembleias">
        {() => <PermissionRoute component={Assembleias} allowedRoles={["admin", "advogado", "colaborador"]} requiredModulo="juridico_assembleias" />}
      </Route>
      <Route path="/admin/juridico/dashboard">
        {() => <ProtectedRoute component={DashboardJuridico} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/admin/juridico/processos">
        {() => <PermissionRoute component={ProcessosJudiciais} allowedRoles={["admin", "advogado", "colaborador"]} requiredModulo="juridico_processos" />}
      </Route>
      <Route path="/admin/juridico/processos/:id">
        {() => <PermissionRoute component={ProcessoDetalhes} allowedRoles={["admin", "advogado", "colaborador"]} requiredModulo="juridico_processos" />}
      </Route>
      <Route path="/admin/juridico/prazos">
        {() => <PermissionRoute component={PrazosJuridicos} allowedRoles={["admin", "advogado", "colaborador"]} requiredModulo="juridico_prazos" />}
      </Route>
      <Route path="/admin/juridico/intimacoes">
        {() => <PermissionRoute component={CentralIntimacoes} allowedRoles={["admin", "advogado", "colaborador"]} requiredModulo="juridico_intimacoes" />}
      </Route>
      <Route path="/admin/juridico/mni-config">
        {() => <PermissionRoute component={ConfiguracoesMNI} allowedRoles={["admin", "advogado", "colaborador"]} requiredModulo="juridico_config" />}
      </Route>
      <Route path="/admin/juridico/busca-advogado">
        {() => <ProtectedRoute component={BuscaAdvogado} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/admin/juridico/condominios">
        {() => <ProtectedRoute component={CondominiosJuridico} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/admin/juridico/condominios/:id">
        {() => <ProtectedRoute component={DashboardJuridicoCondominio} allowedRoles={["admin"]} />}
      </Route>

      {/* Publicações Jurídicas */}
      <Route path="/admin/juridico/publicacoes">
        {() => <PermissionRoute component={DashboardPublicacoes} allowedRoles={["admin", "advogado", "colaborador"]} requiredModulo="juridico_publicacoes" />}
      </Route>
      <Route path="/admin/juridico/publicacoes/monitoramentos">
        {() => <PermissionRoute component={MonitoramentosPublicacoes} allowedRoles={["admin", "advogado", "colaborador"]} requiredModulo="juridico_publicacoes" />}
      </Route>
      <Route path="/admin/juridico/publicacoes/kanban">
        {() => <PermissionRoute component={KanbanPublicacoes} allowedRoles={["admin", "advogado", "colaborador"]} requiredModulo="juridico_publicacoes" />}
      </Route>

      {/* Rotas do Módulo Jurídico (legado) */}
      <Route path="/juridico/solicitacoes">
        {() => <ProtectedRoute component={Solicitacoes} />}
      </Route>
      <Route path="/juridico/solicitacoes/novo">
        {() => <ProtectedRoute component={TicketForm} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/juridico/solicitacoes/:id">
        {() => <ProtectedRoute component={TicketDetalhes} />}
      </Route>
      <Route path="/juridico/kanban">
        {() => <ProtectedRoute component={KanbanJuridico} allowedRoles={["admin"]} />}
      </Route>

      {/* Perfis e Permissões */}
      <Route path="/admin/perfis">
        {() => <ProtectedRoute component={Profiles} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/admin/perfis/:id">
        {() => <ProtectedRoute component={ProfileEditor} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/admin/usuarios-perfis">
        {() => <ProtectedRoute component={UsersProfiles} allowedRoles={["admin"]} />}
      </Route>

      <Route path="/whatsapp">
        {() => { window.location.replace("/atendimento"); return null; }}
      </Route>
      <Route path="/configuracoes/whatsapp">
        {() => <ProtectedRoute component={WhatsAppConfig} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/configuracoes/whatsapp-fila">
        {() => <ProtectedRoute component={WhatsAppFilaConfig} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/atendimento">
        {() => <PermissionRoute component={Atendimento} allowedRoles={["admin", "cobrador", "colaborador"]} requiredModulo="whatsapp" />}
      </Route>
      <Route path="/configuracoes/atendimento">
        {() => <ProtectedRoute component={AtendimentoConfig} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/configuracoes/fluxos">
        {() => <ProtectedRoute component={FluxosAtendimento} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/configuracoes/btg">
        {() => <ProtectedRoute component={BTGConfig} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/admin/btg-conciliacao">
        {() => <ProtectedRoute component={BTGConciliacao} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Layout>
            <div className="flex-1 min-h-0 flex flex-col">
              <Router />
            </div>
          </Layout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
