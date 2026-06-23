import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Download, FileText, Filter, ChevronDown, ChevronUp, Printer, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

const fmtBRL = (v: number) =>
  (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
};

const TIPOS_COBRANCA = [
  { value: "condominio", label: "Cota Condominial" },
  { value: "salao_jogos", label: "Salão de Festa" },
  { value: "churrasqueira", label: "Churrasqueira" },
  { value: "cota_extra", label: "Cota Extra" },
  { value: "multa", label: "Multa" },
  { value: "outros", label: "Outros" },
];

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente", em_cobranca: "Em Cobrança", pago: "Pago",
  acordo: "Acordo", em_acordo: "Em Acordo", acordo_atrasado: "Acordo Atrasado",
  em_negociacao: "Em Negociação", suspenso: "Suspenso", judicial: "Judicial",
  cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-800", em_cobranca: "bg-blue-100 text-blue-800",
  acordo: "bg-purple-100 text-purple-800", em_acordo: "bg-purple-100 text-purple-800",
  acordo_atrasado: "bg-orange-100 text-orange-800", em_negociacao: "bg-cyan-100 text-cyan-800",
  suspenso: "bg-gray-100 text-gray-800", judicial: "bg-red-100 text-red-800",
};

const TIPO_LABELS: Record<string, string> = {
  condominio: "Cota Condominial", salao_jogos: "Salão de Festa",
  churrasqueira: "Churrasqueira", cota_extra: "Cota Extra",
  multa: "Multa", outros: "Outros",
};

