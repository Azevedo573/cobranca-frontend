import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Plus,
  Search,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Scale,
  Filter,
} from "lucide-react";

const CATEGORIAS: Record<string, string> = {
  consultoria: "Consultoria",
  notificacao: "Notificação",
  acao_judicial: "Ação Judicial",
  cobranca_judicial: "Cobrança Judicial",
  assembleia: "Assembleia",
  contrato: "Contrato",
  outro: "Outro",
};

const PRIORIDADES: Record<string, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "bg-slate-100 text-slate-700" },
  media: { label: "Média", color: "bg-blue-100 text-blue-700" },
  alta: { label: "Alta", color: "bg-orange-100 text-orange-700" },
  urgente: { label: "Urgente", color: "bg-red-100 text-red-700" },
};

const STATUS: Record<string, { label: string; icon: React.ComponentType<any>; color: string }> = {
  aberto: { label: "Aberto", icon: AlertCircle, color: "bg-yellow-100 text-yellow-700" },
  em_andamento: { label: "Em Andamento", icon: Clock, color: "bg-blue-100 text-blue-700" },
  aguardando_cliente: { label: "Aguardando", icon: Clock, color: "bg-purple-100 text-purple-700" },
  resolvido: { label: "Resolvido", icon: CheckCircle2, color: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado", icon: XCircle, color: "bg-slate-100 text-slate-500" },
};

export default function Solicitacoes() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todos");
  const [dialogAberto, setDialogAberto] = useState(false);

  // Form de novo ticket
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<string>("outro");
  const [prioridade, setPrioridade] = useState<string>("media");

  const utils = trpc.useUtils();

  const { data: tickets = [], isLoading } = trpc.juridico.listTickets.useQuery({});

  const createTicket = trpc.juridico.createTicket.useMutation({
    onSuccess: () => {
      utils.juridico.listTickets.invalidate();
      setDialogAberto(false);
      setTitulo("");
      setDescricao("");
      setCategoria("outro");
      setPrioridade("media");
      toast.success("Solicitação criada com sucesso!");
    },
    onError: (err) => {
      toast.error("Erro ao criar solicitação: " + err.message);
    },
  });

  const ticketsFiltrados = tickets.filter((t) => {
    const matchBusca =
      !busca ||
      t.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      CATEGORIAS[t.categoria]?.toLowerCase().includes(busca.toLowerCase());
    const matchStatus = filtroStatus === "todos" || t.status === filtroStatus;
    const matchCategoria = filtroCategoria === "todos" || t.categoria === filtroCategoria;
    return matchBusca && matchStatus && matchCategoria;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !descricao.trim()) return;
    createTicket.mutate({ titulo, descricao, categoria: categoria as any, prioridade: prioridade as any });
  };

  const totalAbertos = tickets.filter((t) => t.status === "aberto").length;
  const totalEmAndamento = tickets.filter((t) => t.status === "em_andamento").length;
  const totalResolvidos = tickets.filter((t) => t.status === "resolvido").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Solicitações Jurídicas</h1>
            <p className="text-sm text-muted-foreground">
              {user?.role === "admin"
                ? "Gerencie todas as solicitações dos condomínios"
                : "Abra e acompanhe suas solicitações ao escritório"}
            </p>
          </div>
        </div>
        {user?.role !== "admin" && (
          <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Nova Solicitação
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nova Solicitação</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>Título *</Label>
                  <Input
                    placeholder="Descreva brevemente o assunto"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Categoria *</Label>
                    <Select value={categoria} onValueChange={setCategoria}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORIAS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prioridade *</Label>
                    <Select value={prioridade} onValueChange={setPrioridade}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIORIDADES).map(([val, { label }]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição detalhada *</Label>
                  <Textarea
                    placeholder="Descreva o problema ou solicitação com o máximo de detalhes possível..."
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    rows={5}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogAberto(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createTicket.isPending}>
                    {createTicket.isPending ? "Enviando..." : "Enviar Solicitação"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalAbertos}</p>
                <p className="text-sm text-muted-foreground">Abertos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalEmAndamento}</p>
                <p className="text-sm text-muted-foreground">Em Andamento</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalResolvidos}</p>
                <p className="text-sm text-muted-foreground">Resolvidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título ou categoria..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS).map(([val, { label }]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as categorias</SelectItem>
            {Object.entries(CATEGORIAS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de tickets */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : ticketsFiltrados.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              {tickets.length === 0
                ? "Nenhuma solicitação ainda"
                : "Nenhuma solicitação encontrada"}
            </p>
            {tickets.length === 0 && user?.role !== "admin" && (
              <p className="text-sm text-muted-foreground mt-1">
                Clique em "Nova Solicitação" para abrir um atendimento com o escritório
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {ticketsFiltrados.map((ticket) => {
            const statusInfo = STATUS[ticket.status] ?? STATUS.aberto;
            const StatusIcon = statusInfo.icon;
            const prioInfo = PRIORIDADES[ticket.prioridade] ?? PRIORIDADES.media;

            return (
              <Card
                key={ticket.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/juridico/solicitacoes/${ticket.id}`)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground font-mono">#{ticket.id}</span>
                        <Badge variant="outline" className="text-xs">
                          {CATEGORIAS[ticket.categoria] ?? ticket.categoria}
                        </Badge>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${prioInfo.color}`}>
                          {prioInfo.label}
                        </span>
                      </div>
                      <p className="font-medium truncate">{ticket.titulo}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {new Date(ticket.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${statusInfo.color}`}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
