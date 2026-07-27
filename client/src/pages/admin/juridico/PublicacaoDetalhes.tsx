import { useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  Eye,
  Clock,
  CheckCircle2,
  Archive,
  ChevronDown,
  ExternalLink,
  Building2,
  FileText,
  Calendar,
  Scale,
  Users,
  Loader2,
  Newspaper,
  Link2,
  AlertCircle,
  BookOpen,
  Gavel,
  PlusCircle,
  Timer,
  Mic,
  ListTodo,
  History,
} from "lucide-react";
import { ModalCriarDemanda } from "./CentralDemandas";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  nova:                   { label: "Nova",                color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",       icon: <Bell className="h-3.5 w-3.5" /> },
  analisando:             { label: "Analisando",          color: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",   icon: <Eye className="h-3.5 w-3.5" /> },
  aguardando_providencia: { label: "Aguard. Providência", color: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300", icon: <Clock className="h-3.5 w-3.5" /> },
  providenciada:          { label: "Providenciada",       color: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300",   icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  arquivada:              { label: "Arquivada",           color: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400",      icon: <Archive className="h-3.5 w-3.5" /> },
};

const TIPO_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  intimacao:  { label: "Intimação",  icon: <Bell className="h-3.5 w-3.5" />,       color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  sentenca:   { label: "Sentença",   icon: <Gavel className="h-3.5 w-3.5" />,      color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  despacho:   { label: "Despacho",   icon: <FileText className="h-3.5 w-3.5" />,   color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  audiencia:  { label: "Audiência",  icon: <Calendar className="h-3.5 w-3.5" />,   color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  decisao:    { label: "Decisão",    icon: <Scale className="h-3.5 w-3.5" />,      color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  outro:      { label: "Outro",      icon: <BookOpen className="h-3.5 w-3.5" />,   color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

const PROCESSO_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ativo:     { label: "Ativo",     color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  suspenso:  { label: "Suspenso",  color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  arquivado: { label: "Arquivado", color: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30" },
  encerrado: { label: "Encerrado", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
};

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d + "T12:00:00") : new Date(d);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value || value === "—") return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

// ─── Coluna Direita: Processo Vinculado ───────────────────────────────────────

function ProcessoVinculado({ numeroProcesso }: { numeroProcesso: string | null | undefined }) {
  const busca = numeroProcesso?.replace(/\D/g, "").slice(0, 20) ?? "";

  const { data: processos = [], isLoading } = trpc.processos.listar.useQuery(
    { busca: numeroProcesso ?? "" },
    { enabled: !!numeroProcesso && numeroProcesso.length > 5 }
  );

  // Tenta encontrar o processo com numeroCNJ que bate com o número da publicação
  const processo = processos.find((p: any) => {
    const cnj = p.numeroCNJ?.replace(/\D/g, "") ?? "";
    return cnj === busca || p.numeroCNJ === numeroProcesso;
  }) ?? (processos.length === 1 ? processos[0] : null);

  if (!numeroProcesso) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <Link2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum número de processo identificado</p>
          <p className="text-xs text-muted-foreground mt-1">O número CNJ não foi extraído desta publicação</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Buscando processo vinculado...</span>
        </CardContent>
      </Card>
    );
  }

  if (!processo) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm font-medium text-muted-foreground">Processo não cadastrado</p>
          <p className="text-xs text-muted-foreground mt-1">
            O processo <span className="font-mono">{numeroProcesso}</span> não foi encontrado na base de dados.
          </p>
          <Link href="/admin/juridico/processos">
            <Button variant="outline" size="sm" className="mt-3 text-xs">
              <Scale className="h-3.5 w-3.5 mr-1.5" />
              Ir para Processos
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const statusCfg = PROCESSO_STATUS_CONFIG[processo.status] ?? PROCESSO_STATUS_CONFIG.ativo;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-primary" />
            Processo Vinculado
          </CardTitle>
          <Link href={`/admin/juridico/processos/${processo.id}`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
              <ExternalLink className="h-3 w-3" />
              Abrir
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Número CNJ */}
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Número CNJ</p>
          <p className="text-sm font-mono font-semibold text-primary">{processo.numeroCNJ}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge className={`text-xs border ${statusCfg.color}`}>{statusCfg.label}</Badge>
          {processo.tipo && (
            <Badge variant="outline" className="text-xs">
              {processo.tipo.charAt(0).toUpperCase() + processo.tipo.slice(1)}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2">
          {processo.tribunal && <InfoRow label="Tribunal" value={processo.tribunal} />}
          {processo.comarca && <InfoRow label="Comarca" value={processo.comarca} />}
          {processo.vara && <InfoRow label="Vara" value={processo.vara} />}
          {processo.assunto && <InfoRow label="Assunto" value={processo.assunto} />}
          {processo.classe && <InfoRow label="Classe" value={processo.classe} />}
          {processo.faseProcessual && <InfoRow label="Fase" value={processo.faseProcessual} />}
          {processo.dataAjuizamento && <InfoRow label="Ajuizamento" value={formatDate(processo.dataAjuizamento)} />}
          {processo.advogadoNome && (
            <InfoRow label="Advogado" value={
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3 text-muted-foreground" />
                {processo.advogadoNome}
              </span>
            } />
          )}
          {processo.condominioNome && (
            <InfoRow label="Condomínio" value={
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                {processo.condominioNome}
              </span>
            } />
          )}
        </div>

        {processo.observacoes && (
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Observações</p>
            <p className="text-xs bg-muted/50 rounded p-2 leading-relaxed">{processo.observacoes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function PublicacaoDetalhes() {
  const [, params] = useRoute("/admin/juridico/publicacoes/:id");
  const pubId = parseInt(params?.id ?? "0");

  const utils = trpc.useUtils();
  const [showNovaDemanda, setShowNovaDemanda] = useState(false);

  const { data: pub, isLoading } = trpc.pjePublicacoes.getById.useQuery(
    { id: pubId },
    { enabled: pubId > 0 }
  );

  const marcarLidaMutation = trpc.pjePublicacoes.marcarLida.useMutation({
    onSuccess: () => utils.pjePublicacoes.getById.invalidate({ id: pubId }),
  });

  // Marcar como lida ao abrir (se não lida)
  const [marcouLida, setMarcouLida] = useState(false);
  if (pub && pub.lida === 0 && !marcouLida) {
    setMarcouLida(true);
    marcarLidaMutation.mutate({ id: pubId });
  }

  if (isLoading || pubId === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pub) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-foreground">
        <Newspaper className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Publicação não encontrada</p>
        <Link href="/admin/juridico/publicacoes">
          <Button variant="ghost" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[pub.lida === 0 ? "nova" : "analisando"] ?? STATUS_CONFIG.nova;
  const tipoCfg = TIPO_CONFIG[pub.tipoComunicacao?.toLowerCase() ?? ""] ?? TIPO_CONFIG.outro;

  // Dados para pré-preenchimento do modal de demanda
  const initialValuesDemanda = {
    assunto: `${pub.tipoComunicacao || "Publicação"} - ${pub.numeroProcessoMascara || pub.numeroProcesso || pub.nomeOrgao || "Processo"}`,
    descricao: [
      pub.siglaTribunal ? `Tribunal: ${pub.siglaTribunal}` : null,
      pub.nomeOrgao ? `Órgão: ${pub.nomeOrgao}` : null,
      pub.numeroProcessoMascara ? `Processo: ${pub.numeroProcessoMascara}` : null,
      pub.dataDisponibilizacao ? `Data da publicação: ${formatDate(pub.dataDisponibilizacao)}` : null,
      "",
      pub.texto ? `Conteúdo:\n${pub.texto}` : null,
    ].filter(Boolean).join("\n"),
    tipo: "acompanhamento" as const,
    canal: "processo_interno" as const,
  };

  // Partes e advogados do JSON
  const destinatarios = pub.destinatariosJson as any;
  const partes: Array<{ nome?: string; tipo?: string; cpfCnpj?: string }> = destinatarios?.destinatarios ?? [];
  const advogados: Array<{ nome?: string; oab?: string; numeroOab?: string }> = destinatarios?.advogados ?? [];

  return (
    <>
      <div className="min-h-screen bg-background text-foreground">
        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Lado esquerdo: Voltar + título + badge */}
              <div className="flex items-center gap-3 min-w-0">
                <Link href="/admin/juridico/publicacoes">
                  <Button variant="ghost" size="sm" className="gap-1.5 shrink-0">
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </Button>
                </Link>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-base font-semibold text-foreground">Publicação</h1>
                    {pub.lida === 0 ? (
                      <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 gap-1">
                        <Bell className="h-3 w-3" />
                        Não Lida
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
                        <Eye className="h-3 w-3" />
                        Lida
                      </Badge>
                    )}
                    {pub.tipoComunicacao && (
                      <Badge className={`text-xs gap-1 ${tipoCfg.color}`}>
                        {tipoCfg.icon}
                        {pub.tipoComunicacao}
                      </Badge>
                    )}
                  </div>
                  {pub.dataDisponibilizacao && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Divulgado em {formatDate(pub.dataDisponibilizacao)}
                      {pub.siglaTribunal && ` · ${pub.siglaTribunal}`}
                      {pub.nomePesquisado && ` · Pesquisado: ${pub.nomePesquisado}`}
                    </p>
                  )}
                </div>
              </div>

              {/* Lado direito: botões de ação */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Dropdown Tratamentos */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <PlusCircle className="h-4 w-4" />
                      Tratamentos
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => toast.info("Em breve: Adicionar prazo")}>
                      <Timer className="h-4 w-4 mr-2 text-muted-foreground" />
                      Adicionar prazo
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.info("Em breve: Adicionar audiência")}>
                      <Mic className="h-4 w-4 mr-2 text-muted-foreground" />
                      Adicionar audiência
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowNovaDemanda(true)}>
                      <ListTodo className="h-4 w-4 mr-2 text-muted-foreground" />
                      Adicionar tarefa
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => toast.info("Em breve: Adicionar evento")}>
                      <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                      Adicionar evento
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.info("Em breve: Adicionar histórico manual")}>
                      <History className="h-4 w-4 mr-2 text-muted-foreground" />
                      Adicionar histórico manual
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Conteúdo em duas colunas ─────────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ─── Coluna Esquerda: Dados da Publicação ─────────────────── */}
            <div className="space-y-4">

              {/* Dados do Diário */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <Newspaper className="h-4 w-4 text-primary" />
                    Dados do Diário
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-2 gap-3">
                    {pub.siglaTribunal && (
                      <InfoRow label="Tribunal" value={
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {pub.siglaTribunal}
                        </span>
                      } />
                    )}
                    {pub.nomeOrgao && (
                      <InfoRow label="Órgão / Vara" value={pub.nomeOrgao} />
                    )}
                    {pub.dataDisponibilizacao && (
                      <InfoRow label="Data de Disponibilização" value={
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatDate(pub.dataDisponibilizacao)}
                        </span>
                      } />
                    )}
                    {pub.tipoComunicacao && (
                      <InfoRow label="Tipo de Comunicação" value={pub.tipoComunicacao} />
                    )}
                    {pub.tipoDocumento && (
                      <InfoRow label="Tipo de Documento" value={pub.tipoDocumento} />
                    )}
                    {pub.nomeClasse && (
                      <InfoRow label="Classe" value={pub.nomeClasse} />
                    )}
                    {pub.meio && (
                      <InfoRow label="Meio" value={pub.meio} />
                    )}
                    {pub.meioCompleto && (
                      <InfoRow label="Meio Completo" value={pub.meioCompleto} />
                    )}
                    {pub.nomePesquisado && (
                      <InfoRow label="Nome Pesquisado" value={pub.nomePesquisado} />
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Processo */}
              {(pub.numeroProcesso || pub.numeroProcessoMascara) && (
                <Card>
                  <CardHeader className="pb-3 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <Scale className="h-4 w-4 text-primary" />
                      Processo
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Número do Processo</p>
                      <p className="text-sm font-mono font-semibold text-primary">
                        {pub.numeroProcessoMascara || pub.numeroProcesso}
                      </p>
                    </div>
                    {pub.link && (
                      <a
                        href={pub.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Abrir no PJe
                      </a>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Partes */}
              {partes.length > 0 && (
                <Card>
                  <CardHeader className="pb-3 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-primary" />
                      Partes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-2">
                      {partes.map((parte: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0 mt-0.5">
                            {parte.tipo || "Parte"}
                          </span>
                          <div>
                            <p className="font-medium">{parte.nome || parte.nomeCompleto || "—"}</p>
                            {parte.cpfCnpj && (
                              <p className="text-xs text-muted-foreground">{parte.cpfCnpj}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Advogados */}
              {advogados.length > 0 && (
                <Card>
                  <CardHeader className="pb-3 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <Scale className="h-4 w-4 text-primary" />
                      Advogados
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-2">
                      {advogados.map((adv: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <div>
                            <p className="font-medium">{adv.nome || adv.nomeCompleto || "—"}</p>
                            {(adv.oab || adv.numeroOab) && (
                              <p className="text-xs text-muted-foreground">OAB: {adv.oab || adv.numeroOab}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Texto completo */}
              {pub.texto && (
                <Card>
                  <CardHeader className="pb-3 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-primary" />
                      Conteúdo da Publicação
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="bg-muted/50 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto text-foreground">
                      {pub.texto}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ─── Coluna Direita: Processo Vinculado ───────────────────── */}
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Link2 className="h-4 w-4" />
                  Processo no Sistema
                </h2>
                <ProcessoVinculado
                  numeroProcesso={pub.numeroProcessoMascara || pub.numeroProcesso}
                />
              </div>

              {/* Metadados */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">Metadados</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  <InfoRow label="ID da Publicação (PJe)" value={String(pub.pjeId)} />
                  <InfoRow label="Registrado em" value={pub.createdAt ? new Date(pub.createdAt).toLocaleString("pt-BR") : "—"} />
                  <InfoRow label="Leitura" value={pub.lida === 1 ? "Lida" : "Não lida"} />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Nova Demanda pré-preenchido */}
      <ModalCriarDemanda
        open={showNovaDemanda}
        onClose={() => setShowNovaDemanda(false)}
        initialValues={initialValuesDemanda}
      />
    </>
  );
}
