import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ExternalLink,
  Send,
  Trash2,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { TarefaFormDialog } from "./TarefaFormDialog";
import { useTrabalhoCache } from "./useTrabalhoCache";
import {
  STATUS_LABEL,
  STATUS_COR,
  PRIORIDADE_LABEL,
  ACAO_LABEL,
  acoesDisponiveis,
  exigeTexto,
  formatarPrazo,
  formatarDataHora,
  POLLING_TRABALHO,
  type TarefaTrabalho,
  type AcaoTarefa,
} from "./trabalho";

function AlteracoesEvento({
  antes,
  depois,
}: {
  antes?: string | null;
  depois?: string | null;
}) {
  const labels: Record<string, string> = {
    status: "Estado",
    responsavelId: "Responsável (ID)",
    responsavelNome: "Responsável",
    titulo: "Título",
    descricao: "Descrição",
    prioridade: "Prioridade",
    prazo: "Prazo interno",
    exigeRevisao: "Exige revisão",
    bloqueada: "Bloqueada",
    motivoBloqueio: "Motivo do impedimento",
    entrega: "Entrega",
  };
  try {
    const a = antes ? JSON.parse(antes) : {};
    const d = depois ? JSON.parse(depois) : {};
    if (!a || !d || typeof a !== "object" || typeof d !== "object") return null;
    const keys = Object.keys(labels).filter(
      k => JSON.stringify(a[k]) !== JSON.stringify(d[k]) && (k in a || k in d)
    );
    const valor = (v: unknown) =>
      v == null
        ? "Não informado"
        : typeof v === "string" && v in STATUS_LABEL
          ? STATUS_LABEL[v as keyof typeof STATUS_LABEL]
          : String(v);
    return keys.length ? (
      <dl className="mt-2 space-y-1 text-xs text-slate-500">
        {keys.map(k => (
          <div key={k}>
            <dt className="inline font-medium">{labels[k]}: </dt>
            <dd className="inline break-words">
              {valor(a[k])} → {valor(d[k])}
            </dd>
          </div>
        ))}
      </dl>
    ) : null;
  } catch {
    return null;
  }
}

