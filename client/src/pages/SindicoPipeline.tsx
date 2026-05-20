import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft, Users, DollarSign, Clock, TrendingDown, Handshake, Scale, CheckCircle2, RefreshCw } from "lucide-react";

const fmt = (v: number) => (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COLUNAS = [
  {
    id: "em_atraso_recente",
    label: "Em Atraso Recente",
    desc: "Inadimplência < 90 dias, sem contato",
    icon: Clock,
    color: "border-t-amber-400",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  {
    id: "em_negociacao",
    label: "Em Negociação",
    desc: "Contato realizado, aguardando resposta",
    icon: Users,
    color: "border-t-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  {
    id: "acordo_fechado",
    label: "Acordo Fechado",
    desc: "Acordo ativo em andamento",
    icon: Handshake,
    color: "border-t-emerald-400",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  {
    id: "inadimplente_critico",
    label: "Inadimplente Crítico",
    desc: "Mais de 90 dias sem resolução",
    icon: TrendingDown,
    color: "border-t-red-400",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  {
    id: "juridico",
    label: "Jurídico",
    desc: "Ação judicial em andamento",
    icon: Scale,
    color: "border-t-purple-400",
    badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
  {
    id: "quitado",
    label: "Quitado",
    desc: "Dívida paga ou acordo concluído",
    icon: CheckCircle2,
    color: "border-t-slate-400",
    badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
] as const;

type PipelineStatus = typeof COLUNAS[number]["id"];

type Devedor = {
  id: number;
  name: string | null;
  cpfCnpj: string | null;
  unitNumber: string;
  bloco: string | null;
  status: string;
  valorDevido: number;
  diasAtraso: number;
  ultimoContato: Date | null;
  scoreRecuperacao: number;
  pipelineStatus: string;
};

function ScoreDot({ score }: { score: number }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-muted-foreground">{score}</span>
    </div>
  );
}

function DevedorCard({ devedor, onMover }: { devedor: Devedor; onMover: (id: number, status: PipelineStatus) => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const nextStatuses = COLUNAS.filter(c => c.id !== devedor.pipelineStatus).map(c => ({ id: c.id, label: c.label }));

  return (
    <div className="bg-card border border-border/50 rounded-lg p-3 shadow-sm hover:shadow-md transition-all duration-150 cursor-default group relative">
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{devedor.name || `Unidade ${devedor.unitNumber}`}</p>
          <p className="text-xs text-muted-foreground">
            {devedor.bloco ? `Bloco ${devedor.bloco} — ` : ""}Un. {devedor.unitNumber}
          </p>
        </div>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground text-xs ml-1"
        >
          ⋯
        </button>
      </div>

      {showMenu && (
        <div className="absolute right-2 top-8 z-20 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-40">
          <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Mover para:</p>
          {nextStatuses.map(s => (
            <button
              key={s.id}
              onClick={() => { onMover(devedor.id, s.id as PipelineStatus); setShowMenu(false); }}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {devedor.valorDevido > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <DollarSign className="h-3 w-3 text-red-500 shrink-0" />
            <span className="font-medium text-red-600 dark:text-red-400">{fmt(devedor.valorDevido)}</span>
          </div>
        )}
        {devedor.diasAtraso > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{devedor.diasAtraso} dias em atraso</span>
          </div>
        )}
        {devedor.ultimoContato && (
          <div className="text-xs text-muted-foreground">
            Último contato: {new Date(devedor.ultimoContato).toLocaleDateString("pt-BR")}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
        <ScoreDot score={devedor.scoreRecuperacao} />
        <Link href={`/devedores/${devedor.id}`}>
          <span className="text-xs text-primary hover:underline">Ver detalhes →</span>
        </Link>
      </div>
    </div>
  );
}

export default function SindicoPipeline() {
  const { user } = useAuth();
  const condId = user?.condominioId ?? undefined;

  const { data: devedores, isLoading, refetch } = trpc.portal.pipeline.useQuery(
    { condominioId: condId },
    { enabled: !!user }
  );

  const moverMutation = trpc.portal.atualizarPipelineStatus.useMutation({
    onSuccess: () => refetch(),
  });

  const handleMover = (devedorId: number, novoStatus: PipelineStatus) => {
    moverMutation.mutate({ devedorId, novoStatus });
  };

  const devedoresPorStatus = (status: string): Devedor[] =>
    (devedores ?? []).filter(d => d.pipelineStatus === status) as Devedor[];

  const totalValor = (status: string) =>
    devedoresPorStatus(status).reduce((acc, d) => acc + d.valorDevido, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/sindico">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <div className="h-4 w-px bg-border" />
            <div>
              <h1 className="text-base font-semibold">Pipeline de Devedores</h1>
              <p className="text-xs text-muted-foreground">Visão Kanban por estágio de cobrança</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Resumo rápido */}
        <div className="flex flex-wrap gap-3 mb-6">
          {COLUNAS.map(col => {
            const items = devedoresPorStatus(col.id);
            if (items.length === 0) return null;
            return (
              <div key={col.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${col.badgeClass}`}>
                <col.icon className="h-3 w-3" />
                {col.label}: {items.length}
              </div>
            );
          })}
          {isLoading && <div className="text-xs text-muted-foreground animate-pulse">Carregando...</div>}
        </div>

        {/* Kanban board */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
          {COLUNAS.map(col => {
            const items = devedoresPorStatus(col.id);
            const valor = totalValor(col.id);
            return (
              <div key={col.id} className={`flex flex-col rounded-xl border-t-4 bg-muted/30 ${col.color} min-h-[200px]`}>
                {/* Cabeçalho da coluna */}
                <div className="p-3 border-b border-border/40">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <col.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold">{col.label}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{items.length}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">{col.desc}</p>
                  {valor > 0 && (
                    <p className="text-[10px] font-medium text-red-500 mt-1">{fmt(valor)} em aberto</p>
                  )}
                </div>

                {/* Cards */}
                <div className="p-2 space-y-2 flex-1">
                  {isLoading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
                    ))
                  ) : items.length === 0 ? (
                    <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/50">
                      Nenhum devedor
                    </div>
                  ) : (
                    items.map(dev => (
                      <DevedorCard key={dev.id} devedor={dev} onMover={handleMover} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legenda de score */}
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <p className="font-medium">Score de recuperação:</p>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Alto (70–100)</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" /> Médio (40–69)</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /> Baixo (0–39)</div>
          <span className="ml-2">— Clique em ⋯ em um card para mover entre estágios</span>
        </div>
      </main>
    </div>
  );
}
