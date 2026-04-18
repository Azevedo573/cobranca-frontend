import { useState, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAdminCondominio } from "@/hooks/useAdminCondominio";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { AdminCondominioSelector } from "@/components/AdminCondominioSelector";
import { Upload, Download, FileText, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const TIPO_LABELS: Record<string, string> = {
  devedores: "Importação de Devedores",
  dividas: "Importação de Dívidas",
  baixa_lote: "Baixa em Lote",
  cnab_remessa: "Remessa CNAB 240",
  cnab_retorno: "Retorno CNAB 240",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  processando: { label: "Processando", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  concluido: { label: "Concluído", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
  erro: { label: "Erro", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
};

interface ResultadoBaixa {
  sucesso: number;
  erros: number;
  detalhes: Array<{ linha: number; cobrancaId?: number; status: string; mensagem: string }>;
}

export default function HistoricoImportacoes() {
  const { user } = useAuth();
  const { condominioId, condominios, selectedCondominioId, setSelectedCondominioId } = useAdminCondominio();
  const condominioNome = condominios?.find(c => c.id === selectedCondominioId)?.name;
  const effectiveCondominioId = user?.role === "admin" ? condominioId : user?.condominioId;

  const [baixaDialogOpen, setBaixaDialogOpen] = useState(false);
  const [resultadoDialogOpen, setResultadoDialogOpen] = useState(false);
  const [resultado, setResultado] = useState<ResultadoBaixa | null>(null);
  const [csvConteudo, setCsvConteudo] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [previewLinhas, setPreviewLinhas] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: historico, isLoading, refetch } = trpc.importacoes.list.useQuery(
    { condominioId: effectiveCondominioId ?? undefined },
    { enabled: true }
  );

  const baixaMutation = trpc.importacoes.baixaEmLote.useMutation({
    onSuccess: (data) => {
      setResultado(data);
      setBaixaDialogOpen(false);
      setResultadoDialogOpen(true);
      refetch();
      toast.success(`Baixa concluída: ${data.sucesso} sucesso, ${data.erros} erros`);
    },
    onError: (err) => {
      toast.error("Erro ao processar baixa: " + err.message);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvConteudo(text);
      const linhas = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 5);
      setPreviewLinhas(linhas);
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleBaixaConfirmar = () => {
    if (!csvConteudo) {
      toast.error("Selecione um arquivo CSV");
      return;
    }
    if (!effectiveCondominioId) {
      toast.error("Selecione um condomínio");
      return;
    }
    baixaMutation.mutate({
      condominioId: effectiveCondominioId,
      csvConteudo,
      nomeArquivo,
    });
  };

  const formatarData = (d: Date | string) =>
    format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Histórico de Importações</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Registro de todas as importações e operações em lote realizadas
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {user?.role === "admin" && setSelectedCondominioId && (
            <AdminCondominioSelector
              condominios={condominios}
              selectedId={selectedCondominioId}
              onSelect={setSelectedCondominioId}
            />
          )}
          <Button
            onClick={() => setBaixaDialogOpen(true)}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
            disabled={!effectiveCondominioId}
          >
            <Upload className="mr-2 h-4 w-4" />
            Baixa em Lote (CSV)
          </Button>
        </div>
      </div>

      {/* Estatísticas rápidas */}
      {historico && historico.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(["concluido", "erro", "processando"] as const).map((status) => {
            const count = historico.filter(h => h.status === status).length;
            const cfg = STATUS_CONFIG[status];
            return (
              <Card key={status} className="p-4">
                <div className="flex items-center gap-2">
                  {cfg.icon}
                  <span className="text-sm font-medium">{cfg.label}</span>
                </div>
                <p className="text-2xl font-bold mt-1">{count}</p>
              </Card>
            );
          })}
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-3 w-3" />
              <span className="text-sm font-medium">Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">{historico.length}</p>
          </Card>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Importações Realizadas</CardTitle>
          <CardDescription>
            {user?.role === "admin" && condominioNome
              ? `Condomínio: ${condominioNome}`
              : "Todas as importações do seu condomínio"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
              <p className="mt-3 text-muted-foreground">Carregando...</p>
            </div>
          ) : !historico || historico.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma importação encontrada</h3>
              <p className="text-muted-foreground mb-4">
                Use o botão "Baixa em Lote" para importar pagamentos via CSV
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Sucesso</TableHead>
                  <TableHead className="text-center">Erros</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.map((item) => {
                  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.processando;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">
                        {formatarData(item.createdAt)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          {TIPO_LABELS[item.tipo] || item.tipo}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm truncate max-w-[200px]" title={item.nomeArquivo}>
                            {item.nomeArquivo}
                          </span>
                          {item.urlArquivo && (
                            <a href={item.urlArquivo} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <Download className="h-3 w-3" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-medium">{item.totalRegistros}</TableCell>
                      <TableCell className="text-center">
                        <span className="text-green-600 font-medium">{item.registrosSucesso}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={item.registrosErro > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
                          {item.registrosErro}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant} className="flex items-center gap-1 w-fit">
                          {cfg.icon}
                          {cfg.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Baixa em Lote */}
      <Dialog open={baixaDialogOpen} onOpenChange={setBaixaDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Baixa em Lote via CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium">Formato esperado do arquivo CSV:</p>
              <code className="block bg-background rounded p-2 text-xs font-mono">
                cobrancaId,dataPagamento,valorPago<br />
                123,2024-03-15,150.00<br />
                124,2024-03-15,200.50<br />
                125,2024-03-16,75.00
              </code>
              <p className="text-muted-foreground text-xs">
                Separador: vírgula, ponto-e-vírgula, pipe (|) ou tab. Cabeçalho opcional.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Arquivo CSV</Label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {nomeArquivo ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="font-medium text-sm">{nomeArquivo}</span>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Clique para selecionar o arquivo CSV</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {previewLinhas.length > 0 && (
              <div className="space-y-2">
                <Label>Prévia (primeiras 5 linhas)</Label>
                <div className="bg-muted rounded p-3 text-xs font-mono space-y-1">
                  {previewLinhas.map((l, i) => (
                    <div key={i} className="truncate">{l}</div>
                  ))}
                </div>
              </div>
            )}

            {!effectiveCondominioId && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded p-3 text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>Selecione um condomínio antes de prosseguir</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaixaDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleBaixaConfirmar}
              disabled={!csvConteudo || !effectiveCondominioId || baixaMutation.isPending}
            >
              {baixaMutation.isPending ? "Processando..." : "Confirmar Baixa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Resultado */}
      <Dialog open={resultadoDialogOpen} onOpenChange={setResultadoDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resultado da Baixa em Lote</DialogTitle>
          </DialogHeader>
          {resultado && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 bg-green-50 border-green-200">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-semibold">Sucesso</span>
                  </div>
                  <p className="text-3xl font-bold text-green-700 mt-1">{resultado.sucesso}</p>
                </Card>
                <Card className="p-4 bg-red-50 border-red-200">
                  <div className="flex items-center gap-2 text-red-700">
                    <XCircle className="h-5 w-5" />
                    <span className="font-semibold">Erros</span>
                  </div>
                  <p className="text-3xl font-bold text-red-700 mt-1">{resultado.erros}</p>
                </Card>
              </div>

              {resultado.detalhes.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Detalhes por linha:</h4>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {resultado.detalhes.map((d, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 text-sm p-2 rounded ${
                          d.status === "sucesso" ? "bg-green-50" : "bg-red-50"
                        }`}
                      >
                        {d.status === "sucesso" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                        )}
                        <span>
                          <strong>Linha {d.linha}:</strong> {d.mensagem}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResultadoDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
