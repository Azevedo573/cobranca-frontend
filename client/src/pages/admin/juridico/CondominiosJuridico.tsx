import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Search,
  Scale,
  Clock,
  AlertTriangle,
  FileText,
  ChevronRight,
  TrendingUp,
  Gavel,
} from "lucide-react";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export default function CondominiosJuridico() {
  const [, navigate] = useLocation();
  const [busca, setBusca] = useState("");

  const { data: condominios, isLoading } = trpc.juridicoCondominios.listar.useQuery();

  const filtrados = (condominios ?? []).filter((c) =>
    c.name.toLowerCase().includes(busca.toLowerCase()) ||
    (c.city ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  const comJuridico = filtrados.filter((c) => c.temJuridico);
  const semJuridico = filtrados.filter((c) => !c.temJuridico);

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Condomínios — Módulo Jurídico
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visão consolidada dos processos, prazos e demandas jurídicas por condomínio
          </p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar condomínio..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Condomínios com atividade jurídica */}
          {comJuridico.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Com atividade jurídica ({comJuridico.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {comJuridico.map((cond) => (
                  <CondominioCard
                    key={cond.id}
                    cond={cond}
                    onClick={() => navigate(`/admin/juridico/condominios/${cond.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Condomínios sem atividade jurídica */}
          {semJuridico.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Sem atividade jurídica ({semJuridico.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {semJuridico.map((cond) => (
                  <CondominioCard
                    key={cond.id}
                    cond={cond}
                    onClick={() => navigate(`/admin/juridico/condominios/${cond.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {filtrados.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum condomínio encontrado</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface CondominioCardProps {
  cond: {
    id: number;
    name: string;
    city: string | null;
    state: string | null;
    processosAtivos: number;
    prazosUrgentes: number;
    prazosAtrasados: number;
    totalDemandas: number;
    valorEmDisputa: number;
    temJuridico: boolean;
  };
  onClick: () => void;
}

function CondominioCard({ cond, onClick }: CondominioCardProps) {
  const temAlerta = cond.prazosAtrasados > 0;
  const temUrgencia = cond.prazosUrgentes > 0;

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all border ${
        temAlerta
          ? "border-red-500/40 hover:border-red-500/60"
          : temUrgencia
          ? "border-amber-500/40 hover:border-amber-500/60"
          : "hover:border-primary/40"
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold truncate">{cond.name}</CardTitle>
            {(cond.city || cond.state) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {[cond.city, cond.state].filter(Boolean).join(" — ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {temAlerta && (
              <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {cond.prazosAtrasados} atrasado{cond.prazosAtrasados > 1 ? "s" : ""}
              </Badge>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3">
          {/* Processos */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
            <Gavel className="h-4 w-4 text-blue-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Processos</p>
              <p className="text-sm font-semibold">{cond.processosAtivos}</p>
            </div>
          </div>

          {/* Prazos urgentes */}
          <div className={`flex items-center gap-2 p-2 rounded-md ${
            temAlerta ? "bg-red-500/10" : temUrgencia ? "bg-amber-500/10" : "bg-muted/50"
          }`}>
            <Clock className={`h-4 w-4 shrink-0 ${
              temAlerta ? "text-red-500" : temUrgencia ? "text-amber-500" : "text-muted-foreground"
            }`} />
            <div>
              <p className="text-xs text-muted-foreground">Prazos urgentes</p>
              <p className={`text-sm font-semibold ${
                temAlerta ? "text-red-500" : temUrgencia ? "text-amber-500" : ""
              }`}>{cond.prazosUrgentes}</p>
            </div>
          </div>

          {/* Demandas */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
            <FileText className="h-4 w-4 text-purple-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Demandas</p>
              <p className="text-sm font-semibold">{cond.totalDemandas}</p>
            </div>
          </div>

          {/* Valor em disputa */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
            <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Em disputa</p>
              <p className="text-sm font-semibold">
                {cond.valorEmDisputa > 0
                  ? formatCurrency(cond.valorEmDisputa)
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
