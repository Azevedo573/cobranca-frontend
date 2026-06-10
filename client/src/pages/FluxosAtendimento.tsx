import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Plus, Trash2, Edit2, Play, Square, ChevronDown, ChevronUp,
  MessageSquare, MousePointerClick, ArrowRight, GitBranch,
  Zap, Settings, Copy, GripVertical, AlertCircle, CheckCircle2
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoNo = "inicio" | "mensagem" | "botoes" | "lista_opcoes" | "transferir" | "encerrar";

interface BotaoAcao {
  label: string;
  proximoNoId: number | null;
}

interface ConteudoMensagem { tipo: "mensagem"; texto: string; }
interface ConteudoBotoes { tipo: "botoes"; texto: string; botoes: BotaoAcao[]; }
interface OpcaoLista { id: string; titulo: string; descricao?: string; proximoNoId: number | null; }
interface ConteudoListaOpcoes { tipo: "lista_opcoes"; mensagem: string; titulo: string; labelBotao: string; opcoes: OpcaoLista[]; }
interface ConteudoTransferir { tipo: "transferir"; mensagem?: string; departamentoId?: number | null; }
interface ConteudoEncerrar { tipo: "encerrar"; mensagem?: string; }
interface ConteudoInicio { tipo: "inicio"; texto?: string; }
type ConteudoNo = ConteudoMensagem | ConteudoBotoes | ConteudoListaOpcoes | ConteudoTransferir | ConteudoEncerrar | ConteudoInicio;

interface No {
  id: number;
  fluxoId: number;
  tipo: TipoNo;
  nome: string;
  conteudo: ConteudoNo;
  ordem: number;
}

interface Fluxo {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  gatilho: string;
  palavraChave: string | null;
  instanciaId: number | null;
}

// ─── Ícones por tipo de nó ────────────────────────────────────────────────────

const iconeNo: Record<TipoNo, React.ReactNode> = {
  inicio: <Zap className="w-4 h-4 text-yellow-500" />,
  mensagem: <MessageSquare className="w-4 h-4 text-blue-500" />,
  botoes: <MousePointerClick className="w-4 h-4 text-purple-500" />,
  lista_opcoes: <GitBranch className="w-4 h-4 text-teal-500" />,
  transferir: <ArrowRight className="w-4 h-4 text-orange-500" />,
  encerrar: <Square className="w-4 h-4 text-red-500" />,
};

const corNo: Record<TipoNo, string> = {
  inicio: "border-yellow-500 bg-yellow-500/10",
  mensagem: "border-blue-500 bg-blue-500/10",
  botoes: "border-purple-500 bg-purple-500/10",
  lista_opcoes: "border-teal-500 bg-teal-500/10",
  transferir: "border-orange-500 bg-orange-500/10",
  encerrar: "border-red-500 bg-red-500/10",
};

const labelNo: Record<TipoNo, string> = {
  inicio: "Início",
  mensagem: "Mensagem",
  botoes: "Botões de Ação",
  lista_opcoes: "Lista de Opções",
  transferir: "Transferir para Fila",
  encerrar: "Encerrar",
};

// ─── Componente: Card do Nó ───────────────────────────────────────────────────

