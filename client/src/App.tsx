import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import SindicoDashboard from "./pages/SindicoDashboard";
import CobradorDashboard from "./pages/CobradorDashboard";

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
      
      {/* Rota raiz redireciona baseado no role */}
      <Route path="/">
        {() => {
          if (!user) return <Redirect to="/login" />;
          if (user.role === "admin") return <Redirect to="/admin/dashboard" />;
          if (user.role === "sindico") return <Redirect to="/sindico/dashboard" />;
          if (user.role === "cobrador") return <Redirect to="/cobrador/dashboard" />;
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

      {/* Rotas do Cobrador */}
      <Route path="/cobrador/dashboard">
        {() => <ProtectedRoute component={CobradorDashboard} allowedRoles={["cobrador"]} />}
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
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
