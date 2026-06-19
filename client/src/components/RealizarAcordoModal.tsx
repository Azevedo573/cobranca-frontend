import { useState, useMemo, useCallback } from "react";
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Calculator, HandshakeIcon, Loader2, AlertCircle, FileText, Mail, Printer, CheckCircle2, Gavel, X } from "lucide-react";
import { Dialog as CustasDialog, DialogContent as CustasDialogContent, DialogHeader as CustasDialogHeader, DialogTitle as CustasDialogTitle } from "@/components/ui/dialog";
import { GerarDocumentoModal } from "@/components/GerarDocumentoModal";
import EnviarEmailModal from "@/components/EnviarEmailModal";
import { CustasJudiciais } from "@/components/CustasJudiciais";
import { calcularPlanoAcordo, formatarMoedaAcordo } from "@/../../shared/calculos-acordo";
import { format } from "date-fns";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CobrancaInput {
  id: number;
  tipoCobranca: string;
  description: string | null;
  amount: number; // centavos
  dueDate: Date | null;
  monthReference: string | null;
  status: string;
  breakdown?: {
    valorOriginal: number;
    juros: number;
    multa: number;
    honorarios: number;
    correcaoMonetaria: number;
    custasJudiciais?: number;
    valorTotal: number;
  };
}

interface RealizarAcordoModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cobrancas: CobrancaInput[];
  devedorId: number;
  devedorNome: string;
  condominioId: number;
  condominioNome: string;
  onAcordoCriado?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const hoje = () => new Date().toISOString().split("T")[0];

