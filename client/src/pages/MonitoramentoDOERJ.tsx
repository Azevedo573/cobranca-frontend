import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Newspaper, ExternalLink, CheckCheck, Eye, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  // dateStr pode ser "YYYY-MM-DD"
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

export default function MonitoramentoDOERJ() {
  const [filtroLida, setFiltroLida] = useState<"todas" | "nao_lidas" | "lidas">("todas");
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const queryInput = {
    limit: LIMIT,
    offset,
    lida: filtroLida === "todas" ? undefined : filtroLida === "lidas",
  };

  const { data, isLoading, refetch, isFetching } = trpc.doerj.listar.useQuery(queryInput, {
    refetchOnWindowFocus: false,
  });

  const { data: contador, refetch: refetchContador } = trpc.doerj.contadorNaoLidas.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const utils = trpc.useUtils();

  const marcarLida = trpc.doerj.marcarLida.useMutation({
    onSuccess: () => {
      utils.doerj.listar.invalidate();
      utils.doerj.contadorNaoLidas.invalidate();
    },
  });

  const marcarTodasLidas = trpc.doerj.marcarTodasLidas.useMutation({
    onSuccess: () => {
      utils.doerj.listar.invalidate();
      utils.doerj.contadorNaoLidas.invalidate();
      toast.success("Todas as publicações foram marcadas como lidas.");
    },
  });

  const publicacoes = data?.publicacoes ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Newspaper className="h-6 w-6 text-blue-600" />
              <h1 className="text-2xl font-bold text-foreground">Monitoramento DOERJ</h1>
              {(contador?.total ?? 0) > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {contador?.total} nova{contador?.total !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Publicações do Diário Oficial do Estado do RJ — Dr. Higor
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { refetch(); refetchContador(); }}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            {(contador?.total ?? 0) > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => marcarTodasLidas.mutate()}
                disabled={marcarTodasLidas.isPending}
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                Marcar todas como lidas
              </Button>
            )}
          </div>
        </div>

        {/* Aviso informativo */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardContent className="pt-4 pb-3">
            <div className="flex gap-2 text-sm text-blue-700 dark:text-blue-300">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                O monitoramento é executado automaticamente uma vez ao dia (às 8h). As publicações são buscadas
                no portal <strong>ioerj.com.br</strong> pelo nome <strong>"Higor"</strong> nas seções do Poder Judiciário
                Estadual e Publicações a Pedido.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Filtros */}
        <Tabs value={filtroLida} onValueChange={(v) => { setFiltroLida(v as typeof filtroLida); setOffset(0); }}>
          <TabsList>
            <TabsTrigger value="todas">Todas ({total})</TabsTrigger>
            <TabsTrigger value="nao_lidas">
              Não lidas
              {(contador?.total ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-1.5 text-xs px-1.5 py-0">
                  {contador?.total}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="lidas">Lidas</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Lista de publicações */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-4 pb-4 h-24" />
              </Card>
            ))}
          </div>
        ) : publicacoes.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <Newspaper className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground font-medium">Nenhuma publicação encontrada</p>
              <p className="text-sm text-muted-foreground mt-1">
                {filtroLida === "nao_lidas"
                  ? "Todas as publicações já foram lidas."
                  : "O monitoramento ainda não encontrou publicações com o nome do Dr. Higor."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {publicacoes.map((pub) => (
              <Card
                key={pub.id}
                className={`transition-colors ${pub.lida === 0 ? "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/10" : ""}`}
              >
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {pub.lida === 0 && (
                        <Badge variant="default" className="text-xs bg-blue-600">Nova</Badge>
                      )}
                      {pub.tipo && (
                        <Badge variant="outline" className="text-xs">{pub.tipo}</Badge>
                      )}
                      {pub.jornal && (
                        <Badge variant="secondary" className="text-xs">{pub.jornal}</Badge>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {formatDate(pub.dataPublicacao)}
                      </span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {pub.url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => window.open(pub.url!, "_blank")}
                          title="Ver no DOERJ"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {pub.lida === 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => marcarLida.mutate({ id: pub.id })}
                          disabled={marcarLida.isPending}
                          title="Marcar como lida"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  {pub.trecho ? (
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap line-clamp-6">
                      {pub.trecho}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Trecho não disponível.</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Matéria: {pub.materiaId} · Termo: {pub.termoBusca ?? "Higor"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              Página {currentPage} de {totalPages} · {total} publicações
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + LIMIT >= total}
                onClick={() => setOffset(offset + LIMIT)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
