import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Bell,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Eye,
  Clock,
  FileText,
  Loader2,
  ChevronRight,
  Calendar,
  Building2,
  Users,
  AlertTriangle,
  ExternalLink,
  Tag,
} from "lucide-react";
import { Link } from "wouter";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StatusFiltro = "pendente" | "visualizado" | "tratado" | "descartado";

const STATUS_LABELS: Record<StatusFiltro, string> = {
  pendente: "Pendentes",
  visualizado: "Visualizados",
  tratado: "Tratados",
  descartado: "Descartados",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200",
  visualizado: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200",
  tratado: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200",
  descartado: "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400 border-gray-200",
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CentralIntimacoes() {
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("pendente");
  const [intimacaoSelecionadaId, setIntimacaoSelecionadaId] = useState<number | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [buscandoAvisos, setBuscandoAvisos] = useState(false);

  const utils = trpc.useUtils();

  // Contagem de pendentes (badge no menu)
  const { data: countData } = trpc.mni.countPendentes.useQuery(undefined, {
    refetchInterval: 60_000, // atualiza a cada 1 minuto
  });

  // Lista de intimações
  const { data: intimacoes, isLoading } = trpc.mni.listarIntimacoes.useQuery({
    status: statusFiltro,
    limit: 100,
  });

  // Detalhe da intimação selecionada
  const { data: intimacaoDetalhe, isLoading: carregandoDetalhe } =
    trpc.mni.getIntimacao.useQuery(
      { id: intimacaoSelecionadaId! },
      {
        enabled: intimacaoSelecionadaId !== null,
      }
    );

  // Após carregar o detalhe, invalida a lista para atualizar o status
  const [lastInvalidatedId, setLastInvalidatedId] = useState<number | null>(null);
  if (intimacaoDetalhe && intimacaoDetalhe.id !== lastInvalidatedId) {
    setLastInvalidatedId(intimacaoDetalhe.id);
    void utils.mni.listarIntimacoes.invalidate();
    void utils.mni.countPendentes.invalidate();
  }

  // Buscar teor
  const buscarTeorMutation = trpc.mni.buscarTeor.useMutation({
    onSuccess: () => {
      utils.mni.getIntimacao.invalidate({ id: intimacaoSelecionadaId! });
      toast.success("Inteiro teor carregado");
    },
    onError: (err) => toast.error(`Erro ao buscar teor: ${err.message}`),
  });

  // Tratar intimação
  const tratarMutation = trpc.mni.tratarIntimacao.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.status === "tratado" ? "Intimação concluída!" : "Intimação descartada");
      setIntimacaoSelecionadaId(null);
      setObservacoes("");
      utils.mni.listarIntimacoes.invalidate();
      utils.mni.countPendentes.invalidate();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // Buscar avisos pendentes no TJRJ
  const buscarAvisosMutation = trpc.mni.buscarAvisosPendentes.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.importados} novo(s) aviso(s) importado(s) do TJRJ`);
      utils.mni.listarIntimacoes.invalidate();
      utils.mni.countPendentes.invalidate();
    },
    onError: (err) => toast.error(`Erro ao buscar avisos: ${err.message}`),
    onSettled: () => setBuscandoAvisos(false),
  });

  const handleBuscarAvisos = () => {
    setBuscandoAvisos(true);
    buscarAvisosMutation.mutate({});
  };

  const handleSelecionar = (id: number) => {
    setIntimacaoSelecionadaId(id === intimacaoSelecionadaId ? null : id);
    setObservacoes("");
  };

  const handleTratar = (status: "tratado" | "descartado") => {
    if (!intimacaoSelecionadaId) return;
    tratarMutation.mutate({
      id: intimacaoSelecionadaId,
      status,
      observacoes: observacoes || undefined,
    });
  };

  const handleBuscarTeor = () => {
    if (!intimacaoDetalhe?.idAviso || !intimacaoSelecionadaId) return;
    buscarTeorMutation.mutate({
      id: intimacaoSelecionadaId,
      idAviso: intimacaoDetalhe.idAviso,
    });
  };

  const intimacaoAtual = intimacaoDetalhe;

  return (
    <div className="h-full flex flex-col gap-0">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-amber-500" />
          <div>
            <h1 className="text-xl font-bold">Central de Intimações</h1>
            <p className="text-sm text-muted-foreground">Avisos e intimações do TJRJ via MNI</p>
          </div>
          {(countData ?? 0) > 0 && (
            <Badge className="bg-red-500 text-white text-xs px-2 py-0.5">
              {countData} pendente{(countData ?? 0) > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        <Button
          onClick={handleBuscarAvisos}
          disabled={buscandoAvisos}
          size="sm"
          className="gap-2"
        >
          {buscandoAvisos ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Buscar Avisos no TJRJ
        </Button>
      </div>

      {/* Filtro de status */}
      <Tabs value={statusFiltro} onValueChange={(v) => { setStatusFiltro(v as StatusFiltro); setIntimacaoSelecionadaId(null); }}>
        <TabsList className="mb-4">
          {(Object.keys(STATUS_LABELS) as StatusFiltro[]).map((s) => (
            <TabsTrigger key={s} value={s} className="gap-1.5">
              {STATUS_LABELS[s]}
              {s === "pendente" && (countData ?? 0) > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {countData}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Layout de duas colunas estilo Astrea */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Coluna esquerda — lista */}
        <div className="w-[380px] flex-shrink-0 overflow-y-auto space-y-1.5 pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Carregando...
            </div>
          ) : !intimacoes?.length ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <Bell className="h-8 w-8 opacity-30" />
              <p className="text-sm">Nenhuma intimação {STATUS_LABELS[statusFiltro].toLowerCase()}</p>
            </div>
          ) : (
            intimacoes.map((intimacao) => (
              <button
                key={intimacao.id}
                onClick={() => handleSelecionar(intimacao.id)}
                className={`w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm ${
                  intimacaoSelecionadaId === intimacao.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:bg-accent/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className={`text-xs px-1.5 py-0 ${STATUS_COLORS[intimacao.status]}`}
                      >
                        {STATUS_LABELS[intimacao.status as StatusFiltro] || intimacao.status}
                      </Badge>
                      {intimacao.tipoComunicacao && (
                        <span className="text-xs text-muted-foreground truncate">
                          {intimacao.tipoComunicacao}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-mono font-medium truncate">
                      {intimacao.numeroCNJ || "Sem número"}
                    </p>
                    {intimacao.orgao && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{intimacao.orgao}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {intimacao.dataDisponibilizacao
                        ? new Date(intimacao.dataDisponibilizacao).toLocaleDateString("pt-BR")
                        : "—"}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Coluna direita — detalhe */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {!intimacaoSelecionadaId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <FileText className="h-12 w-12 opacity-20" />
              <p className="text-sm">Selecione uma intimação para ver os detalhes</p>
            </div>
          ) : carregandoDetalhe ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Carregando...
            </div>
          ) : intimacaoAtual ? (
            <div className="space-y-4">
              {/* Header do detalhe */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="outline"
                      className={`${STATUS_COLORS[intimacaoAtual.status]}`}
                    >
                      {STATUS_LABELS[intimacaoAtual.status as StatusFiltro] || intimacaoAtual.status}
                    </Badge>
                    {intimacaoAtual.tipoComunicacao && (
                      <Badge variant="secondary">{intimacaoAtual.tipoComunicacao}</Badge>
                    )}
                  </div>
                  <h2 className="text-lg font-bold font-mono">
                    {intimacaoAtual.numeroCNJ || "Sem número de processo"}
                  </h2>
                </div>

                {/* Ações */}
                {(intimacaoAtual.status === "pendente" || intimacaoAtual.status === "visualizado") && (
                  <div className="flex gap-2 flex-shrink-0">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
                          <XCircle className="h-4 w-4 mr-1" />
                          Descartar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Descartar intimação?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A intimação será marcada como descartada. Esta ação pode ser revertida manualmente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="px-6 pb-2">
                          <Label className="text-sm">Observações (opcional)</Label>
                          <Textarea
                            value={observacoes}
                            onChange={(e) => setObservacoes(e.target.value)}
                            placeholder="Motivo do descarte..."
                            className="mt-1.5 h-20"
                          />
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => handleTratar("descartado")}
                          >
                            Descartar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700">
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Concluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Concluir tratamento?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Confirme que a intimação foi tratada e registre as observações.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="px-6 pb-2">
                          <Label className="text-sm">Observações (opcional)</Label>
                          <Textarea
                            value={observacoes}
                            onChange={(e) => setObservacoes(e.target.value)}
                            placeholder="Ações tomadas, prazo gerado, etc..."
                            className="mt-1.5 h-20"
                          />
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => handleTratar("tratado")}
                          >
                            Confirmar Conclusão
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>

              {/* Metadados do processo */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Dados do Processo
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {intimacaoAtual.orgao && (
                      <>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5" />
                          Órgão
                        </div>
                        <span className="font-medium">{intimacaoAtual.orgao}</span>
                      </>
                    )}
                    {intimacaoAtual.vara && (
                      <>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5" />
                          Vara
                        </div>
                        <span className="font-medium">{intimacaoAtual.vara}</span>
                      </>
                    )}
                    {intimacaoAtual.comarca && (
                      <>
                        <span className="text-muted-foreground">Comarca</span>
                        <span className="font-medium">{intimacaoAtual.comarca}</span>
                      </>
                    )}
                    {intimacaoAtual.dataDisponibilizacao && (
                      <>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          Disponibilização
                        </div>
                        <span className="font-medium">
                          {new Date(intimacaoAtual.dataDisponibilizacao).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                      </>
                    )}
                    {intimacaoAtual.dataPublicacao && (
                      <>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          Publicação
                        </div>
                        <span className="font-medium">
                          {new Date(intimacaoAtual.dataPublicacao).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                      </>
                    )}
                    {intimacaoAtual.idAviso && (
                      <>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Tag className="h-3.5 w-3.5" />
                          ID do Aviso
                        </div>
                        <span className="font-mono text-xs">{intimacaoAtual.idAviso}</span>
                      </>
                    )}
                  </div>

                  {/* Link para o processo se existir */}
                  {intimacaoAtual.processoId && (
                    <div className="pt-2">
                      <Link
                        href={`/admin/juridico/processos/${intimacaoAtual.processoId}`}
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ver processo vinculado
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Partes */}
              {intimacaoAtual.partesJson && (() => {
                try {
                  const partes = JSON.parse(intimacaoAtual.partesJson) as Array<{
                    nome: string;
                    tipo?: string;
                    advogados?: Array<{ nome: string; oab?: string }>;
                  }>;
                  if (!partes.length) return null;
                  return (
                    <Card>
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          Partes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-3">
                        {partes.map((parte, i) => (
                          <div key={i} className="text-sm">
                            <div className="flex items-center gap-2">
                              {parte.tipo && (
                                <Badge variant="outline" className="text-xs py-0">
                                  {parte.tipo}
                                </Badge>
                              )}
                              <span className="font-medium">{parte.nome}</span>
                            </div>
                            {parte.advogados?.map((adv, j) => (
                              <div key={j} className="ml-4 mt-1 text-muted-foreground flex items-center gap-1.5">
                                <span>Advogado: {adv.nome}</span>
                                {adv.oab && (
                                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 text-xs py-0 font-mono">
                                    OAB {adv.oab}
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  );
                } catch {
                  return null;
                }
              })()}

              {/* Inteiro teor */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Inteiro Teor
                    </CardTitle>
                    {!intimacaoAtual.teor && intimacaoAtual.idAviso && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBuscarTeor}
                        disabled={buscarTeorMutation.isPending}
                        className="h-7 text-xs"
                      >
                        {buscarTeorMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Eye className="h-3 w-3 mr-1" />
                        )}
                        Carregar teor
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {intimacaoAtual.teor ? (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-md p-3 font-mono text-xs max-h-80 overflow-y-auto">
                      {intimacaoAtual.teor}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-20 text-muted-foreground gap-1.5">
                      <AlertTriangle className="h-5 w-5 opacity-40" />
                      <p className="text-xs">
                        {intimacaoAtual.idAviso
                          ? "Clique em 'Carregar teor' para buscar o inteiro teor no TJRJ"
                          : "Inteiro teor não disponível para este aviso"}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tratamento anterior */}
              {intimacaoAtual.status === "tratado" && intimacaoAtual.tratadoPorNome && (
                <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
                  <CardContent className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2 text-green-800 dark:text-green-300">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        Tratado por <strong>{intimacaoAtual.tratadoPorNome}</strong>
                        {intimacaoAtual.tratadoEm && (
                          <> em {new Date(intimacaoAtual.tratadoEm).toLocaleString("pt-BR")}</>
                        )}
                      </span>
                    </div>
                    {intimacaoAtual.observacoes && (
                      <p className="mt-2 text-muted-foreground italic">{intimacaoAtual.observacoes}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
