import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { prepararCancelamentoBtg, confirmarCancelamentoBtg } from "../../../../server/btg-v2/cancelamento";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { invalidarCanaisBtg } from "@/lib/invalidarCanaisBtg";
import { CONFIRMACAO_CANCELAMENTO_BTG, podeConfirmarCancelamentoUI, rotuloAmbienteBtg } from "@/lib/btgBoletoUI";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

type Previa = Awaited<ReturnType<typeof prepararCancelamentoBtg>>;
type Resultado = Awaited<ReturnType<typeof confirmarCancelamentoBtg>>;
type Busy = "preparar" | "confirmar" | "consultar" | null;

export function BtgCancelamentoPainel({ previa, resultado, motivo, confirmacao, ciente, busy, enviado, erro, agora, onMotivo, onConfirmacao, onCiente, onPreparar, onConfirmar, onConsultar }: {
  previa: Previa | null;
  resultado: Resultado | null;
  motivo: string;
  confirmacao: string;
  ciente: boolean;
  busy: Busy;
  enviado: boolean;
  erro: string | null;
  agora: number;
  onMotivo: (value: string) => void;
  onConfirmacao: (value: string) => void;
  onCiente: (value: boolean) => void;
  onPreparar: () => void;
  onConfirmar: () => void;
  onConsultar: () => void;
}) {
  const operacao = resultado ?? previa;
  const elegivel = previa?.estado === "preparada" && previa.codigo === "PODE_CANCELAR";
  const expirada = previa ? new Date(previa.expiraEm).getTime() <= agora : false;
  const permitida = previa && podeConfirmarCancelamentoUI({ elegivel, expiraEm: previa.expiraEm, motivo, confirmacao, ciente, busy: Boolean(busy || erro), enviado: enviado || Boolean(resultado), agora });
  return <div className="space-y-4">
    <Alert><AlertDescription>Esta ação cancela somente o título bancário selecionado. A dívida e o acordo não serão excluídos, pagos ou cancelados, e não será criada uma nova cobrança. Cancelar não libera a parcela para API ou CNAB.</AlertDescription></Alert>
    {erro && <Alert variant="destructive" role="alert"><AlertDescription>{erro}</AlertDescription></Alert>}
    {busy && <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{busy === "preparar" ? "Consultando estado e preparando prévia..." : busy === "confirmar" ? "Revalidando sessão e solicitando cancelamento; não repita..." : "Consultando resultado, sem repetir o cancelamento..."}</p>}
    {previa && <section className="space-y-2 rounded-md border bg-muted/20 p-3" aria-label="Prévia do título bancário">
      <Badge variant="outline">{rotuloAmbienteBtg(previa.resumo.ambiente)}</Badge>
      <p className="text-sm">Acordo #{previa.resumo.acordoId} · Parcela #{previa.resumo.parcelaId} · Emissão #{previa.emissaoId} · Revisão {previa.resumo.revisao}</p>
      <p className="text-sm">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(previa.resumo.valorCentavos / 100)} · Vencimento {new Date(previa.resumo.vencimento).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p>
      <p className="text-xs text-muted-foreground">{previa.resumo.contaMascara}</p>
      <p className="text-xs text-muted-foreground">Prévia válida até {new Date(previa.expiraEm).toLocaleString("pt-BR")}. O servidor revalida sessão, conta, revisão e estado antes da solicitação.</p>
      {expirada && !enviado && <p role="alert" className="text-sm text-destructive">Prévia expirada. Prepare uma nova revisão antes de confirmar.</p>}
    </section>}
    {operacao && <div role="status" aria-live="polite" className="space-y-1">
      <Badge variant="outline">{operacao.estado === "cancelada" ? "Cancelado no BTG" : operacao.estado === "recusada" ? "Cancelamento recusado / não confirmado" : operacao.estado === "conflito_pagamento" ? "Conflito de pagamento" : operacao.estado === "preparada" ? "Prévia preparada" : "Cancelamento em confirmação"}</Badge>
      <p className="text-sm">{operacao.mensagem}</p>
      <p className="text-xs text-muted-foreground">Operação: {operacao.operacaoId}</p>
    </div>}
    {elegivel && !enviado && !resultado && <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (permitida) onConfirmar(); }}>
      <div className="space-y-1"><Label htmlFor="btg-cancel-motivo">Motivo obrigatório (5–500 caracteres)</Label><Textarea id="btg-cancel-motivo" value={motivo} maxLength={500} onChange={event => onMotivo(event.target.value)} disabled={Boolean(busy || expirada)} /></div>
      <div className="space-y-1"><Label htmlFor="btg-cancel-literal">Digite {CONFIRMACAO_CANCELAMENTO_BTG}</Label><Input id="btg-cancel-literal" autoComplete="off" value={confirmacao} onChange={event => onConfirmacao(event.target.value)} disabled={Boolean(busy || expirada)} /></div>
      <div className="flex items-start gap-2"><Checkbox id="btg-cancel-ciente" checked={ciente} onCheckedChange={value => onCiente(value === true)} disabled={Boolean(busy || expirada)} /><Label htmlFor="btg-cancel-ciente" className="text-sm leading-relaxed">Estou ciente dos efeitos somente no título selecionado e de que um PDF já baixado ou enviado não pode ser retirado do dispositivo do destinatário.</Label></div>
      <Button type="submit" variant="destructive" disabled={!permitida}>Cancelar cobrança no BTG</Button>
    </form>}
    <div className="flex flex-wrap gap-2">
      {(!previa || (expirada && !enviado && !resultado)) && <Button variant="outline" onClick={onPreparar} disabled={Boolean(busy || enviado)}>Preparar prévia</Button>}
      {operacao && operacao.estado !== "cancelada" && <Button variant="outline" onClick={onConsultar} disabled={Boolean(busy)}>Consultar resultado no BTG</Button>}
    </div>
    <p className="text-xs text-muted-foreground">Não há reenvio automático. Resposta aceita não é confirmação de cancelamento. Outros títulos e o resultado original da remessa são preservados.</p>
  </div>;
}

