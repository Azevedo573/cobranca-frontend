import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CampoSelect } from "./CampoSelect";
import { useTrabalhoCache } from "./useTrabalhoCache";
import {
  diaPrazo,
  PRIORIDADE_LABEL,
  POLLING_TRABALHO,
  type Prioridade,
  type TarefaTrabalho,
} from "./trabalho";

export function TarefaFormDialog({
  open,
  onOpenChange,
  demandaId,
  tarefa,
  canManage,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  demandaId?: number;
  tarefa?: TarefaTrabalho;
  canManage: boolean;
  onCreated?: (id: number) => void;
}) {
  // O pai monta uma nova instância a cada abertura; o rascunho não é substituído por polling.
  const { user } = useAuth();
  const invalidar = useTrabalhoCache();
  const [original] = useState(tarefa);
  const [contextoId, setContextoId] = useState(
    String(tarefa?.demandaId ?? demandaId ?? "")
  );
  const [busca, setBusca] = useState("");
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? "");
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? "");
  const [responsavelId, setResponsavelId] = useState(
    String(tarefa?.responsavelId ?? (!canManage ? user?.id : "") ?? "")
  );
  const [prioridade, setPrioridade] = useState<Prioridade>(
    tarefa?.prioridade ?? "media"
  );
  const [prazo, setPrazo] = useState(diaPrazo(tarefa?.prazo) ?? "");
  const [exigeRevisao, setExigeRevisao] = useState(!!tarefa?.exigeRevisao);
  const demandas = trpc.juridicoDemandas.listar.useQuery(undefined, {
    ...POLLING_TRABALHO,
    enabled: open && !demandaId && !tarefa,
  });
  const elegiveis =
    trpc.juridicoDemandas.tarefas.responsaveisElegiveis.useQuery(
      { demandaId: Number(contextoId) },
      { ...POLLING_TRABALHO, enabled: open && canManage && !!contextoId }
    );
  const create = trpc.juridicoDemandas.tarefas.create.useMutation({
    onSuccess: async result => {
      toast.success("Tarefa criada");
      onOpenChange(false);
      await invalidar();
      onCreated?.(result.id);
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.juridicoDemandas.tarefas.update.useMutation({
    onSuccess: async () => {
      toast.success("Tarefa atualizada");
      onOpenChange(false);
      await invalidar();
    },
    onError: async e => {
      toast.error(e.message);
      await invalidar();
    },
  });
  const ocupada = create.isPending || update.isPending;
  const lista = demandas.isError ? [] : (demandas.data ?? []);
  const selecionada = lista.find(d => d.id === Number(contextoId));
  const salvar = () => {
    if (!titulo.trim() || !contextoId) return;
    if (original)
      update.mutate({
        id: original.id,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        ...(responsavelId !== String(original.responsavelId ?? "")
          ? { responsavelId: responsavelId ? Number(responsavelId) : null }
          : {}),
        ...(prioridade !== original.prioridade ? { prioridade } : {}),
        ...(prazo !== (diaPrazo(original.prazo) ?? "")
          ? { prazo: prazo ? `${prazo}T12:00:00` : null }
          : {}),
        ...(exigeRevisao !== !!original.exigeRevisao ? { exigeRevisao } : {}),
        versao: original.versao,
      });
    else
      create.mutate({
        demandaId: Number(contextoId),
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        responsavelId: responsavelId ? Number(responsavelId) : undefined,
        prioridade,
        prazo: prazo ? `${prazo}T12:00:00` : undefined,
        exigeRevisao: canManage ? exigeRevisao : false,
      });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        if (!ocupada) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tarefa ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          <DialogDescription>
            Atividade vinculada a uma demanda existente. Não altera o
            responsável nem o prazo jurídico do caso.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            salvar();
          }}
        >
          {!demandaId && !tarefa && (
            <div className="space-y-2">
              <label className="block space-y-1 text-xs font-medium text-slate-600">
                Buscar demanda acessível
                <Input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Número ou assunto"
                />
              </label>
              <CampoSelect
                label="Demanda existente *"
                value={contextoId}
                onChange={id => {
                  setContextoId(id);
                  setResponsavelId(!canManage && user ? String(user.id) : "");
                }}
              >
                <option value="">Selecione uma demanda</option>
                {lista
                  .filter(
                    d =>
                      `${d.numero} ${d.assunto}`
                        .toLocaleLowerCase("pt-BR")
                        .includes(busca.toLocaleLowerCase("pt-BR")) ||
                      d.id === Number(contextoId)
                  )
                  .map(d => (
                    <option key={d.id} value={d.id}>
                      {d.numero} · {d.assunto}
                    </option>
                  ))}
              </CampoSelect>
              {demandas.isLoading && (
                <p className="text-xs text-slate-500">
                  Carregando demandas autorizadas…
                </p>
              )}
              {demandas.isError && (
                <p role="alert" className="text-xs text-rose-700">
                  {demandas.error.message}
                </p>
              )}
              {!demandas.isLoading &&
                !demandas.isError &&
                lista.length === 0 && (
                  <p className="text-xs text-slate-600">
                    Nenhuma demanda acessível. Solicite um vínculo ao
                    administrador; não é necessário criar um caso fictício.
                  </p>
                )}
              {selecionada &&
                !(selecionada as { equipeId?: number | null }).equipeId && (
                  <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                    Demanda sem equipe explícita. A delegação a outra pessoa
                    depende de configuração e vínculo pelo administrador.
                  </p>
                )}
            </div>
          )}
          {(demandaId || tarefa) && (
            <p className="text-xs text-slate-600">
              Contexto: demanda #{tarefa?.demandaId ?? demandaId}
            </p>
          )}
          <label className="block space-y-1 text-xs font-medium text-slate-600">
            Título *
            <Input
              required
              maxLength={255}
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ex.: Preparar minuta da manifestação"
            />
          </label>
          <label className="block space-y-1 text-xs font-medium text-slate-600">
            Descrição
            <Textarea
              rows={3}
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
            />
          </label>
          {canManage ? (
            <>
              <CampoSelect
                label="Responsável elegível"
                value={responsavelId}
                disabled={
                  !contextoId ||
                  elegiveis.isLoading ||
                  elegiveis.isError ||
                  original?.status === "em_revisao"
                }
                onChange={setResponsavelId}
              >
                <option value="">Sem responsável</option>
                {(elegiveis.isError ? [] : (elegiveis.data ?? [])).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name || `Usuário #${p.id}`}
                  </option>
                ))}
                {tarefa?.responsavelId &&
                  !(elegiveis.data ?? []).some(
                    p => p.id === tarefa.responsavelId
                  ) && (
                    <option value={tarefa.responsavelId} disabled>
                      {tarefa.responsavelNome || "Responsável atual"} (verificar
                      elegibilidade)
                    </option>
                  )}
              </CampoSelect>
              {elegiveis.isError && (
                <p className="text-xs text-rose-700" role="alert">
                  {elegiveis.error.message}
                </p>
              )}
            </>
          ) : (
            <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">
              Responsável: você. Redistribuição de tarefas é uma ação gerencial.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <CampoSelect
              label="Prioridade"
              value={prioridade}
              onChange={v => setPrioridade(v as Prioridade)}
            >
              {Object.entries(PRIORIDADE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </CampoSelect>
            <label className="block space-y-1 text-xs font-medium text-slate-600">
              Prazo interno
              <Input
                type="date"
                value={prazo}
                onChange={e => setPrazo(e.target.value)}
              />
            </label>
          </div>
          {!prazo && (
            <p className="text-xs text-amber-800">
              Sem prazo: esta tarefa não aparecerá nos atalhos de vencimento.
            </p>
          )}
          {canManage && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={exigeRevisao}
                disabled={
                  original?.status === "em_revisao" ||
                  original?.status === "concluida"
                }
                onChange={e => setExigeRevisao(e.target.checked)}
                className="mt-1 accent-indigo-600"
              />
              <span>
                Exigir revisão da entrega
                <span className="block text-xs text-slate-500">
                  Opcional por tarefa; não é aplicada automaticamente pelo
                  perfil.
                </span>
              </span>
            </label>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={ocupada}
              onClick={() => onOpenChange(false)}
            >
              Voltar
            </Button>
            <Button
              type="submit"
              disabled={
                ocupada ||
                !titulo.trim() ||
                !contextoId ||
                (canManage && elegiveis.isError)
              }
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {ocupada
                ? "Salvando…"
                : tarefa
                  ? "Salvar alterações"
                  : "Criar tarefa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
