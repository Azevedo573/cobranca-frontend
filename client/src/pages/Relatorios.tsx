import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Download, RefreshCw, FileText, TrendingUp, HandshakeIcon, Receipt, BarChart3, Printer, FileDown } from "lucide-react";
import { toast } from "sonner";

const fmtBRL = (v: number) =>
  (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
};

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente", em_cobranca: "Em Cobrança", pago: "Pago",
  acordo: "Acordo", em_acordo: "Em Acordo", acordo_atrasado: "Acordo Atrasado",
  em_negociacao: "Em Negociação", suspenso: "Suspenso", judicial: "Judicial",
  cancelado: "Cancelado", ativo: "Ativo",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-800", em_cobranca: "bg-blue-100 text-blue-800",
  pago: "bg-green-100 text-green-800", acordo: "bg-purple-100 text-purple-800",
  em_acordo: "bg-purple-100 text-purple-800", acordo_atrasado: "bg-orange-100 text-orange-800",
  em_negociacao: "bg-cyan-100 text-cyan-800", suspenso: "bg-gray-100 text-gray-800",
  judicial: "bg-red-100 text-red-800", cancelado: "bg-gray-100 text-gray-500",
  ativo: "bg-green-100 text-green-800",
};

export default function Relatorios() {
  const [tipoAtivo, setTipoAtivo] = useState("inadimplencia");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [condominioId, setCondominioId] = useState<string>("");
  const [exportando, setExportando] = useState(false);

  const exportarPDF = useCallback(() => {
    window.print();
  }, []);

  const { data: listaCondominios = [] } = trpc.condominios.list.useQuery(undefined as any);

  const filtro = {
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    condominioId: condominioId && condominioId !== "todos" ? parseInt(condominioId) : undefined,
  };

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: dadosInad, isLoading: loadingInad, refetch: refetchInad } =
    trpc.relatorios.inadimplencia.useQuery(filtro, { enabled: tipoAtivo === "inadimplencia" });

  // Aba Acordos usa o shape detalhado (cobranças originais + parcelas)
  const filtroAcordosTemValor = tipoAtivo === "acordos" && Object.values(filtro).some((v) => v !== undefined && v !== null);
  const { data: dadosAcordos, isLoading: loadingAcordos, refetch: refetchAcordos } =
    trpc.relatorios.acordosDetalhado.useQuery(filtro, { enabled: filtroAcordosTemValor });

  const gerarPDFAcordosMutation = trpc.relatorios.gerarPDFAcordos.useMutation({
    onSuccess: (result) => {
      const link = document.createElement("a");
      link.href = result.url;
      link.setAttribute("download", `relatorio-acordos-${new Date().toISOString().slice(0, 10)}.pdf`);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("PDF gerado com sucesso!");
    },
    onError: (err) => toast.error(`Erro ao gerar PDF: ${err.message}`),
  });

  const { data: dadosProdRaw, isLoading: loadingProd, refetch: refetchProd } =
    trpc.relatorios.produtividade.useQuery(
      { dataInicio: filtro.dataInicio, dataFim: filtro.dataFim, condominioId: filtro.condominioId },
      { enabled: tipoAtivo === "produtividade" }
    );

  const { data: dadosExtrato, isLoading: loadingExtrato, refetch: refetchExtrato } =
    trpc.relatorios.extrato.useQuery(filtro, { enabled: tipoAtivo === "extrato" });

  const { data: dadosRecup, isLoading: loadingRecup, refetch: refetchRecup } =
    trpc.relatorios.recuperacao.useQuery(filtro, { enabled: tipoAtivo === "recuperacao" });

  // ─── Exportação Excel ────────────────────────────────────────────────────────
  const exportarExcel = useCallback(async () => {
    setExportando(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Sistema de Cobranças";
      wb.created = new Date();

      const addSheet = (name: string, headers: string[], rows: (string | number | null | undefined)[][]) => {
        const ws = wb.addWorksheet(name);
        ws.addRow(headers).font = { bold: true };
        rows.forEach((r) => ws.addRow(r));
        ws.columns.forEach((col) => { col.width = 20; });
      };

      if (tipoAtivo === "inadimplencia" && dadosInad) {
        addSheet("Inadimplência", [
          "Devedor", "CPF/CNPJ", "Unidade", "Bloco", "Condomínio",
          "Descrição", "Vencimento", "Valor Original (R$)", "Status",
        ], dadosInad.rows.map((r) => [
          r.nomeDevedor, r.cpfCnpj ?? "", r.unidade ?? "", r.bloco ?? "", r.nomeCondominio,
          r.descricao ?? "", fmtDate(r.dataVencimento), (r.valorOriginal ?? 0) / 100, STATUS_LABELS[r.status] ?? r.status,
        ]));
      }
      if (tipoAtivo === "acordos" && dadosAcordos) {
        addSheet("Acordos", [
          "Devedor", "Unidade", "Bloco", "Condomínio",
          "Status", "Valor Acordo (R$)", "Parcelas", "Valor Pago (R$)", "Data Criação",
        ], dadosAcordos.acordos.map((r: any) => [
          r.nomeDevedor, r.unidade ?? "", r.bloco ?? "", r.nomeCondominio,
          r.status, (r.agreedAmount ?? 0) / 100,
          r.installments, (r.valorPagoEfetivo ?? 0) / 100, fmtDate(r.createdAt),
        ]));
      }
      if (tipoAtivo === "produtividade" && dadosProdRaw) {
        addSheet("Produtividade", [
          "Colaborador", "E-mail", "Total Tentativas", "Devedores Únicos",
          "Sem Resposta", "Promessas", "Recusas", "Taxa Sucesso (%)",
        ], dadosProdRaw.map((r) => [
          r.colaboradorNome, r.colaboradorEmail, r.totalTentativas, r.devedoresUnicos,
          r.tentativasSemResposta, r.tentativasPromessa, r.tentativasRecusa, r.taxaSucesso,
        ]));
      }
      if (tipoAtivo === "extrato" && dadosExtrato) {
        addSheet("Extrato", [
          "Devedor", "CPF/CNPJ", "Unidade", "Bloco", "Condomínio",
          "Descrição", "Vencimento", "Pagamento", "Valor (R$)", "Status",
        ], dadosExtrato.rows.map((r) => [
          r.nomeDevedor, r.cpfCnpj ?? "", r.unidade ?? "", r.bloco ?? "", r.nomeCondominio,
          r.descricao ?? "", fmtDate(r.dataVencimento), fmtDate(r.dataPagamento),
          (r.valorOriginal ?? 0) / 100, STATUS_LABELS[r.status] ?? r.status,
        ]));
      }
      if (tipoAtivo === "recuperacao" && dadosRecup) {
        addSheet("Recuperação", [
          "Devedor", "CPF/CNPJ", "Unidade", "Bloco", "Condomínio",
          "Descrição", "Vencimento", "Pagamento", "Valor (R$)",
        ], dadosRecup.rows.map((r) => [
          r.nomeDevedor, r.cpfCnpj ?? "", r.unidade ?? "", r.bloco ?? "", r.nomeCondominio,
          r.descricao ?? "", fmtDate(r.dataVencimento), fmtDate(r.dataPagamento),
          (r.valorOriginal ?? 0) / 100,
        ]));
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${tipoAtivo}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Planilha exportada com sucesso!");
    } catch (e) {
      toast.error("Erro ao exportar planilha");
    } finally {
      setExportando(false);
    }
  }, [tipoAtivo, dadosInad, dadosAcordos, dadosProdRaw, dadosExtrato, dadosRecup]);

  const handleRefresh = () => {
    if (tipoAtivo === "inadimplencia") refetchInad();
    else if (tipoAtivo === "acordos") refetchAcordos();
    else if (tipoAtivo === "produtividade") refetchProd();
    else if (tipoAtivo === "extrato") refetchExtrato();
    else if (tipoAtivo === "recuperacao") refetchRecup();
  };

  const isLoading = loadingInad || loadingAcordos || loadingProd || loadingExtrato || loadingRecup;

  // Helpers para a aba Acordos
  const fmtMes = (ref: string | null | undefined) => {
    if (!ref) return "—";
    if (ref.includes("-")) { const [y, m] = ref.split("-"); return `${m}/${y}`; }
    return ref;
  };
  const TIPO_LABELS_COBS: Record<string, string> = {
    condominio: "Condomínio", salao_jogos: "Salão de Jogos", churrasqueira: "Churrasqueira",
    cota_extra: "Cota Extra", multa: "Multa", outros: "Outros",
  };
  const STATUS_PARCELA_LABELS: Record<string, string> = {
    pendente: "Pendente", pago: "Pago", atrasado: "Atrasado", cancelado: "Cancelado",
  };

  return (
    <div className="p-6 space-y-6 print:p-4">
      {/* CSS de impressão */}
      <style>{`
        @media print {
          [data-sidebar], nav, .no-print { display: none !important; }
          .print\\:hidden { display: none !important; }
          body { background: white !important; }
          .overflow-auto { overflow: visible !important; max-height: none !important; }
        }
      `}</style>

      {/* Cabeçalho */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Painel de Relatórios</h1>
          <p className="text-sm text-muted-foreground">Exporte e analise dados do sistema</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          {tipoAtivo === "acordos" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!filtroAcordosTemValor) { toast.error("Selecione pelo menos um filtro para exportar o PDF."); return; }
                gerarPDFAcordosMutation.mutate(filtro);
              }}
              disabled={!dadosAcordos || gerarPDFAcordosMutation.isPending}
            >
              {gerarPDFAcordosMutation.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <FileDown className="h-4 w-4 mr-2" />}
              {gerarPDFAcordosMutation.isPending ? "Gerando PDF..." : "Exportar PDF"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={exportarPDF}>
              <Printer className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
          )}
          <Button size="sm" onClick={exportarExcel} disabled={exportando || isLoading}>
            {exportando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Exportar Excel
          </Button>
        </div>
      </div>
      {/* Título visível apenas na impressão */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">Painel de Relatórios</h1>
        <p className="text-sm text-muted-foreground">Gerado em {new Date().toLocaleDateString("pt-BR")}</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Data Início</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data Fim</Label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Condomínio</Label>
              <Select value={condominioId} onValueChange={setCondominioId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos os condomínios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os condomínios</SelectItem>
                  {(listaCondominios as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Abas de relatórios */}
      <Tabs value={tipoAtivo} onValueChange={setTipoAtivo}>
        <TabsList className="grid grid-cols-5 w-full print:hidden">
          <TabsTrigger value="inadimplencia" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />Inadimplência
          </TabsTrigger>
          <TabsTrigger value="acordos" className="text-xs">
            <HandshakeIcon className="h-3 w-3 mr-1" />Acordos
          </TabsTrigger>
          <TabsTrigger value="extrato" className="text-xs">
            <Receipt className="h-3 w-3 mr-1" />Extrato
          </TabsTrigger>
          <TabsTrigger value="recuperacao" className="text-xs">
            <TrendingUp className="h-3 w-3 mr-1" />Recuperação
          </TabsTrigger>
          <TabsTrigger value="produtividade" className="text-xs">
            <BarChart3 className="h-3 w-3 mr-1" />Produtividade
          </TabsTrigger>
        </TabsList>

        {/* ── Inadimplência ── */}
        <TabsContent value="inadimplencia" className="space-y-4 mt-4">
          {dadosInad && (
            <div className="grid grid-cols-3 gap-4">
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Devedores Únicos</p>
                <p className="text-2xl font-bold text-red-600">{dadosInad.totais.totalDevedores}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total em Aberto</p>
                <p className="text-2xl font-bold text-red-600">{fmtBRL(dadosInad.totais.totalValorOriginal ?? dadosInad.totais.totalAtualizado)}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Cobranças Pendentes</p>
                <p className="text-2xl font-bold">{dadosInad.totais.totalCobrado}</p>
              </CardContent></Card>
            </div>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Cobranças em Aberto</CardTitle>
              <CardDescription className="text-xs">{dadosInad?.rows.length ?? 0} registros</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingInad ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="overflow-auto max-h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Devedor</TableHead>
                        <TableHead>CPF/CNPJ</TableHead>
                        <TableHead>Unidade</TableHead>
                        <TableHead>Condomínio</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dadosInad?.rows.map((r) => (
                        <TableRow key={r.cobrancaId}>
                          <TableCell className="font-medium text-xs">{r.nomeDevedor}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.cpfCnpj ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.bloco ? `${r.bloco}/` : ""}{r.unidade ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.nomeCondominio}</TableCell>
                          <TableCell className="text-xs max-w-[160px] truncate">{r.descricao ?? "—"}</TableCell>
                          <TableCell className="text-xs">{fmtDate(r.dataVencimento)}</TableCell>
                          <TableCell className="text-right text-xs font-semibold text-red-600">{fmtBRL(r.valorOriginal ?? 0)}</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${STATUS_COLORS[r.status] ?? ""}`}>
                              {STATUS_LABELS[r.status] ?? r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!dadosInad?.rows.length && (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Acordos (detalhado) ── */}
        <TabsContent value="acordos" className="space-y-4 mt-4">
          {loadingAcordos && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingAcordos && !filtroAcordosTemValor && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <HandshakeIcon className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground font-medium">Selecione pelo menos um filtro para visualizar os acordos</p>
              <p className="text-xs text-muted-foreground mt-1">Use os campos de data ou condomínio acima</p>
            </div>
          )}

          {!loadingAcordos && filtroAcordosTemValor && dadosAcordos && dadosAcordos.acordos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground font-medium">Nenhum acordo encontrado no período</p>
            </div>
          )}

          {dadosAcordos && dadosAcordos.acordos.length > 0 && (
            <>
              {/* Cards de totais */}
              <div className="grid grid-cols-3 gap-4">
                <Card><CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Total de Acordos</p>
                  <p className="text-2xl font-bold">{dadosAcordos.totais.totalAcordos}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Valor Total Acordado</p>
                  <p className="text-2xl font-bold text-blue-600">{fmtBRL(dadosAcordos.totais.valorTotal)}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Valor Pago</p>
                  <p className="text-2xl font-bold text-green-600">{fmtBRL(dadosAcordos.totais.valorPago)}</p>
                </CardContent></Card>
              </div>

              {/* Lista detalhada de acordos */}
              {(dadosAcordos.acordos as any[]).map((acordo: any) => (
                <div key={acordo.acordoId} className="border rounded-lg overflow-hidden">
                  {/* Cabeçalho do acordo */}
                  <div className="bg-muted/50 px-4 py-3 flex items-center justify-between border-b">
                    <div className="flex items-center gap-3">
                      <HandshakeIcon className="h-4 w-4 text-primary" />
                      <span className="font-bold text-base">Acordo {String(acordo.acordoId).padStart(6, "0")}</span>
                      <Badge className={`text-[10px] ${STATUS_COLORS[acordo.status] ?? ""}`}>
                        {STATUS_LABELS[acordo.status] ?? acordo.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">Efetuado em {fmtDate(acordo.createdAt)}</span>
                  </div>

                  <div className="p-4 space-y-5">
                    {/* Detalhes */}
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Detalhes</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><span className="text-xs text-muted-foreground block">Devedor</span><span className="font-medium">{acordo.nomeDevedor}</span></div>
                        <div><span className="text-xs text-muted-foreground block">Unidade</span><span>{acordo.bloco ? `${acordo.bloco}/` : ""}{acordo.unidade ?? "—"}</span></div>
                        <div><span className="text-xs text-muted-foreground block">Condomínio</span><span>{acordo.nomeCondominio}</span></div>
                        <div><span className="text-xs text-muted-foreground block">Código do Acordo</span><span className="font-mono">{String(acordo.acordoId).padStart(6, "0")}</span></div>
                      </div>
                    </div>

                    <Separator />

                    {/* Cobranças Originais */}
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cobranças Originais</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted/40 text-left">
                              <th className="px-2 py-1.5 border text-right w-20">Número</th>
                              <th className="px-2 py-1.5 border text-center w-24">Vencimento</th>
                              <th className="px-2 py-1.5 border text-center w-20">Competência</th>
                              <th className="px-2 py-1.5 border">Descrição</th>
                              <th className="px-2 py-1.5 border text-right w-28">Valor (R$)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {acordo.cobrancasOriginais.length === 0 ? (
                              <tr><td colSpan={5} className="px-2 py-3 border text-center text-muted-foreground">Nenhuma cobrança original registrada</td></tr>
                            ) : (
                              <>
                                {acordo.cobrancasOriginais.map((c: any, idx: number) => (
                                  <tr key={idx} className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                                    <td className="px-2 py-1 border text-right font-mono">{c.cobrancaId}</td>
                                    <td className="px-2 py-1 border text-center">{fmtDate(c.dataVencimento)}</td>
                                    <td className="px-2 py-1 border text-center">{fmtMes(c.monthReference)}</td>
                                    <td className="px-2 py-1 border">{c.descricao ?? TIPO_LABELS_COBS[c.tipoCobranca] ?? c.tipoCobranca}</td>
                                    <td className="px-2 py-1 border text-right font-semibold">{(c.valorOriginalAcordo / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                                  </tr>
                                ))}
                                <tr className="bg-muted/40 font-semibold">
                                  <td colSpan={4} className="px-2 py-1.5 border text-right">Subtotal das cobranças</td>
                                  <td className="px-2 py-1.5 border text-right">{(acordo.somaOriginal / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                                </tr>
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {/* Resumo de acréscimos */}
                      <div className="mt-3 flex justify-end">
                        <table className="text-xs border-collapse min-w-[280px]">
                          <thead><tr className="bg-muted/40"><th className="px-3 py-1.5 border text-left">Descrição</th><th className="px-3 py-1.5 border text-right">Valor (R$)</th></tr></thead>
                          <tbody>
                            <tr><td className="px-3 py-1 border">Acréscimos (juros, multa, honorários)</td><td className="px-3 py-1 border text-right">{(acordo.acrescimos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td></tr>
                            <tr className="bg-muted/40 font-bold"><td className="px-3 py-1.5 border">Total Devido</td><td className="px-3 py-1.5 border text-right text-blue-700">{fmtBRL(acordo.agreedAmount)}</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <Separator />

                    {/* Parcelas do Acordo */}
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Parcelas do Acordo</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted/40 text-left">
                              <th className="px-2 py-1.5 border text-right w-20">Parcela</th>
                              <th className="px-2 py-1.5 border text-center w-24">Vencimento</th>
                              <th className="px-2 py-1.5 border text-center w-24">Liquidação</th>
                              <th className="px-2 py-1.5 border">Observação</th>
                              <th className="px-2 py-1.5 border text-right w-28">Emitido (R$)</th>
                              <th className="px-2 py-1.5 border text-right w-28">Pago (R$)</th>
                              <th className="px-2 py-1.5 border text-center w-24">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {acordo.parcelas.length === 0 ? (
                              <tr><td colSpan={7} className="px-2 py-3 border text-center text-muted-foreground">Nenhuma parcela registrada</td></tr>
                            ) : (
                              <>
                                {acordo.parcelas.map((p: any, idx: number) => (
                                  <tr key={idx} className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                                    <td className="px-2 py-1 border text-right font-mono">{p.nossoNumero ?? String(p.parcelaId).padStart(6, "0")}</td>
                                    <td className="px-2 py-1 border text-center">{fmtDate(p.dueDate)}</td>
                                    <td className="px-2 py-1 border text-center">{fmtDate(p.paymentDate)}</td>
                                    <td className="px-2 py-1 border text-muted-foreground">{p.snapshotDescricao ?? (acordo.installments === 1 ? "Parcela única" : `Parcela ${p.installmentNumber}/${acordo.installments}`)}</td>
                                    <td className="px-2 py-1 border text-right font-semibold">{(p.amount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                                    <td className="px-2 py-1 border text-right text-green-700 font-semibold">{p.status === "pago" ? (p.amount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}</td>
                                    <td className="px-2 py-1 border text-center">
                                      <Badge className={`text-[10px] ${
                                        p.status === "pago" ? "bg-green-100 text-green-800" :
                                        p.status === "atrasado" ? "bg-red-100 text-red-800" :
                                        p.status === "cancelado" ? "bg-gray-100 text-gray-500" :
                                        "bg-yellow-100 text-yellow-800"
                                      }`}>{STATUS_PARCELA_LABELS[p.status] ?? p.status}</Badge>
                                    </td>
                                  </tr>
                                ))}
                                <tr className="bg-muted/40 font-bold">
                                  <td colSpan={4} className="px-2 py-1.5 border text-right">Total do Acordo</td>
                                  <td className="px-2 py-1.5 border text-right text-blue-700">{fmtBRL(acordo.agreedAmount)}</td>
                                  <td className="px-2 py-1.5 border text-right text-green-700">{fmtBRL(acordo.valorPagoEfetivo)}</td>
                                  <td className="px-2 py-1.5 border" />
                                </tr>
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </TabsContent>

        {/* ── Extrato ── */}
        <TabsContent value="extrato" className="space-y-4 mt-4">
          {dadosExtrato && (
            <div className="grid grid-cols-3 gap-4">
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Cobrado</p>
                <p className="text-2xl font-bold">{fmtBRL(dadosExtrato.totais.totalCobrado)}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Pago</p>
                <p className="text-2xl font-bold text-green-600">{fmtBRL(dadosExtrato.totais.totalPago)}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Pendente</p>
                <p className="text-2xl font-bold text-red-600">{fmtBRL(dadosExtrato.totais.totalPendente)}</p>
              </CardContent></Card>
            </div>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Extrato de Cobranças</CardTitle>
              <CardDescription className="text-xs">{dadosExtrato?.rows.length ?? 0} registros</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingExtrato ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="overflow-auto max-h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Devedor</TableHead>
                        <TableHead>Unidade</TableHead>
                        <TableHead>Condomínio</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Pagamento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dadosExtrato?.rows.map((r) => (
                        <TableRow key={r.cobrancaId}>
                          <TableCell className="font-medium text-xs">{r.nomeDevedor}</TableCell>
                          <TableCell className="text-xs">{r.bloco ? `${r.bloco}/` : ""}{r.unidade ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.nomeCondominio}</TableCell>
                          <TableCell className="text-xs max-w-[140px] truncate">{r.descricao ?? "—"}</TableCell>
                          <TableCell className="text-xs">{fmtDate(r.dataVencimento)}</TableCell>
                          <TableCell className="text-xs">{fmtDate(r.dataPagamento)}</TableCell>
                          <TableCell className="text-right text-xs font-semibold">{fmtBRL(r.valorOriginal ?? 0)}</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${STATUS_COLORS[r.status] ?? ""}`}>
                              {STATUS_LABELS[r.status] ?? r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!dadosExtrato?.rows.length && (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Recuperação ── */}
        <TabsContent value="recuperacao" className="space-y-4 mt-4">
          {dadosRecup && (
            <div className="grid grid-cols-3 gap-4">
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Valor Recuperado</p>
                <p className="text-2xl font-bold text-green-600">{fmtBRL(dadosRecup.totais.totalRecuperado)}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Ainda em Aberto</p>
                <p className="text-2xl font-bold text-red-600">{fmtBRL(dadosRecup.totais.totalEmAberto)}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Taxa de Recuperação</p>
                <p className="text-2xl font-bold text-blue-600">{dadosRecup.totais.taxaRecuperacao}%</p>
              </CardContent></Card>
            </div>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Cobranças Recuperadas (Pagas)</CardTitle>
              <CardDescription className="text-xs">{dadosRecup?.rows.length ?? 0} registros</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingRecup ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="overflow-auto max-h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Devedor</TableHead>
                        <TableHead>Unidade</TableHead>
                        <TableHead>Condomínio</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Pago em</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dadosRecup?.rows.map((r) => (
                        <TableRow key={r.cobrancaId}>
                          <TableCell className="font-medium text-xs">{r.nomeDevedor}</TableCell>
                          <TableCell className="text-xs">{r.bloco ? `${r.bloco}/` : ""}{r.unidade ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.nomeCondominio}</TableCell>
                          <TableCell className="text-xs max-w-[140px] truncate">{r.descricao ?? "—"}</TableCell>
                          <TableCell className="text-xs">{fmtDate(r.dataVencimento)}</TableCell>
                          <TableCell className="text-xs text-green-600">{fmtDate(r.dataPagamento)}</TableCell>
                          <TableCell className="text-right text-xs font-semibold text-green-600">{fmtBRL(r.valorOriginal ?? 0)}</TableCell>
                        </TableRow>
                      ))}
                      {!dadosRecup?.rows.length && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Produtividade ── */}
        <TabsContent value="produtividade" className="space-y-4 mt-4">
          {dadosProdRaw && (
            <div className="grid grid-cols-2 gap-4">
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total de Tentativas</p>
                <p className="text-2xl font-bold">{dadosProdRaw.reduce((s, r) => s + r.totalTentativas, 0)}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Cobradores Ativos</p>
                <p className="text-2xl font-bold">{dadosProdRaw.length}</p>
              </CardContent></Card>
            </div>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Performance por Colaborador</CardTitle>
              <CardDescription className="text-xs">{dadosProdRaw?.length ?? 0} colaboradores</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingProd ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="overflow-auto max-h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead className="text-right">Tentativas</TableHead>
                        <TableHead className="text-right">Devedores Contatados</TableHead>
                        <TableHead className="text-right">Promessas</TableHead>
                        <TableHead className="text-right">Sem Resposta</TableHead>
                        <TableHead className="text-right">Taxa Sucesso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dadosProdRaw?.map((r) => (
                        <TableRow key={r.colaboradorId}>
                          <TableCell className="font-medium">{r.colaboradorNome}</TableCell>
                          <TableCell className="text-right">{r.totalTentativas}</TableCell>
                          <TableCell className="text-right">{r.devedoresUnicos}</TableCell>
                          <TableCell className="text-right text-green-600">{r.tentativasPromessa}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{r.tentativasSemResposta}</TableCell>
                          <TableCell className="text-right font-semibold">{r.taxaSucesso}%</TableCell>
                        </TableRow>
                      ))}
                      {!dadosProdRaw?.length && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