export function BtgCancelamentoDialog({ emissaoId, onClose }: { emissaoId: number; onClose: () => void }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [motivo, setMotivo] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [ciente, setCiente] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const guarda = useRef(false);
  const identidade = `${user?.id}:${user?.role}:${emissaoId}`;
  const atual = useRef(identidade);
  atual.current = identidade;
  const preparar = trpc.btgCancelamento.preparar.useMutation();
  const confirmar = trpc.btgCancelamento.confirmar.useMutation();
  const consultar = trpc.btgCancelamento.consultarResultado.useMutation();
  useEffect(() => {
    setPrevia(null); setResultado(null); setMotivo(""); setConfirmacao(""); setCiente(false); setEnviado(false); setErro(null);
    setBusy(null); guarda.current = false;
    return () => { atual.current = "fechado"; };
  }, [identidade]);
  useEffect(() => { const timer = setInterval(() => setAgora(Date.now()), 1_000); return () => clearInterval(timer); }, []);

  const executar = async (acao: Exclude<Busy, null>) => {
    if (guarda.current || user?.role !== "admin") return;
    if (acao !== "preparar" && !previa) return;
    if (acao === "confirmar" && (!previa || !podeConfirmarCancelamentoUI({ elegivel: previa.estado === "preparada" && previa.codigo === "PODE_CANCELAR", expiraEm: previa.expiraEm, motivo, confirmacao, ciente, busy: Boolean(busy || erro), enviado, agora: Date.now() }))) return;
    guarda.current = true;
    const contexto = identidade;
    setBusy(acao); setErro(null);
    if (acao === "confirmar") setEnviado(true);
    try {
      if (acao === "preparar") {
        const data = await preparar.mutateAsync({ emissaoId });
        if (atual.current === contexto) { setPrevia(data); setResultado(null); setConfirmacao(""); setCiente(false); setEnviado(Boolean(data.solicitadaEm) || data.estado !== "preparada"); }
      } else if (previa) {
        const data = acao === "confirmar"
          ? await confirmar.mutateAsync({ operacaoId: previa.operacaoId, motivo: motivo.trim(), confirmacao: CONFIRMACAO_CANCELAMENTO_BTG, ciente: true })
          : await consultar.mutateAsync({ operacaoId: previa.operacaoId });
        if (atual.current === contexto) setResultado(data);
      }
    } catch (error: unknown) {
      if (atual.current === contexto) setErro(error instanceof Error ? `${error.message} ${acao === "confirmar" ? "Resultado não confirmado; consulte antes de tentar novamente." : "Se a sessão expirou ou perdeu autorização, autentique-se novamente e reabra a revisão."}` : "Não foi possível confirmar a operação; consulte o resultado.");
    } finally {
      guarda.current = false;
      if (atual.current === contexto) { setBusy(null); void invalidarCanaisBtg(utils); }
    }
  };
  if (user?.role !== "admin") return null;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}><DialogHeader><DialogTitle>Cancelar cobrança no BTG · emissão #{emissaoId}</DialogTitle><DialogDescription>Confirmação administrativa individual. Prepare a prévia para consultar o estado atual e conferir o ambiente da integração.</DialogDescription></DialogHeader><BtgCancelamentoPainel previa={previa} resultado={resultado} motivo={motivo} confirmacao={confirmacao} ciente={ciente} busy={busy} enviado={enviado} erro={erro} agora={agora} onMotivo={setMotivo} onConfirmacao={setConfirmacao} onCiente={setCiente} onPreparar={() => { void executar("preparar"); }} onConfirmar={() => { void executar("confirmar"); }} onConsultar={() => { void executar("consultar"); }} /><Button variant="outline" onClick={onClose} disabled={Boolean(busy)}>Fechar</Button></DialogContent></Dialog>;
}
