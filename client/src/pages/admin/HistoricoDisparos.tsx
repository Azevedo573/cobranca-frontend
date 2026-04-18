import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAdminCondominio } from "@/hooks/useAdminCondominio";
import { AdminCondominioSelector } from "@/components/AdminCondominioSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  MessageCircle, Mail, Phone, FileText, Bell,
  History, AlertTriangle, Search, RefreshCw
} from "lucide-react";

const TIPO_ACAO_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: <MessageCircle className="w-3.5 h-3.5" />, color: "bg-green-100 text-green-700 border-green-200" },
  email: { label: "E-mail", icon: <Mail className="w-3.5 h-3.5" />, color: "bg-blue-100 text-blue-700 border-blue-200" },
  sms: { label: "SMS", icon: <Phone className="w-3.5 h-3.5" />, color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  carta: { label: "Carta", icon: <FileText className="w-3.5 h-3.5" />, color: "bg-gray-100 text-gray-700 border-gray-200" },
  ligacao: { label: "Ligação", icon: <Phone className="w-3.5 h-3.5" />, color: "bg-purple-100 text-purple-700 border-purple-200" },
  notificacao_interna: { label: "Notificação", icon: <Bell className="w-3.5 h-3.5" />, color: "bg-orange-100 text-orange-700 border-orange-200" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  enviado: { label: "Enviado", color: "bg-green-100 text-green-700" },
  pendente: { label: "Pendente", color: "bg-yellow-100 text-yellow-700" },
  erro: { label: "Erro", color: "bg-red-100 text-red-700" },
  ignorado: { label: "Ignorado", color: "bg-gray-100 text-gray-600" },
};

type Disparo = {
  id: number;
  reguaId: number;
  posicaoId: number;
  cobrancaId: number;
  devedorId: number;
  diasInadimplencia: number;
  tipoAcao: string;
  mensagemGerada: string | null;
  status: string | null;
  dataDisparo: Date | null;
  devedorNome: string | null;
  devedorUnidade: string | null;
  devedorBloco: string | null;
};

export default function HistoricoDisparos() {
  const {
    condominioId,
    isAdmin,
    condominios,
    selectedCondominioId,
    setSelectedCondominioId,
  } = useAdminCondominio();

  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [expandedDisparo, setExpandedDisparo] = useState<number | null>(null);

  const { data: disparos, isLoading, refetch } = trpc.regua.getDisparosByCondominio.useQuery(
    { condominioId: condominioId!, limit: 500 },
    { enabled: !!condominioId }
  );

  // Admin sem condomínio selecionado: mostrar seletor
  if (isAdmin && !condominioId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
        <p>Selecione um condomínio para ver o histórico de disparos.</p>
        {condominios && setSelectedCondominioId && (
          <div className="mt-4 flex justify-center">
            <AdminCondominioSelector
              condominios={condominios}
              selectedId={selectedCondominioId}
              onSelect={setSelectedCondominioId}
            />
          </div>
        )}
      </div>
    );
  }

  // Não-admin sem condominioId
  if (!condominioId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
        <p>Acesso restrito a administradores de condomínio.</p>
      </div>
    );
  }

  const disparosFiltrados = (disparos as Disparo[] | undefined)?.filter(d => {
    if (filtroTipo !== "todos" && d.tipoAcao !== filtroTipo) return false;
    if (filtroStatus !== "todos" && d.status !== filtroStatus) return false;
    if (busca) {
      const buscaLower = busca.toLowerCase();
      const nome = d.devedorNome ?? `${d.devedorBloco ? d.devedorBloco + " " : ""}Unidade ${d.devedorUnidade}`;
      if (!nome.toLowerCase().includes(buscaLower)) return false;
    }
    return true;
  }) ?? [];

  // Estatísticas
  const totalDisparos = disparosFiltrados.length;
  const porTipo = disparosFiltrados.reduce((acc, d) => {
    acc[d.tipoAcao] = (acc[d.tipoAcao] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="w-6 h-6 text-primary" />
            Histórico de Disparos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Registro de todas as ações automáticas executadas pela Régua de Cobrança
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isAdmin && condominios && setSelectedCondominioId && (
            <AdminCondominioSelector
              condominios={condominios}
              selectedId={selectedCondominioId}
              onSelect={setSelectedCondominioId}
            />
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total de Disparos</p>
            <p className="text-2xl font-bold">{totalDisparos}</p>
          </CardContent>
        </Card>
        {Object.entries(porTipo).slice(0, 3).map(([tipo, count]) => {
          const acao = TIPO_ACAO_LABELS[tipo];
          return (
            <Card key={tipo}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {acao?.icon} {acao?.label ?? tipo}
                </p>
                <p className="text-2xl font-bold">{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por devedor..."
            className="pl-9"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo de ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.entries(TIPO_ACAO_LABELS).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de disparos */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : disparosFiltrados.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <History className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">Nenhum disparo encontrado.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Os disparos aparecerão aqui após a execução da régua de cobrança.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {disparosFiltrados.length} disparo(s) encontrado(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {disparosFiltrados.map((disparo) => {
                const acao = TIPO_ACAO_LABELS[disparo.tipoAcao] ?? { label: disparo.tipoAcao, icon: <Bell className="w-3.5 h-3.5" />, color: "bg-gray-100 text-gray-700 border-gray-200" };
                const status = STATUS_LABELS[disparo.status ?? "enviado"] ?? { label: disparo.status ?? "?", color: "bg-gray-100 text-gray-600" };
                const nomeDevedor = disparo.devedorNome ?? `${disparo.devedorBloco ? disparo.devedorBloco + " - " : ""}Unidade ${disparo.devedorUnidade ?? "?"}`;
                const isExpanded = expandedDisparo === disparo.id;

                return (
                  <div key={disparo.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${acao.color}`}>
                          {acao.icon}
                          {acao.label}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm truncate block">{nomeDevedor}</span>
                          <span className="text-xs text-muted-foreground">
                            {disparo.diasInadimplencia > 0
                              ? `${disparo.diasInadimplencia} dias em atraso`
                              : disparo.diasInadimplencia === 0
                              ? "No vencimento"
                              : `${Math.abs(disparo.diasInadimplencia)} dias antes`}
                            {" · "}
                            Cobrança #{disparo.cobrancaId}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge className={`text-xs ${status.color}`} variant="outline">
                          {status.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {disparo.dataDisparo
                            ? new Date(disparo.dataDisparo).toLocaleString("pt-BR", {
                                day: "2-digit", month: "2-digit", year: "2-digit",
                                hour: "2-digit", minute: "2-digit"
                              })
                            : "-"}
                        </span>
                        {disparo.mensagemGerada && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setExpandedDisparo(isExpanded ? null : disparo.id)}
                          >
                            {isExpanded ? "Ocultar" : "Ver msg"}
                          </Button>
                        )}
                      </div>
                    </div>
                    {isExpanded && disparo.mensagemGerada && (
                      <div className="mt-3 ml-0">
                        <Separator className="mb-3" />
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Mensagem gerada:</p>
                          <pre className="text-xs whitespace-pre-wrap font-sans text-foreground leading-relaxed">
                            {disparo.mensagemGerada}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
