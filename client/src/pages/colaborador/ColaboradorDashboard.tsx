import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone,
  FileText,
  CheckCircle,
  Clock,
  Scale,
  TrendingUp,
  AlertCircle,
  ArrowRight,
  UserCircle,
  HandshakeIcon,
  LayoutDashboard,
} from "lucide-react";

export default function ColaboradorDashboard() {
  const { user } = useAuth();

  // Permissões do colaborador
  const { data: myPerms } = trpc.profiles.getMyPermissions.useQuery();
  const perms = myPerms?.permissoes ?? {};

  const canView = (modulo: string) => perms[modulo]?.visualizar === true;

  // Dados de tentativas (se tiver permissão de cobrança)
  const { data: tentativas } = trpc.tentativas.listAll.useQuery(
    undefined,
    { enabled: canView("cobrancas") || canView("tentativas") }
  );

  // Dados de tickets jurídicos (se tiver permissão jurídico)
  const { data: tickets } = trpc.juridico.listTickets.useQuery(
    {},
    { enabled: canView("juridico") }
  );

  const tentativasHoje = tentativas?.filter((t) => {
    const hoje = new Date().toDateString();
    return new Date(t.attemptDate).toDateString() === hoje;
  }).length ?? 0;

  const tentativasSemana = tentativas?.filter((t) => {
    const semanaAtras = new Date();
    semanaAtras.setDate(semanaAtras.getDate() - 7);
    return new Date(t.attemptDate) >= semanaAtras;
  }).length ?? 0;

  const promessas = tentativas?.filter((t) => t.result === "promessa_pagamento").length ?? 0;

  const ticketsAbertos = tickets?.filter((t) => t.status === "aberto").length ?? 0;
  const ticketsEmAndamento = tickets?.filter((t) => t.status === "em_andamento").length ?? 0;
  const ticketsMeus = tickets?.filter((t) => t.responsavelId === user?.id).length ?? 0;

  const semPerfil = !myPerms?.profileId;

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho de boas-vindas */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Olá, {user?.name?.split(" ")[0]} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        {myPerms?.profileNome && (
          <Badge
            style={{ backgroundColor: myPerms.profileCor ?? "#6366f1", color: "#fff" }}
            className="text-xs px-3 py-1"
          >
            {myPerms.profileNome}
          </Badge>
        )}
      </div>

      {/* Aviso: sem perfil atribuído */}
      {semPerfil && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-5 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-600">Nenhum perfil atribuído</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Você ainda não possui um perfil de acesso configurado. Entre em contato com o administrador para que ele atribua um perfil ao seu usuário.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards de métricas — Cobrança */}
      {(canView("cobrancas") || canView("tentativas")) && (
        <>
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Phone className="h-4 w-4" /> Cobrança
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Phone className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{tentativasHoje}</p>
                    <p className="text-xs text-muted-foreground">Tentativas hoje</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-5 w-5 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{tentativasSemana}</p>
                    <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{promessas}</p>
                    <p className="text-xs text-muted-foreground">Promessas de pagamento</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Cards de métricas — Jurídico */}
      {canView("juridico") && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Scale className="h-4 w-4" /> Jurídico
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{ticketsAbertos}</p>
                  <p className="text-xs text-muted-foreground">Tickets abertos</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Clock className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{ticketsEmAndamento}</p>
                  <p className="text-xs text-muted-foreground">Em andamento</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <UserCircle className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{ticketsMeus}</p>
                  <p className="text-xs text-muted-foreground">Atribuídos a mim</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Ações rápidas */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4" /> Ações Rápidas
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {canView("devedores") && (
            <Link href="/devedores">
              <Card className="cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <CardContent className="pt-4 pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserCircle className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">Ver Devedores</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )}
          {canView("tentativas") && (
            <Link href="/tentativas">
              <Card className="cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <CardContent className="pt-4 pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium">Histórico de Contatos</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )}
          {canView("acordos") && (
            <Link href="/acordos">
              <Card className="cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <CardContent className="pt-4 pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <HandshakeIcon className="h-5 w-5 text-emerald-500" />
                    <span className="text-sm font-medium">Acordos</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )}
          {canView("juridico") && (
            <Link href="/juridico/solicitacoes">
              <Card className="cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <CardContent className="pt-4 pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Scale className="h-5 w-5 text-violet-500" />
                    <span className="text-sm font-medium">Solicitações Jurídicas</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )}
          {canView("cobrancas") && (
            <Link href="/processos">
              <Card className="cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <CardContent className="pt-4 pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-amber-500" />
                    <span className="text-sm font-medium">Dívidas</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )}
          {canView("relatorios") && (
            <Link href="/admin/relatorios/produtividade">
              <Card className="cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <CardContent className="pt-4 pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-5 w-5 text-indigo-500" />
                    <span className="text-sm font-medium">Relatórios</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      </div>

      {/* Sem nenhuma permissão */}
      {!semPerfil && Object.keys(perms).length === 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Seu perfil não possui permissões configuradas ainda.
            </p>
            <p className="text-xs text-muted-foreground">
              Solicite ao administrador que configure as permissões do seu perfil.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
