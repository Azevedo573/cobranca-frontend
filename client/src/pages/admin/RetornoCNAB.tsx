import { useState, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAdminCondominio } from "@/hooks/useAdminCondominio";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AdminCondominioSelector } from "@/components/AdminCondominioSelector";
import {
  Upload, FileText, CheckCircle2, XCircle, AlertTriangle,
  Download, Clock, TrendingUp, Banknote, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface TituloRetorno {
  nossoNumero: string;
  cobrancaIdEmpresa: string;
  codigoOcorrencia: string;
  descricaoOcorrencia: string;
  dataOcorrencia: string;
  dataPagamento: string;
  valorPago: number;
  valorTarifa: number;
  valorJuros: number;
  devedorNome: string;
  devedorCpfCnpj: string;
  processado: boolean;
  cobrancaId?: number;
}

interface ResultadoRetorno {
  totalTitulos: number;
  pagos: number;
  erros: number;
  detalhes: TituloRetorno[];
}

export default function RetornoCNAB() {
  const { user } = useAuth();
  const { condominioId, condominios, selectedCondominioId, setSelectedCondominioId } = useAdminCondominio();
  const effectiveCondominioId = user?.role === "admin" ? condominioId : user?.condominioId;

  const [retornoConteudo, setRetornoConteudo] = useState("");
  const [retornoNomeArquivo, setRetornoNomeArquivo] = useState("");
  const [resultadoRetorno, setResultadoRetorno] = useState<ResultadoRetorno | null>(null);
  const [detalheDialogOpen, setDetalheDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: retornos, isLoading: loadingRetornos } = trpc.cnab.listarRetornos.useQuery(
    { condominioId: effectiveCondominioId ?? 0 },
    { enabled: !!effectiveCondominioId }
  );

  const processarRetornoMutation = trpc.cnab.processarRetorno.useMutation({
    onSuccess: (data) => {
      setResultadoRetorno(data);
      setDetalheDialogOpen(true);
      utils.cnab.listarRetornos.invalidate();
      utils.cobrancas.list.invalidate();
      toast.success(`Retorno processado: ${data.pagos} título(s) pago(s)`);
    },
    onError: (err) => toast.error("Erro ao processar retorno: " + err.message),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRetornoNomeArquivo(file.name);
    setResultadoRetorno(null);
    const reader = new FileReader();
    reader.onload = (ev) => setRetornoConteudo(ev.target?.result as string);
    reader.readAsText(file, "ISO-8859-1");
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setRetornoNomeArquivo(file.name);
    setResultadoRetorno(null);
    const reader = new FileReader();
    reader.onload = (ev) => setRetornoConteudo(ev.target?.result as string);
    reader.readAsText(file, "ISO-8859-1");
  };

  const handleProcessar = () => {
    if (!retornoConteudo) {
      toast.error("Selecione o arquivo de retorno");
      return;
    }
    if (!effectiveCondominioId) {
      toast.error("Selecione um condomínio");
      return;
    }
    processarRetornoMutation.mutate({
      condominioId: effectiveCondominioId,
      nomeArquivo: retornoNomeArquivo,
      conteudo: retornoConteudo,
    });
  };

  const handleLimpar = () => {
    setRetornoConteudo("");
    setRetornoNomeArquivo("");
    setResultadoRetorno(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatarData = (d: Date | string | number) =>
    format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR });

  const formatarMoeda = (centavos: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);

  const getOcorrenciaBadge = (codigo: string) => {
    const pagos = ["06", "07", "08", "09", "15", "17"];
    const erros = ["03", "04", "05", "10", "11", "12"];
    if (pagos.includes(codigo)) {
      return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Pago</Badge>;
    }
    if (erros.includes(codigo)) {
      return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" />Erro</Badge>;
    }
    return <Badge variant="outline" className="text-blue-600 border-blue-300">{codigo}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Download className="h-6 w-6 text-primary" />
            Retorno CNAB 240
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Processe arquivos de retorno recebidos do BTG Pactual para baixar pagamentos automaticamente
          </p>
        </div>
        {user?.role === "admin" && setSelectedCondominioId && (
          <AdminCondominioSelector
            condominios={condominios}
            selectedId={selectedCondominioId}
            onSelect={setSelectedCondominioId}
          />
        )}
      </div>

      {!effectiveCondominioId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3" />
            <p className="font-medium">Selecione um condomínio para continuar</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Upload */}
          <Card>
            <CardHeader>
              <CardTitle>Importar Arquivo de Retorno</CardTitle>
              <CardDescription>
                Arraste ou clique para selecionar o arquivo <strong>.ret</strong> recebido do BTG Pactual
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
                  ${retornoNomeArquivo
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/30 hover:border-primary hover:bg-primary/5"
                  }`}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                {retornoNomeArquivo ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-10 w-10 text-primary" />
                    <p className="font-semibold text-primary">{retornoNomeArquivo}</p>
                    <p className="text-xs text-muted-foreground">
                      {retornoConteudo.split("\n").length} linhas lidas
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <p className="font-medium text-muted-foreground">
                      Clique ou arraste o arquivo de retorno aqui
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Formatos aceitos: .ret, .txt, .240 (CNAB 240 padrão Febraban)
                    </p>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".ret,.txt,.240,.RET,.TXT"
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="flex gap-3">
                <Button
                  onClick={handleProcessar}
                  disabled={!retornoConteudo || processarRetornoMutation.isPending}
                  className="flex-1"
                >
                  {processarRetornoMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Processar Retorno
                    </>
                  )}
                </Button>
                {retornoNomeArquivo && (
                  <Button variant="outline" onClick={handleLimpar}>
                    Limpar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Resultado do último processamento */}
          {resultadoRetorno && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-700">{resultadoRetorno.pagos}</p>
                      <p className="text-xs text-green-600">Títulos Pagos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                      <XCircle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-700">{resultadoRetorno.erros}</p>
                      <p className="text-xs text-red-600">Erros / Rejeições</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Banknote className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-700">
                        {formatarMoeda(
                          resultadoRetorno.detalhes
                            .filter(d => d.processado)
                            .reduce((acc, d) => acc + d.valorPago, 0)
                        )}
                      </p>
                      <p className="text-xs text-blue-600">Valor Total Recebido</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="sm:col-span-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setDetalheDialogOpen(true)}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Ver detalhes dos {resultadoRetorno.totalTitulos} títulos processados
                </Button>
              </div>
            </div>
          )}

          {/* Histórico de retornos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Histórico de Retornos Processados
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRetornos ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                </div>
              ) : !retornos || retornos.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Clock className="h-10 w-10 mx-auto mb-3" />
                  <p className="font-medium">Nenhum retorno processado ainda</p>
                  <p className="text-sm mt-1">Os retornos processados aparecerão aqui</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-center">Pagos</TableHead>
                      <TableHead className="text-center">Rejeitados</TableHead>
                      <TableHead className="text-right">Valor Recebido</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {retornos.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-sm">{r.nomeArquivo}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatarData(r.createdAt)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            {r.titulosPagos}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {r.titulosRejeitados > 0 ? (
                            <Badge className="bg-red-100 text-red-700 border-red-200">
                              {r.titulosRejeitados}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-700">
                          {formatarMoeda(r.valorTotalPago)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Processado
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Dialog: Detalhes do retorno */}
      <Dialog open={detalheDialogOpen} onOpenChange={setDetalheDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detalhes do Retorno — {retornoNomeArquivo}
            </DialogTitle>
          </DialogHeader>
          {resultadoRetorno && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <span className="text-green-600 font-medium">
                  <CheckCircle2 className="inline h-4 w-4 mr-1" />
                  {resultadoRetorno.pagos} pagos
                </span>
                <span className="text-red-600 font-medium">
                  <XCircle className="inline h-4 w-4 mr-1" />
                  {resultadoRetorno.erros} erros
                </span>
                <span className="text-muted-foreground">
                  {resultadoRetorno.totalTitulos} total
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nosso Nº</TableHead>
                    <TableHead>Devedor</TableHead>
                    <TableHead>Ocorrência</TableHead>
                    <TableHead>Data Pgto</TableHead>
                    <TableHead className="text-right">Valor Pago</TableHead>
                    <TableHead className="text-right">Tarifa</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultadoRetorno.detalhes.map((t, i) => (
                    <TableRow key={i} className={t.processado ? "" : "opacity-60"}>
                      <TableCell className="font-mono text-xs">{t.nossoNumero}</TableCell>
                      <TableCell className="text-sm">{t.devedorNome || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {getOcorrenciaBadge(t.codigoOcorrencia)}
                          <span className="text-xs text-muted-foreground">{t.descricaoOcorrencia}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.dataPagamento && t.dataPagamento !== "00000000"
                          ? t.dataPagamento
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {t.valorPago > 0 ? formatarMoeda(t.valorPago) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {t.valorTarifa > 0 ? formatarMoeda(t.valorTarifa) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {t.processado ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Baixado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-300">
                            Não encontrado
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
