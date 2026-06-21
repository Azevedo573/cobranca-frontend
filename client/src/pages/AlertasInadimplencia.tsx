import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, AlertCircle, CheckCircle, Clock, FileText, RefreshCw } from "lucide-react";

type StatusAlerta = "pendente" | "em_tratativa" | "resolvido" | "ignorado";

const NIVEL_CONFIG = {
  0: { label: "1ª Parcela Não Paga", color: "bg-red-100 text-red-800 border-red-200", icon: AlertCircle, borderColor: "border-l-red-500" },
  1: { label: "Aviso Inicial", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: AlertTriangle, borderColor: "border-l-yellow-400" },
  2: { label: "Segundo Aviso", color: "bg-orange-100 text-orange-800 border-orange-200", icon: AlertTriangle, borderColor: "border-l-orange-500" },
  3: { label: "Alerta Crítico", color: "bg-red-100 text-red-800 border-red-200", icon: AlertCircle, borderColor: "border-l-red-600" },
};

const STATUS_CONFIG: Record<StatusAlerta, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-red-100 text-red-700" },
  em_tratativa: { label: "Em Tratativa", color: "bg-blue-100 text-blue-700" },
  resolvido: { label: "Resolvido", color: "bg-green-100 text-green-700" },
  ignorado: { label: "Ignorado", color: "bg-gray-100 text-gray-600" },
};

function formatMoeda(centavos: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
}

