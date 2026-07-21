import { useState, useCallback, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Download, RefreshCw, FileText, TrendingUp, HandshakeIcon, Receipt, BarChart3, Printer, FileDown, Filter, ChevronDown, ChevronUp, FileSpreadsheet } from "lucide-react";
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

const TIPOS_COBRANCA_RELAT = [
  { value: "condominio", label: "Cota Condominial" },
  { value: "salao_jogos", label: "Salão de Festa" },
  { value: "churrasqueira", label: "Churrasqueira" },
  { value: "cota_extra", label: "Cota Extra" },
  { value: "multa", label: "Multa" },
  { value: "outros", label: "Outros" },
];

const TIPO_LABELS_INAD: Record<string, string> = {
  condominio: "Cota Condominial", salao_jogos: "Salão de Festa",
  churrasqueira: "Churrasqueira", cota_extra: "Cota Extra",
  multa: "Multa", outros: "Outros",
};

export default function Relatorios() {
  const [tipoAtivo, setTipoAtivo] = useState("inadimplencia");
  const [exportando, setExportando] = useState(false);

  // ─── Estado filtros inadimplência (ricos) ───────────────────────────────────
  const [inadCondominioId, setInadCondominioId] = useState<string>("");
  const [inadDevedorId, setInadDevedorId] = useState<string>("");
  const [inadDataInicio, setInadDataInicio] = useState("");
  const [inadDataFim, setInadDataFim] = useState("");
  const [inadAtualizadoAte, setInadAtualizadoAte] = useState(new Date().toISOString().slice(0, 10));
  const [inadTiposCobranca, setInadTiposCobranca] = useState<string[]>(["todos"]);
  const [inadCategoria, setInadCategoria] = useState<"todos" | "padrao" | "ajuizada">("todos");
  const [inadHonorariosPerc, setInadHonorariosPerc] = useState<string>("");
  const [inadCustasJudiciais, setInadCustasJudiciais] = useState<string>("");
  const [inadOutrasDespesas, setInadOutrasDespesas] = useState<string>("");
  const [inadFiltrosAbertos, setInadFiltrosAbertos] = useState(true);
  const [inadQueryInput, setInadQueryInput] = useState<any>(null);
  const [inadBuscou, setInadBuscou] = useState(false);

  const inadCondominioIdNum = inadCondominioId && inadCondominioId !== "todos" ? parseInt(inadCondominioId) : undefined;

  const { data: inadListaDevedores = [] } = trpc.devedores.list.useQuery(
    { condominioId: inadCondominioIdNum! },
    { enabled: !!inadCondominioIdNum }
  );

  const toggleInadTipo = (tipo: string) => {
    if (tipo === "todos") { setInadTiposCobranca(["todos"]); return; }
    setInadTiposCobranca(prev => {
      const semTodos = prev.filter(t => t !== "todos");
      if (semTodos.includes(tipo)) {
        const novo = semTodos.filter(t => t !== tipo);
        return novo.length === 0 ? ["todos"] : novo;
      }
      return [...semTodos, tipo];
    });
  };

  const handleGerarInadimplencia = () => {
    const input: any = {
      atualizadoAte: inadAtualizadoAte || undefined,
      categoria: inadCategoria !== "todos" ? inadCategoria : undefined,
    };
    if (inadCondominioIdNum) input.condominioId = inadCondominioIdNum;
    if (inadDevedorId && inadDevedorId !== "todos") input.devedorId = parseInt(inadDevedorId);
    if (inadDataInicio) input.dataInicio = inadDataInicio;
    if (inadDataFim) input.dataFim = inadDataFim;
    if (!inadTiposCobranca.includes("todos") && inadTiposCobranca.length > 0) input.tiposCobranca = inadTiposCobranca;
    if (inadHonorariosPerc !== "") input.honorariosPerc = parseFloat(inadHonorariosPerc);
    if (inadCustasJudiciais !== "") input.custasJudiciais = Math.round(parseFloat(inadCustasJudiciais) * 100);
    if (inadOutrasDespesas !== "") input.outrasDespesas = Math.round(parseFloat(inadOutrasDespesas) * 100);
    setInadQueryInput(input);
    setInadBuscou(true);
  };

  const { data: listaCondominios = [] } = trpc.condominios.list.useQuery(undefined as any);

  // filtro genérico para outras abas
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [condominioId, setCondominioId] = useState<string>("");
  const filtro = {
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    condominioId: condominioId && condominioId !== "todos" ? parseInt(condominioId) : undefined,
  };

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: dadosInad, isLoading: loadingInad, refetch: refetchInad } =
    trpc.relatorios.inadimplencia.useQuery(inadQueryInput, { enabled: !!inadQueryInput && tipoAtivo === "inadimplencia" });

  const inadRowsAgrupadas = useMemo(() => {
    if (!dadosInad?.rows) return [];
    const mapa = new Map<number, { devedor: string; unidade: string; bloco: string; condominio: string; linhas: typeof dadosInad.rows; subtotal: number }>();
    for (const r of dadosInad.rows) {
      const existing = mapa.get(r.devedorId);
      if (existing) { existing.linhas.push(r); existing.subtotal += r.totalFinal; }
      else { mapa.set(r.devedorId, { devedor: r.nomeDevedor ?? "", unidade: r.unidade ?? "", bloco: r.bloco ?? "", condominio: r.nomeCondominio ?? "", linhas: [r], subtotal: r.totalFinal }); }
    }
    return Array.from(mapa.values()).sort((a, b) => a.devedor.localeCompare(b.devedor));
  }, [dadosInad]);

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

  // ─── Aba Produtividade (Relatório de Cobrança detalhado) ────────────────────
  const [prodCondominioId, setProdCondominioId] = useState<string>("");
  const [prodUnidade, setProdUnidade] = useState<string>("");
  const [prodDataInicio, setProdDataInicio] = useState("");
  const [prodDataFim, setProdDataFim] = useState("");
  const [prodResultados, setProdResultados] = useState<string[]>([]);
  const [prodTipos, setProdTipos] = useState<string[]>([]);
  const [prodUserId, setProdUserId] = useState<string>("");
  const [prodFiltroAtivo, setProdFiltroAtivo] = useState<{
    condominioId?: number; unitNumber?: string; dataInicio?: string; dataFim?: string;
    results?: string[]; contactTypes?: string[]; userId?: number; isSistema?: boolean;
  } | null>(null);

  const { data: listaUnidades = [] } = trpc.relatorios.listarUnidades.useQuery(
    { condominioId: prodCondominioId && prodCondominioId !== "todos" ? parseInt(prodCondominioId) : undefined },
    { enabled: tipoAtivo === "produtividade" }
  );
  const { data: listaOperadores = [] } = trpc.tentativas.listarColaboradores.useQuery(
    undefined, { enabled: tipoAtivo === "produtividade" }
  );

  const prodFiltroTemValor = prodFiltroAtivo !== null;
  const { data: dadosProdRaw, isLoading: loadingProd, refetch: refetchProd } =
    trpc.relatorios.relatorioCobranca.useQuery(
      prodFiltroAtivo ?? {},
      { enabled: prodFiltroTemValor && tipoAtivo === "produtividade" }
    );

  const gerarPDFCobrancaMutation = trpc.relatorios.gerarPDFCobranca.useMutation({
    onSuccess: (result) => {
      const link = document.createElement("a");
      link.href = result.url;
      link.setAttribute("download", `relatorio-cobranca-${new Date().toISOString().slice(0, 10)}.pdf`);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("PDF gerado com sucesso!");
    },
    onError: (err) => toast.error(`Erro ao gerar PDF: ${err.message}`),
  });

  const handleGerarRelatorioCobranca = () => {
    const isSistema = prodTipos.includes("sistema") && prodTipos.length === 1 ? true
      : prodTipos.includes("sistema") ? undefined : undefined;
    const contactTypes = prodTipos.filter((t) => t !== "sistema");
    setProdFiltroAtivo({
      condominioId: prodCondominioId && prodCondominioId !== "todos" ? parseInt(prodCondominioId) : undefined,
      unitNumber: prodUnidade && prodUnidade !== "todas" ? prodUnidade : undefined,
      dataInicio: prodDataInicio || undefined,
      dataFim: prodDataFim || undefined,
      results: prodResultados.length > 0 ? prodResultados : undefined,
      contactTypes: contactTypes.length > 0 ? contactTypes : undefined,
      userId: prodUserId && prodUserId !== "todos" ? parseInt(prodUserId) : undefined,
      isSistema: prodTipos.includes("sistema") ? true : undefined,
    });
  };

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
        const CONTACT_LABELS_XLS: Record<string, string> = {
          telefone: "Telefone", email: "E-mail", whatsapp: "WhatsApp", pessoal: "Presencial", sistema: "Sistema",
        };
        const RESULT_LABELS_XLS: Record<string, string> = {
          promessa_pagamento: "Promessa de Pagamento", sem_resposta: "Sem Resposta",
          recusa: "Recusa", deseja_acordo: "Deseja Acordo", outro: "Outro",
        };
        addSheet("Cobrança", [
          "Data/Hora", "Devedor", "Unidade", "Condomínio",
          "Tipo de Contato", "Resultado", "Responsável", "Observações",
        ], dadosProdRaw.rows.map((r: any) => [
          new Date(r.attemptDate).toLocaleString("pt-BR"),
          r.nomeDevedor,
          r.bloco ? `${r.bloco}/${r.unitNumber}` : r.unitNumber,
          r.nomeCondominio,
          r.isSistema ? "Sistema" : (CONTACT_LABELS_XLS[r.contactType] ?? r.contactType),
          RESULT_LABELS_XLS[r.result ?? ""] ?? r.result ?? "—",
          r.colaboradorNome,
          r.notes ?? "",
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

  const CONTACT_LABELS_UI: Record<string, string> = {
    telefone: "Telefone", email: "E-mail", whatsapp: "WhatsApp", pessoal: "Presencial", sistema: "Sistema",
  };
  const RESULT_LABELS_UI: Record<string, string> = {
    promessa_pagamento: "Promessa de Pagamento", sem_resposta: "Sem Resposta",
    recusa: "Recusa", deseja_acordo: "Deseja Acordo", outro: "Outro",
  };
  const RESULT_COLORS_UI: Record<string, string> = {
    promessa_pagamento: "bg-green-100 text-green-800",
    sem_resposta: "bg-yellow-100 text-yellow-800",
    recusa: "bg-red-100 text-red-800",
    deseja_acordo: "bg-purple-100 text-purple-800",
    outro: "bg-gray-100 text-gray-700",
  };
  const CONTACT_COLORS_UI: Record<string, string> = {
    telefone: "bg-blue-100 text-blue-800",
    email: "bg-indigo-100 text-indigo-800",
    whatsapp: "bg-green-100 text-green-800",
    pessoal: "bg-orange-100 text-orange-800",
    sistema: "bg-gray-100 text-gray-700",
  };

  // ─── Exportação PDF Inadimplência (jsPDF) ───────────────────────────────────────
  const exportarPDFInad = useCallback(async () => {
    if (!dadosInad?.rows.length) { toast.error("Nenhum dado para exportar"); return; }
    setExportando(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.setFontSize(14); doc.setFont("helvetica", "bold");
      doc.text("RELATÓRIO DE INADIMPLÊNCIA", 148, 15, { align: "center" });
      doc.setFontSize(9); doc.setFont("helvetica", "normal");
      const cond = (listaCondominios as any[]).find((c: any) => c.id === inadCondominioIdNum);
      const linhaFiltros = [
        cond ? `Condomínio: ${cond.name}` : "Condomínio: Todos",
        `Atualizado até: ${fmtDate(inadAtualizadoAte)}`,
        inadDataInicio || inadDataFim ? `Período: ${inadDataInicio ? fmtDate(inadDataInicio) : "—"} a ${inadDataFim ? fmtDate(inadDataFim) : "—"}` : "",
        `Categoria: ${inadCategoria === "todos" ? "Todos" : inadCategoria === "ajuizada" ? "Ajuizados" : "Padrão"}`,
      ].filter(Boolean).join("   |   ");
      doc.text(linhaFiltros, 148, 22, { align: "center" });
      doc.setFontSize(8); doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 14, 28);
      autoTable(doc, {
        startY: 32,
        head: [["Devedor", "Unidade", "Condomínio", "Tipo", "Vencimento", "Meses", "Valor Orig.", "Juros", "Multa", "Correção", "Honorários", "Custas", "Outras", "Total"]],
        body: dadosInad.rows.map(r => [
          r.nomeDevedor ?? "", `${r.bloco ? r.bloco + "/" : ""}${r.unidade ?? ""}`, r.nomeCondominio ?? "",
          TIPO_LABELS_INAD[r.tipoCobranca ?? ""] ?? "", fmtDate(r.dataVencimento), r.mesesAtraso,
          fmtBRL(r.valorOriginal ?? 0), fmtBRL(r.juros), fmtBRL(r.multa), fmtBRL(r.correcao),
          fmtBRL(r.honorarios), fmtBRL(r.custas + r.custasGlobais), fmtBRL(r.outrasDespesas), fmtBRL(r.totalFinal),
        ]),
        foot: [["TOTAL GERAL", "", "", "", "", "",
          fmtBRL(dadosInad.totais.totalValorOriginal), fmtBRL(dadosInad.totais.totalJuros),
          fmtBRL(dadosInad.totais.totalMulta), fmtBRL(dadosInad.totais.totalCorrecao),
          fmtBRL(dadosInad.totais.totalHonorarios), fmtBRL(dadosInad.totais.totalCustas),
          fmtBRL(dadosInad.totais.totalOutras), fmtBRL(dadosInad.totais.totalAtualizado),
        ]],
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
        footStyles: { fillColor: [255, 243, 205], textColor: [0, 0, 0], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 30 }, 1: { cellWidth: 15 }, 2: { cellWidth: 28 }, 3: { cellWidth: 22 },
          4: { cellWidth: 18 }, 5: { cellWidth: 10 }, 6: { cellWidth: 20, halign: "right" },
          7: { cellWidth: 18, halign: "right" }, 8: { cellWidth: 18, halign: "right" },
          9: { cellWidth: 18, halign: "right" }, 10: { cellWidth: 20, halign: "right" },
          11: { cellWidth: 18, halign: "right" }, 12: { cellWidth: 18, halign: "right" },
          13: { cellWidth: 22, halign: "right" },
        },
        margin: { left: 10, right: 10 }, showFoot: "lastPage",
      });
      doc.save(`relatorio-inadimplencia-${inadAtualizadoAte || new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF exportado com sucesso!");
    } catch (e) { console.error(e); toast.error("Erro ao exportar PDF"); }
    finally { setExportando(false); }
  }, [dadosInad, inadAtualizadoAte, inadCondominioIdNum, listaCondominios, inadCategoria, inadDataInicio, inadDataFim]);

  const exportarExcelInad = useCallback(async () => {
    if (!dadosInad?.rows.length) { toast.error("Nenhum dado para exportar"); return; }
    setExportando(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Sistema de Cobranças"; wb.created = new Date();
      const ws = wb.addWorksheet("Inadimplência");
      const headers = ["Devedor", "CPF/CNPJ", "Unidade", "Bloco", "Condomínio", "Tipo", "Descrição", "Vencimento", "Meses Atraso", "Valor Original (R$)", "Juros (R$)", "Multa (R$)", "Correção (R$)", "Honorários (R$)", "Custas (R$)", "Outras Despesas (R$)", "Total Atualizado (R$)", "Status", "Categoria"];
      const headerRow = ws.addRow(headers);
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      for (const r of dadosInad.rows) {
        ws.addRow([r.nomeDevedor ?? "", r.cpfCnpj ?? "", r.unidade ?? "", r.bloco ?? "", r.nomeCondominio ?? "",
          TIPO_LABELS_INAD[r.tipoCobranca ?? ""] ?? r.tipoCobranca ?? "", r.descricao ?? "",
          fmtDate(r.dataVencimento), r.mesesAtraso,
          (r.valorOriginal ?? 0) / 100, r.juros / 100, r.multa / 100, r.correcao / 100,
          r.honorarios / 100, (r.custas + r.custasGlobais) / 100, r.outrasDespesas / 100, r.totalFinal / 100,
          STATUS_LABELS[r.status] ?? r.status, r.categoria === "ajuizada" ? "Ajuizada" : "Padrão"]);
      }
      const totalRow = ws.addRow(["TOTAL GERAL", "", "", "", "", "", "", "", "",
        dadosInad.totais.totalValorOriginal / 100, dadosInad.totais.totalJuros / 100,
        dadosInad.totais.totalMulta / 100, dadosInad.totais.totalCorrecao / 100,
        dadosInad.totais.totalHonorarios / 100, dadosInad.totais.totalCustas / 100,
        dadosInad.totais.totalOutras / 100, dadosInad.totais.totalAtualizado / 100, "", ""]);
      totalRow.font = { bold: true };
      totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
      ws.columns.forEach(col => { col.width = 18; });
      [10, 11, 12, 13, 14, 15, 16, 17].forEach(i => { ws.getColumn(i).numFmt = '"R$"#,##0.00'; });
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `relatorio-inadimplencia-${inadAtualizadoAte || new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Planilha exportada com sucesso!");
    } catch (e) { toast.error("Erro ao exportar planilha"); }
    finally { setExportando(false); }
  }, [dadosInad, inadAtualizadoAte]);

  const handleRefresh = () => {
    if (tipoAtivo === "inadimplencia") refetchInad();
    else if (tipoAtivo === "acordos") refetchAcordos();
    else if (tipoAtivo === "produtividade") { if (prodFiltroTemValor) refetchProd(); }
    else if (tipoAtivo === "extrato") refetchExtrato();
    else if (tipoAtivo === "recuperacao") refetchRecup();
  };

  const isLoading = loadingInad || loadingAcordos || (tipoAtivo === "produtividade" ? false : loadingProd) || loadingExtrato || loadingRecup;

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
          ) : tipoAtivo === "inadimplencia" ? (
            <Button variant="outline" size="sm" onClick={exportarPDFInad} disabled={exportando || !dadosInad?.rows.length}>
              {exportando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
              Exportar PDF
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => window.print()}>
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

      {/* Filtros genéricos para abas Acordos/Extrato/Recuperação */}
      {tipoAtivo !== "inadimplencia" && (
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
      )}

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

        {/* ── Inadimplência (filtros ricos) ── */}
        <TabsContent value="inadimplencia" className="space-y-4 mt-4">
          {/* Painel de filtros */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Filtros do Relatório de Inadimplência</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setInadFiltrosAbertos(v => !v)} className="h-7 px-2">
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  {inadFiltrosAbertos ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </div>
            </CardHeader>
            {inadFiltrosAbertos && (
              <CardContent className="space-y-4">
                {/* Linha 1: Condomínio + Unidade + Categoria */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">1. Condomínio</Label>
                    <Select value={inadCondominioId} onValueChange={v => { setInadCondominioId(v); setInadDevedorId(""); }}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Todos os condomínios..." /></SelectTrigger>
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
                    <Select value={inadDevedorId} onValueChange={setInadDevedorId} disabled={!inadCondominioIdNum}>
                      <SelectTrigger className="h-9"><SelectValue placeholder={inadCondominioIdNum ? "Todas as unidades" : "Selecione um condomínio"} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas as unidades</SelectItem>
                        {(inadListaDevedores as any[]).map((d: any) => (
                          <SelectItem key={d.id} value={String(d.id)}>
                            {d.bloco ? `${d.bloco}/` : ""}{d.unitNumber} — {d.name ?? "Sem nome"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">6. Categoria</Label>
                    <Select value={inadCategoria} onValueChange={v => setInadCategoria(v as any)}>
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
                    <Input type="date" value={inadDataInicio} onChange={e => setInadDataInicio(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">3. Período — Fim do vencimento</Label>
                    <Input type="date" value={inadDataFim} onChange={e => setInadDataFim(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">4. Atualizado até *</Label>
                    <Input type="date" value={inadAtualizadoAte} onChange={e => setInadAtualizadoAte(e.target.value)} className="h-9" />
                    <p className="text-[10px] text-muted-foreground">Data base para cálculo de juros, multa e correção</p>
                  </div>
                </div>
                {/* Linha 3: Tipos de cobrança */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">5. Tipos de Cobrança</Label>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <Checkbox checked={inadTiposCobranca.includes("todos")} onCheckedChange={() => toggleInadTipo("todos")} />
                      Todos
                    </label>
                    {TIPOS_COBRANCA_RELAT.map(t => (
                      <label key={t.value} className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <Checkbox checked={inadTiposCobranca.includes(t.value)} onCheckedChange={() => toggleInadTipo(t.value)} />
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
                        <Input type="number" min={0} max={100} step={0.1} value={inadHonorariosPerc} onChange={e => setInadHonorariosPerc(e.target.value)} placeholder="Usa taxa do condomínio" className="h-9 pr-8" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Se vazio, usa a taxa configurada no condomínio</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Custas Judiciais (R$)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                        <Input type="number" min={0} step={0.01} value={inadCustasJudiciais} onChange={e => setInadCustasJudiciais(e.target.value)} placeholder="0,00" className="h-9 pl-8" />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Valor global distribuído entre as cobranças</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Outras Despesas (R$)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                        <Input type="number" min={0} step={0.01} value={inadOutrasDespesas} onChange={e => setInadOutrasDespesas(e.target.value)} placeholder="0,00" className="h-9 pl-8" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={exportarExcelInad} disabled={exportando || !dadosInad?.rows.length}>
                    {exportando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportarPDFInad} disabled={exportando || !dadosInad?.rows.length}>
                    {exportando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
                    PDF
                  </Button>
                  <Button onClick={handleGerarInadimplencia} disabled={loadingInad} className="min-w-[140px]">
                    {loadingInad ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Filter className="h-4 w-4 mr-2" />}
                    Gerar Relatório
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

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

          {/* Tabela de resultados agrupada por devedor */}
          {(inadBuscou || dadosInad) && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Cobranças em Aberto</CardTitle>
                    <CardDescription className="text-xs">{dadosInad?.rows.length ?? 0} registros · agrupados por devedor</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingInad ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
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
                        {inadRowsAgrupadas.map((grupo) => (
                          <>
                            <TableRow key={`header-${grupo.devedor}`} className="bg-muted/30 border-t-2">
                              <TableCell colSpan={12} className="py-1.5 font-semibold text-xs">
                                <span className="text-primary">{grupo.devedor}</span>
                                <span className="text-muted-foreground ml-2 font-normal">
                                  {grupo.bloco ? `Bloco ${grupo.bloco} / ` : ""}Unidade {grupo.unidade}
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-xs font-bold text-red-700 py-1.5">{fmtBRL(grupo.subtotal)}</TableCell>
                              <TableCell className="py-1.5" />
                            </TableRow>
                            {grupo.linhas.map((r) => (
                              <TableRow key={r.cobrancaId} className="hover:bg-muted/20">
                                <TableCell className="text-xs pl-6 text-muted-foreground">{r.descricao ?? TIPO_LABELS_INAD[r.tipoCobranca ?? ""] ?? "—"}</TableCell>
                                <TableCell className="text-xs">{r.nomeCondominio}</TableCell>
                                <TableCell className="text-xs"><span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{TIPO_LABELS_INAD[r.tipoCobranca ?? ""] ?? r.tipoCobranca}</span></TableCell>
                                <TableCell className="text-xs">{fmtDate(r.dataVencimento)}</TableCell>
                                <TableCell className="text-xs text-center">
                                  <span className={`font-medium ${r.mesesAtraso > 12 ? "text-red-600" : r.mesesAtraso > 6 ? "text-orange-600" : "text-foreground"}`}>{r.mesesAtraso}</span>
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
                                  <Badge className={`text-[10px] ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}`}>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </>
                        ))}
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

        {/* ── Produtividade (Relatório de Cobrança) ── */}
        <TabsContent value="produtividade" className="space-y-4 mt-4">
          {/* Filtros locais da aba */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Filtros do Relatório de Cobrança</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {/* 1. Condomínio */}
                <div className="space-y-1">
                  <Label className="text-xs">Condomínio</Label>
                  <Select value={prodCondominioId} onValueChange={(v) => { setProdCondominioId(v); setProdUnidade(""); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos os condomínios" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os condomínios</SelectItem>
                      {listaCondominios.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* 2. Unidade */}
                <div className="space-y-1">
                  <Label className="text-xs">Unidade</Label>
                  <Select value={prodUnidade} onValueChange={setProdUnidade} disabled={listaUnidades.length === 0}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas as unidades" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as unidades</SelectItem>
                      {listaUnidades.map((u: string) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* 3. Período */}
                <div className="space-y-1">
                  <Label className="text-xs">Período do contato</Label>
                  <div className="flex gap-1">
                    <Input type="date" className="h-8 text-xs" value={prodDataInicio} onChange={(e) => setProdDataInicio(e.target.value)} />
                    <Input type="date" className="h-8 text-xs" value={prodDataFim} onChange={(e) => setProdDataFim(e.target.value)} />
                  </div>
                </div>
                {/* 4. Resultado */}
                <div className="space-y-1">
                  <Label className="text-xs">Resultado do contato</Label>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {["promessa_pagamento", "sem_resposta", "recusa", "outro"].map((r) => (
                      <button key={r} type="button"
                        onClick={() => setProdResultados((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r])}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                          prodResultados.includes(r)
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        }`}>
                        {RESULT_LABELS_UI[r]}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 5. Tipo de contato */}
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de contato</Label>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {["telefone", "email", "whatsapp", "pessoal", "sistema"].map((t) => (
                      <button key={t} type="button"
                        onClick={() => setProdTipos((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                          prodTipos.includes(t)
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        }`}>
                        {CONTACT_LABELS_UI[t]}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 6. Responsável */}
                <div className="space-y-1">
                  <Label className="text-xs">Responsável</Label>
                  <Select value={prodUserId} onValueChange={setProdUserId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos os operadores" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os operadores</SelectItem>
                      {listaOperadores.map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name ?? u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Botões de ação */}
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleGerarRelatorioCobranca} className="h-8 text-xs">
                  <RefreshCw className="h-3 w-3 mr-1" /> Gerar Relatório
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs"
                  disabled={!dadosProdRaw || gerarPDFCobrancaMutation.isPending}
                  onClick={() => gerarPDFCobrancaMutation.mutate(prodFiltroAtivo ?? {})}>
                  {gerarPDFCobrancaMutation.isPending
                    ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Gerando PDF...</>
                    : <><FileDown className="h-3 w-3 mr-1" /> Exportar PDF</>}
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs"
                  disabled={!dadosProdRaw || exportando}
                  onClick={exportarExcel}>
                  {exportando ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Exportando...</>
                    : <><Download className="h-3 w-3 mr-1" /> Exportar Excel</>}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Cards de totais */}
          {dadosProdRaw && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "Total de Contatos", value: dadosProdRaw.totais.total, color: "text-foreground" },
                { label: "Promessas", value: dadosProdRaw.totais.promessas, color: "text-green-600" },
                { label: "Sem Resposta", value: dadosProdRaw.totais.semResposta, color: "text-yellow-600" },
                { label: "Recusas", value: dadosProdRaw.totais.recusas, color: "text-red-600" },
                { label: "Outros", value: dadosProdRaw.totais.outros, color: "text-muted-foreground" },
              ].map((c) => (
                <Card key={c.label}><CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                </CardContent></Card>
              ))}
            </div>
          )}

          {/* Tabela de contatos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Contatos Realizados</CardTitle>
              <CardDescription className="text-xs">
                {dadosProdRaw ? `${dadosProdRaw.rows.length} registros` : "Aplique os filtros e clique em Gerar Relatório"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingProd ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !dadosProdRaw ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
                  <p className="text-sm">Selecione os filtros e clique em "Gerar Relatório"</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[520px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Data/Hora</TableHead>
                        <TableHead className="text-xs">Devedor</TableHead>
                        <TableHead className="text-xs">Unidade</TableHead>
                        <TableHead className="text-xs">Condomínio</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Resultado</TableHead>
                        <TableHead className="text-xs">Responsável</TableHead>
                        <TableHead className="text-xs">Observações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dadosProdRaw.rows.map((r: any) => (
                        <TableRow key={r.tentativaId}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(r.attemptDate).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                          </TableCell>
                          <TableCell className="text-xs font-medium">{r.nomeDevedor}</TableCell>
                          <TableCell className="text-xs">{r.bloco ? `${r.bloco}/` : ""}{r.unitNumber}</TableCell>
                          <TableCell className="text-xs max-w-[120px] truncate">{r.nomeCondominio}</TableCell>
                          <TableCell className="text-xs">
                            <Badge className={`text-[10px] ${CONTACT_COLORS_UI[r.isSistema ? "sistema" : r.contactType] ?? "bg-gray-100 text-gray-700"}`}>
                              {r.isSistema ? "Sistema" : (CONTACT_LABELS_UI[r.contactType] ?? r.contactType)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge className={`text-[10px] ${RESULT_COLORS_UI[r.result ?? ""] ?? "bg-gray-100 text-gray-700"}`}>
                              {RESULT_LABELS_UI[r.result ?? ""] ?? r.result ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{r.colaboradorNome}</TableCell>
                          <TableCell className="text-xs max-w-[160px] truncate text-muted-foreground">{r.notes ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                      {dadosProdRaw.rows.length === 0 && (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum contato encontrado com os filtros selecionados</TableCell></TableRow>
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
