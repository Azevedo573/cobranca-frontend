import * as React from "react";
import { CheckCircle2, FileText, Loader2, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { textoFaseDocumento, type EstadoProgressoDocumento } from "@/lib/progressoDocumento";

export function DocumentoUploadProgresso({ estado }: { estado: EstadoProgressoDocumento }) {
  const sucesso = estado.fase === "concluido";
  const erro = estado.fase === "erro";
  const ocupado = !sucesso && !erro;
  const indeterminado = estado.percentual === null || estado.fase === "salvando";
  const etapas = ["Preparar", "Enviar", "Salvar"];
  const atual = estado.fase === "preparando" ? 0 : estado.fase === "enviando" ? 1 : 2;
  const tamanho = (estado.tamanho / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <div className={cn("w-full rounded-xl border p-4 text-left shadow-sm transition-colors",
      erro ? "border-destructive/30 bg-destructive/5" : sucesso ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/20" : "border-primary/20 bg-primary/[0.03]")}
      aria-busy={ocupado}>
      <div className="flex items-center gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", erro ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
          {sucesso ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : erro ? <AlertCircle className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground" title={estado.nome}>{estado.nome}</p>
          <p className="text-xs text-muted-foreground">PDF · {tamanho} MB</p>
        </div>
        {ocupado && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" />}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 text-xs">
        <span role="status" className={cn("font-medium", erro ? "text-destructive" : sucesso ? "text-emerald-700 dark:text-emerald-400" : "text-primary")}>{textoFaseDocumento(estado)}</span>
        {!indeterminado && !erro && <span className="tabular-nums font-semibold text-foreground">{estado.percentual}%</span>}
      </div>
      {indeterminado && ocupado ? (
        <div role="progressbar" aria-label={textoFaseDocumento(estado)} aria-valuetext="Aguardando confirmação do servidor" className="relative mt-2 h-2 overflow-hidden rounded-full bg-primary/15">
          <div className="absolute inset-y-0 left-0 w-full origin-left animate-pulse rounded-full bg-primary/70 motion-reduce:animate-none" />
        </div>
      ) : (
        <Progress value={estado.percentual ?? 0} aria-label={textoFaseDocumento(estado)} aria-valuenow={estado.percentual ?? 0} aria-valuemin={0} aria-valuemax={100}
          className={cn("mt-2 h-2", erro && "opacity-40")} />
      )}
      {erro ? <p role="alert" className="mt-2 text-xs leading-relaxed text-destructive">{estado.erro || "Verifique sua conexão e tente novamente."}</p> : (
        <div className="mt-3 flex justify-between gap-2 text-[11px] text-muted-foreground" aria-hidden="true">
          {etapas.map((etapa, index) => <span key={etapa} className={cn("flex items-center gap-1.5", (index < atual || sucesso) && "text-emerald-700 dark:text-emerald-400", index === atual && ocupado && "font-medium text-primary")}>
            <span className={cn("h-1.5 w-1.5 rounded-full bg-muted-foreground/30", (index < atual || sucesso) && "bg-emerald-500", index === atual && ocupado && "bg-primary")} />{etapa}
          </span>)}
        </div>
      )}
      {estado.fase === "salvando" && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Transmissão concluída. Aguarde a confirmação do armazenamento.</p>}
      {estado.fase === "preparando" && <p className="mt-2 text-xs text-muted-foreground">Lendo o arquivo no seu dispositivo.</p>}
    </div>
  );
}
