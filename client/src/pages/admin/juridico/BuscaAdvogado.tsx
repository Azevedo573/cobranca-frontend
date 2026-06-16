import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Search, Scale, Users, ChevronDown, ChevronRight, ExternalLink, AlertCircle, Info } from "lucide-react";
import { Link } from "wouter";

// Mapa de aliases dos principais tribunais para exibição
const TRIBUNAIS_PRINCIPAIS = [
  { label: "Todos os principais", value: "__todos__" },
  { label: "TJSP — São Paulo", value: "api_publica_tjsp" },
  { label: "TJRJ — Rio de Janeiro", value: "api_publica_tjrj" },
  { label: "TJMG — Minas Gerais", value: "api_publica_tjmg" },
  { label: "TJRS — Rio Grande do Sul", value: "api_publica_tjrs" },
  { label: "TJPR — Paraná", value: "api_publica_tjpr" },
  { label: "TJBA — Bahia", value: "api_publica_tjba" },
  { label: "TJSC — Santa Catarina", value: "api_publica_tjsc" },
  { label: "TJPE — Pernambuco", value: "api_publica_tjpe" },
  { label: "TJCE — Ceará", value: "api_publica_tjce" },
  { label: "TJGO — Goiás", value: "api_publica_tjgo" },
  { label: "STJ — Superior Tribunal de Justiça", value: "api_publica_stj" },
  { label: "TST — Tribunal Superior do Trabalho", value: "api_publica_tst" },
  { label: "TRT2 — Trabalho SP Capital", value: "api_publica_trt2" },
  { label: "TRT15 — Trabalho Campinas", value: "api_publica_trt15" },
  { label: "TRF3 — Federal SP/MS", value: "api_publica_trf3" },
  { label: "TRF4 — Federal Sul", value: "api_publica_trf4" },
];

type ProcessoResultado = {
  id: string;
  tribunal: string;
  numeroProcesso: string;
  classe: string | null;
  assunto: string | null;
  vara: string | null;
  dataAjuizamento: string | null;
  partes: Array<{
    nome: string;
    tipo: string | null;
    advogados: Array<{ nome: string; documento?: string }>;
  }>;
};

function formatarNumCNJ(num: string): string {
  // Formata NNNNNNN-DD.AAAA.J.TT.OOOO
  const limpo = num.replace(/\D/g, "");
  if (limpo.length !== 20) return num;
  return `${limpo.slice(0, 7)}-${limpo.slice(7, 9)}.${limpo.slice(9, 13)}.${limpo[13]}.${limpo.slice(14, 16)}.${limpo.slice(16)}`;
}

