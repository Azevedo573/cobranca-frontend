import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { CheckCircle2, Users, FileText, TrendingUp } from "lucide-react";
import { useEffect } from "react";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated && user) {
      // Redirecionar para dashboard baseado no role
      if (user.role === "admin") {
        setLocation("/admin/dashboard");
      } else {
        setLocation("/dashboard");
      }
    }
  }, [isAuthenticated, user, setLocation]);

  if (isAuthenticated && user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-slate-900">
            Sistema de Gestão de Cobranças Condominiais
          </h1>
          <p className="text-slate-600 mt-2">
            Solução completa para administradoras e síndicos
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">
            Controle Total de Cobranças Condominiais
          </h2>
          <p className="text-lg text-slate-700 mb-8 leading-relaxed">
            Gerencie devedores, registre tentativas de cobrança, negocie acordos
            e acompanhe boletos em um único sistema. Desenvolvido especificamente
            para administradoras e síndicos que buscam eficiência e organização.
          </p>
          <div className="flex gap-4">
            <Button
              size="lg"
              onClick={() => (window.location.href = getLoginUrl())}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Fazer Login
            </Button>
          </div>
        </section>

        {/* Features Section */}
        <section className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-6 h-6 text-blue-600" />
              <h3 className="text-xl font-semibold text-slate-900">
                Gestão de Devedores
              </h3>
            </div>
            <p className="text-slate-600">
              Cadastre e organize devedores por condomínio. Mantenha histórico
              completo de cobranças, tentativas de contato e acordos negociados.
            </p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-6 h-6 text-blue-600" />
              <h3 className="text-xl font-semibold text-slate-900">
                Boletos e Cobranças
              </h3>
            </div>
            <p className="text-slate-600">
              Gere boletos, registre tentativas de cobrança, negocie acordos com
              parcelas e acompanhe o status de cada débito.
            </p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="w-6 h-6 text-blue-600" />
              <h3 className="text-xl font-semibold text-slate-900">
                Acordos e Negociação
              </h3>
            </div>
            <p className="text-slate-600">
              Negocie acordos com devedores, defina parcelas com juros e multa,
              e acompanhe o cumprimento de cada acordo.
            </p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-6 h-6 text-blue-600" />
              <h3 className="text-xl font-semibold text-slate-900">
                Relatórios e Análises
              </h3>
            </div>
            <p className="text-slate-600">
              Visualize relatórios de produtividade, inadimplência por tipo de
              cobrança e desempenho de colaboradores.
            </p>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-blue-50 p-12 rounded-lg border border-blue-200 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Comece Agora
          </h2>
          <p className="text-slate-700 mb-6 text-lg">
            Faça login para acessar o sistema de gestão de cobranças
            condominiais.
          </p>
          <Button
            size="lg"
            onClick={() => (window.location.href = getLoginUrl())}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Acessar Sistema
          </Button>
        </section>
      </main>
    </div>
  );
}
