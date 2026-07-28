import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  RefreshCw,
  Scale,
  Calendar,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Gavel,
  Users,
  Building2,
  Hash,
  ExternalLink,
  Info,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  // Tenta extrair data de strings como "01/07/2026" ou ISO
  const match = d.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return `${match[1]}/${match[2]}/${match[3]}`;
  try {
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return d;
  }
}

function getMovimentoIcon(descricao: string) {
  const d = descricao?.toLowerCase() ?? "";
  if (d.includes("sentença") || d.includes("sentenca")) return <Gavel className="h-3.5 w-3.5" />;
  if (d.includes("audiência") || d.includes("audiencia")) return <Users className="h-3.5 w-3.5" />;
  if (d.includes("decisão") || d.includes("decisao") || d.includes("despacho")) return <Scale className="h-3.5 w-3.5" />;
  if (d.includes("distribuição") || d.includes("distribuicao")) return <Building2 className="h-3.5 w-3.5" />;
  if (d.includes("petição") || d.includes("peticao") || d.includes("recurso")) return <FileText className="h-3.5 w-3.5" />;
  if (d.includes("arquiv")) return <CheckCircle2 className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

function getMovimentoColor(descricao: string) {
  const d = descricao?.toLowerCase() ?? "";
  if (d.includes("sentença") || d.includes("sentenca")) return "bg-purple-500";
  if (d.includes("audiência") || d.includes("audiencia")) return "bg-green-500";
  if (d.includes("decisão") || d.includes("decisao")) return "bg-blue-500";
  if (d.includes("despacho")) return "bg-amber-500";
  if (d.includes("distribuição") || d.includes("distribuicao")) return "bg-teal-500";
  if (d.includes("arquiv")) return "bg-slate-400";
  if (d.includes("recurso")) return "bg-orange-500";
  return "bg-primary/60";
}

// ─── Subcomponente: Dados Básicos do Processo ─────────────────────────────────

function DadosBasicosTJRJ({ dados }: { dados: any }) {
  const campos = [
    { label: "Número Interno TJRJ", value: dados.numProcesso, mono: true },
    { label: "Número CNJ", value: dados.codCnj || dados.codigoProcessoCNJ },
    { label: "Classe", value: dados.descrTipProcesso || dados.classe },
    { label: "Assunto", value: dados.assunto },
    { label: "Vara / Órgão", value: dados.descrOrgaoJulgador || dados.vara },
    { label: "Comarca", value: dados.descrComarca || dados.comarca },
    { label: "Situação", value: dados.descrSituacao || dados.situacao },
    { label: "Valor da Causa", value: dados.valorCausa ? `R$ ${Number(dados.valorCausa).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : null },
    { label: "Data de Distribuição", value: formatDate(dados.dataDistribuicao || dados.dtDistribuicao) },
  ].filter(c => c.value);

  if (!campos.length) return null;

  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {campos.map((c, i) => (
        <div key={i} className={c.mono ? "col-span-2" : ""}>
          <p className="text-xs text-muted-foreground mb-0.5">{c.label}</p>
          <p className={`text-sm ${c.mono ? "font-mono font-semibold text-primary" : "text-foreground"}`}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Subcomponente: Item de Movimentação ─────────────────────────────────────

function MovimentoItem({ mov, isLast }: { mov: any; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const descricao = mov.descrMovimento || mov.descricao || mov.tipoMovimento || "Movimentação";
  const data = formatDate(mov.dtMovimento || mov.dataMovimento || mov.data);
  const complemento = mov.complemento || mov.descrComplemento || mov.observacao;
  const documentos = mov.documentos ?? [];
  const hasDetails = complemento || documentos.length > 0;

  const dotColor = getMovimentoColor(descricao);

  return (
    <div className="flex gap-3">
      {/* Linha do tempo */}
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full ${dotColor} flex items-center justify-center text-white shrink-0 mt-0.5`}>
          {getMovimentoIcon(descricao)}
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
      </div>

      {/* Conteúdo */}
      <div className={`pb-4 flex-1 min-w-0 ${isLast ? "" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground leading-snug">{descricao}</p>
            {data !== "—" && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {data}
              </p>
            )}
          </div>
          {hasDetails && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 shrink-0"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>

        {expanded && (
          <div className="mt-2 space-y-2">
            {complemento && (
              <div className="bg-muted/50 rounded p-2 text-xs leading-relaxed text-foreground">
                {complemento}
              </div>
            )}
            {documentos.length > 0 && (
              <div className="space-y-1">
                {documentos.map((doc: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{doc.descricao || doc.nome || `Documento ${i + 1}`}</span>
                    {doc.url && (
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

interface ConsultaTJRJProps {
  /** Número CNJ do processo (ex: 0038028-63.2022.8.19.0001) */
  numeroCNJ: string | null | undefined;
  /** Se true, inicia a consulta automaticamente ao montar */
  autoConsultar?: boolean;
  /** Título exibido no card */
  titulo?: string;
}

export function ConsultaTJRJ({ numeroCNJ, autoConsultar = false, titulo = "Consulta TJRJ" }: ConsultaTJRJProps) {
  const [ativo, setAtivo] = useState(autoConsultar);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const { data, isLoading, error, refetch } = trpc.tjrj.consultarMovimentos.useQuery(
    { numeroCNJ: numeroCNJ ?? "" },
    {
      enabled: ativo && !!numeroCNJ && numeroCNJ.length > 5,
      retry: false,
      staleTime: 5 * 60 * 1000, // 5 min cache
    }
  );

  if (!numeroCNJ) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4 text-center">
          <Hash className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Nenhum número de processo para consultar</p>
        </CardContent>
      </Card>
    );
  }

  // ── Não iniciado ─────────────────────────────────────────────────────────
  if (!ativo) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Scale className="h-4 w-4 text-primary" />
                {titulo}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{numeroCNJ}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5"
              onClick={() => setAtivo(true)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Carregando ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <div className="text-center">
            <p className="text-sm font-medium">Consultando TJRJ...</p>
            <p className="text-xs mt-0.5">Buscando movimentações do processo</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Erro ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-destructive">Erro na consulta</p>
              <p className="text-xs text-muted-foreground mt-0.5 break-words">{error.message}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 gap-1.5 w-full"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Sucesso ──────────────────────────────────────────────────────────────
  if (!data) return null;

  const { resolucao, numProcessoInterno, movimentos } = data;

  // Extrair lista de movimentos do objeto retornado
  let listaMovimentos: any[] = [];
  if (Array.isArray(movimentos)) {
    listaMovimentos = movimentos;
  } else if (movimentos?.movimentos && Array.isArray(movimentos.movimentos)) {
    listaMovimentos = movimentos.movimentos;
  } else if (movimentos?.listaMovimentos && Array.isArray(movimentos.listaMovimentos)) {
    listaMovimentos = movimentos.listaMovimentos;
  } else if (typeof movimentos === "object" && movimentos !== null) {
    // Tentar encontrar qualquer array dentro do objeto
    const arrays = Object.values(movimentos).filter(Array.isArray) as any[][];
    if (arrays.length > 0) listaMovimentos = arrays[0];
  }

  const LIMITE_INICIAL = 10;
  const movimentosExibidos = mostrarTodos ? listaMovimentos : listaMovimentos.slice(0, LIMITE_INICIAL);
  const temMais = listaMovimentos.length > LIMITE_INICIAL;

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-primary" />
            {titulo}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs font-mono">
              {numProcessoInterno}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => refetch()}
              title="Atualizar"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        {/* Dados básicos do processo */}
        <DadosBasicosTJRJ dados={resolucao} />

        {/* Separador */}
        {listaMovimentos.length > 0 && (
          <div className="border-t border-border pt-3 mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-3">
              <Clock className="h-3.5 w-3.5" />
              Movimentações ({listaMovimentos.length})
            </p>

            {/* Timeline */}
            <div>
              {movimentosExibidos.map((mov: any, i: number) => (
                <MovimentoItem
                  key={i}
                  mov={mov}
                  isLast={i === movimentosExibidos.length - 1 && (!temMais || mostrarTodos)}
                />
              ))}
            </div>

            {temMais && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-1 text-xs text-muted-foreground gap-1"
                onClick={() => setMostrarTodos(v => !v)}
              >
                {mostrarTodos ? (
                  <><ChevronUp className="h-3.5 w-3.5" /> Mostrar menos</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5" /> Ver mais {listaMovimentos.length - LIMITE_INICIAL} movimentações</>
                )}
              </Button>
            )}
          </div>
        )}

        {listaMovimentos.length === 0 && (
          <div className="text-center py-4">
            <Info className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Nenhuma movimentação encontrada</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
