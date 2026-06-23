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
import {
  Loader2, Filter, ChevronDown, ChevronUp, FileSpreadsheet, Printer,
  Phone, Mail, MessageSquare, Users, User, Monitor, CheckCircle2, XCircle,
  Clock, HelpCircle, FileText, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
};
const fmtDateTime = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const RESULTADO_LABELS: Record<string, string> = {
  promessa_pagamento: "Promessa de Pagamento",
  sem_resposta: "Sem Resposta",
  deseja_acordo: "Deseja Acordo",
  recusa: "Recusa",
  outro: "Outro",
};

const RESULTADO_COLORS: Record<string, string> = {
  promessa_pagamento: "bg-green-100 text-green-800",
  sem_resposta: "bg-yellow-100 text-yellow-800",
  deseja_acordo: "bg-blue-100 text-blue-800",
  recusa: "bg-red-100 text-red-800",
  outro: "bg-gray-100 text-gray-700",
};

const TIPO_LABELS: Record<string, string> = {
  telefone: "Telefone",
  email: "E-mail",
  pessoal: "Presencial",
  whatsapp: "WhatsApp",
  sistema: "Sistema (Automação)",
};

const TIPO_ICONS: Record<string, React.ReactNode> = {
  telefone: <Phone className="h-3 w-3" />,
  email: <Mail className="h-3 w-3" />,
  pessoal: <User className="h-3 w-3" />,
  whatsapp: <MessageSquare className="h-3 w-3" />,
  sistema: <Monitor className="h-3 w-3" />,
};

const RESULTADO_OPCOES = [
  { value: "promessa_pagamento", label: "Promessa de Pagamento", icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> },
  { value: "sem_resposta", label: "Sem Resposta", icon: <Clock className="h-3.5 w-3.5 text-yellow-600" /> },
  { value: "deseja_acordo", label: "Deseja Acordo", icon: <TrendingUp className="h-3.5 w-3.5 text-blue-600" /> },
  { value: "recusa", label: "Recusa", icon: <XCircle className="h-3.5 w-3.5 text-red-600" /> },
  { value: "outro", label: "Outro", icon: <HelpCircle className="h-3.5 w-3.5 text-gray-500" /> },
];

const TIPO_OPCOES = [
  { value: "telefone", label: "Telefone" },
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "pessoal", label: "Presencial" },
  { value: "sistema", label: "Sistema (Automação)" },
];

