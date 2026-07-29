import { useState, useEffect } from "react";
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
  Clock,
  FileText,
  Gavel,
  Users,
  Building2,
  Hash,
  ExternalLink,
  Info,
  User,
  Briefcase,
} from "lucide-react";

// ─── Tipos baseados na estrutura real da API TJRJ ─────────────────────────────

export interface TJRJMovimento {
  codTipAnd?: number;
  ordem?: number;
  dtAlt?: string;
  descrMov?: string;          // ← descrição principal
  dtMovimento?: string;       // ← data principal
  descricao?: string;         // ← texto completo do ato
  descResumida?: string;
  descrTipAto?: string;
  descrAto?: string;
  descrTipMov?: string;
  nomeJuiz?: string;
  indPublicado?: string;
  movimentosExibicao?: Array<{
    tipoMovimento?: string;
    detalhesMovimento?: Array<{ codigo: string; descricao: string }>;
    resumoOuIntegra?: {
      descTipoAto?: string;
      descResumida?: string;
      descCompleta?: string;
    } | null;
    codDocAtoAssinadoDig?: string | null;
  }>;
  publicado?: { dtExp?: string; dtPub?: string; dtPubPrev?: string };
  // campos de distribuição (último item)
  descDistribuicao?: string;
  serventia?: string;
  dt?: string;
}

