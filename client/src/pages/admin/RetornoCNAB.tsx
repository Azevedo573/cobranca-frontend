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
import { AdminCondominioSelector } from "@/components/AdminCondominioSelector";
import {
  Upload, FileText, CheckCircle2, XCircle, AlertTriangle,
  Clock, TrendingUp, Banknote, RefreshCw, ArrowRightLeft,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface ResultadoRetorno {
  retornoId: number;
  totalTitulos: number;
  entradas: number;
  pagos: number;
  cancelados: number;
  naoEncontrados: number;
  valorTotalPago: number;
  dataGeracao: string;
  horaGeracao: string;
}

export default function RetornoCNAB() {
  const { user } = useAuth();
  const { condominioId, condominios, selectedCondominioId, setSelectedCondominioId } = useAdminCondominio();
  const effectiveCondominioId = user?.role === "admin" ? condominioId : user?.condominioId;

  const [retornoConteudo, setRetornoConteudo] = useState("");
  const [retornoNomeArquivo, setRetornoNomeArquivo] = useState("");
  const [resultadoRetorno, setResultadoRetorno] = useState<ResultadoRetorno | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: retornos, isLoading: loadingRetornos } = trpc.cnab.listarRetornos.useQuery(
    { condominioId: effectiveCondominioId ?? 0 },
    { enabled: !!effectiveCondominioId }
  );

  const processarRetornoMutation = trpc.cnab.processarRetorno.useMutation({
    onSuccess: (data) => {
      setResultadoRetorno(data);
      utils.cnab.listarRetornos.invalidate();
      utils.cobrancas.list.invalidate();
      if (data.pagos > 0) {
        toast.success(`Retorno processado: ${data.pagos} título(s) pago(s)`);
      } else if (data.entradas > 0) {
        toast.success(`Retorno processado: ${data.entradas} entrada(s) confirmada(s)`);
      } else {
        toast.info(`Retorno processado: ${data.totalTitulos} título(s) analisado(s)`);
      }
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

  const formatarDataGeracao = (ddmmaaaa: string) => {
    if (!ddmmaaaa || ddmmaaaa.length < 8) return ddmmaaaa;
    return `${ddmmaaaa.substring(0, 2)}/${ddmmaaaa.substring(2, 4)}/${ddmmaaaa.substring(4, 8)}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowRightLeft className="h-6 w-6 text-primary" />
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
                      Formatos aceitos: .ret, .txt, .240 (CNAB 240 — BTG Pactual)
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
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Resultado do Processamento
                  {resultadoRetorno.dataGeracao && (
                    <span className="text-xs font-normal text-muted-foreground ml-2">
                      Arquivo gerado em {formatarDataGeracao(resultadoRetorno.dataGeracao)}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{resultadoRetorno.totalTitulos}</p>
                    <p className="text-xs text-muted-foreground">Total de Títulos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{resultadoRetorno.entradas}</p>
                    <p className="text-xs text-muted-foreground">Entradas Confirmadas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{resultadoRetorno.pagos}</p>
                    <p className="text-xs text-muted-foreground">Títulos Pagos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">{resultadoRetorno.cancelados}</p>
                    <p className="text-xs text-muted-foreground">Baixados/Cancelados</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600">{resultadoRetorno.naoEncontrados}</p>
                    <p className="text-xs text-muted-foreground">Não Encontrados</p>
                  </div>
                </div>
                {resultadoRetorno.valorTotalPago > 0 && (
                  <div className="mt-4 pt-4 border-t border-primary/20 text-center">
                    <p className="text-sm text-muted-foreground">Valor Total Recebido</p>
                    <p className="text-3xl font-bold text-green-600">
                      {formatarMoeda(resultadoRetorno.valorTotalPago)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
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
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Pagos</TableHead>
                      <TableHead className="text-center">Não Encontrados</TableHead>
                      <TableHead className="text-right">Valor Recebido</TableHead>
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
                          <Badge variant="outline">{r.totalTitulos}</Badge>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