const diasEntre = (vencimento: Date | null) => {
  if (!vencimento) return 0;
  const diff = new Date().getTime() - new Date(vencimento).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

const tipoLabel: Record<string, string> = {
  condominio: "Cota condominial",
  salao_jogos: "Salão de Jogos",
  churrasqueira: "Churrasqueira",
  cota_extra: "Cota Extra",
  multa: "Multa",
  outros: "Outros",
};

// ─── Componente principal ─────────────────────────────────────────────────────

export function RealizarAcordoModal({
  open,
  onOpenChange,
  cobrancas,
  devedorId,
  devedorNome,
  condominioId,
  condominioNome,
  onAcordoCriado,
}: RealizarAcordoModalProps) {
  // ── Parâmetros globais de cálculo ──────────────────────────────────────────
  const [dataCalculo, setDataCalculo] = useState(hoje());
  const [usarCorrecao, setUsarCorrecao] = useState(true);
  const [multaPct, setMultaPct] = useState("2.0000");
  const [jurosPct, setJurosPct] = useState("1.0000");
  const [honorarioPct, setHonorarioPct] = useState("10.0000");
  const [honorarioRS, setHonorarioRS] = useState("0.00");

  const [descontoPct, setDescontoPct] = useState("0.0000");
  const [descontoRS, setDescontoRS] = useState("0.00");

  // ── Seleção de cobranças ───────────────────────────────────────────────────
  const cobrancasDisponiveis = useMemo(
    () => cobrancas.filter((c) => c.status === "pendente" || c.status === "em_cobranca"),
    [cobrancas]
  );
  const [selecionadas, setSelecionadas] = useState<Set<number>>(
    () => new Set(cobrancas.filter((c) => c.status === "pendente" || c.status === "em_cobranca").map((c) => c.id))
  );

  const toggleCobranca = (id: number) => {
    setSelecionadas((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleTodas = () => {
    if (selecionadas.size === cobrancasDisponiveis.length) {
      setSelecionadas(new Set());
    } else {
      setSelecionadas(new Set(cobrancasDisponiveis.map((c) => c.id)));
    }
  };

  // ── Cálculo por título ─────────────────────────────────────────────────────
  const titulos = useMemo(() => {
    const dataAlvo = new Date(dataCalculo + "T12:00:00");
    return cobrancasDisponiveis.map((c) => {
      const b = c.breakdown;
      const valorOriginal = b ? b.valorOriginal : c.amount / 100;
      const dias = c.dueDate ? Math.max(0, Math.floor((dataAlvo.getTime() - new Date(c.dueDate).getTime()) / (1000 * 60 * 60 * 24))) : 0;
      const meses = dias / 30;

      // Custas judiciais (do breakdown calculado pelo backend)
      const custasJudiciais = b ? (b.custasJudiciais || 0) : 0;

      // Correção monetária
      const corMonetaria = usarCorrecao && b ? b.correcaoMonetaria : 0;
      const baseCorrigida = valorOriginal + corMonetaria;

      // Multa (% sobre valor original)
      const multa = (parseFloat(multaPct) / 100) * valorOriginal;

      // Juros (% ao mês sobre valor original × meses)
      const juros = (parseFloat(jurosPct) / 100) * valorOriginal * meses;

      // Sub total antes de honorários (inclui custas judiciais)
      const subTotal = baseCorrigida + multa + juros + custasJudiciais;

      // Honorários (% sobre subTotal + valor fixo)
      const honorario = (parseFloat(honorarioPct) / 100) * subTotal + parseFloat(honorarioRS || "0");

      // Desconto
      const desconto = (parseFloat(descontoPct || "0") / 100) * (subTotal + honorario) + parseFloat(descontoRS || "0");

      const total = subTotal + honorario - desconto;

      return {
        id: c.id,
        titulo: c.description || c.monthReference || tipoLabel[c.tipoCobranca] || c.tipoCobranca,
        tipoNeg: "-",
        indiceCM: "IPCA",
        tipoTitulo: tipoLabel[c.tipoCobranca] || c.tipoCobranca,
        vencimento: c.dueDate ? format(new Date(c.dueDate), "dd/MM/yyyy") : "-",
        dias,
        valorOriginal,
        corMonetaria,
        custasJudiciais,
        multa,
        juros,
        subTotal,
        honorario,
        desconto,
        total: Math.max(0, total),
      };
    });
  }, [cobrancasDisponiveis, dataCalculo, usarCorrecao, multaPct, jurosPct, honorarioPct, honorarioRS, descontoPct, descontoRS]);

  // Totais das selecionadas
  const totais = useMemo(() => {
    const sel = titulos.filter((t) => selecionadas.has(t.id));
    return {
      valorOriginal: sel.reduce((s, t) => s + t.valorOriginal, 0),
      corMonetaria: sel.reduce((s, t) => s + t.corMonetaria, 0),
      custasJudiciais: sel.reduce((s, t) => s + t.custasJudiciais, 0),
      multa: sel.reduce((s, t) => s + t.multa, 0),
      juros: sel.reduce((s, t) => s + t.juros, 0),
      subTotal: sel.reduce((s, t) => s + t.subTotal, 0),
      honorario: sel.reduce((s, t) => s + t.honorario, 0),
      desconto: sel.reduce((s, t) => s + t.desconto, 0),
      total: sel.reduce((s, t) => s + t.total, 0),
    };
  }, [titulos, selecionadas]);

  // ── Simulação de parcelas ──────────────────────────────────────────────────
  // ── Custas Judiciais e Outras Despesas ──────────────────────────────────
  const [custasOpen, setCustasOpen] = useState(false);
  const [outrasDespesasPct, setOutrasDespesasPct] = useState("");
  const [outrasDespesasRS, setOutrasDespesasRS] = useState("");
  const [outrasDespesasDesc, setOutrasDespesasDesc] = useState("");

  const [temEntrada, setTemEntrada] = useState(false);
  const [valorEntrada, setValorEntrada] = useState("0.00");
  const [numeroParcelas, setNumeroParcelas] = useState("1");
  const [dataPagamento, setDataPagamento] = useState(hoje());
  const [formaPagamento, setFormaPagamento] = useState("");
  const [portador, setPortador] = useState("");
  const [taxaCobrancaPct, setTaxaCobrancaPct] = useState("");
  const [taxaCobrancaRS, setTaxaCobrancaRS] = useState("");
  const [jurosParcelamentoPct, setJurosParcelamentoPct] = useState("0.0000");
  const [tipoParcelas, setTipoParcelas] = useState<"mensal" | "dias">("mensal");
  const [intervaloDias, setIntervaloDias] = useState("30");
  const [observacao, setObservacao] = useState("");

  const { data: condominio } = trpc.condominios.getById.useQuery({ id: condominioId });
  const { data: acordosAtivos } = trpc.acordos.getAtivosComParcelas.useQuery({ devedorId });
  const acordoAtivo = acordosAtivos && acordosAtivos.length > 0 ? acordosAtivos[0] : null;

  const plano = useMemo(() => {
    const totalCentavos = Math.round(totais.total * 100);
    if (totalCentavos === 0) return null;
    const entradaCentavos = Math.round(parseFloat(valorEntrada || "0") * 100);
    const nparcelas = Math.max(1, parseInt(numeroParcelas || "1"));
    const dataBase = new Date(dataPagamento + "T12:00:00");
    if (tipoParcelas === "mensal") {
      dataBase.setMonth(dataBase.getMonth() - 1);
    } else {
      dataBase.setDate(dataBase.getDate() - parseInt(intervaloDias || "30"));
    }
    return calcularPlanoAcordo({
      valorTotal: totalCentavos,
      valorEntrada: entradaCentavos,
      numeroParcelas: nparcelas,
      taxaJurosMensal: parseFloat(jurosParcelamentoPct || "0"),
      dataInicio: dataBase,
    });
  }, [totais.total, valorEntrada, numeroParcelas, dataPagamento, jurosParcelamentoPct, tipoParcelas, intervaloDias]);

  // ── Estados dos modais de ação final ─────────────────────────────────────
  const [acordoCriadoId, setAcordoCriadoId] = useState<number | null>(null);
  const [modalDocOpen, setModalDocOpen] = useState(false);
  const [modalEmailOpen, setModalEmailOpen] = useState(false);
  const [emailDevedor, setEmailDevedor] = useState("");

  // Parcelas do acordo criado para usar nos modais de documento
  const parcelasParaDoc = useMemo(() => {
    if (!plano) return [];
    return plano.parcelas.map((p, i) => ({
      id: i + 1,
      installmentNumber: p.numeroParcela,
      amount: p.valor,
      dueDate: p.dataVencimento,
      status: "pendente",
    }));
  }, [plano]);

  // ── Gerar boletos em lote ─────────────────────────────────────────────────
  const [gerandoBoletos, setGerandoBoletos] = useState(false);
  const gerarBoletosLoteMutation = trpc.acordos.gerarBoletosLoteAcordo.useMutation({
    onSuccess: (data) => {
      setGerandoBoletos(false);
      if (data.success && data.boletos.length > 0) {
        toast.success(data.mensagem);
        // Abrir cada boleto em nova aba
        data.boletos.forEach((b: any) => window.open(b.url, '_blank'));
      } else {
        toast.warning(data.mensagem);
      }
    },
    onError: (e) => {
      setGerandoBoletos(false);
      toast.error("Erro ao gerar boletos: " + e.message);
    },
  });

  const handleGerarBoletosLote = () => {
    if (!acordoCriadoId) {
      toast.warning("Finalize o acordo primeiro antes de gerar os boletos.");
      return;
    }
    setGerandoBoletos(true);
    gerarBoletosLoteMutation.mutate({ acordoId: acordoCriadoId });
  };

  // ── Criar acordo ───────────────────────────────────────────────────────────
  const createAcordoMutation = trpc.acordos.create.useMutation({
    onSuccess: (data) => {
      toast.success("Acordo criado com sucesso!");
      setAcordoCriadoId((data as any)?.id ?? null);
      onAcordoCriado?.();
    },
    onError: (e) => toast.error("Erro ao criar acordo: " + e.message),
  });

  const handleCriarAcordo = () => {
    if (selecionadas.size === 0) {
      toast.error("Selecione pelo menos uma cobrança");
      return;
    }
    if (!plano || plano.parcelas.length === 0) {
      toast.error("Configure as parcelas antes de criar o acordo");
      return;
    }
    const notes = `Acordo de ${selecionadas.size} título(s). ${observacao}`.trim();

    // Calcular snapshot agregado das cobranças selecionadas (valores em centavos)
    const titulosSelecionados = titulos.filter((t) => selecionadas.has(t.id));
    const snapPrincipal = Math.round(titulosSelecionados.reduce((s, t) => s + t.valorOriginal, 0) * 100);
    const snapJuros = Math.round(titulosSelecionados.reduce((s, t) => s + t.juros, 0) * 100);
    const snapMulta = Math.round(titulosSelecionados.reduce((s, t) => s + t.multa, 0) * 100);
    const snapCorrecao = Math.round(titulosSelecionados.reduce((s, t) => s + t.corMonetaria, 0) * 100);
    const snapHonorarios = Math.round(titulosSelecionados.reduce((s, t) => s + t.honorario, 0) * 100);
    const snapValorAtualizado = Math.round(titulosSelecionados.reduce((s, t) => s + t.total, 0) * 100);
    const snapDescricao = titulosSelecionados.map((t) => t.titulo).join(" | ");

    // Distribuir snapshot proporcionalmente entre as parcelas
    const totalParcelas = plano.numeroParcelas;
    const proporcaoPorParcela = 1 / totalParcelas;

    createAcordoMutation.mutate({
      cobrancaIds: Array.from(selecionadas),
      devedorId,
      condominioId,
      totalAmount: plano.valorTotal,
      agreedAmount: plano.valorTotal,
      installments: plano.numeroParcelas,
      firstPaymentDate: plano.parcelas[0]?.dataVencimento || new Date(),
      paymentFrequency: "mensal",
      notes,
      parcelas: plano.parcelas.map((p, idx) => ({
        installmentNumber: p.numeroParcela,
        amount: p.valor,
        dueDate: p.dataVencimento,
        // Snapshot proporcional por parcela
        snapshotPrincipal: Math.round(snapPrincipal * proporcaoPorParcela),
        snapshotJuros: Math.round(snapJuros * proporcaoPorParcela),
        snapshotMulta: Math.round(snapMulta * proporcaoPorParcela),
        snapshotCorrecao: Math.round(snapCorrecao * proporcaoPorParcela),
        snapshotHonorarios: Math.round(snapHonorarios * proporcaoPorParcela),
        snapshotValorAtualizado: Math.round(snapValorAtualizado * proporcaoPorParcela),
        snapshotDescricao: idx === 0 ? snapDescricao : undefined, // só na primeira parcela
      })),
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col p-0 gap-0 rounded-xl overflow-hidden"
        style={{ width: '96vw', maxWidth: '96vw', height: '92vh', maxHeight: '92vh' }}
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <HandshakeIcon className="h-5 w-5 text-primary" />
              Acordo de Títulos — {devedorNome}
            </DialogTitle>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>Atualizar valor do saldo até:</span>
              <Input
                type="date"
                value={dataCalculo}
                onChange={(e) => setDataCalculo(e.target.value)}
                className="w-36 h-8 text-sm"
              />
              <Button size="sm" variant="default" className="h-8 gap-1" onClick={() => {}}>
                <Calculator className="h-3.5 w-3.5" />
                Calcular
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="px-6 py-4 space-y-6">

            {/* ── Parâmetros de cálculo ── */}
            <div className="bg-muted/30 rounded-lg p-4 border">
              <div className="flex flex-wrap gap-4 items-end">
                {/* Correção monetária */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="correcao"
                    checked={usarCorrecao}
                    onCheckedChange={(v) => setUsarCorrecao(v as boolean)}
                  />
                  <label htmlFor="correcao" className="text-sm font-medium cursor-pointer">
                    Cor. Monetária<br />
                    <span className="text-xs text-muted-foreground">(IPCA)</span>
                  </label>
                </div>

                {/* Multa */}
                <div>
                  <Label className="text-xs">Multa (%)</Label>
                  <Input value={multaPct} onChange={(e) => setMultaPct(e.target.value)} className="w-24 h-8 text-sm mt-1" />
                </div>

                {/* Juros */}
                <div>
                  <Label className="text-xs">Juros (%)</Label>
                  <Input value={jurosPct} onChange={(e) => setJurosPct(e.target.value)} className="w-24 h-8 text-sm mt-1" />
                </div>

                {/* Honorário */}
                <div>
                  <Label className="text-xs">Honorário</Label>
                  <div className="flex gap-1 mt-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">%</span>
                      <Input value={honorarioPct} onChange={(e) => setHonorarioPct(e.target.value)} className="w-20 h-8 text-sm" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">R$</span>
                      <Input value={honorarioRS} onChange={(e) => setHonorarioRS(e.target.value)} className="w-20 h-8 text-sm" />
                    </div>
                  </div>
                </div>


                {/* Desconto */}
                <div>
                  <Label className="text-xs">Desconto</Label>
                  <div className="flex gap-1 mt-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">%</span>
                      <Input value={descontoPct} onChange={(e) => setDescontoPct(e.target.value)} className="w-20 h-8 text-sm" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">R$</span>
                      <Input value={descontoRS} onChange={(e) => setDescontoRS(e.target.value)} className="w-20 h-8 text-sm" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Tabela de títulos ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Títulos em Aberto</h3>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={toggleTodas}>
                  {selecionadas.size === cobrancasDisponiveis.length ? "Desmarcar Todas" : "Selecionar Todas"}
                </Button>
              </div>
              <div className="border rounded-lg overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="w-8 p-2"></th>
                      <th className="p-2 text-left font-medium">Título</th>
                      <th className="p-2 text-left font-medium">Tipo Título</th>
                      <th className="p-2 text-center font-medium">Vencimento</th>
                      <th className="p-2 text-center font-medium">Dias</th>
                      <th className="p-2 text-right font-medium">Vl. Original</th>
                      <th className="p-2 text-right font-medium">Cor. Monetária</th>
                      <th className="p-2 text-right font-medium">Multa</th>
                      <th className="p-2 text-right font-medium">Juros</th>
                      <th className="p-2 text-right font-medium">Sub Total</th>
                      <th className="p-2 text-right font-medium">Honorário</th>
                      <th className="p-2 text-right font-medium">Desconto</th>
                      <th className="p-2 text-right font-medium text-primary">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {titulos.map((t) => (
                      <React.Fragment key={`row-${t.id}`}>
                        <tr
                          className={`border-t transition-colors cursor-pointer ${selecionadas.has(t.id) ? "bg-primary/5" : "hover:bg-muted/30"}`}
                          onClick={() => toggleCobranca(t.id)}
                        >
                          <td className="p-2 text-center">
                            <Checkbox
                              checked={selecionadas.has(t.id)}
                              onCheckedChange={() => toggleCobranca(t.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="p-2 font-medium max-w-[120px] truncate">{t.titulo}</td>
                          <td className="p-2 text-muted-foreground">{t.tipoTitulo}</td>
                          <td className="p-2 text-center">{t.vencimento}</td>
                          <td className="p-2 text-center">{t.dias}</td>
                          <td className="p-2 text-right">{fmt(t.valorOriginal)}</td>
                          <td className="p-2 text-right">{fmt(t.corMonetaria)}</td>
                          <td className="p-2 text-right">{fmt(t.multa)}</td>
                          <td className="p-2 text-right">{fmt(t.juros)}</td>
                          <td className="p-2 text-right">{fmt(t.subTotal)}</td>
                          <td className="p-2 text-right">{fmt(t.honorario)}</td>
                          <td className="p-2 text-right text-green-700">{fmt(t.desconto)}</td>
                          <td className="p-2 text-right font-bold text-primary">{fmt(t.total)}</td>
                        </tr>
                        {t.custasJudiciais > 0 && (
                          <tr key={`custas-${t.id}`} className={`${selecionadas.has(t.id) ? "bg-primary/5" : "bg-amber-50/60 dark:bg-amber-900/10"}`}>
                            <td></td>
                            <td colSpan={3} className="px-2 pb-1.5 pt-0">
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                                <Gavel className="h-3 w-3" />
                                Custas Judiciais
                              </span>
                            </td>
                            <td className="px-2 pb-1.5 pt-0 text-center text-[11px] text-muted-foreground">—</td>
                            <td className="px-2 pb-1.5 pt-0 text-right text-[11px] font-semibold text-amber-700 dark:text-amber-400">{fmt(t.custasJudiciais)}</td>
                            <td colSpan={7}></td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                  {/* Totais */}
                  <tfoot className="bg-muted/60 font-semibold border-t-2">
                    <tr>
                      <td colSpan={5} className="p-2 text-right text-xs">Totais selecionados:</td>
                      <td className="p-2 text-right">{fmt(totais.valorOriginal)}</td>
                      <td className="p-2 text-right">{fmt(totais.corMonetaria)}</td>
                      <td className="p-2 text-right">{fmt(totais.multa)}</td>
                      <td className="p-2 text-right">{fmt(totais.juros)}</td>
                      <td className="p-2 text-right">{fmt(totais.subTotal)}</td>
                      <td className="p-2 text-right">{fmt(totais.honorario)}</td>
                      <td className="p-2 text-right text-green-700">{fmt(totais.desconto)}</td>
                      <td className="p-2 text-right text-primary">{fmt(totais.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <Separator />

            {/* ── Custas Judiciais + Outras Despesas ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Despesas Adicionais</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-amber-500 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                  onClick={() => setCustasOpen(!custasOpen)}
                >
                  <Gavel className="h-4 w-4" />
                  Custas Judiciais
                </Button>
              </div>

              {/* Dialog de Custas Judiciais */}
              <CustasDialog open={custasOpen} onOpenChange={setCustasOpen}>
                <CustasDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <CustasDialogHeader>
                    <CustasDialogTitle className="flex items-center gap-2">
                      <Gavel className="h-5 w-5 text-amber-600" />
                      Custas Judiciais — {devedorNome}
                    </CustasDialogTitle>
                  </CustasDialogHeader>
                  <CustasJudiciais devedorId={devedorId} condominioId={condominioId} />
                </CustasDialogContent>
              </CustasDialog>

              {/* Outras Despesas */}
              <div className="p-3 border rounded-lg bg-muted/20 mb-4">
                <Label className="text-xs font-semibold mb-2 block">Outras Despesas</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Percentual (%)</Label>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-muted-foreground">%</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={outrasDespesasPct}
                        onChange={(e) => setOutrasDespesasPct(e.target.value.replace(',', '.'))}
                        className="h-8 text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Valor (R$)</Label>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-muted-foreground">R$</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={outrasDespesasRS}
                        onChange={(e) => setOutrasDespesasRS(e.target.value.replace(',', '.'))}
                        className="h-8 text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Referência / Descrição</Label>
                    <Input
                      type="text"
                      value={outrasDespesasDesc}
                      onChange={(e) => setOutrasDespesasDesc(e.target.value)}
                      className="h-8 text-sm mt-1"
                      placeholder="Ex: Despesas com cartório, diligências..."
                    />
                  </div>
                </div>
                {(parseFloat((outrasDespesasPct || "0").replace(',', '.')) > 0 || parseFloat((outrasDespesasRS || "0").replace(',', '.')) > 0) && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Valor calculado: <strong>{fmt((parseFloat((outrasDespesasPct || "0").replace(',', '.')) / 100) * totais.total + parseFloat((outrasDespesasRS || "0").replace(',', '.')))}</strong>
                    {outrasDespesasDesc && <span className="ml-1">— {outrasDespesasDesc}</span>}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* ── Simulação de parcelas ── */}
            <div>
              <h3 className="text-sm font-semibold mb-4">Simulação de Acordo / Boleto</h3>

              {/* Parâmetros */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {/* Entrada */}
                <div className="col-span-2 md:col-span-4 flex items-center gap-2">
                  <Checkbox
                    id="entrada"
                    checked={temEntrada}
                    onCheckedChange={(v) => setTemEntrada(v as boolean)}
                  />
                  <label htmlFor="entrada" className="text-sm font-medium cursor-pointer">Entrada</label>
                  {temEntrada && (
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={valorEntrada}
                      onChange={(e) => setValorEntrada(e.target.value)}
                      className="w-32 h-8 text-sm"
                      placeholder="R$ 0,00"
                    />
                  )}
                </div>

                {/* Nº Parcelas */}
                <div>
                  <Label className="text-xs">Nº Parcelas</Label>
                  <div className="flex items-center gap-1 mt-1">
                    <Input
                      type="number"
                      min="1"
                      max="120"
                      value={numeroParcelas}
                      onChange={(e) => setNumeroParcelas(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">(Max. 10)</span>
                  </div>
                </div>

                {/* Data de Pagamento */}
                <div>
                  <Label className="text-xs">Data de Pagamento</Label>
                  <Input
                    type="date"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                    className="h-8 text-sm mt-1"
                  />
                </div>

                {/* Forma de Pagamento */}
                <div>
                  <Label className="text-xs">Forma de Pagamento</Label>
                   <Select value={formaPagamento} onValueChange={(v) => {
                      setFormaPagamento(v);
                      if (v === "boleto") setPortador("BTG Pactual");
                      else if (portador === "BTG Pactual") setPortador("");
                    }}>
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Portador */}
                <div>
                  <Label className="text-xs">Portador</Label>
                  <Input
                    value={portador}
                    onChange={(e) => setPortador(e.target.value)}
                    placeholder="Ex: BTG Pactual"
                    className="h-8 text-sm mt-1"
                  />
                </div>

                {/* Taxa de Cobrança */}
                <div>
                  <Label className="text-xs">Taxa de Cobrança</Label>
                  <div className="flex gap-1 mt-1">
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs text-muted-foreground">%</span>
                      <Input value={taxaCobrancaPct} onChange={(e) => setTaxaCobrancaPct(e.target.value)} className="w-16 h-8 text-sm" />
                    </div>
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs text-muted-foreground">R$</span>
                      <Input value={taxaCobrancaRS} onChange={(e) => setTaxaCobrancaRS(e.target.value)} className="w-16 h-8 text-sm" />
                    </div>
                  </div>
                </div>

                {/* Juros do parcelamento */}
                <div>
                  <Label className="text-xs">Juros (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={jurosParcelamentoPct}
                    onChange={(e) => setJurosParcelamentoPct(e.target.value)}
                    className="h-8 text-sm mt-1"
                  />
                </div>

                {/* Tipo de Parcelas */}
                <div className="col-span-2">
                  <Label className="text-xs">Tipo de Parcelas</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input
                        type="radio"
                        checked={tipoParcelas === "mensal"}
                        onChange={() => setTipoParcelas("mensal")}
                        className="accent-primary"
                      />
                      Mensal
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input
                        type="radio"
                        checked={tipoParcelas === "dias"}
                        onChange={() => setTipoParcelas("dias")}
                        className="accent-primary"
                      />
                      A cada
                      <Input
                        type="number"
                        min="1"
                        value={intervaloDias}
                        onChange={(e) => setIntervaloDias(e.target.value)}
                        className="w-16 h-7 text-sm"
                        disabled={tipoParcelas !== "dias"}
                      />
                      dias
                    </label>
                  </div>
                </div>

                {/* Observação */}
                <div className="col-span-2 md:col-span-4">
                  <Label className="text-xs">Observação</Label>
                  <Textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    className="mt-1 text-sm"
                    rows={2}
                    placeholder="Observações sobre o acordo..."
                  />
                </div>
              </div>

              {/* Tabela de parcelas */}
              {plano && plano.parcelas.length > 0 && (
                <div className="border rounded-lg overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-center font-medium">Parcela</th>
                        <th className="p-2 text-left font-medium">Portador</th>
                        <th className="p-2 text-center font-medium">Vencimento</th>
                        <th className="p-2 text-center font-medium">Nr. Dias</th>
                        <th className="p-2 text-right font-medium">Valor</th>
                        <th className="p-2 text-right font-medium">Juros</th>
                        <th className="p-2 text-right font-medium">Taxa</th>
                        <th className="p-2 text-right font-medium text-primary">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plano.parcelas.map((p) => {
                        const taxa = (parseFloat((taxaCobrancaPct || "0").replace(',', '.')) / 100) * (p.valor / 100) + parseFloat((taxaCobrancaRS || "0").replace(',', '.'));
                        const totalParcela = p.valor / 100 + taxa;
                        return (
                          <tr key={p.numeroParcela} className="border-t hover:bg-muted/20">
                            <td className="p-2 text-center font-medium">{p.numeroParcela}</td>
                            <td className="p-2">{portador || "-"}</td>
                            <td className="p-2 text-center">
                              {format(new Date(p.dataVencimento), "dd/MM/yyyy")}
                            </td>
                            <td className="p-2 text-center">
                              {Math.floor((new Date(p.dataVencimento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}
                            </td>
                            <td className="p-2 text-right">{fmt(p.valor / 100)}</td>
                            <td className="p-2 text-right">{fmt(0)}</td>
                            <td className="p-2 text-right">{fmt(taxa)}</td>
                            <td className="p-2 text-right font-semibold text-primary">{fmt(totalParcela)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/60 font-semibold border-t-2">
                      <tr>
                        <td colSpan={4} className="p-2 text-right text-xs">Total:</td>
                        <td className="p-2 text-right">{fmt(plano.valorTotal / 100)}</td>
                        <td className="p-2 text-right">{fmt(0)}</td>
                        <td className="p-2 text-right">
                          {fmt(plano.parcelas.reduce((s, p) => {
                            const taxa = (parseFloat((taxaCobrancaPct || "0").replace(',', '.')) / 100) * (p.valor / 100) + parseFloat((taxaCobrancaRS || "0").replace(',', '.'));
                            return s + taxa;
                          }, 0))}
                        </td>
                        <td className="p-2 text-right text-primary">
                          {fmt(plano.parcelas.reduce((s, p) => {
                            const taxa = (parseFloat((taxaCobrancaPct || "0").replace(',', '.')) / 100) * (p.valor / 100) + parseFloat((taxaCobrancaRS || "0").replace(',', '.'));
                            return s + p.valor / 100 + taxa;
                          }, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {(!plano || plano.parcelas.length === 0) && selecionadas.size > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-lg p-4 bg-muted/20">
                  <AlertCircle className="h-4 w-4" />
                  Configure o número de parcelas e a data para visualizar a simulação.
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex-shrink-0 bg-background">
          {/* Linha de totais */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm">
              {selecionadas.size > 0 && (
                <span className="text-muted-foreground">
                  <strong className="text-foreground">{selecionadas.size}</strong> título(s) selecionado(s) •
                  Total: <strong className="text-primary text-base">{fmt(totais.total)}</strong>
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-muted-foreground">
              Fechar
            </Button>
          </div>

          {/* Botões de ação */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Finalizar */}
            <Button
              onClick={handleCriarAcordo}
              disabled={selecionadas.size === 0 || createAcordoMutation.isPending || !!acordoCriadoId}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              {createAcordoMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : acordoCriadoId ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <HandshakeIcon className="h-4 w-4" />
              )}
              {acordoCriadoId ? "Acordo Finalizado" : "Finalizar"}
            </Button>

            {/* Dem. de Débito */}
            <Button
              variant="outline"
              className="gap-2 border-green-600 text-green-700 hover:bg-green-50"
              onClick={() => setModalDocOpen(true)}
              disabled={selecionadas.size === 0}
            >
              <FileText className="h-4 w-4" />
              Dem. de Débito
            </Button>

            {/* Termo de Acordo */}
            <Button
              variant="outline"
              className="gap-2 border-green-600 text-green-700 hover:bg-green-50"
              onClick={() => setModalDocOpen(true)}
              disabled={selecionadas.size === 0}
            >
              <FileText className="h-4 w-4" />
              Termo de Acordo
            </Button>

            {/* Boleto em lote */}
            <Button
              variant="outline"
              className="gap-2 border-green-600 text-green-700 hover:bg-green-50"
              onClick={handleGerarBoletosLote}
              disabled={gerandoBoletos || !acordoCriadoId}
              title={!acordoCriadoId ? "Finalize o acordo primeiro" : "Gerar boletos para todas as parcelas"}
            >
              {gerandoBoletos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {gerandoBoletos ? "Gerando..." : "Boleto"}
            </Button>

            {/* Email Boleto/Termo */}
            <Button
              variant="outline"
              className="gap-2 border-green-600 text-green-700 hover:bg-green-50"
              onClick={() => setModalEmailOpen(true)}
              disabled={selecionadas.size === 0}
            >
              <Mail className="h-4 w-4" />
              Email Boleto/Termo
            </Button>
          </div>
        </div>

        {/* Modal de Gerar Documento */}
        <GerarDocumentoModal
          open={modalDocOpen}
          onClose={() => setModalDocOpen(false)}
          devedor={{ id: devedorId, name: devedorNome, condominioId }}
          parcelasAcordo={parcelasParaDoc}
          nomeCondominio={condominioNome}
          emailDevedor={emailDevedor}
        />

        {/* Modal de Enviar Email */}
        <EnviarEmailModal
          open={modalEmailOpen}
          onClose={() => setModalEmailOpen(false)}
          devedorId={devedorId}
          nomeDevedor={devedorNome}
          emailDevedor={emailDevedor}
          condominioId={condominioId}
        />
      </DialogContent>
    </Dialog>
  );
}
