import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  ArrowLeft,
  Scale,
  Building2,
  Tag,
  AlertTriangle,
  MessageSquarePlus,
  Send,
  UserCheck,
} from "lucide-react";

const CATEGORIAS = [
  { value: "consultoria", label: "Consultoria" },
  { value: "notificacao", label: "Notificação" },
  { value: "acao_judicial", label: "Ação Judicial" },
  { value: "cobranca_judicial", label: "Cobrança Judicial" },
  { value: "assembleia", label: "Assembleia" },
  { value: "contrato", label: "Contrato" },
  { value: "outro", label: "Outro" },
];

const PRIORIDADES = [
  { value: "baixa", label: "Baixa", color: "text-slate-600" },
  { value: "media", label: "Média", color: "text-blue-600" },
  { value: "alta", label: "Alta", color: "text-orange-600" },
  { value: "urgente", label: "Urgente", color: "text-red-600" },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export default function TicketForm() {
  const [, navigate] = useLocation();

  // Campos do formulário
  const [condominioId, setCondominioId] = useState<string>("");
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<string>("outro");
  const [prioridade, setPrioridade] = useState<string>("media");
  const [descricao, setDescricao] = useState("");
  const [responsavelId, setResponsavelId] = useState<string>("nenhum");
  const [mensagemInicial, setMensagemInicial] = useState("");

  const utils = trpc.useUtils();

  // Buscar lista de condomínios
  const { data: condominios = [], isLoading: loadingCondominios } =
    trpc.condominios.list.useQuery();

  // Buscar lista de usuários (admin + cobradores) para selecionar responsável
  const { data: todosUsuarios = [], isLoading: loadingUsuarios } =
    trpc.users.list.useQuery();

  // Filtrar apenas admin e cobradores (excluir síndicos)
  const responsaveis = todosUsuarios.filter(
    (u) => u.role === "admin" || u.role === "cobrador"
  );

  // Procedure de criação
  const createTicket = trpc.juridico.createTicketAdmin.useMutation({
    onSuccess: (ticket) => {
      utils.juridico.listTickets.invalidate();
      toast.success("Ticket jurídico criado com sucesso!");
      navigate(`/juridico/solicitacoes/${ticket.id}`);
    },
    onError: (err) => {
      toast.error("Erro ao criar ticket: " + err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!condominioId) {
      toast.error("Selecione um condomínio.");
      return;
    }
    if (!titulo.trim()) {
      toast.error("Informe o título do ticket.");
      return;
    }
    if (!descricao.trim()) {
      toast.error("Informe a descrição do ticket.");
      return;
    }
    createTicket.mutate({
      condominioId: parseInt(condominioId),
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      categoria: categoria as any,
      prioridade: prioridade as any,
      responsavelId:
        responsavelId && responsavelId !== "nenhum"
          ? parseInt(responsavelId)
          : null,
      mensagemInicial: mensagemInicial.trim() || undefined,
    });
  };

  const condominioSelecionado = condominios.find(
    (c) => String(c.id) === condominioId
  );

  const responsavelSelecionado = responsaveis.find(
    (u) => String(u.id) === responsavelId
  );

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/juridico/solicitacoes")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <Scale className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Novo Ticket Jurídico</h1>
            <p className="text-sm text-muted-foreground">
              Cadastro manual de solicitação pelo escritório
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Card: Condomínio */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Condomínio
            </CardTitle>
            <CardDescription>
              Selecione o condomínio ao qual este ticket pertence
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={condominioId}
              onValueChange={setCondominioId}
              disabled={loadingCondominios}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    loadingCondominios
                      ? "Carregando condomínios..."
                      : "Selecione o condomínio"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {condominios.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                    {c.city ? ` — ${c.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {condominioSelecionado && (
              <p className="text-xs text-muted-foreground mt-2">
                CNPJ: {condominioSelecionado.cnpj || "—"}
                {condominioSelecionado.address
                  ? ` · ${condominioSelecionado.address}`
                  : ""}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Card: Dados do Ticket */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              Dados do Ticket
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Título */}
            <div className="space-y-1.5">
              <Label htmlFor="titulo">
                Título <span className="text-destructive">*</span>
              </Label>
              <Input
                id="titulo"
                placeholder="Ex: Análise de inadimplência para assembleia"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={255}
                required
              />
            </div>

            {/* Categoria e Prioridade lado a lado */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="categoria">
                  Categoria <span className="text-destructive">*</span>
                </Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger id="categoria">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prioridade">
                  Prioridade <span className="text-destructive">*</span>
                </Label>
                <Select value={prioridade} onValueChange={setPrioridade}>
                  <SelectTrigger id="prioridade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORIDADES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <span className={p.color}>{p.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="descricao">
                Descrição <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="descricao"
                placeholder="Descreva detalhadamente o assunto, contexto e o que precisa ser feito..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={5}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Card: Responsável */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              Responsável{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (opcional)
              </span>
            </CardTitle>
            <CardDescription>
              Atribua este ticket a um advogado ou colaborador do escritório
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={responsavelId}
              onValueChange={setResponsavelId}
              disabled={loadingUsuarios}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    loadingUsuarios
                      ? "Carregando colaboradores..."
                      : "Selecione o responsável"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">
                  <span className="text-muted-foreground">
                    Sem responsável definido
                  </span>
                </SelectItem>
                {responsaveis.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[10px]">
                          {getInitials(u.name || "?")}
                        </AvatarFallback>
                      </Avatar>
                      <span>{u.name}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        ({u.role === "admin" ? "Administrador" : "Colaborador"})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {responsavelSelecionado && responsavelId !== "nenhum" && (
              <div className="flex items-center gap-2 mt-3 p-2 bg-muted rounded-md">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">
                    {getInitials(responsavelSelecionado.name || "?")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {responsavelSelecionado.name}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {responsavelSelecionado.role === "admin"
                      ? "Administrador"
                      : "Colaborador"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card: Mensagem Inicial (opcional) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />
              Mensagem Inicial{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (opcional)
              </span>
            </CardTitle>
            <CardDescription>
              Se preenchida, será adicionada como primeira mensagem do escritório
              no chat do ticket
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Ex: Recebemos sua solicitação e já estamos analisando o caso. Em breve retornaremos com mais informações."
              value={mensagemInicial}
              onChange={(e) => setMensagemInicial(e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Aviso */}
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            Este ticket será criado em nome do escritório. O condomínio poderá
            visualizá-lo e responder pelo painel de solicitações.
          </p>
        </div>

        {/* Botões */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/juridico/solicitacoes")}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={createTicket.isPending}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {createTicket.isPending ? "Criando..." : "Criar Ticket"}
          </Button>
        </div>
      </form>
    </div>
  );
}
