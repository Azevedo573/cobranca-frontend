import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Users, Plus, Send, RefreshCw, Copy, UserPlus, UserMinus,
  Crown, ShieldOff, LogOut, Search, MessageSquare, Settings,
  ChevronRight, Phone, Info,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPhone(phone: string) {
  // Remove sufixo -group se presente
  return phone.replace(/-group$/, "").replace(/-\d+$/, "");
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function timeAgo(ts: string | number) {
  if (!ts) return "";
  const ms = typeof ts === "string" ? parseInt(ts) * 1000 : ts;
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function WhatsAppGrupos() {
  const [instanciaId, setInstanciaId] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [activeTab, setActiveTab] = useState<"info" | "participantes" | "mensagem">("info");

  // Modais
  const [showCriar, setShowCriar] = useState(false);
  const [showAddParticipante, setShowAddParticipante] = useState(false);
  const [showRenomear, setShowRenomear] = useState(false);
  const [showDescricao, setShowDescricao] = useState(false);
  const [showSair, setShowSair] = useState(false);

  // Formulários
  const [novoGrupoNome, setNovoGrupoNome] = useState("");
  const [novoGrupoTelefones, setNovoGrupoTelefones] = useState("");
  const [novoGrupoAutoInvite, setNovoGrupoAutoInvite] = useState(false);
  const [novoParticipante, setNovoParticipante] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");

  // Dados
  const { data: instancias = [] } = trpc.whatsapp.listarInstancias.useQuery();
  const instanciaAtiva = instancias.find((i) => i.id === instanciaId);

  const { data: grupos = [], isLoading: loadingGrupos, refetch: refetchGrupos } =
    trpc.whatsapp.listarGrupos.useQuery(
      { instanciaId: instanciaId ?? 0, pageSize: 200 },
      { enabled: !!instanciaId }
    );

  const { data: metadata, refetch: refetchMetadata } =
    trpc.whatsapp.metadadosGrupo.useQuery(
      { instanciaId: instanciaId ?? 0, groupPhone: selectedGroup ?? "" },
      { enabled: !!instanciaId && !!selectedGroup }
    );

  const { data: linkConvite } =
    trpc.whatsapp.obterLinkConvite.useQuery(
      { instanciaId: instanciaId ?? 0, groupPhone: selectedGroup ?? "" },
      { enabled: !!instanciaId && !!selectedGroup }
    );

  // Mutations
  const criarGrupo = trpc.whatsapp.criarGrupo.useMutation({
    onSuccess: (res) => {
      toast.success(`Grupo criado! ID: ${res.phone}`);
      if (res.phonesNotAdded?.length) {
        toast.warning(`${res.phonesNotAdded.length} número(s) não adicionado(s).`);
      }
      setShowCriar(false);
      setNovoGrupoNome("");
      setNovoGrupoTelefones("");
      refetchGrupos();
    },
    onError: (e) => toast.error(e.message),
  });

  const enviarMensagem = trpc.whatsapp.enviarMensagemGrupo.useMutation({
    onSuccess: () => {
      toast.success("Mensagem enviada!");
      setMensagem("");
    },
    onError: (e) => toast.error(e.message),
  });

  const adicionarParticipante = trpc.whatsapp.adicionarParticipante.useMutation({
    onSuccess: () => {
      toast.success("Participante adicionado!");
      setShowAddParticipante(false);
      setNovoParticipante("");
      refetchMetadata();
    },
    onError: (e) => toast.error(e.message),
  });

  const removerParticipante = trpc.whatsapp.removerParticipante.useMutation({
    onSuccess: () => {
      toast.success("Participante removido!");
      refetchMetadata();
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarNome = trpc.whatsapp.atualizarNome.useMutation({
    onSuccess: () => {
      toast.success("Nome atualizado!");
      setShowRenomear(false);
      setNovoNome("");
      refetchGrupos();
      refetchMetadata();
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarDescricao = trpc.whatsapp.atualizarDescricao.useMutation({
    onSuccess: () => {
      toast.success("Descrição atualizada!");
      setShowDescricao(false);
      setNovaDescricao("");
      refetchMetadata();
    },
    onError: (e) => toast.error(e.message),
  });

  const promoverAdmin = trpc.whatsapp.promoverAdmin.useMutation({
    onSuccess: () => {
      toast.success("Participante promovido a admin!");
      refetchMetadata();
    },
    onError: (e) => toast.error(e.message),
  });

  const removerAdmin = trpc.whatsapp.removerAdmin.useMutation({
    onSuccess: () => {
      toast.success("Admin removido!");
      refetchMetadata();
    },
    onError: (e) => toast.error(e.message),
  });

  const sairDoGrupo = trpc.whatsapp.sairDoGrupo.useMutation({
    onSuccess: () => {
      toast.success("Saiu do grupo!");
      setShowSair(false);
      setSelectedGroup(null);
      refetchGrupos();
    },
    onError: (e) => toast.error(e.message),
  });

  // Filtro de grupos
  const gruposFiltrados = grupos.filter((g) =>
    g.name?.toLowerCase().includes(busca.toLowerCase()) ||
    g.phone?.toLowerCase().includes(busca.toLowerCase())
  );

  const grupoSelecionado = grupos.find((g) => g.phone === selectedGroup);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Grupos WhatsApp</h1>
              <p className="text-sm text-muted-foreground">Gerencie grupos via Z-API</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Seletor de instância */}
            <Select
              value={instanciaId?.toString() ?? ""}
              onValueChange={(v) => {
                setInstanciaId(Number(v));
                setSelectedGroup(null);
              }}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Selecionar instância..." />
              </SelectTrigger>
              <SelectContent>
                {instancias.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id.toString()}>
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${inst.ativo ? "bg-green-500" : "bg-gray-400"}`}
                      />
                      {inst.nome}
                      <Badge variant="outline" className="text-xs ml-1">
                        {inst.setor}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {instanciaId && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" onClick={() => refetchGrupos()}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Atualizar lista</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button onClick={() => setShowCriar(true)} className="gap-2 bg-green-600 hover:bg-green-700">
                  <Plus className="h-4 w-4" />
                  Novo Grupo
                </Button>
              </>
            )}
          </div>
        </div>

        {!instanciaId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="p-4 rounded-full bg-muted inline-block">
                <Users className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium">Selecione uma instância</p>
              <p className="text-sm text-muted-foreground">
                Escolha uma instância Z-API para gerenciar seus grupos.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* ─── Lista de grupos ──────────────────────────────────────────── */}
            <div className="w-80 border-r flex flex-col bg-muted/20">
              <div className="p-3 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar grupos..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
              </div>

              <ScrollArea className="flex-1">
                {loadingGrupos ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : gruposFiltrados.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {busca ? "Nenhum grupo encontrado" : "Nenhum grupo disponível"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {gruposFiltrados.map((grupo) => (
                      <button
                        key={grupo.phone}
                        onClick={() => {
                          setSelectedGroup(grupo.phone);
                          setActiveTab("info");
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors flex items-center gap-3 ${
                          selectedGroup === grupo.phone ? "bg-accent" : ""
                        }`}
                      >
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className="bg-green-500/20 text-green-700 text-sm font-semibold">
                            {getInitials(grupo.name || "G")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm truncate">{grupo.name || "Grupo sem nome"}</p>
                            {grupo.lastMessageTime && (
                              <span className="text-xs text-muted-foreground shrink-0 ml-1">
                                {timeAgo(grupo.lastMessageTime)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {formatPhone(grupo.phone)}
                          </p>
                        </div>
                        {Number(grupo.unread) > 0 && (
                          <Badge className="bg-green-500 text-white text-xs shrink-0">
                            {grupo.unread}
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="p-3 border-t text-center">
                <p className="text-xs text-muted-foreground">
                  {gruposFiltrados.length} grupo(s) — {instanciaAtiva?.nome}
                </p>
              </div>
            </div>

            {/* ─── Painel de detalhes ───────────────────────────────────────── */}
            {!selectedGroup ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="p-4 rounded-full bg-muted inline-block">
                    <MessageSquare className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium">Selecione um grupo</p>
                  <p className="text-sm text-muted-foreground">
                    Clique em um grupo para ver detalhes e gerenciar.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header do grupo */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-green-500/20 text-green-700 font-semibold">
                        {getInitials(grupoSelecionado?.name || metadata?.subject || "G")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="font-semibold">
                        {grupoSelecionado?.name || metadata?.subject || "Carregando..."}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {metadata ? `${metadata.participants?.length ?? 0} participantes` : formatPhone(selectedGroup)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        setNovoNome(grupoSelecionado?.name || metadata?.subject || "");
                        setShowRenomear(true);
                      }}
                    >
                      <Settings className="h-4 w-4" />
                      Renomear
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        setNovaDescricao(metadata?.description || "");
                        setShowDescricao(true);
                      }}
                    >
                      <Info className="h-4 w-4" />
                      Descrição
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowSair(true)}
                    >
                      <LogOut className="h-4 w-4" />
                      Sair
                    </Button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b bg-background px-6">
                  {(["info", "participantes", "mensagem"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab
                          ? "border-green-600 text-green-600"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab === "info" && "Informações"}
                      {tab === "participantes" && `Participantes${metadata ? ` (${metadata.participants?.length ?? 0})` : ""}`}
                      {tab === "mensagem" && "Enviar Mensagem"}
                    </button>
                  ))}
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-6">
                    {/* ── Aba Info ── */}
                    {activeTab === "info" && (
                      <div className="space-y-4 max-w-2xl">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              Detalhes do Grupo
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-start gap-2">
                              <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">ID do Grupo</p>
                                <p className="text-sm font-mono">{selectedGroup}</p>
                              </div>
                            </div>
                            {metadata?.description && (
                              <div className="flex items-start gap-2">
                                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Descrição</p>
                                  <p className="text-sm">{metadata.description}</p>
                                </div>
                              </div>
                            )}
                            {metadata?.owner && (
                              <div className="flex items-start gap-2">
                                <Crown className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Criador</p>
                                  <p className="text-sm">{metadata.owner}</p>
                                </div>
                              </div>
                            )}
                            {metadata?.creation && (
                              <div className="flex items-start gap-2">
                                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Criado em</p>
                                  <p className="text-sm">
                                    {new Date(metadata.creation).toLocaleDateString("pt-BR", {
                                      day: "2-digit",
                                      month: "long",
                                      year: "numeric",
                                    })}
                                  </p>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Link de convite */}
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              Link de Convite
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {linkConvite?.invitationLink ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  readOnly
                                  value={linkConvite.invitationLink}
                                  className="font-mono text-xs"
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => {
                                    navigator.clipboard.writeText(linkConvite.invitationLink);
                                    toast.success("Link copiado!");
                                  }}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Link não disponível (apenas admins podem ver).
                              </p>
                            )}
                          </CardContent>
                        </Card>

                        {/* Configurações */}
                        {metadata && (
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-medium text-muted-foreground">
                                Configurações
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm">Apenas admins enviam mensagens</span>
                                <Badge variant={metadata.adminOnlyMessage ? "default" : "secondary"}>
                                  {metadata.adminOnlyMessage ? "Sim" : "Não"}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm">Apenas admins alteram configurações</span>
                                <Badge variant={metadata.adminOnlySettings ? "default" : "secondary"}>
                                  {metadata.adminOnlySettings ? "Sim" : "Não"}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm">Aprovação de admin para entrar</span>
                                <Badge variant={metadata.requireAdminApproval ? "default" : "secondary"}>
                                  {metadata.requireAdminApproval ? "Sim" : "Não"}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}

                    {/* ── Aba Participantes ── */}
                    {activeTab === "participantes" && (
                      <div className="space-y-4 max-w-2xl">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">
                            {metadata?.participants?.length ?? 0} participante(s)
                          </h3>
                          <Button
                            size="sm"
                            className="gap-2 bg-green-600 hover:bg-green-700"
                            onClick={() => setShowAddParticipante(true)}
                          >
                            <UserPlus className="h-4 w-4" />
                            Adicionar
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {metadata?.participants?.map((p) => (
                            <div
                              key={p.phone}
                              className="flex items-center justify-between p-3 rounded-lg border bg-card"
                            >
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-xs bg-muted">
                                    {getInitials(p.name || p.phone)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium">
                                      {p.name || p.phone}
                                    </p>
                                    {p.isSuperAdmin && (
                                      <Badge className="bg-yellow-500 text-white text-xs">
                                        <Crown className="h-3 w-3 mr-1" />
                                        Dono
                                      </Badge>
                                    )}
                                    {p.isAdmin && !p.isSuperAdmin && (
                                      <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                                        Admin
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">{p.phone}</p>
                                </div>
                              </div>
                              {!p.isSuperAdmin && (
                                <div className="flex items-center gap-1">
                                  {p.isAdmin ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-orange-500 hover:text-orange-600"
                                            onClick={() =>
                                              removerAdmin.mutate({
                                                instanciaId: instanciaId!,
                                                groupPhone: selectedGroup,
                                                phones: [p.phone],
                                              })
                                            }
                                          >
                                            <ShieldOff className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Remover admin</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-green-600 hover:text-green-700"
                                            onClick={() =>
                                              promoverAdmin.mutate({
                                                instanciaId: instanciaId!,
                                                groupPhone: selectedGroup,
                                                phones: [p.phone],
                                              })
                                            }
                                          >
                                            <Crown className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Promover a admin</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-destructive hover:text-destructive"
                                          onClick={() =>
                                            removerParticipante.mutate({
                                              instanciaId: instanciaId!,
                                              groupPhone: selectedGroup,
                                              phones: [p.phone],
                                            })
                                          }
                                        >
                                          <UserMinus className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Remover do grupo</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Aba Mensagem ── */}
                    {activeTab === "mensagem" && (
                      <div className="space-y-4 max-w-2xl">
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Enviar mensagem para o grupo</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="p-3 rounded-lg bg-muted/50 border">
                              <p className="text-xs text-muted-foreground mb-1">Enviando para</p>
                              <p className="font-medium text-sm">
                                {grupoSelecionado?.name || metadata?.subject || selectedGroup}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label>Mensagem</Label>
                              <Textarea
                                placeholder="Digite a mensagem para o grupo..."
                                value={mensagem}
                                onChange={(e) => setMensagem(e.target.value)}
                                rows={6}
                                className="resize-none"
                              />
                              <p className="text-xs text-muted-foreground text-right">
                                {mensagem.length} caracteres
                              </p>
                            </div>
                            <Button
                              className="w-full gap-2 bg-green-600 hover:bg-green-700"
                              disabled={!mensagem.trim() || enviarMensagem.isPending}
                              onClick={() =>
                                enviarMensagem.mutate({
                                  instanciaId: instanciaId!,
                                  groupPhone: selectedGroup,
                                  message: mensagem.trim(),
                                })
                              }
                            >
                              <Send className="h-4 w-4" />
                              {enviarMensagem.isPending ? "Enviando..." : "Enviar Mensagem"}
                            </Button>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Modal: Criar Grupo ─────────────────────────────────────────────── */}
      <Dialog open={showCriar} onOpenChange={setShowCriar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-green-600" />
              Criar Novo Grupo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome do grupo *</Label>
              <Input
                placeholder="Ex: Condomínio Jardim das Flores"
                value={novoGrupoNome}
                onChange={(e) => setNovoGrupoNome(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Participantes *</Label>
              <Textarea
                placeholder={"Um número por linha:\n5511999990001\n5511999990002"}
                value={novoGrupoTelefones}
                onChange={(e) => setNovoGrupoTelefones(e.target.value)}
                rows={5}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Apenas números com DDD e DDI (ex: 5511999990001). Não inclua o número da instância.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoInvite"
                checked={novoGrupoAutoInvite}
                onChange={(e) => setNovoGrupoAutoInvite(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="autoInvite" className="cursor-pointer">
                Enviar convite automático para números não adicionados
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCriar(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!novoGrupoNome.trim() || !novoGrupoTelefones.trim() || criarGrupo.isPending}
              onClick={() => {
                const phones = novoGrupoTelefones
                  .split("\n")
                  .map((p) => p.trim())
                  .filter(Boolean);
                criarGrupo.mutate({
                  instanciaId: instanciaId!,
                  groupName: novoGrupoNome.trim(),
                  phones,
                  autoInvite: novoGrupoAutoInvite,
                });
              }}
            >
              {criarGrupo.isPending ? "Criando..." : "Criar Grupo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Adicionar Participante ──────────────────────────────────── */}
      <Dialog open={showAddParticipante} onOpenChange={setShowAddParticipante}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-600" />
              Adicionar Participante
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Número(s) — um por linha</Label>
              <Textarea
                placeholder={"5511999990001\n5511999990002"}
                value={novoParticipante}
                onChange={(e) => setNovoParticipante(e.target.value)}
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Com DDD e DDI, sem espaços ou símbolos.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddParticipante(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!novoParticipante.trim() || adicionarParticipante.isPending}
              onClick={() => {
                const phones = novoParticipante
                  .split("\n")
                  .map((p) => p.trim())
                  .filter(Boolean);
                adicionarParticipante.mutate({
                  instanciaId: instanciaId!,
                  groupPhone: selectedGroup!,
                  phones,
                });
              }}
            >
              {adicionarParticipante.isPending ? "Adicionando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Renomear Grupo ───────────────────────────────────────────── */}
      <Dialog open={showRenomear} onOpenChange={setShowRenomear}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear Grupo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Novo nome</Label>
              <Input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Nome do grupo"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenomear(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!novoNome.trim() || atualizarNome.isPending}
              onClick={() =>
                atualizarNome.mutate({
                  instanciaId: instanciaId!,
                  groupPhone: selectedGroup!,
                  groupName: novoNome.trim(),
                })
              }
            >
              {atualizarNome.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Alterar Descrição ────────────────────────────────────────── */}
      <Dialog open={showDescricao} onOpenChange={setShowDescricao}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Descrição</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={novaDescricao}
                onChange={(e) => setNovaDescricao(e.target.value)}
                placeholder="Descrição do grupo..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDescricao(false)}>
              Cancelar
            </Button>
            <Button
              disabled={atualizarDescricao.isPending}
              onClick={() =>
                atualizarDescricao.mutate({
                  instanciaId: instanciaId!,
                  groupPhone: selectedGroup!,
                  description: novaDescricao,
                })
              }
            >
              {atualizarDescricao.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Sair do Grupo ────────────────────────────────────────────── */}
      <Dialog open={showSair} onOpenChange={setShowSair}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Sair do Grupo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Tem certeza que deseja sair do grupo{" "}
            <strong>{grupoSelecionado?.name || metadata?.subject}</strong>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSair(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={sairDoGrupo.isPending}
              onClick={() =>
                sairDoGrupo.mutate({
                  instanciaId: instanciaId!,
                  groupPhone: selectedGroup!,
                })
              }
            >
              {sairDoGrupo.isPending ? "Saindo..." : "Sair do Grupo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
