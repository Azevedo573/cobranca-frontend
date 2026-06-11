import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle,
  Copy, ExternalLink, Loader2, QrCode, FileText
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BTG_STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  CREATED: { label: "Emitido", variant: "secondary" },
  PROCESSING: { label: "Processando", variant: "secondary" },
  PAID: { label: "Pago", variant: "default" },
  EXPIRED: { label: "Expirado", variant: "destructive" },
  CANCELED: { label: "Cancelado", variant: "destructive" },
  FAILED: { label: "Falhou", variant: "destructive" },
};

export default function BTGConciliacao() {
  const { user } = useAuth();
  const [condominioId, setCondominioId] = useState<string>("todos");
  const [page, setPage] = useState(1);

  const { data: condominios } = trpc.condominios.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  // condominioId é opcional: se não selecionado, mostra todas as cobranças BTG
  const condId = (condominioId && condominioId !== "todos")
    ? parseInt(condominioId)
    : (user?.role === "admin" ? undefined : user?.condominioId ?? undefined);

  const { data: cobrancas, refetch, isLoading } = trpc.btg.listarCobrancasComBtg.useQuery(
    { condominioId: condId, page, pageSize: 20 }
  );

  const sincronizarMutation = trpc.btg.sincronizarStatus.useMutation({
    onSuccess: (res) => {
      if (res.pago) {
        toast.success(`Cobrança marcada como PAGA! Valor: R$ ${(res.amount / 100).toFixed(2)}`);
      } else {
        toast.info(`Status atualizado: ${res.btgStatus}`);
      }
      refetch();
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const conciliarTodasMutation = trpc.btg.conciliarTodas.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Conciliação concluída! ${res.atualizadas} atualizadas, ${res.pagas} marcadas como pagas.` +
        (res.erros.length ? ` ${res.erros.length} erros.` : "")
      );
      refetch();
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const cancelarMutation = trpc.btg.cancelarBoleto.useMutation({
    onSuccess: () => {
      toast.success("Boleto cancelado no BTG");
      refetch();
    },
    onError: (err) => toast.error("Erro ao cancelar: " + err.message),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  const formatDate = (date: Date | string | null | undefined) =>
    date ? new Date(date).toLocaleDateString("pt-BR") : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <RefreshCw className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Conciliação BTG</h1>
            <p className="text-muted-foreground text-sm">Acompanhe e sincronize o status dos boletos emitidos via API BTG</p>
          </div>
        </div>
        <Button
          onClick={() => conciliarTodasMutation.mutate({ condominioId: condId })}
          disabled={conciliarTodasMutation.isPending}
        >
          {conciliarTodasMutation.isPending
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            : <RefreshCw className="h-4 w-4 mr-2" />
          }
          Conciliar Todas
        </Button>
      </div>

      {user?.role === "admin" && condominios && (
        <Card>
          <CardContent className="pt-4">
            <Select value={condominioId} onValueChange={setCondominioId}>
              <SelectTrigger className="w-full md:w-80">
                <SelectValue placeholder="Todos os condomínios" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os condomínios</SelectItem>
                {condominios.map(c => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Resumo */}
      {cobrancas && cobrancas.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(BTG_STATUS_CONFIG).map(([status, cfg]) => {
            const count = cobrancas.filter(c => c.btgStatus === status).length;
            if (!count) return null;
            return (
              <Card key={status}>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{count}</div>
                  <Badge variant={cfg.variant} className="mt-1">{cfg.label}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cobranças com Boleto BTG</CardTitle>
          <CardDescription>
            {cobrancas?.length ?? 0} registros encontrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !cobrancas?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma cobrança com boleto BTG encontrada
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Devedor</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status BTG</TableHead>
                    <TableHead>Status Sistema</TableHead>
                    <TableHead>Emitido em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cobrancas.map((cob) => {
                    const btgCfg = cob.btgStatus ? BTG_STATUS_CONFIG[cob.btgStatus] : null;
                    return (
                      <TableRow key={cob.id}>
                        <TableCell className="font-mono text-xs">#{cob.id}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{cob.devedorNome || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {cob.devedorBloco ? `Bl. ${cob.devedorBloco} ` : ""}Unid. {cob.devedorUnidade}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm max-w-32 truncate">{cob.description || "—"}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(cob.amount)}</TableCell>
                        <TableCell className="text-sm">{formatDate(cob.dueDate)}</TableCell>
                        <TableCell>
                          {btgCfg ? (
                            <Badge variant={btgCfg.variant}>{btgCfg.label}</Badge>
                          ) : (
                            <Badge variant="outline">{cob.btgStatus || "—"}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cob.status === "pago" ? "default" : "secondary"}>
                            {cob.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(cob.btgEmitidoEm)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            {/* Sincronizar */}
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Sincronizar status"
                              onClick={() => sincronizarMutation.mutate({ cobrancaId: cob.id })}
                              disabled={sincronizarMutation.isPending}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>

                            {/* Copiar PIX */}
                            {cob.btgPixCopiaECola && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Copiar PIX Copia e Cola"
                                onClick={() => copyToClipboard(cob.btgPixCopiaECola!)}
                              >
                                <QrCode className="h-3 w-3" />
                              </Button>
                            )}

                            {/* Abrir boleto */}
                            {cob.btgBankSlipUrl && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Abrir boleto PDF"
                                asChild
                              >
                                <a href={cob.btgBankSlipUrl} target="_blank" rel="noopener noreferrer">
                                  <FileText className="h-3 w-3" />
                                </a>
                              </Button>
                            )}

                            {/* Cancelar */}
                            {cob.btgStatus && !["CANCELED", "EXPIRED", "PAID"].includes(cob.btgStatus) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Cancelar boleto BTG"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm("Cancelar este boleto no BTG?")) {
                                    cancelarMutation.mutate({ cobrancaId: cob.id });
                                  }
                                }}
                              >
                                <XCircle className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {cobrancas && cobrancas.length === 20 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            Anterior
          </Button>
          <span className="flex items-center px-4 text-sm">Página {page}</span>
          <Button variant="outline" onClick={() => setPage(p => p + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