function formatData(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

export default function AlertasInadimplencia() {
  const utils = trpc.useUtils();

  const [filtroStatus, setFiltroStatus] = useState<StatusAlerta | "todos">("pendente");
  const [filtroNivel, setFiltroNivel] = useState<string>("todos");
  const [modalAlerta, setModalAlerta] = useState<{ id: number; acordoId: number } | null>(null);
  const [novoStatus, setNovoStatus] = useState<StatusAlerta>("em_tratativa");
  const [observacao, setObservacao] = useState("");

  const { data, isLoading, refetch } = trpc.alertasAcordo.list.useQuery({
    status: filtroStatus !== "todos" ? filtroStatus : undefined,
    nivel: filtroNivel !== "todos" ? Number(filtroNivel) : undefined,
    limit: 100,
  });

  const { data: contagem } = trpc.alertasAcordo.contarPendentes.useQuery();

  const atualizarMutation = trpc.alertasAcordo.atualizarStatus.useMutation({
    onSuccess: () => {
      utils.alertasAcordo.list.invalidate();
      utils.alertasAcordo.contarPendentes.invalidate();
      setModalAlerta(null);
      setObservacao("");
    },
    onError: () => {
    },
  });

  const alertas = data?.rows ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Alertas de Inadimplência — Acordos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento progressivo de parcelas em atraso para acompanhamento da equipe
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-red-600">{contagem?.total ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-700" />
              <div>
                <p className="text-xs text-muted-foreground">Críticos (30d+)</p>
                <p className="text-2xl font-bold text-red-700">{contagem?.criticos ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Em Tratativa</p>
                <p className="text-2xl font-bold text-blue-600">
                  {alertas.filter(a => a.status === "em_tratativa").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Resolvidos (filtro)</p>
                <p className="text-2xl font-bold text-green-600">
                  {alertas.filter(a => a.status === "resolvido").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Status:</Label>
              <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as any)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_tratativa">Em Tratativa</SelectItem>
                  <SelectItem value="resolvido">Resolvido</SelectItem>
                  <SelectItem value="ignorado">Ignorado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Nível:</Label>
              <Select value={filtroNivel} onValueChange={setFiltroNivel}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os níveis</SelectItem>
                  <SelectItem value="0">1ª Parcela Não Paga</SelectItem>
                  <SelectItem value="1">Aviso Inicial (5d)</SelectItem>
                  <SelectItem value="2">Segundo Aviso (10d)</SelectItem>
                  <SelectItem value="3">Crítico (30d+)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-sm text-muted-foreground ml-auto">
              {data?.total ?? 0} alerta(s) encontrado(s)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Lista de alertas */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando alertas...</div>
      ) : alertas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
            <p className="text-lg font-medium text-foreground">Nenhum alerta encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">
              {filtroStatus === "pendente"
                ? "Todos os acordos estão em dia com os pagamentos."
                : "Nenhum alerta corresponde aos filtros selecionados."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alertas.map((alerta) => {
            const nivelCfg = NIVEL_CONFIG[alerta.nivel as keyof typeof NIVEL_CONFIG] ?? NIVEL_CONFIG[1];
            const NivelIcon = nivelCfg.icon;
            const statusCfg = STATUS_CONFIG[alerta.status as StatusAlerta];

            return (
              <Card key={alerta.id} className={`border-l-4 ${nivelCfg.borderColor}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    {/* Info principal */}
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <NivelIcon className="h-4 w-4" />
                        <Badge variant="outline" className={nivelCfg.color}>
                          {nivelCfg.label}
                        </Badge>
                        <Badge variant="outline" className={statusCfg.color}>
                          {statusCfg.label}
                        </Badge>
                        <span className="text-sm font-semibold text-foreground">
                          Acordo #{alerta.acordoId}
                        </span>
                        <span className="text-sm text-muted-foreground">—</span>
                        <span className="text-sm text-foreground">
                          {alerta.devedorNome ?? "Devedor"} · {alerta.devedorBloco ? `Bl. ${alerta.devedorBloco} ` : ""}{alerta.devedorUnidade}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Condomínio</p>
                          <p className="font-medium">{alerta.condominioNome}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Parcela</p>
                          <p className="font-medium">{alerta.installmentNumber}/{alerta.totalParcelas}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Vencimento</p>
                          <p className="font-medium">{formatData(alerta.dataVencimento)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Dias em Atraso</p>
                          <p className={`font-bold ${alerta.diasAtraso >= 30 ? "text-red-600" : alerta.diasAtraso >= 10 ? "text-orange-600" : "text-yellow-600"}`}>
                            {alerta.diasAtraso} dias
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Valor da Parcela</p>
                          <p className="font-semibold">{formatMoeda(alerta.valorParcela)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Boleto Atualizado</p>
                          <p className={`font-medium ${alerta.temBoletoAtualizado ? "text-green-600" : "text-red-500"}`}>
                            {alerta.temBoletoAtualizado ? "Sim" : "Não"}
                          </p>
                        </div>
                        {alerta.statusBoleto && (
                          <div>
                            <p className="text-xs text-muted-foreground">Status Boleto</p>
                            <p className="font-medium capitalize">{alerta.statusBoleto.replace(/_/g, " ")}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-muted-foreground">Alerta gerado em</p>
                          <p className="font-medium">{formatData(alerta.createdAt)}</p>
                        </div>
                      </div>

                      {/* Mensagem descritiva */}
                      <div className="bg-muted/50 rounded-md p-3 text-sm">
                        {alerta.nivel === 0 ? (
                          <span className="text-red-700 font-medium">
                            A 1ª parcela deste acordo não foi paga. O prazo configurado para o condomínio foi ultrapassado.
                            Avalie o cancelamento do boleto e do acordo.
                          </span>
                        ) : alerta.nivel === 1 ? (
                          <span className="text-yellow-700">
                            Primeiro aviso: a parcela {alerta.installmentNumber}/{alerta.totalParcelas} está {alerta.diasAtraso} dias em atraso.
                            Entre em contato com o devedor para regularização.
                          </span>
                        ) : alerta.nivel === 2 ? (
                          <span className="text-orange-700 font-medium">
                            Segundo aviso: a parcela {alerta.installmentNumber}/{alerta.totalParcelas} está {alerta.diasAtraso} dias em atraso.
                            Reforce a necessidade de tratativa urgente.
                          </span>
                        ) : (
                          <span className="text-red-700 font-bold">
                            Alerta crítico: a parcela {alerta.installmentNumber}/{alerta.totalParcelas} está {alerta.diasAtraso} dias em atraso.
                            Avalie o cancelamento do boleto, atualização da cobrança ou cancelamento do acordo.
                          </span>
                        )}
                      </div>

                      {alerta.observacao && (
                        <div className="text-sm text-muted-foreground italic">
                          <FileText className="h-3 w-3 inline mr-1" />
                          {alerta.observacao}
                        </div>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="flex flex-col gap-2 min-w-[140px]">
                      {alerta.status === "pendente" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                            onClick={() => {
                              setModalAlerta({ id: alerta.id, acordoId: alerta.acordoId });
                              setNovoStatus("em_tratativa");
                            }}
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            Em Tratativa
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-gray-500 border-gray-200 hover:bg-gray-50"
                            onClick={() => {
                              setModalAlerta({ id: alerta.id, acordoId: alerta.acordoId });
                              setNovoStatus("ignorado");
                            }}
                          >
                            Ignorar
                          </Button>
                        </>
                      )}
                      {(alerta.status === "pendente" || alerta.status === "em_tratativa") && (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => {
                            setModalAlerta({ id: alerta.id, acordoId: alerta.acordoId });
                            setNovoStatus("resolvido");
                          }}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Resolver
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de atualização de status */}
      <Dialog open={!!modalAlerta} onOpenChange={(open) => { if (!open) { setModalAlerta(null); setObservacao(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {novoStatus === "resolvido" ? "Marcar como Resolvido" :
               novoStatus === "em_tratativa" ? "Registrar Tratativa" :
               "Ignorar Alerta"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Novo status</Label>
              <Select value={novoStatus} onValueChange={(v) => setNovoStatus(v as StatusAlerta)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="em_tratativa">Em Tratativa</SelectItem>
                  <SelectItem value="resolvido">Resolvido</SelectItem>
                  <SelectItem value="ignorado">Ignorado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observação (opcional)</Label>
              <Textarea
                className="mt-1"
                placeholder="Descreva a tratativa realizada, decisão tomada, etc."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalAlerta(null); setObservacao(""); }}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!modalAlerta) return;
                atualizarMutation.mutate({
                  id: modalAlerta.id,
                  status: novoStatus,
                  observacao: observacao || undefined,
                });
              }}
              disabled={atualizarMutation.isPending}
            >
              {atualizarMutation.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
