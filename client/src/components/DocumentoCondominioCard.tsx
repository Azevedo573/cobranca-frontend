import * as React from "react";
import { ExternalLink, FileCheck, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentoUploadProgresso } from "@/components/DocumentoUploadProgresso";
import type { EstadoProgressoDocumento } from "@/lib/progressoDocumento";
import { cn } from "@/lib/utils";
import { DOCUMENTO_CONDOMINIO_MAX_MB } from "@shared/documentos-condominio";

export type DocumentoCondominioCardProps = {
  tipo: "convencao" | "regimento";
  url: string;
  disabled: boolean;
  uploading: boolean;
  removing: boolean;
  canUpload: boolean;
  progresso?: EstadoProgressoDocumento;
  onSelect: (file: File) => void;
  onRemove: () => void;
};

export function DocumentoCondominioCard({
  tipo,
  url,
  disabled,
  uploading,
  removing,
  canUpload,
  progresso,
  onSelect,
  onRemove,
}: DocumentoCondominioCardProps) {
  const inputFile = React.useRef<HTMLInputElement>(null);
  const id = React.useId();
  const [dragOver, setDragOver] = React.useState(false);
  const titulo = tipo === "convencao" ? "Convenção Condominial" : "Regimento Interno";
  const ocupado = uploading || removing;
  const uploadDisabled = disabled || ocupado || !canUpload;
  const removeDisabled = disabled || ocupado;

  const abrirSelecao = () => {
    if (!uploadDisabled) inputFile.current?.click();
  };

  const handleSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    // Permite selecionar novamente o mesmo PDF, inclusive após cancelamento no pai.
    event.currentTarget.value = "";
    if (file && !uploadDisabled) onSelect(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!uploadDisabled) setDragOver(true);
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !uploadDisabled) onSelect(file);
  };

  return (
    <section className="min-w-0 space-y-2" aria-labelledby={`${id}-titulo`} aria-busy={ocupado}>
      <h4 id={`${id}-titulo`} className="text-sm font-medium text-foreground">
        {titulo}
      </h4>
      <input
        ref={inputFile}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        aria-label={`Selecionar PDF — ${titulo}`}
        disabled={uploadDisabled}
        onChange={handleSelect}
      />
      {url ? (
        <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/20">
          <div className="flex items-center gap-3">
            <FileCheck className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Documento enviado</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Visualizar PDF — ${titulo}`}
                className="inline-flex items-center gap-1 rounded-sm text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                Visualizar PDF
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              aria-label={`Substituir PDF — ${titulo}`}
              disabled={uploadDisabled}
              onClick={abrirSelecao}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Substituir PDF
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
              aria-label={`Excluir documento — ${titulo}`}
              disabled={removeDisabled}
              onClick={() => {
                if (!removeDisabled) onRemove();
              }}
            >
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              {removing ? "Excluindo documento..." : "Excluir documento"}
            </Button>
          </div>
          {uploading && (
            <p className="text-xs text-muted-foreground">O PDF atual permanece disponível durante a substituição.</p>
          )}
          {removing && <p role="status" className="sr-only">Excluindo {titulo}.</p>}
        </div>
      ) : (
        <button
          type="button"
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            uploadDisabled
              ? "cursor-not-allowed border-muted-foreground/20 opacity-50"
              : dragOver
                ? "cursor-pointer border-primary bg-primary/10"
                : "cursor-pointer border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5"
          )}
          aria-label={`Enviar PDF — ${titulo}`}
          aria-describedby={`${id}-limite`}
          disabled={uploadDisabled}
          onClick={abrirSelecao}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {uploading || removing ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Upload className={cn("h-6 w-6", dragOver && !uploadDisabled ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
          )}
          <span className="text-sm text-muted-foreground">
            {uploading ? "Envio em andamento" : removing ? "Excluindo documento..." : dragOver && !uploadDisabled ? "Solte para enviar" : "Clique ou arraste o PDF aqui"}
          </span>
          <span id={`${id}-limite`} className="text-xs text-muted-foreground">
            PDF, máx. {DOCUMENTO_CONDOMINIO_MAX_MB} MB
          </span>
        </button>
      )}
      {!url && !canUpload && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Salve o condomínio antes de enviar documentos.</p>
      )}
      {progresso && <DocumentoUploadProgresso estado={progresso} />}
    </section>
  );
}