function PartesList({ partes, nomeBusca }: { partes: ProcessoResultado["partes"]; nomeBusca: string }) {
  const nomeLower = nomeBusca.toLowerCase();
  return (
    <div className="space-y-1">
      {partes.map((p, i) => {
        const isMatch =
          p.nome.toLowerCase().includes(nomeLower) ||
          p.advogados.some((a) => a.nome.toLowerCase().includes(nomeLower));
        return (
          <div key={i} className={`text-xs rounded px-2 py-1 ${isMatch ? "bg-amber-50 border border-amber-200 text-amber-900" : "text-muted-foreground"}`}>
            <span className="font-medium">{p.nome}</span>
            {p.tipo && (
              <Badge variant="outline" className="ml-2 text-[10px] py-0 h-4">
                {p.tipo}
              </Badge>
            )}
            {p.advogados.length > 0 && (
              <div className="mt-0.5 pl-2 text-[11px] text-muted-foreground">
                {p.advogados.map((a, j) => (
                  <span key={j} className={`block ${a.nome.toLowerCase().includes(nomeLower) ? "text-amber-700 font-medium" : ""}`}>
                    Adv: {a.nome}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProcessoCard({ processo, nomeBusca }: { processo: ProcessoResultado; nomeBusca: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <TableRow className="cursor-pointer hover:bg-muted/50">
          <TableCell>
            <div className="flex items-center gap-2">
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <span className="font-mono text-sm font-medium">
                {formatarNumCNJ(processo.numeroProcesso)}
              </span>
            </div>
          </TableCell>
          <TableCell>
            <Badge variant="outline" className="text-xs">{processo.tribunal}</Badge>
          </TableCell>
          <TableCell className="text-sm text-muted-foreground">
            {processo.classe ?? "—"}
          </TableCell>
          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
            {processo.assunto ?? "—"}
          </TableCell>
          <TableCell className="text-sm text-muted-foreground">
            {processo.dataAjuizamento
              ? new Date(processo.dataAjuizamento).toLocaleDateString("pt-BR")
              : "—"}
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{processo.partes.length}</span>
            </div>
          </TableCell>
        </TableRow>
      </CollapsibleTrigger>
      <CollapsibleContent asChild>
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30 py-3 px-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Vara / Órgão Julgador</p>
                <p className="text-sm">{processo.vara ?? "Não informado"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Partes e Advogados</p>
                <PartesList partes={processo.partes} nomeBusca={nomeBusca} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Link href={`/admin/juridico/processos?importar=${encodeURIComponent(processo.numeroProcesso)}&tribunal=${encodeURIComponent(processo.tribunal)}`}>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <ExternalLink className="h-3 w-3" />
                  Importar para o sistema
                </Button>
              </Link>
            </div>
          </TableCell>
        </TableRow>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function BuscaAdvogado() {
  const [nome, setNome] = useState("");
  const [tribunalSelecionado, setTribunalSelecionado] = useState("__todos__");
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<{
    multiTribunal: boolean;
    total: number;
    processos: ProcessoResultado[];
    tribunaisConsultados?: number;
  } | null>(null);

  const buscarMutation = trpc.processos.buscarPorNomeAdvogado.useMutation({
    onSuccess: (data) => {
      setResultado(data as typeof resultado);
      if (data.total === 0) {
        toast.info("Nenhum processo encontrado para este nome no(s) tribunal(is) consultado(s).");
      } else {
        toast.success(`${data.total} processo(s) encontrado(s).`);
      }
    },
    onError: (err) => {
      toast.error(`Erro na busca: ${err.message}`);
    },
    onSettled: () => setBuscando(false),
  });

  const tribunaisAliases = useMemo(() => {
    if (tribunalSelecionado === "__todos__") return undefined;
    return [tribunalSelecionado];
  }, [tribunalSelecionado]);

  function handleBuscar() {
    if (nome.trim().length < 3) {
      toast.warning("Informe ao menos 3 caracteres para buscar.");
      return;
    }
    setBuscando(true);
    setResultado(null);
    buscarMutation.mutate({
      nomeAdvogado: nome.trim(),
      tribunaisAliases,
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Scale className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Busca por Advogado</h1>
          <p className="text-muted-foreground text-sm">
            Pesquise processos pelo nome do advogado na base DataJud do CNJ
          </p>
        </div>
      </div>

      {/* Aviso informativo */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-4 pb-3">
          <div className="flex gap-2 text-sm text-blue-800">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>Sobre a busca por nome:</strong> A busca é feita nos campos de partes e representantes do processo no DataJud (CNJ).
              Para nomes comuns, selecione um tribunal específico para resultados mais precisos.
              Os dados podem ter defasagem de horas a dias dependendo do tribunal.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Formulário de busca */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Parâmetros de Busca</CardTitle>
          <CardDescription>
            Digite o nome completo ou parcial do advogado e selecione o tribunal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Ex: João da Silva Advogados"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
                className="w-full"
              />
            </div>
            <Select value={tribunalSelecionado} onValueChange={setTribunalSelecionado}>
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue placeholder="Selecionar tribunal" />
              </SelectTrigger>
              <SelectContent>
                {TRIBUNAIS_PRINCIPAIS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleBuscar}
              disabled={buscando || nome.trim().length < 3}
              className="gap-2 shrink-0"
            >
              <Search className="h-4 w-4" />
              {buscando ? "Buscando..." : "Buscar"}
            </Button>
          </div>
          {tribunalSelecionado === "__todos__" && (
            <p className="text-xs text-muted-foreground mt-2">
              Sem tribunal selecionado, a busca será feita nos 9 principais tribunais simultaneamente (TJSP, TJRJ, TJMG, TJRS, TJPR, STJ, TST, TRT2, TRT15).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Resultados */}
      {buscando && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="inline-flex items-center gap-3 text-muted-foreground">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Consultando DataJud do CNJ...</span>
            </div>
            {tribunalSelecionado === "__todos__" && (
              <p className="text-xs text-muted-foreground mt-2">
                Buscando em múltiplos tribunais simultaneamente. Pode levar até 20 segundos.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!buscando && resultado && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Resultados da Busca
              </CardTitle>
              <div className="flex items-center gap-2">
                {resultado.multiTribunal && resultado.tribunaisConsultados && (
                  <Badge variant="secondary" className="text-xs">
                    {resultado.tribunaisConsultados} tribunais consultados
                  </Badge>
                )}
                <Badge variant={resultado.total > 0 ? "default" : "outline"}>
                  {resultado.total} processo(s)
                </Badge>
              </div>
            </div>
            {resultado.total > 0 && (
              <CardDescription>
                Processos onde <strong>"{nome}"</strong> aparece como parte ou advogado representante.
                Clique em uma linha para ver os detalhes e partes do processo.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {resultado.total === 0 ? (
              <div className="py-12 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum processo encontrado para este nome.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tente um nome mais completo ou selecione um tribunal específico.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número CNJ</TableHead>
                    <TableHead>Tribunal</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead>Ajuizamento</TableHead>
                    <TableHead>Partes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultado.processos.map((processo) => (
                    <ProcessoCard
                      key={`${processo.tribunal}-${processo.id}`}
                      processo={processo}
                      nomeBusca={nome}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