export interface TJRJProcesso {
  idProc?: string;
  codProc?: string;           // número interno (ex: 2022.001.032157-2)
  codCnj?: string;            // número CNJ
  dataDis?: string;           // data de distribuição
  txtAcao?: string;           // ação / classe
  txtAssunto?: string;        // assunto
  descVara?: string;
  descServ?: string;
  nome?: string;              // comarca
  descRito?: string;
  sitProc?: string;
  advogados?: Array<{ nomeAdv: string; numOab: string }>;
  movimentosProc?: TJRJMovimento[];
  personagensProcesso?: Array<{ nome: string; descPers: string; codTipPers?: string }>;
  personagens?: Array<{ nome: string; descPers: string; tipoPolo?: string }>;
  segundaInstProc?: Array<{ codProc: string; codCnj: string; url: string }>;
  descrComp?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMovimentoIcon(descricao: string) {
  const d = (descricao ?? "").toLowerCase();
  if (d.includes("sentença") || d.includes("sentenca") || d.includes("julgamento")) return <Gavel className="h-3.5 w-3.5" />;
  if (d.includes("audiência") || d.includes("audiencia")) return <Users className="h-3.5 w-3.5" />;
  if (d.includes("decisão") || d.includes("decisao") || d.includes("despacho")) return <Scale className="h-3.5 w-3.5" />;
  if (d.includes("distribuição") || d.includes("distribuicao") || d.includes("distribuic")) return <Building2 className="h-3.5 w-3.5" />;
  if (d.includes("petição") || d.includes("peticao") || d.includes("recurso") || d.includes("juntada")) return <FileText className="h-3.5 w-3.5" />;
  if (d.includes("conclusão") || d.includes("conclusao")) return <Briefcase className="h-3.5 w-3.5" />;
  if (d.includes("remessa")) return <ExternalLink className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

function getMovimentoColor(descricao: string) {
  const d = (descricao ?? "").toLowerCase();
  if (d.includes("sentença") || d.includes("sentenca") || d.includes("julgamento")) return "bg-purple-500";
  if (d.includes("audiência") || d.includes("audiencia")) return "bg-green-500";
  if (d.includes("decisão") || d.includes("decisao")) return "bg-blue-600";
  if (d.includes("despacho")) return "bg-amber-500";
  if (d.includes("distribuição") || d.includes("distribuicao")) return "bg-teal-500";
  if (d.includes("conclusão") || d.includes("conclusao")) return "bg-indigo-500";
  if (d.includes("remessa")) return "bg-orange-500";
  if (d.includes("recurso") || d.includes("apelação") || d.includes("apelacao")) return "bg-rose-500";
  if (d.includes("juntada")) return "bg-slate-400";
  return "bg-primary/60";
}

// ─── Subcomponente: Partes do Processo ───────────────────────────────────────

function PartesProcesso({ processo }: { processo: TJRJProcesso }) {
  const personagens = processo.personagensProcesso ?? [];
  if (!personagens.length) return null;

  const grupos: Record<string, string[]> = {};
  for (const p of personagens) {
    const tipo = p.descPers ?? "Outros";
    if (!grupos[tipo]) grupos[tipo] = [];
    grupos[tipo].push(p.nome);
  }

  return (
    <div className="space-y-2">
      {Object.entries(grupos).map(([tipo, nomes]) => (
        <div key={tipo}>
          <p className="text-xs text-muted-foreground mb-1 font-medium">{tipo}</p>
          {nomes.map((nome, i) => (
            <div key={i} className="flex items-center gap-1.5 text-sm text-foreground">
              <User className="h-3 w-3 text-muted-foreground shrink-0" />
              <span>{nome}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Subcomponente: Item de Movimentação ─────────────────────────────────────

function MovimentoItem({ mov, isLast }: { mov: TJRJMovimento; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);

  // Descrição: preferir descrMov, fallback para movimentosExibicao[0].tipoMovimento ou descDistribuicao
  const descricao =
    mov.descrMov ||
    mov.movimentosExibicao?.[0]?.tipoMovimento ||
    mov.descDistribuicao ||
    "Movimentação";

  // Data: preferir dtMovimento, fallback para dt ou dtAlt
  const data = mov.dtMovimento || mov.dt || mov.dtAlt || "—";

  // Texto completo do ato
  const textoCompleto = mov.descricao?.trim() || "";
  const textoResumido = mov.descResumida?.trim() || "";

  // Detalhes dos movimentosExibicao
  const subMovimentos = mov.movimentosExibicao ?? [];

  // Juiz
  const juiz = mov.nomeJuiz;

  // Tipo do ato (sentença, despacho, etc.)
  const tipoAto = mov.descrTipAto || mov.descrTipMov;

  const hasDetails = textoCompleto || textoResumido || subMovimentos.length > 0 || juiz;

  const dotColor = getMovimentoColor(descricao);

  return (
    <div className="flex gap-3">
      {/* Linha do tempo */}
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full ${dotColor} flex items-center justify-center text-white shrink-0 mt-0.5`}>
          {getMovimentoIcon(descricao)}
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-1 min-h-[16px]" />}
      </div>

      {/* Conteúdo */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground leading-snug">{descricao}</p>
            {tipoAto && tipoAto !== descricao && (
              <p className="text-xs text-muted-foreground">{tipoAto}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {data}
              {juiz && <span className="ml-2">· {juiz}</span>}
            </p>
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
            {/* Texto resumido (se diferente do completo) */}
            {textoResumido && !textoCompleto && (
              <div className="bg-muted/50 rounded p-2 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                {textoResumido}
              </div>
            )}

            {/* Texto completo */}
            {textoCompleto && textoCompleto !== " " && (
              <div className="bg-muted/50 rounded p-2 text-xs leading-relaxed text-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                {textoCompleto}
              </div>
            )}

            {/* Sub-movimentos (detalhes estruturados) */}
            {subMovimentos.map((sub, i) => (
              <div key={i} className="border-l-2 border-border pl-2 space-y-1">
                {sub.tipoMovimento && sub.tipoMovimento !== descricao && (
                  <p className="text-xs font-medium text-muted-foreground">{sub.tipoMovimento}</p>
                )}
                {sub.detalhesMovimento?.map((d, j) => (
                  <div key={j} className="flex gap-1 text-xs">
                    <span className="text-muted-foreground shrink-0">{d.codigo}</span>
                    <span className="text-foreground">{d.descricao}</span>
                  </div>
                ))}
                {/* Resumo/Íntegra */}
                {sub.resumoOuIntegra?.descResumida && (
                  <div className="bg-muted/30 rounded p-1.5 text-xs text-foreground mt-1 whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {sub.resumoOuIntegra.descResumida}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

interface ConsultaTJRJProps {
  numeroCNJ: string | null | undefined;
  autoConsultar?: boolean;
  titulo?: string;
  /** Callback chamado quando os dados são carregados — útil para importação */
  onDadosCarregados?: (processo: TJRJProcesso) => void;
}

export function ConsultaTJRJ({
  numeroCNJ,
  autoConsultar = false,
  titulo = "Consulta TJRJ",
  onDadosCarregados,
}: ConsultaTJRJProps) {
  const [ativo, setAtivo] = useState(autoConsultar);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [mostrarPartes, setMostrarPartes] = useState(false);

  const { data, isLoading, error, refetch } = trpc.tjrj.consultarMovimentos.useQuery(
    { numeroCNJ: numeroCNJ ?? "" },
    {
      enabled: ativo && !!numeroCNJ && numeroCNJ.length > 5,
      retry: false,
      staleTime: 5 * 60 * 1000,
    }
  );

  useEffect(() => {
    if (data?.movimentos && onDadosCarregados) {
      onDadosCarregados(data.movimentos as TJRJProcesso);
    }
  }, [data]);

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
              className="shrink-0 gap-1.5"
              onClick={() => setAtivo(true)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Consultar TJRJ
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

  if (!data) return null;

  // ── Extrair dados da resposta ─────────────────────────────────────────────
  // A resposta da etapa 2 é o objeto completo do processo
  const proc = data.movimentos as TJRJProcesso;
  const movimentos: TJRJMovimento[] = proc?.movimentosProc ?? [];
  const numInterno = data.numProcessoInterno;

  const LIMITE_INICIAL = 15;
  const movimentosExibidos = mostrarTodos ? movimentos : movimentos.slice(0, LIMITE_INICIAL);
  const temMais = movimentos.length > LIMITE_INICIAL;

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-primary" />
            {titulo}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {proc?.sitProc === "A" && (
              <Badge className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                Ativo
              </Badge>
            )}
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

      <CardContent className="px-4 pb-4 space-y-4">
        {/* ── Dados básicos do processo ─────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {[
            { label: "Número Interno", value: numInterno, mono: true },
            { label: "Número CNJ", value: proc?.codCnj, mono: true },
            { label: "Ação / Classe", value: proc?.txtAcao },
            { label: "Assunto", value: proc?.txtAssunto },
            { label: "Vara", value: proc?.descVara || proc?.descServ },
            { label: "Comarca", value: proc?.nome },
            { label: "Rito", value: proc?.descRito },
            { label: "Distribuição", value: proc?.dataDis },
          ].filter(c => c.value).map((c, i) => (
            <div key={i} className={c.mono ? "col-span-2" : ""}>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-sm ${c.mono ? "font-mono font-semibold text-primary" : "text-foreground"}`}>
                {c.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Partes ────────────────────────────────────────────────────── */}
        {(proc?.personagensProcesso?.length ?? 0) > 0 && (
          <div>
            <button
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-full"
              onClick={() => setMostrarPartes(v => !v)}
            >
              <Users className="h-3.5 w-3.5" />
              Partes ({proc?.personagensProcesso?.length})
              {mostrarPartes ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
            </button>
            {mostrarPartes && (
              <div className="mt-2">
                <PartesProcesso processo={proc} />
              </div>
            )}
          </div>
        )}

        {/* ── Movimentações ─────────────────────────────────────────────── */}
        {movimentos.length > 0 ? (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-3">
              <Clock className="h-3.5 w-3.5" />
              Movimentações ({movimentos.length})
            </p>

            <div>
              {movimentosExibidos.map((mov, i) => (
                <MovimentoItem
                  key={mov.ordem ?? i}
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
                  <><ChevronDown className="h-3.5 w-3.5" /> Ver mais {movimentos.length - LIMITE_INICIAL} movimentações</>
                )}
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-4 border-t border-border pt-4">
            <Info className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Nenhuma movimentação encontrada</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
