import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ListTodo,
  Kanban,
  Plus,
  Settings2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { CampoSelect } from "@/components/juridico/CampoSelect";
import { TarefaColecao } from "@/components/juridico/TarefaCards";
import { TarefaPainel } from "@/components/juridico/TarefaPainel";
import { TarefaFormDialog } from "@/components/juridico/TarefaFormDialog";
import { EquipeConfigDialog } from "@/components/juridico/EquipeConfigDialog";
import {
  ESTADOS,
  STATUS_LABEL,
  PRIORIDADE_LABEL,
  PERIODO_LABEL,
  POLLING_TRABALHO,
  filtrarTarefas,
  indicadoresTarefas,
  type EstadoTarefa,
  type Prioridade,
  type Periodo,
  type TarefaTrabalho,
} from "@/components/juridico/trabalho";

export default function MinhasTarefas() {
  const { user } = useAuth();
  const [aba, setAba] = useState<"minhas" | "equipe">("minhas");
  const [visao, setVisao] = useState<"lista" | "kanban">("lista");
  const [periodo, setPeriodo] = useState<Periodo>("todas");
  const [status, setStatus] = useState<EstadoTarefa | "todas">("todas");
  const [prioridade, setPrioridade] = useState<Prioridade | "todas">("todas");
  const [condominioId, setCondominioId] = useState("");
  const [demandaId, setDemandaId] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [busca, setBusca] = useState("");
  const [offset, setOffset] = useState(0);
  const limite = 100;
  const [tarefaId, setTarefaId] = useState<number | null>(null);
  const [criando, setCriando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const juridico =
    !!user && ["admin", "advogado", "colaborador"].includes(user.role);
  const permissoes = trpc.juridicoEquipes.minhas.useQuery(undefined, {
    ...POLLING_TRABALHO,
    enabled: juridico,
  });
  const canManage = !permissoes.isError && !!permissoes.data?.canManage;
  const equipe = aba === "equipe" && canManage;
  const input = {
    status,
    prioridade,
    condominioId: condominioId ? Number(condominioId) : undefined,
    demandaId: demandaId ? Number(demandaId) : undefined,
  };
  const minhas = trpc.juridicoDemandas.tarefas.minhasTarefas.useQuery(input, {
    ...POLLING_TRABALHO,
    enabled: juridico && !equipe && !!permissoes.data && !permissoes.isError,
  });
  const daEquipe = trpc.juridicoDemandas.tarefas.listarEquipe.useQuery(
    {
      ...input,
      limit: limite,
      offset,
      responsavelId:
        responsavelId && responsavelId !== "sem"
          ? Number(responsavelId)
          : undefined,
    },
    { ...POLLING_TRABALHO, enabled: equipe }
  );
  // Não usar placeholderData/keepPreviousData nem uma cópia local dos cartões.
  const query = equipe ? daEquipe : minhas;
  const rows = useMemo(
    () =>
      query.isError || permissoes.isError
        ? []
        : ((equipe
            ? (daEquipe.data?.tarefas ?? [])
            : (minhas.data ?? [])) as TarefaTrabalho[]),
    [equipe, daEquipe.data, minhas.data, query.isError, permissoes.isError]
  );
  const filtradas = useMemo(
    () =>
      filtrarTarefas(rows, {
        periodo,
        status,
        prioridade,
        condominioId,
        demandaId,
        responsavelId: equipe ? responsavelId : "",
        busca,
      }),
    [
      rows,
      periodo,
      status,
      prioridade,
      condominioId,
      demandaId,
      responsavelId,
      equipe,
      busca,
    ]
  );
  const indicadores = indicadoresTarefas(filtradas);
  const condominios = Array.from(
    new Map(
      rows
        .filter(t => t.demandaCondominioId)
        .map(t => [
          String(t.demandaCondominioId),
          t.demandaCondominioNome || `Condomínio #${t.demandaCondominioId}`,
        ])
    ).entries()
  );
  const demandas = Array.from(
    new Map(
      rows.map(t => [
        String(t.demandaId),
        `${t.demandaNumero || `#${t.demandaId}`} · ${t.demandaAssunto || "Demanda"}`,
      ])
    ).entries()
  );
  const pessoas = Array.from(
    new Map(
      rows
        .filter(t => t.responsavelId)
        .map(t => [
          String(t.responsavelId),
          t.responsavelNome || `Usuário #${t.responsavelId}`,
        ])
    ).entries()
  );
  useEffect(() => {
    if (!canManage) setAba("minhas");
  }, [canManage]);
  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(`juridico-visao-${user.id}`);
      if (saved === "lista" || saved === "kanban") setVisao(saved);
    } catch {
      /* armazenamento opcional */
    }
  }, [user?.id]);
  const mudarVisao = (v: "lista" | "kanban") => {
    setVisao(v);
    try {
      localStorage.setItem(`juridico-visao-${user?.id}`, v);
    } catch {
      /* armazenamento opcional */
    }
  };
  const limpar = () => {
    setStatus("todas");
    setPrioridade("todas");
    setCondominioId("");
    setDemandaId("");
    setResponsavelId("");
    setPeriodo("todas");
    setBusca("");
    setOffset(0);
  };
  const erro = permissoes.error || query.error;
  const carregando = permissoes.isLoading || query.isLoading;
  return (
    <div className="min-h-full bg-slate-50/60 p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 md:text-2xl">
            <ListTodo className="h-6 w-6 text-indigo-600" />
            Central de Trabalho Jurídico
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Uma tarefa, um histórico. Seu trabalho diário no contexto das
            demandas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user?.role === "admin" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfigurando(true)}
            >
              <Settings2 className="mr-1.5 h-4 w-4" />
              Configurar equipe
            </Button>
          )}
          {!permissoes.isError && permissoes.data?.canCreate && (
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => setCriando(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Nova tarefa
            </Button>
          )}
        </div>
      </header>
      {!juridico ? (
        <div
          role="status"
          className="rounded-xl border border-slate-200 bg-white p-6"
        >
          <h2 className="font-semibold text-slate-800">
            Central disponível aos perfis jurídicos autorizados
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Este perfil não tem uma carteira de tarefas jurídicas. Solicite ao
            administrador um perfil e os vínculos necessários, se sua função
            exigir esse acesso.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={equipe ? "equipe" : "minhas"}
              onValueChange={v => {
                setAba(v as "minhas" | "equipe");
                setOffset(0);
                setResponsavelId("");
              }}
            >
              <TabsList>
                <TabsTrigger value="minhas">Minhas Tarefas</TabsTrigger>
                {canManage && <TabsTrigger value="equipe">Equipe</TabsTrigger>}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <div
                className="flex rounded-lg border border-slate-200 bg-white p-0.5"
                aria-label="Visualização"
              >
                {(["lista", "kanban"] as const).map(v => (
                  <Button
                    key={v}
                    size="sm"
                    variant={visao === v ? "secondary" : "ghost"}
                    aria-pressed={visao === v}
                    onClick={() => mudarVisao(v)}
                  >
                    {v === "lista" ? (
                      <ListTodo className="mr-1 h-4 w-4" />
                    ) : (
                      <Kanban className="mr-1 h-4 w-4" />
                    )}
                    {v === "lista" ? "Lista" : "Kanban"}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Atualizar tarefas e permissões"
                disabled={query.isFetching}
                onClick={() => {
                  permissoes.refetch();
                  query.refetch();
                }}
              >
                <RefreshCw
                  className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>
          {!permissoes.isError &&
            permissoes.data &&
            permissoes.data.equipes.length === 0 &&
            user?.role !== "admin" && (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p>
                  Você ainda não está vinculado a uma equipe jurídica. Suas
                  tarefas legadas autorizadas continuam disponíveis. Delegação e
                  visão da equipe exigem configuração explícita pelo
                  administrador.
                </p>
              </div>
            )}
          {equipe && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Sem responsável", indicadores.semResponsavel],
                ["Atrasadas", indicadores.atrasadas],
                ["Vencem hoje", indicadores.hoje],
                ["Em revisão", indicadores.revisao],
              ].map(([label, valor]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-800">
                    {valor}
                  </p>
                </div>
              ))}
            </div>
          )}
          <section
            aria-label="Filtros de tarefas"
            className="rounded-xl border border-slate-200 bg-white p-3 space-y-3"
          >
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(PERIODO_LABEL).map(([v, l]) => (
                <Button
                  key={v}
                  variant={periodo === v ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={periodo === v}
                  onClick={() => {
                    setPeriodo(v as Periodo);
                    setOffset(0);
                  }}
                >
                  {l}
                </Button>
              ))}
              <p className="self-center text-[11px] text-slate-500 ml-auto">
                Prazos internos · 7 dias inclui hoje
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <CampoSelect
                label="Estado"
                value={status}
                onChange={v => {
                  setStatus(v as EstadoTarefa | "todas");
                  setOffset(0);
                }}
              >
                <option value="todas">Todos os estados ativos</option>
                {[...ESTADOS, "cancelada" as const].map(s => (
                  <option key={s} value={s}>
                    {s === "cancelada"
                      ? "Canceladas (histórico)"
                      : STATUS_LABEL[s]}
                  </option>
                ))}
              </CampoSelect>
              <CampoSelect
                label="Prioridade"
                value={prioridade}
                onChange={v => {
                  setPrioridade(v as Prioridade | "todas");
                  setOffset(0);
                }}
              >
                <option value="todas">Todas</option>
                {Object.entries(PRIORIDADE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </CampoSelect>
              <CampoSelect
                label="Condomínio"
                value={condominioId}
                onChange={v => {
                  setCondominioId(v);
                  setOffset(0);
                }}
              >
                <option value="">Todos autorizados</option>
                {condominios.map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
                {condominioId &&
                  !condominios.some(([id]) => id === condominioId) && (
                    <option value={condominioId}>
                      Condomínio selecionado #{condominioId}
                    </option>
                  )}
              </CampoSelect>
              <CampoSelect
                label="Demanda"
                value={demandaId}
                onChange={v => {
                  setDemandaId(v);
                  setOffset(0);
                }}
              >
                <option value="">Todas autorizadas</option>
                {demandas.map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
                {demandaId && !demandas.some(([id]) => id === demandaId) && (
                  <option value={demandaId}>
                    Demanda selecionada #{demandaId}
                  </option>
                )}
              </CampoSelect>
              {equipe && (
                <CampoSelect
                  label="Responsável"
                  value={responsavelId}
                  onChange={v => {
                    setResponsavelId(v);
                    setOffset(0);
                  }}
                >
                  <option value="">Todos da equipe autorizada</option>
                  <option value="sem">Sem responsável (página)</option>
                  {pessoas.map(([id, nome]) => (
                    <option key={id} value={id}>
                      {nome}
                    </option>
                  ))}
                  {responsavelId &&
                    responsavelId !== "sem" &&
                    !pessoas.some(([id]) => id === responsavelId) && (
                      <option value={responsavelId}>
                        Responsável selecionado #{responsavelId}
                      </option>
                    )}
                </CampoSelect>
              )}
              <label className="block space-y-1 text-xs font-medium text-slate-600">
                Buscar tarefa
                <Input
                  value={busca}
                  onChange={e => {
                    setBusca(e.target.value);
                    setOffset(0);
                  }}
                  placeholder="Título ou contexto"
                  className="h-9"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {filtradas.length} tarefa(s) visível(is).{" "}
                {equipe
                  ? "Contadores, busca e atalhos de prazo consideram somente esta página filtrada, não a equipe inteira."
                  : "Contadores e atalhos consideram os filtros atuais."}
              </p>
              <Button variant="ghost" size="sm" onClick={limpar}>
                Limpar filtros
              </Button>
            </div>
          </section>
          {erro ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"
            >
              <p>{erro.message}</p>
              <p className="mt-1 text-xs">
                Verifique suas permissões e vínculos. Nenhum dado do filtro
                anterior é exibido.
              </p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => {
                  permissoes.refetch();
                  query.refetch();
                }}
              >
                Tentar novamente
              </Button>
            </div>
          ) : carregando ? (
            <div
              className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500"
              role="status"
            >
              Carregando tarefas autorizadas…
            </div>
          ) : (
            <>
              {!filtradas.length && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                  <ListTodo className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <h2 className="text-sm font-semibold text-slate-800">
                    Nenhuma tarefa neste recorte
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Altere os filtros ou aguarde uma atribuição. Nenhum cartão
                    anterior foi mantido.
                  </p>
                </div>
              )}
              {(filtradas.length > 0 || visao === "kanban") && (
                <TarefaColecao
                  tarefas={filtradas}
                  visao={visao}
                  onOpen={setTarefaId}
                />
              )}
            </>
          )}
          {equipe && !erro && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Página {Math.floor(offset / limite) + 1} ·{" "}
                {daEquipe.data?.total ?? 0} registros no filtro do servidor
                (antes dos atalhos de prazo, busca e sem responsável).
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!offset || query.isFetching}
                  onClick={() => setOffset(v => Math.max(0, v - limite))}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    query.isFetching ||
                    offset + limite >= (daEquipe.data?.total ?? 0)
                  }
                  onClick={() => setOffset(v => v + limite)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
          <p className="text-[11px] text-slate-500">
            Atualização automática a cada 30 segundos em primeiro plano.
            Quantidade de tarefas não mede esforço ou qualidade. Para mudar o
            estado, abra o cartão e use os comandos acessíveis por teclado.
          </p>
        </>
      )}
      {tarefaId != null && (
        <TarefaPainel
          key={tarefaId}
          tarefaId={tarefaId}
          onClose={() => setTarefaId(null)}
        />
      )}
      {criando && (
        <TarefaFormDialog
          open
          onOpenChange={setCriando}
          canManage={canManage && !!permissoes.data?.canCreate}
          onCreated={setTarefaId}
        />
      )}
      {configurando && user?.role === "admin" && (
        <EquipeConfigDialog onClose={() => setConfigurando(false)} />
      )}
    </div>
  );
}