export default function RelatorioCobranca() {
  // ─── Filtros ────────────────────────────────────────────────────────────────
  const [condominioId, setCondominioId] = useState<string>("");
  const [devedorId, setDevedorId] = useState<string>("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [resultados, setResultados] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [responsavelId, setResponsavelId] = useState<string>("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [queryInput, setQueryInput] = useState<any>(null);

  // ─── Dados ──────────────────────────────────────────────────────────────────
  const { data: listaCondominios = [] } = trpc.condominios.list.useQuery(undefined as any);
  const condominioIdNum = condominioId && condominioId !== "todos" ? parseInt(condominioId) : undefined;

  const { data: listaDevedores = [] } = trpc.devedores.list.useQuery(
    { condominioId: condominioIdNum! },
    { enabled: !!condominioIdNum }
  );

  const { data: listaUsuarios = [] } = trpc.users.list.useQuery();

  const { data: dadosCobranca, isLoading } = trpc.relatorios.cobranca.useQuery(
    queryInput,
    { enabled: !!queryInput }
  );

  const handleBuscar = () => {
    const input: any = {};
    if (condominioIdNum) input.condominioId = condominioIdNum;
    if (devedorId && devedorId !== "todos") input.devedorId = parseInt(devedorId);
    if (dataInicio) input.dataInicio = dataInicio;
    if (dataFim) input.dataFim = dataFim;
    if (resultados.length > 0) input.resultadoContato = resultados;
    if (tipos.length > 0) input.tipoContato = tipos;
    if (responsavelId && responsavelId !== "todos") input.responsavelId = parseInt(responsavelId);
    setQueryInput(input);
    setBuscou(true);
  };

  const toggleResultado = (v: string) => {
    setResultados(prev => prev.includes(v) ? prev.filter(r => r !== v) : [...prev, v]);
  };
  const toggleTipo = (v: string) => {
    setTipos(prev => prev.includes(v) ? prev.filter(t => t !== v) : [...prev, v]);
  };

  // ─── Exportação Excel ────────────────────────────────────────────────────────
  const exportarExcel = useCallback(async () => {
    if (!dadosCobranca?.rows.length) { toast.error("Nenhum dado para exportar"); return; }
    setExportando(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Sistema de Cobranças";
      wb.created = new Date();
      const ws = wb.addWorksheet("Relatório de Cobrança");

      const headers = ["Data/Hora", "Devedor", "Unidade", "Bloco", "Condomínio", "Tipo de Contato", "Resultado", "Responsável", "Observações", "Próximo Contato"];
      const headerRow = ws.addRow(headers);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };

      for (const r of dadosCobranca.rows) {
        ws.addRow([
          fmtDateTime(r.dataContato),
          r.nomeDevedor ?? "",
          r.unidade ?? "",
          r.bloco ?? "",
          r.nomeCondominio ?? "",
          TIPO_LABELS[r.tipoContato ?? ""] ?? r.tipoContato ?? "",
          RESULTADO_LABELS[r.resultado ?? ""] ?? r.resultado ?? "",
          r.responsavelNome ?? "",
          r.notas ?? "",
          r.proximaData ? fmtDate(r.proximaData) : "",
        ]);
      }

      // Aba de resumo por responsável
      if (dadosCobranca.porResponsavel.length > 0) {
        const wsResp = wb.addWorksheet("Por Responsável");
        const hResp = wsResp.addRow(["Responsável", "Total", "Promessas", "Sem Resposta", "Recusas", "Taxa Sucesso (%)"]);
        hResp.font = { bold: true, color: { argb: "FFFFFFFF" } };
        hResp.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
        for (const r of dadosCobranca.porResponsavel) {
          wsResp.addRow([r.nome, r.total, r.promessa, r.semResposta, r.recusa, r.taxaSucesso]);
        }
        wsResp.columns.forEach(c => { c.width = 20; });
      }

      ws.columns.forEach(c => { c.width = 22; });
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-cobranca-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Planilha exportada com sucesso!");
    } catch (e) {
      toast.error("Erro ao exportar planilha");
    } finally {
      setExportando(false);
    }
  }, [dadosCobranca]);

  // ─── Exportação PDF ──────────────────────────────────────────────────────────
  const exportarPDF = useCallback(async () => {
    if (!dadosCobranca?.rows.length) { toast.error("Nenhum dado para exportar"); return; }
    setExportando(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("RELATÓRIO DE COBRANÇA / PRODUTIVIDADE", 148, 15, { align: "center" });

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const cond = (listaCondominios as any[]).find((c: any) => c.id === condominioIdNum);
      const filtrosStr = [
        cond ? `Condomínio: ${cond.name}` : "Condomínio: Todos",
        dataInicio || dataFim ? `Período: ${dataInicio ? fmtDate(dataInicio) : "—"} a ${dataFim ? fmtDate(dataFim) : "—"}` : "",
      ].filter(Boolean).join("   |   ");
      doc.text(filtrosStr, 148, 22, { align: "center" });
      doc.setFontSize(8);
      doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}   |   Total: ${dadosCobranca.totais.total} contatos`, 14, 28);

      autoTable(doc, {
        startY: 32,
        head: [["Data/Hora", "Devedor", "Unidade", "Condomínio", "Tipo", "Resultado", "Responsável", "Observações"]],
        body: dadosCobranca.rows.map(r => [
          fmtDateTime(r.dataContato),
          r.nomeDevedor ?? "",
          `${r.bloco ? r.bloco + "/" : ""}${r.unidade ?? ""}`,
          r.nomeCondominio ?? "",
          TIPO_LABELS[r.tipoContato ?? ""] ?? "",
          RESULTADO_LABELS[r.resultado ?? ""] ?? "",
          r.responsavelNome ?? "",
          (r.notas ?? "").slice(0, 60) + ((r.notas?.length ?? 0) > 60 ? "..." : ""),
        ]),
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 25 }, 1: { cellWidth: 35 }, 2: { cellWidth: 15 },
          3: { cellWidth: 30 }, 4: { cellWidth: 22 }, 5: { cellWidth: 30 },
          6: { cellWidth: 28 }, 7: { cellWidth: 55 },
        },
        margin: { left: 10, right: 10 },
      });

      // Segunda página: resumo por responsável
      if (dadosCobranca.porResponsavel.length > 0) {
        doc.addPage();
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("RESUMO POR RESPONSÁVEL", 148, 15, { align: "center" });
        autoTable(doc, {
          startY: 22,
          head: [["Responsável", "Total", "Promessas", "Sem Resposta", "Recusas", "Taxa Sucesso"]],
          body: dadosCobranca.porResponsavel.map(r => [r.nome, r.total, r.promessa, r.semResposta, r.recusa, `${r.taxaSucesso}%`]),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 30, right: 30 },
        });
      }

      doc.save(`relatorio-cobranca-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF exportado com sucesso!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao exportar PDF");
    } finally {
      setExportando(false);
    }
  }, [dadosCobranca, condominioIdNum, listaCondominios, dataInicio, dataFim]);

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Relatório de Cobrança
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Histórico detalhado de contatos e produtividade da equipe</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setFiltrosAbertos(v => !v)}>
            <Filter className="h-4 w-4 mr-1" />
            Filtros
            {filtrosAbertos ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
          <Button variant="outline" size="sm" onClick={exportarExcel} disabled={exportando || !dadosCobranca?.rows.length}>
            {exportando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportarPDF} disabled={exportando || !dadosCobranca?.rows.length}>
            {exportando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
            PDF
          </Button>
          <Button size="sm" onClick={handleBuscar} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Filter className="h-4 w-4 mr-1" />}
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
            {/* Linha 1: Condomínio + Unidade + Responsável */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium">1. Condomínio</Label>
                <Select value={condominioId} onValueChange={v => { setCondominioId(v); setDevedorId(""); }}>
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
                <Label className="text-xs font-medium">6. Responsável</Label>
                <Select value={responsavelId} onValueChange={setResponsavelId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos os operadores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os operadores</SelectItem>
                    {(listaUsuarios as any[]).map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name ?? u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linha 2: Período */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium">3. Período do contato — Início</Label>
                <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">3. Período do contato — Fim</Label>
                <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-9" />
              </div>
            </div>

            <Separator />

            {/* Linha 3: Resultado + Tipo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-medium">4. Resultado do contato</Label>
                <div className="flex flex-col gap-2">
                  {RESULTADO_OPCOES.map(o => (
                    <label key={o.value} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={resultados.includes(o.value)}
                        onCheckedChange={() => toggleResultado(o.value)}
                      />
                      <span className="flex items-center gap-1.5">{o.icon}{o.label}</span>
                    </label>
                  ))}
                  {resultados.length > 0 && (
                    <button className="text-xs text-muted-foreground underline text-left mt-1" onClick={() => setResultados([])}>
                      Limpar seleção
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">5. Tipo de contato</Label>
                <div className="flex flex-col gap-2">
                  {TIPO_OPCOES.map(o => (
                    <label key={o.value} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={tipos.includes(o.value)}
                        onCheckedChange={() => toggleTipo(o.value)}
                      />
                      <span className="flex items-center gap-1.5">
                        {TIPO_ICONS[o.value]}
                        {o.label}
                      </span>
                    </label>
                  ))}
                  {tipos.length > 0 && (
                    <button className="text-xs text-muted-foreground underline text-left mt-1" onClick={() => setTipos([])}>
                      Limpar seleção
                    </button>
                  )}
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
      {dadosCobranca && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Contatos", value: dadosCobranca.totais.total, color: "text-foreground", icon: <Phone className="h-4 w-4" /> },
            { label: "Promessas", value: dadosCobranca.totais.promessa, color: "text-green-700", icon: <CheckCircle2 className="h-4 w-4 text-green-600" /> },
            { label: "Sem Resposta", value: dadosCobranca.totais.semResposta, color: "text-yellow-700", icon: <Clock className="h-4 w-4 text-yellow-600" /> },
            { label: "Deseja Acordo", value: dadosCobranca.totais.deseja_acordo, color: "text-blue-700", icon: <TrendingUp className="h-4 w-4 text-blue-600" /> },
            { label: "Recusas", value: dadosCobranca.totais.recusa, color: "text-red-700", icon: <XCircle className="h-4 w-4 text-red-600" /> },
            { label: "Outros", value: dadosCobranca.totais.outro, color: "text-gray-600", icon: <HelpCircle className="h-4 w-4 text-gray-500" /> },
          ].map(card => (
            <Card key={card.label}>
              <CardContent className="pt-3 pb-3 px-3">
                <div className="flex items-center gap-1.5 mb-1">{card.icon}<p className="text-[10px] text-muted-foreground">{card.label}</p></div>
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Resumo por responsável */}
      {dadosCobranca && dadosCobranca.porResponsavel.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Resumo por Responsável</CardTitle>
            <CardDescription className="text-xs">{dadosCobranca.porResponsavel.length} operador(es)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Responsável</TableHead>
                  <TableHead className="text-xs text-center">Total</TableHead>
                  <TableHead className="text-xs text-center">Promessas</TableHead>
                  <TableHead className="text-xs text-center">Sem Resposta</TableHead>
                  <TableHead className="text-xs text-center">Recusas</TableHead>
                  <TableHead className="text-xs text-center">Taxa de Sucesso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dadosCobranca.porResponsavel.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-medium">{r.nome}</TableCell>
                    <TableCell className="text-xs text-center font-semibold">{r.total}</TableCell>
                    <TableCell className="text-xs text-center text-green-700">{r.promessa}</TableCell>
                    <TableCell className="text-xs text-center text-yellow-700">{r.semResposta}</TableCell>
                    <TableCell className="text-xs text-center text-red-700">{r.recusa}</TableCell>
                    <TableCell className="text-xs text-center">
                      <span className={`font-semibold ${r.taxaSucesso >= 50 ? "text-green-700" : r.taxaSucesso >= 25 ? "text-yellow-700" : "text-red-700"}`}>
                        {r.taxaSucesso}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tabela detalhada */}
      {(buscou || dadosCobranca) && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Histórico Detalhado de Contatos</CardTitle>
                <CardDescription className="text-xs">{dadosCobranca?.rows.length ?? 0} registros</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !dadosCobranca?.rows.length ? (
              <div className="text-center text-muted-foreground py-16">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum contato encontrado com os filtros selecionados</p>
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Data/Hora</TableHead>
                      <TableHead className="text-xs">Devedor</TableHead>
                      <TableHead className="text-xs">Unidade</TableHead>
                      <TableHead className="text-xs">Condomínio</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Resultado</TableHead>
                      <TableHead className="text-xs">Responsável</TableHead>
                      <TableHead className="text-xs">Observações</TableHead>
                      <TableHead className="text-xs">Próximo Contato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosCobranca.rows.map(r => (
                      <TableRow key={r.id} className="hover:bg-muted/20">
                        <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(r.dataContato)}</TableCell>
                        <TableCell className="text-xs font-medium">{r.nomeDevedor}</TableCell>
                        <TableCell className="text-xs">
                          {r.bloco ? `${r.bloco}/` : ""}{r.unidade ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">{r.nomeCondominio}</TableCell>
                        <TableCell className="text-xs">
                          <span className="flex items-center gap-1">
                            {TIPO_ICONS[r.tipoContato ?? ""]}
                            <span className="text-[10px]">{TIPO_LABELS[r.tipoContato ?? ""] ?? r.tipoContato}</span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${RESULTADO_COLORS[r.resultado ?? ""] ?? "bg-gray-100 text-gray-700"}`}>
                            {RESULTADO_LABELS[r.resultado ?? ""] ?? r.resultado ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{r.responsavelNome}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={r.notas ?? ""}>
                          {r.notas ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {r.proximaData ? fmtDate(r.proximaData) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
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
