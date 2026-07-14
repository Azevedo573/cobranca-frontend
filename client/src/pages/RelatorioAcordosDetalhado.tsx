import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, FileDown, FileText, RefreshCw, HandshakeIcon } from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmtBRL = (v: number | null | undefined) => {
  if (v == null) return "R$ 0,00";
  return (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
};

const fmtMes = (ref: string | null | undefined) => {
  if (!ref) return "—";
  // formato esperado: "MM/YYYY" ou "YYYY-MM"
  if (ref.includes("-")) {
    const [y, m] = ref.split("-");
    return `${m}/${y}`;
  }
  return ref;
};

const TIPO_LABELS: Record<string, string> = {
  condominio: "Condomínio",
  salao_jogos: "Salão de Jogos",
  churrasqueira: "Churrasqueira",
  cota_extra: "Cota Extra",
  multa: "Multa",
  outros: "Outros",
};

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  pago: "Pago",
  cancelado: "Cancelado",
  inadimplente: "Inadimplente",
};

const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-blue-100 text-blue-800",
  pago: "bg-green-100 text-green-800",
  cancelado: "bg-gray-100 text-gray-500",
  inadimplente: "bg-red-100 text-red-800",
};

const STATUS_PARCELA_LABELS: Record<string, string> = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

// ─── Componente principal ────────────────────────────────────────────────────
export default function RelatorioAcordosDetalhado() {
  const printRef = useRef<HTMLDivElement>(null);

  const [condominioId, setCondominioId] = useState<string>("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<{
    condominioId?: number;
    dataInicio?: string;
    dataFim?: string;
  }>({});

  const { data: listaCondominios = [] } = trpc.condominios.list.useQuery(undefined as any);

  const { data, isLoading, refetch } = trpc.relatorios.acordosDetalhado.useQuery(filtroAtivo, {
    enabled: Object.keys(filtroAtivo).length > 0,
  });

  const handleFiltrar = () => {
    setFiltroAtivo({
      condominioId: condominioId && condominioId !== "todos" ? parseInt(condominioId) : undefined,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
    });
  };

  const gerarPDFMutation = trpc.relatorios.gerarPDFAcordos.useMutation({
    onSuccess: (result) => {
      // Abrir o PDF em nova aba para download
      window.open(result.url, "_blank");
      toast.success("PDF gerado com sucesso!");
    },
    onError: (err) => {
      toast.error(`Erro ao gerar PDF: ${err.message}`);
    },
  });

  const handleGerarPDF = () => {
    if (Object.keys(filtroAtivo).length === 0) {
      toast.error("Selecione os filtros e gere o relatório antes de exportar o PDF.");
      return;
    }
    gerarPDFMutation.mutate(filtroAtivo);
  };

  const nomeCondominio = condominioId && condominioId !== "todos"
    ? (listaCondominios as any[]).find((c: any) => String(c.id) === condominioId)?.name ?? ""
    : "Todos os condomínios";

  const periodoLabel = dataInicio || dataFim
    ? `${dataInicio ? new Date(dataInicio).toLocaleDateString("pt-BR") : "—"} a ${dataFim ? new Date(dataFim).toLocaleDateString("pt-BR") : "—"}`
    : "Todo o período";

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HandshakeIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Relatório de Acordos</h1>
            <p className="text-sm text-muted-foreground">Detalhamento completo por acordo: cobranças originais, acréscimos e parcelas</p>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGerarPDF}
            disabled={!data || gerarPDFMutation.isPending}
          >
            {gerarPDFMutation.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <FileDown className="h-4 w-4 mr-2" />}
            {gerarPDFMutation.isPending ? "Gerando PDF..." : "Exportar PDF"}
          </Button>
        </div>
      </div>

      {/* ── Filtros ── */}
      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Condomínio</Label>
              <Select value={condominioId} onValueChange={setCondominioId}>
                <SelectTrigger className="h-8 text-xs">
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
              <Label className="text-xs">Data início</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data fim</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button className="h-8 w-full text-xs" onClick={handleFiltrar}>
                Gerar Relatório
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Conteúdo imprimível ── */}
      <div ref={printRef} className="space-y-6">

        {/* Cabeçalho do relatório (visível na impressão) */}
        {data && (
          <div className="print:block hidden border-b pb-4 mb-6">
            <h1 className="text-2xl font-bold">Relatório de Acordos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              <strong>Condomínio:</strong> {nomeCondominio} &nbsp;|&nbsp;
              <strong>Período:</strong> {periodoLabel}
            </p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Carregando acordos...</span>
          </div>
        )}

        {/* Estado inicial */}
        {!isLoading && Object.keys(filtroAtivo).length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <HandshakeIcon className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">Selecione os filtros e clique em "Gerar Relatório"</p>
            <p className="text-xs text-muted-foreground mt-1">Você pode filtrar por condomínio e período</p>
          </div>
        )}

        {/* Sem resultados */}
        {!isLoading && data && data.acordos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">Nenhum acordo encontrado no período</p>
          </div>
        )}

        {/* Totais gerais */}
        {data && data.acordos.length > 0 && (
          <>
            {/* Cards de resumo */}
            <div className="grid grid-cols-3 gap-4 print:hidden">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Total de Acordos</p>
                  <p className="text-2xl font-bold">{data.totais.totalAcordos}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Valor Total Acordado</p>
                  <p className="text-2xl font-bold text-blue-600">{fmtBRL(data.totais.valorTotal)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Valor Pago</p>
                  <p className="text-2xl font-bold text-green-600">{fmtBRL(data.totais.valorPago)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Cabeçalho do relatório (visível na tela) */}
            <div className="print:hidden">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{nomeCondominio}</span>
                <span>·</span>
                <span>{periodoLabel}</span>
                <span>·</span>
                <span>{data.acordos.length} acordo(s)</span>
              </div>
            </div>

            {/* Lista de acordos */}
            {data.acordos.map((acordo: any) => (
              <div key={acordo.acordoId} className="border rounded-lg overflow-hidden print:break-inside-avoid print:mb-8">

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
                      <div>
                        <span className="text-xs text-muted-foreground block">Devedor</span>
                        <span className="font-medium">{acordo.nomeDevedor}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Unidade</span>
                        <span>{acordo.bloco ? `${acordo.bloco}/` : ""}{acordo.unidade ?? "—"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Condomínio</span>
                        <span>{acordo.nomeCondominio}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Código do Acordo</span>
                        <span className="font-mono">{String(acordo.acordoId).padStart(6, "0")}</span>
                      </div>
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
                            <tr>
                              <td colSpan={5} className="px-2 py-3 border text-center text-muted-foreground">
                                Nenhuma cobrança original registrada
                              </td>
                            </tr>
                          ) : (
                            <>
                              {acordo.cobrancasOriginais.map((c: any, idx: number) => (
                                <tr key={idx} className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                                  <td className="px-2 py-1 border text-right font-mono">{c.cobrancaId}</td>
                                  <td className="px-2 py-1 border text-center">{fmtDate(c.dataVencimento)}</td>
                                  <td className="px-2 py-1 border text-center">{fmtMes(c.monthReference)}</td>
                                  <td className="px-2 py-1 border">
                                    {c.descricao ?? TIPO_LABELS[c.tipoCobranca] ?? c.tipoCobranca}
                                  </td>
                                  <td className="px-2 py-1 border text-right font-semibold">
                                    {(c.valorOriginalAcordo / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                              {/* Subtotal */}
                              <tr className="bg-muted/40 font-semibold">
                                <td colSpan={4} className="px-2 py-1.5 border text-right">Subtotal das cobranças</td>
                                <td className="px-2 py-1.5 border text-right">
                                  {(acordo.somaOriginal / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Resumo de acréscimos */}
                    <div className="mt-3 flex justify-end">
                      <table className="text-xs border-collapse min-w-[280px]">
                        <thead>
                          <tr className="bg-muted/40">
                            <th className="px-3 py-1.5 border text-left">Descrição</th>
                            <th className="px-3 py-1.5 border text-right">Valor (R$)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="px-3 py-1 border">Acréscimos (juros, multa, honorários)</td>
                            <td className="px-3 py-1 border text-right">
                              {(acordo.acrescimos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr className="bg-muted/40 font-bold">
                            <td className="px-3 py-1.5 border">Total Devido</td>
                            <td className="px-3 py-1.5 border text-right text-blue-700">
                              {fmtBRL(acordo.agreedAmount)}
                            </td>
                          </tr>
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
                            <tr>
                              <td colSpan={7} className="px-2 py-3 border text-center text-muted-foreground">
                                Nenhuma parcela registrada
                              </td>
                            </tr>
                          ) : (
                            <>
                              {acordo.parcelas.map((p: any, idx: number) => (
                                <tr key={idx} className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                                  <td className="px-2 py-1 border text-right font-mono">
                                    {p.nossoNumero ?? String(p.parcelaId).padStart(6, "0")}
                                  </td>
                                  <td className="px-2 py-1 border text-center">{fmtDate(p.dueDate)}</td>
                                  <td className="px-2 py-1 border text-center">{fmtDate(p.paymentDate)}</td>
                                  <td className="px-2 py-1 border text-muted-foreground">
                                    {p.snapshotDescricao ?? (acordo.installments === 1 ? "Parcela única" : `Parcela ${p.installmentNumber}/${acordo.installments}`)}
                                  </td>
                                  <td className="px-2 py-1 border text-right font-semibold">
                                    {(p.amount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-2 py-1 border text-right text-green-700 font-semibold">
                                    {p.status === "pago"
                                      ? (p.amount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                                      : "—"}
                                  </td>
                                  <td className="px-2 py-1 border text-center">
                                    <Badge className={`text-[10px] ${
                                      p.status === "pago" ? "bg-green-100 text-green-800" :
                                      p.status === "atrasado" ? "bg-red-100 text-red-800" :
                                      p.status === "cancelado" ? "bg-gray-100 text-gray-500" :
                                      "bg-yellow-100 text-yellow-800"
                                    }`}>
                                      {STATUS_PARCELA_LABELS[p.status] ?? p.status}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                              {/* Total do acordo */}
                              <tr className="bg-muted/40 font-bold">
                                <td colSpan={4} className="px-2 py-1.5 border text-right">Total do Acordo</td>
                                <td className="px-2 py-1.5 border text-right text-blue-700">
                                  {fmtBRL(acordo.agreedAmount)}
                                </td>
                                <td className="px-2 py-1.5 border text-right text-green-700">
                                  {fmtBRL(acordo.valorPagoEfetivo)}
                                </td>
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

            {/* Rodapé */}
            <div className="border-t pt-4 mt-8 text-center text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Gomes &amp; Silva Sociedade de Advogados</p>
              <p>R. do Carmo, 8 — 12º Andar / Sala 02</p>
              <p>Relatório gerado em {new Date().toLocaleString("pt-BR")}</p>
            </div>

          </>
        )}
      </div>

      {/* Estilos de impressão */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          .print\\:mb-8 { margin-bottom: 2rem; }
          body { font-size: 11px; }
        }
      `}</style>
    </div>
  );
}