function CardNo({
  no,
  todos,
  onEditar,
  onRemover,
  onMoverCima,
  onMoverBaixo,
  isFirst,
  isLast,
}: {
  no: No;
  todos: No[];
  onEditar: (no: No) => void;
  onRemover: (id: number) => void;
  onMoverCima: (id: number) => void;
  onMoverBaixo: (id: number) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const conteudo = no.conteudo;

  return (
    <div className={`relative border-2 rounded-lg p-4 ${corNo[no.tipo]} transition-all`}>
      {/* Linha de conexão acima (exceto primeiro) */}
      {!isFirst && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="w-px h-4 bg-border" />
          <ArrowRight className="w-3 h-3 text-muted-foreground rotate-90" />
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="mt-0.5">{iconeNo[no.tipo]}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {labelNo[no.tipo]}
            </span>
            <span className="text-xs text-muted-foreground">#{no.ordem}</span>
          </div>
          <p className="text-sm font-medium text-foreground truncate">{no.nome}</p>

          {/* Preview do conteúdo */}
          {conteudo.tipo === "mensagem" && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{conteudo.texto}</p>
          )}
          {conteudo.tipo === "botoes" && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground line-clamp-1">{conteudo.texto}</p>
              <div className="flex flex-wrap gap-1">
                {conteudo.botoes.map((b, i) => {
                  const proximo = todos.find(n => n.id === b.proximoNoId);
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs py-0">{b.label}</Badge>
                      {proximo && (
                        <span className="text-xs text-muted-foreground">→ {proximo.nome}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {conteudo.tipo === "lista_opcoes" && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground line-clamp-1">{conteudo.mensagem}</p>
              <div className="flex flex-wrap gap-1">
                {conteudo.opcoes.map((op, i) => {
                  const proximo = todos.find(n => n.id === op.proximoNoId);
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs py-0 bg-teal-100 text-teal-700">{op.titulo}</Badge>
                      {proximo && <span className="text-xs text-muted-foreground">→ {proximo.nome}</span>}
                    </div>
                  );
                })}
              </div>
              {conteudo.opcoes.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhuma opção configurada</p>}
            </div>
          )}
          {conteudo.tipo === "transferir" && (
            <p className="text-xs text-muted-foreground mt-1">
              {conteudo.mensagem || "Encaminha para atendente humano"}
            </p>
          )}
          {conteudo.tipo === "encerrar" && (
            <p className="text-xs text-muted-foreground mt-1">
              {conteudo.mensagem || "Encerra a conversa"}
            </p>
          )}
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMoverCima(no.id)} disabled={isFirst}>
            <ChevronUp className="w-3 h-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onEditar(no)}>
            <Edit2 className="w-3 h-3" />
          </Button>
          {no.tipo !== "inicio" && (
            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onRemover(no.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMoverBaixo(no.id)} disabled={isLast}>
            <ChevronDown className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente: Modal de Edição de Nó ───────────────────────────────────────

function ModalEditarNo({
  no,
  todos,
  onSalvar,
  onFechar,
}: {
  no: No | null;
  todos: No[];
  onSalvar: (no: No) => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(no?.nome ?? "");
  const [conteudo, setConteudo] = useState<ConteudoNo>(
    no?.conteudo ?? { tipo: "mensagem", texto: "" }
  );

  if (!no) return null;

  const salvar = () => {
    if (!nome.trim()) return;
    onSalvar({ ...no, nome: nome.trim(), conteudo });
  };

  const adicionarBotao = () => {
    if (conteudo.tipo !== "botoes") return;
    setConteudo({ ...conteudo, botoes: [...conteudo.botoes, { label: "", proximoNoId: null }] });
  };

  const atualizarBotao = (idx: number, campo: keyof BotaoAcao, valor: string | number | null) => {
    if (conteudo.tipo !== "botoes") return;
    const novos = conteudo.botoes.map((b, i) => i === idx ? { ...b, [campo]: valor } : b);
    setConteudo({ ...conteudo, botoes: novos });
  };

  const removerBotao = (idx: number) => {
    if (conteudo.tipo !== "botoes") return;
    setConteudo({ ...conteudo, botoes: conteudo.botoes.filter((_, i) => i !== idx) });
  };

  const adicionarOpcao = () => {
    if (conteudo.tipo !== "lista_opcoes") return;
    const novoId = `op${Date.now()}`;
    setConteudo({ ...conteudo, opcoes: [...conteudo.opcoes, { id: novoId, titulo: "", descricao: "", proximoNoId: null }] });
  };

  const atualizarOpcao = (idx: number, campo: keyof OpcaoLista, valor: string | number | null) => {
    if (conteudo.tipo !== "lista_opcoes") return;
    const novas = conteudo.opcoes.map((op, i) => i === idx ? { ...op, [campo]: valor } : op);
    setConteudo({ ...conteudo, opcoes: novas });
  };

  const removerOpcao = (idx: number) => {
    if (conteudo.tipo !== "lista_opcoes") return;
    setConteudo({ ...conteudo, opcoes: conteudo.opcoes.filter((_, i) => i !== idx) });
  };

  const nosDisponiveis = todos.filter(n => n.id !== no.id && n.tipo !== "inicio");

  return (
    <Dialog open onOpenChange={onFechar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {iconeNo[no.tipo]}
            Editar Nó — {labelNo[no.tipo]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome do nó</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Boas-vindas" className="mt-1" />
          </div>

          {/* Conteúdo por tipo */}
          {conteudo.tipo === "mensagem" && (
            <div>
              <Label>Mensagem de texto</Label>
              <Textarea
                value={conteudo.texto}
                onChange={e => setConteudo({ ...conteudo, texto: e.target.value })}
                placeholder="Digite a mensagem que será enviada ao cliente..."
                className="mt-1 min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {"{{nome}}"} para o nome do contato
              </p>
            </div>
          )}

          {conteudo.tipo === "botoes" && (
            <div className="space-y-3">
              <div>
                <Label>Texto acima dos botões</Label>
                <Textarea
                  value={conteudo.texto}
                  onChange={e => setConteudo({ ...conteudo, texto: e.target.value })}
                  placeholder="Ex: Como posso te ajudar?"
                  className="mt-1 min-h-[80px]"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Botões de ação</Label>
                  <Button size="sm" variant="outline" onClick={adicionarBotao} disabled={conteudo.botoes.length >= 3}>
                    <Plus className="w-3 h-3 mr-1" /> Adicionar
                  </Button>
                </div>
                <div className="space-y-2">
                  {conteudo.botoes.map((botao, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <Input
                          value={botao.label}
                          onChange={e => atualizarBotao(idx, "label", e.target.value)}
                          placeholder={`Botão ${idx + 1} (ex: Cobrança)`}
                          className="text-sm"
                        />
                        <Select
                          value={botao.proximoNoId?.toString() ?? "null"}
                          onValueChange={v => atualizarBotao(idx, "proximoNoId", v === "null" ? null : parseInt(v))}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="Próximo nó..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="null">— Encerrar fluxo —</SelectItem>
                            {nosDisponiveis.map(n => (
                              <SelectItem key={n.id} value={n.id.toString()}>
                                {iconeNo[n.tipo]} {n.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button size="icon" variant="ghost" className="text-destructive mt-1" onClick={() => removerBotao(idx)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  {conteudo.botoes.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Nenhum botão adicionado</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Máximo 3 botões (limitação do WhatsApp)</p>
              </div>
            </div>
          )}

          {conteudo.tipo === "lista_opcoes" && (
            <div className="space-y-3">
              <div>
                <Label>Mensagem principal</Label>
                <Textarea
                  value={conteudo.mensagem}
                  onChange={e => setConteudo({ ...conteudo, mensagem: e.target.value })}
                  placeholder="Ex: Selecione uma das opções abaixo:"
                  className="mt-1 min-h-[70px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Título da lista</Label>
                  <Input
                    value={conteudo.titulo}
                    onChange={e => setConteudo({ ...conteudo, titulo: e.target.value })}
                    placeholder="Ex: Menu de opções"
                    className="mt-1 text-sm"
                  />
                </div>
                <div>
                  <Label>Texto do botão</Label>
                  <Input
                    value={conteudo.labelBotao}
                    onChange={e => setConteudo({ ...conteudo, labelBotao: e.target.value })}
                    placeholder="Ex: Ver opções"
                    className="mt-1 text-sm"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Opções da lista</Label>
                  <Button size="sm" variant="outline" onClick={adicionarOpcao} disabled={(conteudo.opcoes?.length ?? 0) >= 10}>
                    <Plus className="w-3 h-3 mr-1" /> Adicionar
                  </Button>
                </div>
                <ScrollArea className="max-h-64">
                  <div className="space-y-3 pr-1">
                    {conteudo.opcoes.map((op, idx) => (
                      <div key={idx} className="border rounded-lg p-3 space-y-2 bg-teal-50/50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-teal-700">Opção {idx + 1}</span>
                          <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive" onClick={() => removerOpcao(idx)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <Input
                          value={op.titulo}
                          onChange={e => atualizarOpcao(idx, "titulo", e.target.value)}
                          placeholder="Título da opção (ex: Cobrança)"
                          className="text-sm"
                        />
                        <Input
                          value={op.descricao ?? ""}
                          onChange={e => atualizarOpcao(idx, "descricao", e.target.value)}
                          placeholder="Descrição (opcional)"
                          className="text-sm"
                        />
                        <Select
                          value={op.proximoNoId?.toString() ?? "null"}
                          onValueChange={v => atualizarOpcao(idx, "proximoNoId", v === "null" ? null : parseInt(v))}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="Próximo nó..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="null">— Encerrar fluxo —</SelectItem>
                            {nosDisponiveis.map(n => (
                              <SelectItem key={n.id} value={n.id.toString()}>
                                {labelNo[n.tipo]} — {n.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    {conteudo.opcoes.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">Nenhuma opção adicionada</p>
                    )}
                  </div>
                </ScrollArea>
                <p className="text-xs text-muted-foreground mt-1">ℹ️ Máximo 10 opções por lista (Z-API)</p>
              </div>
            </div>
          )}

          {conteudo.tipo === "transferir" && (
            <div>
              <Label>Mensagem antes de transferir (opcional)</Label>
              <Textarea
                value={conteudo.mensagem ?? ""}
                onChange={e => setConteudo({ ...conteudo, mensagem: e.target.value })}
                placeholder="Ex: Aguarde, vou te conectar com um atendente..."
                className="mt-1"
              />
            </div>
          )}

          {conteudo.tipo === "encerrar" && (
            <div>
              <Label>Mensagem de encerramento</Label>
              <Textarea
                value={conteudo.mensagem ?? ""}
                onChange={e => setConteudo({ ...conteudo, mensagem: e.target.value })}
                placeholder="Ex: Obrigado pelo contato! Até logo."
                className="mt-1"
              />
            </div>
          )}

          {conteudo.tipo === "inicio" && (
            <div>
              <Label>Mensagem de boas-vindas (opcional)</Label>
              <Textarea
                value={conteudo.texto ?? ""}
                onChange={e => setConteudo({ ...conteudo, texto: e.target.value })}
                placeholder="Ex: Olá! Bem-vindo ao nosso atendimento."
                className="mt-1"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={!nome.trim()}>Salvar nó</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente: Editor de Fluxo ──────────────────────────────────────────────

function EditorFluxo({ fluxo, onVoltar }: { fluxo: Fluxo; onVoltar: () => void }) {
  const utils2 = trpc.useUtils();

  const { data: nosFluxoData, isLoading, refetch: refetchNos } = trpc.fluxos.buscar.useQuery({ id: fluxo.id });
  const nos: No[] = ((nosFluxoData as any)?.nos ?? []).map((n: any) => ({ ...n, nome: n.titulo }));

  const criarNoMutation = trpc.fluxos.adicionarNo.useMutation({
    onSuccess: () => { refetchNos(); },
  });
  const atualizarNoMutation = trpc.fluxos.atualizarNo.useMutation({
    onSuccess: () => { refetchNos(); },
  });
  const removerNoMutation = trpc.fluxos.excluirNo.useMutation({
    onSuccess: () => { refetchNos(); },
  });

  const [noEditando, setNoEditando] = useState<No | null>(null);

  const adicionarNo = (tipo: TipoNo) => {
    const conteudoInicial: ConteudoNo =
      tipo === "mensagem" ? { tipo: "mensagem", texto: "" } :
      tipo === "botoes" ? { tipo: "botoes", texto: "", botoes: [] } :
      tipo === "lista_opcoes" ? { tipo: "lista_opcoes", mensagem: "", titulo: "Menu de opções", labelBotao: "Ver opções", opcoes: [] } :
      tipo === "transferir" ? { tipo: "transferir", mensagem: "" } :
      tipo === "encerrar" ? { tipo: "encerrar", mensagem: "" } :
      { tipo: "inicio" };

    criarNoMutation.mutate({
      fluxoId: fluxo.id,
      tipo: tipo as any,
      titulo: labelNo[tipo],
      conteudo: conteudoInicial,
      ordem: nos.length,
    });
  };

  const salvarNo = (noAtualizado: No) => {
    atualizarNoMutation.mutate({
      id: noAtualizado.id,
      titulo: noAtualizado.nome,
      conteudo: noAtualizado.conteudo,
    }, {
      onSuccess: () => {
        setNoEditando(null);
        toast.success("Nó salvo com sucesso");
      },
    });
  };

  const removerNo = (id: number) => {
    removerNoMutation.mutate({ id }, {
      onSuccess: () => toast.success("Nó removido"),
    });
  };

  const moverNo = (id: number, direcao: "cima" | "baixo") => {
    const idx = nos.findIndex(n => n.id === id);
    if (idx === -1) return;
    const novoIdx = direcao === "cima" ? idx - 1 : idx + 1;
    if (novoIdx < 0 || novoIdx >= nos.length) return;
    const noAlvo = nos[novoIdx];
    // Trocar ordens
    atualizarNoMutation.mutate({ id, titulo: nos[idx].nome, conteudo: nos[idx].conteudo, ordem: noAlvo.ordem });
    atualizarNoMutation.mutate({ id: noAlvo.id, titulo: noAlvo.nome, conteudo: noAlvo.conteudo, ordem: nos[idx].ordem }, {
      onSuccess: () => { refetchNos(); },
    });
  };

  const tiposDisponiveis: TipoNo[] = ["mensagem", "botoes", "lista_opcoes", "transferir", "encerrar"];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
        <Button variant="ghost" size="sm" onClick={onVoltar}>← Voltar</Button>
        <div className="flex-1">
          <h2 className="font-semibold">{fluxo.nome}</h2>
          <p className="text-xs text-muted-foreground">{nos.length} nó(s) configurado(s)</p>
        </div>
        <Badge variant={fluxo.ativo ? "default" : "secondary"}>
          {fluxo.ativo ? "Ativo" : "Inativo"}
        </Badge>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Coluna de nós */}
        <ScrollArea className="flex-1 p-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : (
            <div className="space-y-6 max-w-md mx-auto">
              {nos.sort((a, b) => a.ordem - b.ordem).map((no, idx) => (
                <CardNo
                  key={no.id}
                  no={no}
                  todos={nos}
                  onEditar={setNoEditando}
                  onRemover={removerNo}
                  onMoverCima={id => moverNo(id, "cima")}
                  onMoverBaixo={id => moverNo(id, "baixo")}
                  isFirst={idx === 0}
                  isLast={idx === nos.length - 1}
                />
              ))}

              {/* Linha final */}
              {nos.length > 0 && (
                <div className="flex flex-col items-center">
                  <div className="w-px h-4 bg-border" />
                  <ArrowRight className="w-3 h-3 text-muted-foreground rotate-90" />
                </div>
              )}

              {/* Botões para adicionar nós */}
              <div className="border-2 border-dashed border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground text-center mb-3">Adicionar nó ao fluxo</p>
                <div className="grid grid-cols-2 gap-2">
                  {tiposDisponiveis.map(tipo => (
                    <Button
                      key={tipo}
                      variant="outline"
                      size="sm"
                      className="justify-start gap-2"
                      onClick={() => adicionarNo(tipo)}
                    >
                      {iconeNo[tipo]}
                      {labelNo[tipo]}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Painel lateral de ajuda */}
        <div className="w-64 border-l p-4 hidden lg:block">
          <h3 className="text-sm font-semibold mb-3">Tipos de nó</h3>
          <div className="space-y-3">
            {(["inicio", "mensagem", "botoes", "lista_opcoes", "transferir", "encerrar"] as TipoNo[]).map(tipo => (
              <div key={tipo} className="flex gap-2">
                <div className="mt-0.5">{iconeNo[tipo]}</div>
                <div>
                  <p className="text-xs font-medium">{labelNo[tipo]}</p>
                  <p className="text-xs text-muted-foreground">
                    {tipo === "inicio" && "Ponto de entrada do fluxo"}
                    {tipo === "mensagem" && "Envia texto ao cliente"}
                    {tipo === "botoes" && "Apresenta até 3 botões clicáveis"}
                    {tipo === "lista_opcoes" && "Lista interativa com até 10 opções"}
                    {tipo === "transferir" && "Encaminha para fila humana"}
                    {tipo === "encerrar" && "Finaliza o fluxo"}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Dicas</h3>
            <p className="text-xs text-muted-foreground">• Máximo 3 botões por nó de ação</p>
            <p className="text-xs text-muted-foreground">• Use {"{{nome}}"} para personalizar</p>
            <p className="text-xs text-muted-foreground">• O fluxo sempre começa pelo nó Início</p>
            <p className="text-xs text-muted-foreground">• Botões podem redirecionar para qualquer nó</p>
          </div>
        </div>
      </div>

      {/* Modal de edição */}
      {noEditando && (
        <ModalEditarNo
          no={noEditando}
          todos={nos}
          onSalvar={salvarNo}
          onFechar={() => setNoEditando(null)}
        />
      )}
    </div>
  );
}

// ─── Componente principal: Lista de Fluxos ────────────────────────────────────

export default function FluxosAtendimento() {
  const utils = trpc.useUtils();
  const { data: fluxosData, isLoading } = trpc.fluxos.listar.useQuery();
  const fluxos: Fluxo[] = (fluxosData as any) ?? [];

  const { data: instanciasData } = trpc.whatsapp.listarInstancias.useQuery();
  const instancias = (instanciasData as any) ?? [];

  const criarMutation = trpc.fluxos.criar.useMutation({
    onSuccess: () => {
      utils.fluxos.listar.invalidate();
      setModalCriar(false);
      toast.success("Fluxo criado com sucesso!");
    },
  });
  const atualizarMutation = trpc.fluxos.atualizar.useMutation({
    onSuccess: () => utils.fluxos.listar.invalidate(),
  });
  const removerMutation = trpc.fluxos.excluir.useMutation({
    onSuccess: () => {
      utils.fluxos.listar.invalidate();
      toast.success("Fluxo removido");
    },
  });

  const [fluxoEditando, setFluxoEditando] = useState<Fluxo | null>(null);
  const [modalCriar, setModalCriar] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novoGatilho, setNovoGatilho] = useState<"primeira_mensagem" | "palavra_chave">("primeira_mensagem");
  const [novaPalavraChave, setNovaPalavraChave] = useState("");
  const [novaInstanciaId, setNovaInstanciaId] = useState<string>("todas");

  const criarFluxo = () => {
    if (!novoNome.trim()) return;
    criarMutation.mutate({
      nome: novoNome.trim(),
      descricao: novaDescricao.trim() || undefined,
      gatilho: novoGatilho,
      palavraChave: novoGatilho === "palavra_chave" ? novaPalavraChave.trim() : undefined,
      instanciaId: novaInstanciaId === "todas" ? undefined : parseInt(novaInstanciaId),
    });
  };

  const toggleAtivo = (fluxo: Fluxo) => {
    atualizarMutation.mutate({ id: fluxo.id, ativo: !fluxo.ativo }, {
      onSuccess: () => toast.success(fluxo.ativo ? "Fluxo desativado" : "Fluxo ativado"),
    });
  };

  if (fluxoEditando) {
    return <EditorFluxo fluxo={fluxoEditando} onVoltar={() => setFluxoEditando(null)} />;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-primary" />
            Fluxos de Atendimento
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure bots automáticos para responder clientes antes de encaminhar para um atendente
          </p>
        </div>
        <Button onClick={() => setModalCriar(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo Fluxo
        </Button>
      </div>

      {/* Lista de fluxos */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando fluxos...</div>
      ) : fluxos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <GitBranch className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Nenhum fluxo criado</h3>
            <p className="text-muted-foreground mb-4">
              Crie fluxos de atendimento para automatizar respostas e direcionar clientes
            </p>
            <Button onClick={() => setModalCriar(true)}>
              <Plus className="w-4 h-4 mr-2" /> Criar primeiro fluxo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {fluxos.map(fluxo => {
            const instancia = instancias.find((i: any) => i.id === fluxo.instanciaId);
            return (
              <Card key={fluxo.id} className={`transition-all ${fluxo.ativo ? "border-primary/30" : "opacity-60"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${fluxo.ativo ? "bg-green-500/20" : "bg-muted"}`}>
                      <GitBranch className={`w-5 h-5 ${fluxo.ativo ? "text-green-500" : "text-muted-foreground"}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{fluxo.nome}</h3>
                        <Badge variant={fluxo.ativo ? "default" : "secondary"} className="text-xs">
                          {fluxo.ativo ? (
                            <><CheckCircle2 className="w-3 h-3 mr-1" /> Ativo</>
                          ) : (
                            <><Square className="w-3 h-3 mr-1" /> Inativo</>
                          )}
                        </Badge>
                      </div>
                      {fluxo.descricao && (
                        <p className="text-sm text-muted-foreground mb-2">{fluxo.descricao}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-xs">
                          <Zap className="w-3 h-3 mr-1" />
                          {fluxo.gatilho === "primeira_mensagem" ? "Primeira mensagem" : `Palavra: "${fluxo.palavraChave}"`}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {instancia ? instancia.nome : "Todas as instâncias"}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={fluxo.ativo}
                        onCheckedChange={() => toggleAtivo(fluxo)}
                      />
                      <Button size="sm" variant="outline" onClick={() => setFluxoEditando(fluxo)}>
                        <Edit2 className="w-3 h-3 mr-1" /> Editar nós
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removerMutation.mutate({ id: fluxo.id })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal criar fluxo */}
      <Dialog open={modalCriar} onOpenChange={setModalCriar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Fluxo de Atendimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do fluxo *</Label>
              <Input
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                placeholder="Ex: Atendimento Cobrança"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input
                value={novaDescricao}
                onChange={e => setNovaDescricao(e.target.value)}
                placeholder="Breve descrição do fluxo"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Gatilho de ativação</Label>
              <Select value={novoGatilho} onValueChange={(v: any) => setNovoGatilho(v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primeira_mensagem">Primeira mensagem recebida</SelectItem>
                  <SelectItem value="palavra_chave">Palavra-chave específica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {novoGatilho === "palavra_chave" && (
              <div>
                <Label>Palavra-chave</Label>
                <Input
                  value={novaPalavraChave}
                  onChange={e => setNovaPalavraChave(e.target.value)}
                  placeholder="Ex: cobrança, boleto, pagamento"
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label>Instância WhatsApp</Label>
              <Select value={novaInstanciaId} onValueChange={setNovaInstanciaId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as instâncias</SelectItem>
                  {instancias.map((i: any) => (
                    <SelectItem key={i.id} value={i.id.toString()}>{i.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalCriar(false)}>Cancelar</Button>
            <Button onClick={criarFluxo} disabled={!novoNome.trim() || criarMutation.isPending}>
              {criarMutation.isPending ? "Criando..." : "Criar Fluxo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
