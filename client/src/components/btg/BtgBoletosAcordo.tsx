import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { baixarPdfBase64 } from "@/lib/downloadBase64";
import { invalidarCanaisBtg } from "@/lib/invalidarCanaisBtg";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BtgBoletoParcela } from "./BtgBoletoParcela";

type ResultadoItem = { parcelaId: number; mensagem: string; ok: boolean };

/** Somente documentos existentes: não emite, não altera canal nem reapresenta CNAB como fallback. */
export function BtgBoletosAcordo({ acordoId, mostrarParcelas = false }: { acordoId: number; mostrarParcelas?: boolean }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [resultados, setResultados] = useState<ResultadoItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const guarda = useRef(false);
  const identidade = `${user?.id}:${user?.role}:${acordoId}`;
  const atual = useRef(identidade);
  atual.current = identidade;
  const leitura = trpc.btgBoletos.listarAcordo.useQuery({ acordoId }, {
    enabled: user?.role === "admin", retry: false, staleTime: 0, gcTime: 0,
    refetchInterval: query => query.state.data?.parcelas.some(p => p.operacaoCancelamento && ["solicitada", "em_confirmacao"].includes(p.operacaoCancelamento.estado)) ? 5_000 : false,
  });
  const gerar = trpc.btgBoletos.gerarLote.useMutation({ retry: false });
  useEffect(() => {
    setSelecionadas(new Set()); setResultados([]); setErro(null);
    return () => { atual.current = "fechado"; };
  }, [identidade]);
  const elegiveis = leitura.data?.parcelas.filter(p => p.fonte === "btg_api" && p.pdfDisponivel && p.pagamentoPermitido && !(p.operacaoCancelamento && ["solicitada", "em_confirmacao", "cancelada", "conflito_pagamento"].includes(p.operacaoCancelamento.estado))) ?? [];
  const ids = elegiveis.filter(p => selecionadas.has(p.parcelaId)).map(p => p.parcelaId);
  const baixar = async () => {
    if (guarda.current || !ids.length || user?.role !== "admin") return;
    guarda.current = true; setErro(null); setResultados([]);
    const contexto = identidade;
    try {
      const lote = await gerar.mutateAsync({ acordoId, parcelaIds: ids });
      if (atual.current !== contexto) return;
      const itens: ResultadoItem[] = [];
      for (const item of lote.itens) {
        if (!item.ok || !item.base64 || !item.nomeArquivo || item.mimeType !== "application/pdf") {
          itens.push({ parcelaId: item.parcelaId, ok: false, mensagem: item.mensagem ?? "Documento indisponível; nenhum título foi emitido." });
          continue;
        }
        try {
          baixarPdfBase64({ base64: item.base64, nomeArquivo: item.nomeArquivo, mimeType: "application/pdf" });
          itens.push({ parcelaId: item.parcelaId, ok: true, mensagem: "PDF entregue ao navegador." });
        } catch (error: unknown) {
          itens.push({ parcelaId: item.parcelaId, ok: false, mensagem: error instanceof Error ? error.message : "Não foi possível baixar o PDF." });
        }
      }
      setResultados(itens);
    } catch (error: unknown) {
      if (atual.current === contexto) setErro(error instanceof Error ? error.message : "Lote indisponível; nenhum título foi emitido.");
    } finally {
      guarda.current = false;
      if (atual.current === contexto) void invalidarCanaisBtg(utils);
    }
  };
  if (user?.role !== "admin") return null;
  if (leitura.error) return <p role="alert" className="text-xs text-destructive">Documentos BTG indisponíveis: {leitura.error.message}. Não será usado outro canal.</p>;
  if (!leitura.data) return <p role="status" className="text-xs text-muted-foreground">Carregando documentos do acordo...</p>;
  return <section className="space-y-2 text-xs" aria-label="Documentos bancários do acordo">
    <p className="font-medium">Boletos das parcelas já emitidas no BTG</p>
    {leitura.data.parcelas.every(p => p.fonte === "nao_emitida") && <p className="text-muted-foreground">Acordo criado. As parcelas ainda não foram emitidas no banco. Revise o envio; número reservado não habilita boleto.</p>}
    {elegiveis.length > 0 ? <><div className="flex flex-wrap gap-3">{elegiveis.map(p => <div key={p.parcelaId} className="flex items-center gap-1"><Checkbox id={`lote-${acordoId}-${p.parcelaId}`} checked={selecionadas.has(p.parcelaId)} disabled={gerar.isPending} onCheckedChange={checked => setSelecionadas(anteriores => { const next = new Set(anteriores); if (checked === true) next.add(p.parcelaId); else next.delete(p.parcelaId); return next; })} /><Label htmlFor={`lote-${acordoId}-${p.parcelaId}`} className="text-xs">Parcela #{p.parcelaId}</Label></div>)}</div><Button type="button" size="sm" variant="outline" onClick={() => { void baixar(); }} disabled={!ids.length || gerar.isPending}>{gerar.isPending ? "Gerando documentos..." : `Baixar PDFs selecionados (${ids.length})`}</Button><p className="text-muted-foreground">O navegador pode solicitar permissão para vários downloads. Resultado individual abaixo; não há novo envio ao banco.</p></> : <p className="text-muted-foreground">Nenhum PDF BTG disponível para pagamento neste momento.</p>}
    {erro && <p role="alert" className="text-destructive">{erro}</p>}
    {resultados.length > 0 && <ul aria-label="Resultado por parcela" className="space-y-1">{resultados.map(item => <li key={item.parcelaId} className={item.ok ? "text-muted-foreground" : "text-destructive"}>Parcela #{item.parcelaId}: {item.mensagem}</li>)}</ul>}
    {mostrarParcelas && <div className="space-y-3 border-t pt-2">{leitura.data.parcelas.map(p => <div key={p.parcelaId} className="space-y-1"><p className="font-medium">Parcela #{p.parcelaId}</p><BtgBoletoParcela parcelaId={p.parcelaId} situacao={p} /></div>)}</div>}
  </section>;
}