export function TarefaPainel({
  tarefaId,
  onClose,
}: {
  tarefaId: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const invalidar = useTrabalhoCache();
  const [comentario, setComentario] = useState("");
  const [acao, setAcao] = useState<{
    nome: AcaoTarefa;
    versao?: number;
  } | null>(null);
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState(false);
  const [excluirComentario, setExcluirComentario] = useState<number | null>(
    null
  );
  const [historicoOffset, setHistoricoOffset] = useState(0);
  const historicoLimit = 50;
  const detalhe = trpc.juridicoDemandas.tarefas.getById.useQuery(
    { id: tarefaId },
    POLLING_TRABALHO
  );
  const escopo = trpc.juridicoEquipes.minhas.useQuery(
    undefined,
    POLLING_TRABALHO
  );
  const autorizado = !!detalhe.data && !detalhe.isError;
  const comentarios = trpc.juridicoDemandas.tarefas.getComentarios.useQuery(
    { tarefaId },
    { ...POLLING_TRABALHO, enabled: autorizado }
  );
  const historico = trpc.juridicoDemandas.tarefas.getHistorico.useQuery(
    { tarefaId, limit: historicoLimit, offset: historicoOffset },
    { ...POLLING_TRABALHO, enabled: autorizado }
  );
  const comando = trpc.juridicoDemandas.tarefas.comando.useMutation({
    onSuccess: async () => {
      toast.success("Ação registrada na tarefa");
      setAcao(null);
      setTexto("");
      await invalidar();
    },
    onError: async e => {
      toast.error(e.message);
      await invalidar();
    },
  });
  const adicionar = trpc.juridicoDemandas.tarefas.addComentario.useMutation({
    onSuccess: async () => {
      setComentario("");
      toast.success("Comentário registrado");
      await invalidar();
    },
    onError: async e => {
      toast.error(e.message);
      await invalidar();
    },
  });
  const ocultar = trpc.juridicoDemandas.tarefas.deleteComentario.useMutation({
    onSuccess: async () => {
      setExcluirComentario(null);
      toast.success("Comentário ocultado; histórico preservado");
      await invalidar();
    },
    onError: async e => {
      toast.error(e.message);
      await invalidar();
    },
  });
  const t = autorizado ? (detalhe.data!.tarefa as TarefaTrabalho) : null;
  const d = autorizado ? detalhe.data!.demanda : null;
  const gerencia =
    autorizado &&
    !!detalhe.data!.canManage &&
    !!escopo.data?.canEdit &&
    !escopo.isError;
  const aprovar = autorizado && !!detalhe.data!.canApprove && !escopo.isError;
  const acoes = t ? acoesDisponiveis(t, user?.id ?? 0, gerencia, aprovar) : [];
  const editavel = !!t && gerencia && t.status !== "cancelada";
  const precisaTexto = !!t && !!acao && exigeTexto(acao.nome, t);
  const contexto = d as {
    id: number;
    numero?: string | null;
    assunto?: string | null;
    condominioNome?: string | null;
    equipeId?: number | null;
    acessoCompleto?: boolean;
  } | null;
  return (
    <Sheet
      open
      onOpenChange={open => {
        if (
          !open &&
          !comando.isPending &&
          !adicionar.isPending &&
          !ocultar.isPending
        )
          onClose();
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-xl overflow-hidden bg-white">
        <SheetHeader className="border-b border-slate-200 pr-10">
          <SheetTitle className="text-slate-900">
            {t?.titulo ?? "Tarefa jurídica"}
          </SheetTitle>
          <SheetDescription>
            Trabalhe nesta atividade sem alterar ou encerrar o caso jurídico.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {detalhe.isLoading && (
            <p role="status" className="text-sm text-slate-500">
              Carregando tarefa…
            </p>
          )}
          {detalhe.isError && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
            >
              <p>{detalhe.error.message}</p>
              <p className="mt-1 text-xs">
                A tarefa pode ter sido reatribuída ou seu acesso alterado. Os
                dados anteriores não são exibidos.
              </p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => detalhe.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          )}
          {t && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={STATUS_COR[t.status]}>
                  {STATUS_LABEL[t.status]}
                </Badge>
                <Badge variant="outline">
                  Prioridade {PRIORIDADE_LABEL[t.prioridade]}
                </Badge>
                {!!t.exigeRevisao && (
                  <Badge
                    variant="outline"
                    className="text-amber-800 border-amber-200"
                  >
                    Entrega com revisão
                  </Badge>
                )}
                <span className="ml-auto text-xs text-slate-500">
                  Versão {t.versao ?? "legada"}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm">
                <p className="font-medium text-slate-800">
                  {contexto?.numero ?? `Demanda #${t.demandaId}`} ·{" "}
                  {contexto?.assunto ?? "Contexto autorizado"}
                </p>
                {contexto?.condominioNome && (
                  <p className="text-xs text-slate-600">
                    {contexto.condominioNome}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  Receber esta tarefa não concede acesso a documentos,
                  financeiro ou edição da demanda.
                </p>
                {contexto?.acessoCompleto === true && (
                  <Link
                    href={`/admin/juridico/demanda/${t.demandaId}`}
                    className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline"
                  >
                    Ver demanda <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
                {contexto?.acessoCompleto !== true && (
                  <p className="text-xs text-slate-500">
                    Contexto mínimo disponível neste painel. Acesso completo
                    depende do vínculo ao caso.
                  </p>
                )}
                {contexto && contexto.equipeId == null && (
                  <p className="text-xs text-amber-800">
                    Demanda sem equipe explícita. Solicite configuração
                    administrativa para delegar a outro membro.
                  </p>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">
                    Responsável pela tarefa
                  </dt>
                  <dd className="mt-1 text-slate-800">
                    {t.responsavelNome || "Sem responsável"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Prazo interno</dt>
                  <dd className="mt-1 text-slate-800">
                    {formatarPrazo(t.prazo)}
                  </dd>
                </div>
              </dl>
              {t.descricao && (
                <p className="whitespace-pre-wrap break-words text-sm text-slate-700">
                  {t.descricao}
                </p>
              )}
              {!!t.bloqueada && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Impedimento informado
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">
                    {t.motivoBloqueio || "Consulte o histórico"}
                  </p>
                </div>
              )}
              {t.entrega && (
                <section className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                  <h3 className="text-xs font-semibold text-indigo-800">
                    Registro da entrega
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {t.entrega}
                  </p>
                </section>
              )}
              {t.status === "concluida" && !t.aprovadaEm && (
                <p className="text-xs text-slate-500">
                  Conclusão sem aprovação registrada (revisão não exigida ou
                  registro legado). Nenhuma aprovação retroativa foi presumida.
                </p>
              )}
              <section
                aria-label="Ações da tarefa"
                className="flex flex-wrap gap-2"
              >
                {acoes.map(nome => (
                  <Button
                    key={nome}
                    size="sm"
                    variant={
                      nome === "iniciar" ||
                      nome === "entregar" ||
                      nome === "aprovar"
                        ? "default"
                        : "outline"
                    }
                    disabled={comando.isPending || detalhe.isFetching}
                    className={nome === "cancelar" ? "text-rose-700" : ""}
                    onClick={() => {
                      setAcao({ nome, versao: t.versao });
                      setTexto("");
                    }}
                  >
                    {nome === "entregar" && !t.exigeRevisao
                      ? "Concluir tarefa"
                      : ACAO_LABEL[nome]}
                  </Button>
                ))}
                {editavel && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditando(true)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Editar / atribuir
                  </Button>
                )}
              </section>
              <Tabs defaultValue="comentarios">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="comentarios">Comentários</TabsTrigger>
                  <TabsTrigger value="historico">Histórico</TabsTrigger>
                </TabsList>
                <TabsContent value="comentarios" className="space-y-3">
                  {comentarios.isLoading && (
                    <p className="text-xs text-slate-500">
                      Carregando comentários…
                    </p>
                  )}
                  {comentarios.isError && (
                    <p role="alert" className="text-sm text-rose-700">
                      {comentarios.error.message}
                    </p>
                  )}
                  {!comentarios.isError &&
                    (comentarios.data ?? [])
                      .filter(c => !c.oculto)
                      .map(c => (
                        <article
                          key={c.id}
                          className="rounded-lg border border-slate-200 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-slate-700">
                                {c.autorNome || "Autor não informado"}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {formatarDataHora(c.createdAt)}
                              </p>
                            </div>
                            {(c.autorId === user?.id ||
                              user?.role === "admin") && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-slate-500"
                                aria-label="Ocultar comentário"
                                onClick={() => setExcluirComentario(c.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                            {c.texto}
                          </p>
                        </article>
                      ))}
                  {!comentarios.isError &&
                    !comentarios.isLoading &&
                    !comentarios.data?.length && (
                      <p className="py-3 text-xs text-slate-500">
                        Nenhum comentário registrado.
                      </p>
                    )}
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      if (comentario.trim())
                        adicionar.mutate({
                          tarefaId,
                          texto: comentario.trim(),
                          versao: t.versao,
                        });
                    }}
                    className="space-y-2"
                  >
                    <label className="block space-y-1 text-xs font-medium text-slate-600">
                      Registrar andamento ou comentário
                      <Textarea
                        maxLength={2000}
                        value={comentario}
                        onChange={e => setComentario(e.target.value)}
                        rows={3}
                        placeholder="Descreva o andamento ou uma observação…"
                      />
                    </label>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        !comentario.trim() ||
                        adicionar.isPending ||
                        comentarios.isError ||
                        t.status === "cancelada"
                      }
                    >
                      <Send className="mr-1 h-3.5 w-3.5" />
                      {adicionar.isPending
                        ? "Enviando…"
                        : "Registrar comentário"}
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="historico" className="space-y-3">
                  {historico.isLoading && (
                    <p className="text-xs text-slate-500">
                      Carregando histórico…
                    </p>
                  )}
                  {historico.isError && (
                    <p role="alert" className="text-sm text-rose-700">
                      {historico.error.message}
                    </p>
                  )}
                  {!historico.isError &&
                    (historico.data?.eventos ?? []).map(e => (
                      <article
                        key={e.id}
                        className="rounded-lg border border-slate-200 p-3"
                      >
                        <p className="text-xs font-semibold text-slate-700">
                          {e.usuarioNome || "Autor não informado"} ·{" "}
                          {formatarDataHora(e.createdAt)}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                          {e.descricao}
                        </p>
                        <AlteracoesEvento
                          antes={e.antesJson}
                          depois={e.depoisJson}
                        />
                      </article>
                    ))}
                  {!historico.isError &&
                    !historico.isLoading &&
                    !historico.data?.eventos.length && (
                      <p className="py-3 text-xs text-slate-500">
                        Nenhum evento registrado nesta tarefa legada.
                      </p>
                    )}
                  {!historico.isError && !!historico.data?.total && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        {historico.data.total} evento(s) · página{" "}
                        {Math.floor(historicoOffset / historicoLimit) + 1}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!historicoOffset || historico.isFetching}
                          onClick={() =>
                            setHistoricoOffset(v =>
                              Math.max(0, v - historicoLimit)
                            )
                          }
                        >
                          Anteriores
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            historico.isFetching ||
                            historicoOffset + historicoLimit >=
                              historico.data.total
                          }
                          onClick={() =>
                            setHistoricoOffset(v => v + historicoLimit)
                          }
                        >
                          Mais antigos
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
              <p className="text-[11px] text-slate-500">
                Atualização automática a cada 30 segundos enquanto esta tela
                estiver em primeiro plano.
              </p>
            </>
          )}
        </div>
        <Dialog
          open={!!acao && !!t}
          onOpenChange={open => {
            if (!open && !comando.isPending) setAcao(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {acao ? ACAO_LABEL[acao.nome] : "Ação da tarefa"}
              </DialogTitle>
              <DialogDescription>
                {acao?.nome === "entregar"
                  ? t?.exigeRevisao
                    ? "A entrega irá para revisão. Descreva o resultado para o revisor."
                    : "A tarefa será concluída, sem encerrar a demanda ou o prazo jurídico."
                  : acao?.nome === "cancelar"
                    ? "O cancelamento preserva comentários e histórico. Informe o motivo."
                    : "Esta ação será registrada no histórico da mesma tarefa."}
              </DialogDescription>
            </DialogHeader>
            <label className="block space-y-1 text-sm text-slate-600">
              {precisaTexto ? "Descrição / motivo *" : "Observação (opcional)"}
              <Textarea
                value={texto}
                maxLength={2000}
                onChange={e => setTexto(e.target.value)}
                rows={4}
              />
            </label>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={comando.isPending}
                onClick={() => setAcao(null)}
              >
                Voltar
              </Button>
              <Button
                disabled={
                  comando.isPending ||
                  (precisaTexto && !texto.trim()) ||
                  !t ||
                  !acao ||
                  !acoes.includes(acao.nome)
                }
                onClick={() => {
                  if (acao && t)
                    comando.mutate({
                      id: tarefaId,
                      acao: acao.nome,
                      texto: texto.trim() || undefined,
                      versao: acao.versao,
                    });
                }}
              >
                {comando.isPending ? "Registrando…" : "Confirmar ação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={excluirComentario != null && !!t}
          onOpenChange={open => {
            if (!open && !ocultar.isPending) setExcluirComentario(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ocultar comentário?</DialogTitle>
              <DialogDescription>
                O comentário será ocultado na conversa, sem exclusão do registro
                de auditoria.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={ocultar.isPending}
                onClick={() => setExcluirComentario(null)}
              >
                Voltar
              </Button>
              <Button
                disabled={ocultar.isPending}
                onClick={() => {
                  if (excluirComentario)
                    ocultar.mutate({
                      id: excluirComentario,
                      versao: t?.versao,
                    });
                }}
              >
                Ocultar comentário
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {editando && t && (
          <TarefaFormDialog
            open
            onOpenChange={setEditando}
            tarefa={t}
            canManage={gerencia}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
