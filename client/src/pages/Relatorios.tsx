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
import { Loader2, Download, RefreshCw, FileText, TrendingUp, HandshakeIcon, Receipt, BarChart3 } from "lucide-react";
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

  const { data: listaCondominios = [] } = trpc.condominios.list.useQuery(undefined as any);

  const filtro = {
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    condominioId: condominioId ? parseInt(condominioId) : undefined,
  };

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: dadosInad, isLoading: loadingInad, refetch: refetchInad } =
    trpc.relatorios.inadimplencia.useQuery(filtro, { enabled: tipoAtivo === "inadimplencia" });

  const { data: dadosAcordos, isLoading: loadingAcordos, refetch: refetchAcordos } =
    trpc.relatorios.acordosPeriodo.useQuery(filtro, { enabled: tipoAtivo === "acordos" });

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
          "Devedor", "CPF/CNPJ", "Unidade", "Bloco", "Condomínio",
          "Status", "Valor Acordo (R$)", "Parcelas", "Valor Pago (R$)", "Data Criação",
        ], dadosAcordos.rows.map((r) => [
          r.nomeDevedor, r.cpfCnpj ?? "", r.unidade ?? "", r.bloco ?? "", r.nomeCondominio,
          STATUS_LABELS[r.status] ?? r.status, (r.valorTotal ?? 0) / 100,
          r.numParcelas, (r.valorPago ?? 0) / 100, fmtDate(r.dataCriacao),
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

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Exporte e analise dados do sistema</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={exportarExcel} disabled={exportando || isLoading}>
            {exportando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Exportar Excel
          </Button>
        </div>
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
                  <SelectItem value="">Todos os condomínios</SelectItem>
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
        <TabsList className="grid grid-cols-5 w-full">
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
                <p className="text-2xl font-bold text-red-600">{fmtBRL(dadosInad.totais.totalValor)}</p>
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

        {/* ── Acordos ── */}
        <TabsContent value="acordos" className="space-y-4 mt-4">
          {dadosAcordos && (
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
                <p className="text-xs text-muted-foreground">Valor Recuperado</p>
                <p className="text-2xl font-bold text-green-600">{fmtBRL(dadosAcordos.totais.valorRecuperado)}</p>
              </CardContent></Card>
            </div>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Acordos no Período</CardTitle>
              <CardDescription className="text-xs">{dadosAcordos?.rows.length ?? 0} registros</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAcordos ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="overflow-auto max-h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Devedor</TableHead>
                        <TableHead>Unidade</TableHead>
                        <TableHead>Condomínio</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor Acordo</TableHead>
                        <TableHead className="text-right">Parcelas</TableHead>
                        <TableHead className="text-right">Valor Pago</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dadosAcordos?.rows.map((r) => (
                        <TableRow key={r.acordoId}>
                          <TableCell className="font-medium text-xs">{r.nomeDevedor}</TableCell>
                          <TableCell className="text-xs">{r.bloco ? `${r.bloco}/` : ""}{r.unidade ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.nomeCondominio}</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${STATUS_COLORS[r.status] ?? ""}`}>
                              {STATUS_LABELS[r.status] ?? r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold">{fmtBRL(r.valorTotal ?? 0)}</TableCell>
                          <TableCell className="text-right text-xs">{r.numParcelas}x</TableCell>
                          <TableCell className="text-right text-xs text-green-600">{fmtBRL(r.valorPago ?? 0)}</TableCell>
                          <TableCell className="text-xs">{fmtDate(r.dataCriacao)}</TableCell>
                        </TableRow>
                      ))}
                      {!dadosAcordos?.rows.length && (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
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
