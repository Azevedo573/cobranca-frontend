import * as React from "react";
import { useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { baixarPdfBase64 } from "@/lib/downloadBase64";
import { invalidarCanaisBtg } from "@/lib/invalidarCanaisBtg";
import { podeReapresentarCnabUI, rotuloAmbienteBtg } from "@/lib/btgBoletoUI";
import type { ParcelaCanalUI } from "@/lib/btgCanaisUI";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, FileDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { BtgCancelamentoDialog } from "./BtgCancelamentoDialog";

export type SituacaoBoletoBtg = inferRouterOutputs<AppRouter>["btgBoletos"]["situacaoParcela"];
type Meio = "linhaDigitavel" | "codigoBarras" | "pixCopiaECola";

export function BtgBoletoPainel({ situacao, busy = false, erro, onPdf, onCopiar, onConsultar, onCancelar }: {
  situacao: SituacaoBoletoBtg;
  busy?: boolean;
  erro?: string | null;
  onPdf: () => void;
  onCopiar: (meio: Meio) => void;
  onConsultar: () => void;
  onCancelar: () => void;
}) {
  const ativa = situacao.pagamentoPermitido && !situacao.operacaoCancelamento?.estado.match(/solicitada|em_confirmacao|conflito_pagamento|cancelada/);
  const api = situacao.fonte === "btg_api";
  return <div className="space-y-1 text-xs">
    <div className="flex flex-wrap gap-1"><Badge variant="outline" className="text-xs font-normal">Fonte: {api ? "API BTG · emissão canônica" : situacao.fonte === "cnab" ? "CNAB" : "Não emitida"}</Badge>{api && <Badge variant="outline" className="text-xs">{rotuloAmbienteBtg(situacao.ambiente)}</Badge>}</div>
    <p role="status" className="text-muted-foreground">{situacao.mensagem}</p>
    {api && <p className="text-muted-foreground">Situação bancária: {situacao.statusBancario ?? "Não confirmada"} · Documento: {situacao.estadoDocumento}</p>}
    {api && <p className="text-muted-foreground">Emissão #{situacao.emissaoId} · Revisão {situacao.revisao}{situacao.nossoNumero ? ` · Nosso número BTG: ${situacao.nossoNumero}` : ""}</p>}
    {api && <p className="text-muted-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(situacao.valorCentavos / 100)} · {new Date(situacao.vencimento).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p>}
    {erro && <p role="alert" className="text-destructive">{erro}</p>}
    {busy && <p role="status" className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Processando...</p>}
    {api && <div className="flex flex-wrap gap-1">
      {ativa && situacao.pdfDisponivel && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={onPdf}><FileDown className="mr-1 h-3 w-3" />Boleto (PDF)</Button>}
      {ativa && situacao.linhaDigitavel && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onCopiar("linhaDigitavel")}><Copy className="mr-1 h-3 w-3" />Copiar linha digitável</Button>}
      {ativa && situacao.codigoBarras && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onCopiar("codigoBarras")}><Copy className="mr-1 h-3 w-3" />Copiar código de barras</Button>}
      {ativa && situacao.pixCopiaECola && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onCopiar("pixCopiaECola")}><Copy className="mr-1 h-3 w-3" />Pix Copia e Cola</Button>}
      {ativa && !situacao.pdfDisponivel && <p className="w-full text-muted-foreground">PDF indisponível: dados documentais pendentes ou sem snapshot comprovado. Não emita novamente.</p>}
      {situacao.emissaoId && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={onConsultar}><RefreshCw className="mr-1 h-3 w-3" />Consultar dados do boleto no BTG</Button>}
      {situacao.emissaoId && ativa && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs text-destructive" disabled={busy} onClick={onCancelar}>Cancelar cobrança no BTG</Button>}
      {situacao.operacaoCancelamento && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={onCancelar}>Acompanhar cancelamento</Button>}
    </div>}
    {api && !ativa && <p className="text-muted-foreground">Meios de pagamento indisponíveis. Registro preservado para consulta; documentos já compartilhados não são revogados.</p>}
  </div>;
}

function BoletoCnabParcela({ parcelaId, parcela }: { parcelaId: number; parcela: ParcelaCanalUI }) {
  const [erro, setErro] = useState<string | null>(null);
  const gerar = trpc.acordos.gerarBoletoPDFParcela.useMutation();
  if (!podeReapresentarCnabUI(parcela)) return <p className="text-xs text-muted-foreground">Documento CNAB indisponível. É necessária remessa comprovada; uma reserva local não é emissão.</p>;
  return <div className="space-y-1"><Badge variant="outline" className="text-xs">Fonte: CNAB · remessa comprovada</Badge><Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={gerar.isPending} onClick={async () => { setErro(null); try { const data = await gerar.mutateAsync({ parcelaId }); window.open(data.url, "_blank", "noopener,noreferrer"); } catch (error: unknown) { setErro(error instanceof Error ? error.message : "Não foi possível gerar o documento CNAB."); } }}>Boleto CNAB (PDF)</Button>{erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}</div>;
}

export function BtgBoletoParcela({ parcelaId, parcelaCnab, situacao: fornecida }: {
  parcelaId: number;
  parcelaCnab?: ParcelaCanalUI;
  situacao?: SituacaoBoletoBtg;
}) {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cancelamento, setCancelamento] = useState(false);
  const guarda = useRef(false);
  const identidade = `${user?.id}:${user?.role}:${parcelaId}`;
  const atual = useRef(identidade);
  atual.current = identidade;
  React.useEffect(() => {
    guarda.current = false;
    setBusy(false); setErro(null); setCancelamento(false);
    return () => { atual.current = ''; guarda.current = false; };
  }, [identidade]);
  const consulta = trpc.btgBoletos.situacaoParcela.useQuery({ parcelaId }, {
    enabled: admin && !fornecida, retry: false, staleTime: 0, gcTime: 0,
    refetchInterval: query => query.state.data?.operacaoCancelamento && ["solicitada", "em_confirmacao"].includes(query.state.data.operacaoCancelamento.estado) ? 5_000 : false,
  });
  const gerar = trpc.btgBoletos.gerarPdf.useMutation({ retry: false });
  const consultar = trpc.btgBoletos.consultarDados.useMutation({ retry: false });
  const situacao = fornecida ?? consulta.data;
  const executar = async (acao: "pdf" | "consultar" | Meio) => {
    if (guarda.current || !admin || !situacao) return;
    guarda.current = true; setBusy(true); setErro(null);
    const contexto = identidade;
    try {
      if (acao === "pdf") {
        const data = await gerar.mutateAsync({ parcelaId });
        if (atual.current === contexto) baixarPdfBase64(data);
      } else if (acao === "consultar") {
        await consultar.mutateAsync({ parcelaId });
      } else {
        // Leitura local fresca antes da cópia, nunca consulta externa silenciosa.
        const fresca = await utils.btgBoletos.situacaoParcela.fetch({ parcelaId });
        if (atual.current !== contexto) return;
        if (!fresca.pagamentoPermitido || fresca.emissaoId !== situacao.emissaoId || fresca.revisao !== situacao.revisao || (fresca.operacaoCancelamento && ["solicitada", "em_confirmacao", "cancelada", "conflito_pagamento"].includes(fresca.operacaoCancelamento.estado)) || !fresca[acao]) throw new Error("Situação da cobrança alterada; reabra os dados antes de copiar.");
        await navigator.clipboard.writeText(fresca[acao]);
        toast.success(acao === "pixCopiaECola" ? "Pix copiado." : acao === "codigoBarras" ? "Código de barras copiado." : "Linha digitável copiada.");
      }
    } catch (error: unknown) {
      if (atual.current === contexto) setErro(error instanceof Error ? error.message : "Não foi possível concluir. Reabra a consulta; se necessário, autentique-se novamente.");
    } finally {
      guarda.current = false;
      if (atual.current === contexto) { setBusy(false); void invalidarCanaisBtg(utils); }
    }
  };
  if (!admin) return parcelaCnab && podeReapresentarCnabUI(parcelaCnab) ? <BoletoCnabParcela parcelaId={parcelaId} parcela={parcelaCnab} /> : <p className="text-xs text-muted-foreground">Documentos API BTG exigem acesso administrativo ativo.</p>;
  if (consulta.error && !fornecida) return <p role="alert" className="text-xs text-destructive">Leitura bancária indisponível: {consulta.error.message}. Nenhum canal alternativo será usado.</p>;
  if (!situacao) return <p role="status" className="text-xs text-muted-foreground">Carregando situação documental...</p>;
  if (situacao.fonte === "cnab") return parcelaCnab ? <BoletoCnabParcela parcelaId={parcelaId} parcela={parcelaCnab} /> : <p className="text-xs text-muted-foreground">Fonte: CNAB. Reapresente pelo fluxo CNAB autorizado.</p>;
  return <><BtgBoletoPainel situacao={situacao} busy={busy} erro={erro} onPdf={() => { void executar("pdf"); }} onCopiar={meio => { void executar(meio); }} onConsultar={() => { void executar("consultar"); }} onCancelar={() => setCancelamento(true)} />{cancelamento && situacao.emissaoId && <BtgCancelamentoDialog key={`${identidade}:${situacao.emissaoId}:${situacao.revisao}`} emissaoId={situacao.emissaoId} onClose={() => { setCancelamento(false); void invalidarCanaisBtg(utils); }} />}</>;
}