export default function RelatorioInadimplencia() {
  // ─── Filtros ────────────────────────────────────────────────────────────────
  const [condominioId, setCondominioId] = useState<string>("");
  const [devedorId, setDevedorId] = useState<string>("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [atualizadoAte, setAtualizadoAte] = useState(new Date().toISOString().slice(0, 10));
  const [tiposCobranca, setTiposCobranca] = useState<string[]>(["todos"]);
  const [categoria, setCategoria] = useState<"todos" | "padrao" | "ajuizada">("todos");
  const [honorariosPerc, setHonorariosPerc] = useState<string>("");
  const [custasJudiciais, setCustasJudiciais] = useState<string>("");
  const [outrasDespesas, setOutrasDespesas] = useState<string>("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [buscou, setBuscou] = useState(false);

  // ─── Dados ──────────────────────────────────────────────────────────────────
  const { data: listaCondominios = [] } = trpc.condominios.list.useQuery(undefined as any);

  const condominioIdNum = condominioId && condominioId !== "todos" ? parseInt(condominioId) : undefined;

  const { data: listaDevedores = [] } = trpc.devedores.list.useQuery(
    { condominioId: condominioIdNum! },
    { enabled: !!condominioIdNum }
  );

  const [queryInput, setQueryInput] = useState<any>(null);

  const { data: dadosInad, isLoading, refetch } = trpc.relatorios.inadimplencia.useQuery(
    queryInput,
    { enabled: !!queryInput }
  );

  const handleBuscar = () => {
    const input: any = {
      atualizadoAte: atualizadoAte || undefined,
      categoria: categoria !== "todos" ? categoria : undefined,
    };
    if (condominioIdNum) input.condominioId = condominioIdNum;
    if (devedorId && devedorId !== "todos") input.devedorId = parseInt(devedorId);
    if (dataInicio) input.dataInicio = dataInicio;
    if (dataFim) input.dataFim = dataFim;
    if (!tiposCobranca.includes("todos") && tiposCobranca.length > 0) input.tiposCobranca = tiposCobranca;
    if (honorariosPerc !== "") input.honorariosPerc = parseFloat(honorariosPerc);
    if (custasJudiciais !== "") input.custasJudiciais = Math.round(parseFloat(custasJudiciais) * 100);
    if (outrasDespesas !== "") input.outrasDespesas = Math.round(parseFloat(outrasDespesas) * 100);
    setQueryInput(input);
    setBuscou(true);
  };

  const toggleTipo = (tipo: string) => {
    if (tipo === "todos") {
      setTiposCobranca(["todos"]);
      return;
    }
    setTiposCobranca(prev => {
      const semTodos = prev.filter(t => t !== "todos");
      if (semTodos.includes(tipo)) {
        const novo = semTodos.filter(t => t !== tipo);
        return novo.length === 0 ? ["todos"] : novo;
      }
      return [...semTodos, tipo];
    });
  };

  // ─── Agrupamento por devedor ─────────────────────────────────────────────────
  const rowsAgrupadas = useMemo(() => {
    if (!dadosInad?.rows) return [];
    const mapa = new Map<number, { devedor: string; unidade: string; bloco: string; condominio: string; linhas: typeof dadosInad.rows; subtotal: number }>();
    for (const r of dadosInad.rows) {
      const existing = mapa.get(r.devedorId);
      if (existing) {
        existing.linhas.push(r);
        existing.subtotal += r.totalFinal;
      } else {
        mapa.set(r.devedorId, {
          devedor: r.nomeDevedor ?? "",
          unidade: r.unidade ?? "",
          bloco: r.bloco ?? "",
          condominio: r.nomeCondominio ?? "",
          linhas: [r],
          subtotal: r.totalFinal,
        });
      }
    }
    return Array.from(mapa.values()).sort((a, b) => a.devedor.localeCompare(b.devedor));
  }, [dadosInad]);

  // ─── Exportação Excel ────────────────────────────────────────────────────────
  const exportarExcel = useCallback(async () => {
    if (!dadosInad?.rows.length) { toast.error("Nenhum dado para exportar"); return; }
    setExportando(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Sistema de Cobranças";
      wb.created = new Date();
      const ws = wb.addWorksheet("Inadimplência");

      const headers = [
        "Devedor", "CPF/CNPJ", "Unidade", "Bloco", "Condomínio",
        "Tipo", "Descrição", "Vencimento", "Meses Atraso",
        "Valor Original (R$)", "Juros (R$)", "Multa (R$)", "Correção (R$)",
        "Honorários (R$)", "Custas (R$)", "Outras Despesas (R$)", "Total Atualizado (R$)",
        "Status", "Categoria",
      ];
      const headerRow = ws.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

      for (const r of dadosInad.rows) {
        ws.addRow([
          r.nomeDevedor ?? "", r.cpfCnpj ?? "", r.unidade ?? "", r.bloco ?? "", r.nomeCondominio ?? "",
          TIPO_LABELS[r.tipoCobranca ?? ""] ?? r.tipoCobranca ?? "",
          r.descricao ?? "", fmtDate(r.dataVencimento), r.mesesAtraso,
          (r.valorOriginal ?? 0) / 100, r.juros / 100, r.multa / 100, r.correcao / 100,
          r.honorarios / 100, (r.custas + r.custasGlobais) / 100, r.outrasDespesas / 100,
          r.totalFinal / 100,
          STATUS_LABELS[r.status] ?? r.status, r.categoria === "ajuizada" ? "Ajuizada" : "Padrão",
        ]);
      }

      // Linha de total
      const totalRow = ws.addRow([
        "TOTAL GERAL", "", "", "", "", "", "", "", "",
        dadosInad.totais.totalValorOriginal / 100,
        dadosInad.totais.totalJuros / 100,
        dadosInad.totais.totalMulta / 100,
        dadosInad.totais.totalCorrecao / 100,
        dadosInad.totais.totalHonorarios / 100,
        dadosInad.totais.totalCustas / 100,
        dadosInad.totais.totalOutras / 100,
        dadosInad.totais.totalAtualizado / 100,
        "", "",
      ]);
      totalRow.font = { bold: true };
      totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };

      ws.columns.forEach((col) => { col.width = 18; });
      // Formatar colunas monetárias
      [10, 11, 12, 13, 14, 15, 16, 17].forEach(i => {
        ws.getColumn(i).numFmt = '"R$"#,##0.00';
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-inadimplencia-${atualizadoAte || new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Planilha exportada com sucesso!");
    } catch (e) {
      toast.error("Erro ao exportar planilha");
    } finally {
      setExportando(false);
    }
  }, [dadosInad, atualizadoAte]);

  // ─── Exportação PDF ──────────────────────────────────────────────────────────
  const exportarPDF = useCallback(async () => {
    if (!dadosInad?.rows.length) { toast.error("Nenhum dado para exportar"); return; }
    setExportando(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // Cabeçalho
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("RELATÓRIO DE INADIMPLÊNCIA", 148, 15, { align: "center" });

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const cond = (listaCondominios as any[]).find((c: any) => c.id === condominioIdNum);
      const linhaFiltros = [
        cond ? `Condomínio: ${cond.name}` : "Condomínio: Todos",
        `Atualizado até: ${fmtDate(atualizadoAte)}`,
        dataInicio || dataFim ? `Período: ${dataInicio ? fmtDate(dataInicio) : "—"} a ${dataFim ? fmtDate(dataFim) : "—"}` : "",
        `Categoria: ${categoria === "todos" ? "Todos" : categoria === "ajuizada" ? "Ajuizados" : "Padrão"}`,
      ].filter(Boolean).join("   |   ");
      doc.text(linhaFiltros, 148, 22, { align: "center" });

      doc.setFontSize(8);
      doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 14, 28);

      // Tabela
      autoTable(doc, {
        startY: 32,
        head: [[
          "Devedor", "Unidade", "Condomínio", "Tipo", "Vencimento", "Meses",
          "Valor Orig.", "Juros", "Multa", "Correção", "Honorários", "Custas", "Outras", "Total",
        ]],
        body: dadosInad.rows.map(r => [
          r.nomeDevedor ?? "",
          `${r.bloco ? r.bloco + "/" : ""}${r.unidade ?? ""}`,
          r.nomeCondominio ?? "",
          TIPO_LABELS[r.tipoCobranca ?? ""] ?? "",
          fmtDate(r.dataVencimento),
          r.mesesAtraso,
          fmtBRL(r.valorOriginal ?? 0),
          fmtBRL(r.juros),
          fmtBRL(r.multa),
          fmtBRL(r.correcao),
          fmtBRL(r.honorarios),
          fmtBRL(r.custas + r.custasGlobais),
          fmtBRL(r.outrasDespesas),
          fmtBRL(r.totalFinal),
        ]),
        foot: [[
          "TOTAL GERAL", "", "", "", "", "",
          fmtBRL(dadosInad.totais.totalValorOriginal),
          fmtBRL(dadosInad.totais.totalJuros),
          fmtBRL(dadosInad.totais.totalMulta),
          fmtBRL(dadosInad.totais.totalCorrecao),
          fmtBRL(dadosInad.totais.totalHonorarios),
          fmtBRL(dadosInad.totais.totalCustas),
          fmtBRL(dadosInad.totais.totalOutras),
          fmtBRL(dadosInad.totais.totalAtualizado),
        ]],
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
        footStyles: { fillColor: [255, 243, 205], textColor: [0, 0, 0], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 30 }, 1: { cellWidth: 15 }, 2: { cellWidth: 28 },
          3: { cellWidth: 22 }, 4: { cellWidth: 18 }, 5: { cellWidth: 10 },
          6: { cellWidth: 20, halign: "right" }, 7: { cellWidth: 18, halign: "right" },
          8: { cellWidth: 18, halign: "right" }, 9: { cellWidth: 18, halign: "right" },
          10: { cellWidth: 20, halign: "right" }, 11: { cellWidth: 18, halign: "right" },
          12: { cellWidth: 18, halign: "right" }, 13: { cellWidth: 22, halign: "right" },
        },
        margin: { left: 10, right: 10 },
        showFoot: "lastPage",
      });

      doc.save(`relatorio-inadimplencia-${atualizadoAte || new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF exportado com sucesso!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao exportar PDF");
    } finally {
      setExportando(false);
    }
  }, [dadosInad, atualizadoAte, condominioIdNum, listaCondominios, categoria, dataInicio, dataFim]);

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Relatório de Inadimplência
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Posição atualizada com encargos calculados até a data selecionada</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setFiltrosAbertos(v => !v)}>
            <Filter className="h-4 w-4 mr-1" />
            Filtros
            {filtrosAbertos ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
          <Button variant="outline" size="sm" onClick={exportarExcel} disabled={exportando || !dadosInad?.rows.length}>
            {exportando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportarPDF} disabled={exportando || !dadosInad?.rows.length}>
            {exportando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
            PDF
          </Button>
          <Button size="sm" onClick={handleBuscar} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            Gerar Relatório
          </Button>
        </div>
      </div>

      {/* Painel de filtros */}
      {filtrosAbertos && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Filtros do Relatório</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Linha 1: Condomínio + Unidade + Categoria */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium">1. Condomínio *</Label>
                <Select value={condominioId} onValueChange={v => { setCondominioId(v); setDevedorId(""); }}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecionar condomínio..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os condomínios</SelectItem>
                    {(listaCondominios as any[]).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">2. Unidade</Label>
                <Select value={devedorId} onValueChange={setDevedorId} disabled={!condominioIdNum}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={condominioIdNum ? "Todas as unidades" : "Selecione um condomínio"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as unidades</SelectItem>
                    {(listaDevedores as any[]).map((d: any) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.bloco ? `${d.bloco}/` : ""}{d.unitNumber} — {d.name ?? "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">6. Categoria</Label>
                <Select value={categoria} onValueChange={v => setCategoria(v as any)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos (Padrão + Ajuizados)</SelectItem>
                    <SelectItem value="padrao">Somente Padrão</SelectItem>
                    <SelectItem value="ajuizada">Somente Ajuizados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linha 2: Período + Atualização */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium">3. Período — Início do vencimento</Label>
                <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">3. Período — Fim do vencimento</Label>
                <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">4. Atualizado até *</Label>
                <Input type="date" value={atualizadoAte} onChange={e => setAtualizadoAte(e.target.value)} className="h-9" />
                <p className="text-[10px] text-muted-foreground">Data base para cálculo de juros, multa e correção</p>
              </div>
            </div>

            {/* Linha 3: Tipos de cobrança */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">5. Tipos de Cobrança</Label>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <Checkbox
                    checked={tiposCobranca.includes("todos")}
                    onCheckedChange={() => toggleTipo("todos")}
                  />
                  Todos
                </label>
                {TIPOS_COBRANCA.map(t => (
                  <label key={t.value} className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <Checkbox
                      checked={tiposCobranca.includes(t.value)}
                      onCheckedChange={() => toggleTipo(t.value)}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            {/* Linha 4: Acréscimos */}
            <div>
              <Label className="text-xs font-medium mb-2 block">7. Acréscimos adicionais</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Honorários (%)</Label>
                  <div className="relative">
                    <Input
                      type="number" min={0} max={100} step={0.1}
                      value={honorariosPerc}
                      onChange={e => setHonorariosPerc(e.target.value)}
                      placeholder="Usa taxa do condomínio"
                      className="h-9 pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Se vazio, usa a taxa configurada no condomínio</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Custas Judiciais (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <Input
                      type="number" min={0} step={0.01}
                      value={custasJudiciais}
                      onChange={e => setCustasJudiciais(e.target.value)}
                      placeholder="0,00"
                      className="h-9 pl-8"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">Valor global distribuído entre as cobranças</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Outras Despesas (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <Input
                      type="number" min={0} step={0.01}
                      value={outrasDespesas}
                      onChange={e => setOutrasDespesas(e.target.value)}
                      placeholder="0,00"
                      className="h-9 pl-8"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button onClick={handleBuscar} disabled={isLoading} className="min-w-[140px]">
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Filter className="h-4 w-4 mr-2" />}
                Gerar Relatório
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards de totalizadores */}
      {dadosInad && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "Devedores", value: dadosInad.totais.totalDevedores.toString(), color: "text-foreground" },
            { label: "Cobranças", value: dadosInad.totais.totalCobrado.toString(), color: "text-foreground" },
            { label: "Valor Original", value: fmtBRL(dadosInad.totais.totalValorOriginal), color: "text-red-600" },
            { label: "Juros", value: fmtBRL(dadosInad.totais.totalJuros), color: "text-orange-600" },
            { label: "Multa", value: fmtBRL(dadosInad.totais.totalMulta), color: "text-orange-600" },
            { label: "Correção", value: fmtBRL(dadosInad.totais.totalCorrecao), color: "text-orange-600" },
            { label: "Honorários", value: fmtBRL(dadosInad.totais.totalHonorarios), color: "text-blue-600" },
            { label: "Total Atualizado", value: fmtBRL(dadosInad.totais.totalAtualizado), color: "text-red-700 font-bold" },
          ].map(card => (
            <Card key={card.label} className="text-center">
              <CardContent className="pt-3 pb-3 px-2">
                <p className="text-[10px] text-muted-foreground leading-tight">{card.label}</p>
                <p className={`text-sm font-semibold mt-0.5 ${card.color}`}>{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabela de resultados */}
      {(buscou || dadosInad) && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Cobranças em Aberto</CardTitle>
                <CardDescription className="text-xs">
                  {dadosInad?.rows.length ?? 0} registros · agrupados por devedor
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !dadosInad?.rows.length ? (
              <div className="text-center text-muted-foreground py-16">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma cobrança encontrada com os filtros selecionados</p>
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Devedor / Unidade</TableHead>
                      <TableHead className="text-xs">Condomínio</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Vencimento</TableHead>
                      <TableHead className="text-xs text-center">Meses</TableHead>
                      <TableHead className="text-xs text-right">Valor Orig.</TableHead>
                      <TableHead className="text-xs text-right">Juros</TableHead>
                      <TableHead className="text-xs text-right">Multa</TableHead>
                      <TableHead className="text-xs text-right">Correção</TableHead>
                      <TableHead className="text-xs text-right">Honorários</TableHead>
                      <TableHead className="text-xs text-right">Custas</TableHead>
                      <TableHead className="text-xs text-right">Outras</TableHead>
                      <TableHead className="text-xs text-right font-bold">Total</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsAgrupadas.map((grupo) => (
                      <>
                        {/* Linha de cabeçalho do devedor */}
                        <TableRow key={`header-${grupo.devedor}`} className="bg-muted/30 border-t-2">
                          <TableCell colSpan={12} className="py-1.5 font-semibold text-xs">
                            <span className="text-primary">{grupo.devedor}</span>
                            <span className="text-muted-foreground ml-2 font-normal">
                              {grupo.bloco ? `Bloco ${grupo.bloco} / ` : ""}Unidade {grupo.unidade}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-xs font-bold text-red-700 py-1.5">
                            {fmtBRL(grupo.subtotal)}
                          </TableCell>
                          <TableCell className="py-1.5" />
                        </TableRow>
                        {/* Linhas de cobranças do devedor */}
                        {grupo.linhas.map((r) => (
                          <TableRow key={r.cobrancaId} className="hover:bg-muted/20">
                            <TableCell className="text-xs pl-6 text-muted-foreground">
                              {r.descricao ?? TIPO_LABELS[r.tipoCobranca ?? ""] ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs">{r.nomeCondominio}</TableCell>
                            <TableCell className="text-xs">
                              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                {TIPO_LABELS[r.tipoCobranca ?? ""] ?? r.tipoCobranca}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs">{fmtDate(r.dataVencimento)}</TableCell>
                            <TableCell className="text-xs text-center">
                              <span className={`font-medium ${r.mesesAtraso > 12 ? "text-red-600" : r.mesesAtraso > 6 ? "text-orange-600" : "text-foreground"}`}>
                                {r.mesesAtraso}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-right">{fmtBRL(r.valorOriginal ?? 0)}</TableCell>
                            <TableCell className="text-xs text-right text-orange-600">{fmtBRL(r.juros)}</TableCell>
                            <TableCell className="text-xs text-right text-orange-600">{fmtBRL(r.multa)}</TableCell>
                            <TableCell className="text-xs text-right text-orange-600">{fmtBRL(r.correcao)}</TableCell>
                            <TableCell className="text-xs text-right text-blue-600">{fmtBRL(r.honorarios)}</TableCell>
                            <TableCell className="text-xs text-right">{fmtBRL(r.custas + r.custasGlobais)}</TableCell>
                            <TableCell className="text-xs text-right">{fmtBRL(r.outrasDespesas)}</TableCell>
                            <TableCell className="text-xs text-right font-semibold text-red-700">{fmtBRL(r.totalFinal)}</TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}`}>
                                {STATUS_LABELS[r.status] ?? r.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ))}
                    {/* Linha de total geral */}
                    <TableRow className="bg-yellow-50 border-t-2 font-bold">
                      <TableCell colSpan={5} className="text-xs font-bold">TOTAL GERAL</TableCell>
                      <TableCell className="text-xs text-right font-bold">{fmtBRL(dadosInad.totais.totalValorOriginal)}</TableCell>
                      <TableCell className="text-xs text-right font-bold text-orange-600">{fmtBRL(dadosInad.totais.totalJuros)}</TableCell>
                      <TableCell className="text-xs text-right font-bold text-orange-600">{fmtBRL(dadosInad.totais.totalMulta)}</TableCell>
                      <TableCell className="text-xs text-right font-bold text-orange-600">{fmtBRL(dadosInad.totais.totalCorrecao)}</TableCell>
                      <TableCell className="text-xs text-right font-bold text-blue-600">{fmtBRL(dadosInad.totais.totalHonorarios)}</TableCell>
                      <TableCell className="text-xs text-right font-bold">{fmtBRL(dadosInad.totais.totalCustas)}</TableCell>
                      <TableCell className="text-xs text-right font-bold">{fmtBRL(dadosInad.totais.totalOutras)}</TableCell>
                      <TableCell className="text-xs text-right font-bold text-red-700">{fmtBRL(dadosInad.totais.totalAtualizado)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
