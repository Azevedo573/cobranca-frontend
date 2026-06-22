import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Printer,
  Download,
  Loader2,
  Scale,
  ClipboardPen,
  Gavel,
  Bell,
} from "lucide-react";

// ─── Tipos de documentos jurídicos e seus campos ─────────────────────────────

const TIPO_INFO: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  procuracao: { label: "Procuração", icon: <Scale className="h-4 w-4" />, color: "text-teal-400" },
  carta_preposto: { label: "Carta de Preposto", icon: <ClipboardPen className="h-4 w-4" />, color: "text-cyan-400" },
  ata_audiencia: { label: "Ata de Audiência", icon: <Gavel className="h-4 w-4" />, color: "text-amber-400" },
  notificacao_juridica: { label: "Notificação Jurídica", icon: <Bell className="h-4 w-4" />, color: "text-rose-400" },
};

// Variáveis jurídicas e seus labels amigáveis
const VARIAVEIS_JURIDICAS: { chave: string; label: string; tipo: "text" | "select" | "date" | "datetime" }[] = [
  { chave: "condominio", label: "Nome do Condomínio", tipo: "select" },
  { chave: "representanteLegal", label: "Representante Legal", tipo: "text" },
  { chave: "tipoAcao", label: "Tipo de Ação Judicial", tipo: "text" },
  { chave: "numeroProcesso", label: "Número do Processo", tipo: "text" },
  { chave: "dataDocumento", label: "Data do Documento", tipo: "date" },
  { chave: "assinatura", label: "Assinatura (nome para assinar)", tipo: "text" },
  { chave: "nomePreposto", label: "Nome do Preposto", tipo: "text" },
  { chave: "dataHoraAudiencia", label: "Data e Hora da Audiência", tipo: "datetime" },
  { chave: "advogadoResponsavel", label: "Advogado Responsável", tipo: "text" },
  { chave: "oabAdvogado", label: "OAB do Advogado", tipo: "text" },
  { chave: "varaCompetente", label: "Vara Competente", tipo: "text" },
  { chave: "foroComarca", label: "Foro / Comarca", tipo: "text" },
];

// Detecta quais variáveis {{chave}} estão presentes no HTML do modelo
function detectarVariaveis(html: string): string[] {
  const matches = html.match(/\{\{(\w+)\}\}/g) ?? [];
  const unique = Array.from(new Set(matches.map((m) => m.replace(/[{}]/g, ""))));
  return unique;
}

// Substitui variáveis no HTML do modelo
function substituirVariaveis(html: string, valores: Record<string, string>): string {
  let resultado = html;
  for (const [chave, valor] of Object.entries(valores)) {
    resultado = resultado.replace(new RegExp(`\\{\\{${chave}\\}\\}`, "g"), valor || `{{${chave}}}`);
  }
  return resultado;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PreencherModeloJuridico() {
  const [, params] = useRoute("/modelos-documento/:id/preencher");
  const [, navigate] = useLocation();
  const modeloId = Number(params?.id);

  const { data: modelo, isLoading: carregandoModelo } = trpc.modelosDocumento.getById.useQuery(
    { id: modeloId },
    { enabled: !!modeloId && !isNaN(modeloId) }
  );

  const { data: condominiosRaw = [] } = trpc.condominios.list.useQuery();
  const condominios = condominiosRaw as Array<{
    id: number;
    name: string;
    juridicoAdvogadoResponsavel?: string | null;
    juridicoAdvogadoOAB?: string | null;
    juridicoVaraCompetente?: string | null;
    juridicoForoComarca?: string | null;
  }>;

  const gerarPDFMutation = trpc.modelosDocumento.gerarPDF.useMutation({
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast.success("PDF gerado com sucesso!");
    },
    onError: (err) => {
      toast.error("Erro ao gerar PDF: " + err.message);
    },
  });

  const [valores, setValores] = useState<Record<string, string>>({});
  const [condominioSelecionado, setCondominioSelecionado] = useState<string>("");

  // Detectar variáveis presentes no modelo
  const variaveisPresentes = modelo ? detectarVariaveis(modelo.conteudoHtml) : [];

  // Filtrar apenas variáveis jurídicas que estão presentes no modelo
  const camposParaExibir = VARIAVEIS_JURIDICAS.filter((v) =>
    variaveisPresentes.includes(v.chave)
  );

  // Preencher data do documento com data atual por padrão
  useEffect(() => {
    if (modelo) {
      const hoje = new Date().toLocaleDateString("pt-BR");
      setValores((prev) => ({
        dataDocumento: hoje,
        ...prev,
      }));
    }
  }, [modelo]);

  // Quando condomínio é selecionado, preencher campos relacionados
  useEffect(() => {
    if (condominioSelecionado) {
      const cond = condominios.find((c) => String(c.id) === condominioSelecionado);
      if (cond) {
        setValores((prev) => ({
          ...prev,
          condominio: cond.name,
          advogadoResponsavel: cond.juridicoAdvogadoResponsavel ?? prev.advogadoResponsavel ?? "",
          oabAdvogado: cond.juridicoAdvogadoOAB ?? prev.oabAdvogado ?? "",
          varaCompetente: cond.juridicoVaraCompetente ?? prev.varaCompetente ?? "",
          foroComarca: cond.juridicoForoComarca ?? prev.foroComarca ?? "",
        }));
      }
    }
  }, [condominioSelecionado, condominios]);

  const htmlPreview = modelo
    ? substituirVariaveis(modelo.conteudoHtml, valores)
    : "";

  const handleGerarPDF = () => {
    if (!modelo) return;
    gerarPDFMutation.mutate({
      modeloId: modelo.id,
      variaveis: valores,
    });
  };

  const handleImprimir = () => {
    const janela = window.open("", "_blank");
    if (!janela) {
      toast.error("Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está ativo.");
      return;
    }
    janela.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${modelo?.nome ?? "Documento"}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; color: #000; }
            @media print { body { margin: 20mm; } }
          </style>
        </head>
        <body>${htmlPreview}</body>
      </html>
    `);
    janela.document.close();
    janela.focus();
    janela.print();
  };

  if (carregandoModelo) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!modelo) {
    return (
      <div className="p-6 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground">Modelo não encontrado.</p>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate("/modelos-documento")}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>
    );
  }

  const tipoInfo = TIPO_INFO[modelo.tipo] ?? {
    label: modelo.tipo,
    icon: <FileText className="h-4 w-4" />,
    color: "text-muted-foreground",
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/modelos-documento")}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 truncate">
              <span className={tipoInfo.color}>{tipoInfo.icon}</span>
              <span className="truncate">Preencher: {modelo.nome}</span>
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
              {tipoInfo.label} — preencha os campos abaixo para gerar o documento final.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleImprimir}
            disabled={!htmlPreview}
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          <Button
            className="gap-2"
            onClick={handleGerarPDF}
            disabled={gerarPDFMutation.isPending}
          >
            {gerarPDFMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Gerar PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Formulário de preenchimento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Campos do Documento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {camposParaExibir.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Nenhuma variável jurídica detectada neste modelo. Verifique se o conteúdo usa variáveis como{" "}
                <code className="bg-muted px-1 rounded text-xs">{"{{condominio}}"}</code>.
              </p>
            ) : (
              camposParaExibir.map((campo) => (
                <div key={campo.chave} className="space-y-1.5">
                  <Label htmlFor={campo.chave} className="text-sm font-medium">
                    {campo.label}
                  </Label>
                  {campo.tipo === "select" && campo.chave === "condominio" ? (
                    <Select
                      value={condominioSelecionado}
                      onValueChange={(val) => setCondominioSelecionado(val)}
                    >
                      <SelectTrigger id={campo.chave}>
                        <SelectValue placeholder="Selecione o condomínio..." />
                      </SelectTrigger>
                      <SelectContent>
                        {condominios.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : campo.tipo === "datetime" ? (
                    <Input
                      id={campo.chave}
                      type="datetime-local"
                      value={valores[campo.chave] ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        // Formatar para exibição amigável no documento
                        const formatted = raw
                          ? new Date(raw).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "";
                        setValores((prev) => ({ ...prev, [campo.chave]: formatted }));
                      }}
                    />
                  ) : campo.tipo === "date" ? (
                    <Input
                      id={campo.chave}
                      type="date"
                      value={
                        valores[campo.chave]
                          ? (() => {
                              const parts = valores[campo.chave].split("/");
                              return parts.length === 3
                                ? `${parts[2]}-${parts[1]}-${parts[0]}`
                                : valores[campo.chave];
                            })()
                          : ""
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        const formatted = raw
                          ? new Date(raw + "T12:00:00").toLocaleDateString("pt-BR")
                          : "";
                        setValores((prev) => ({ ...prev, [campo.chave]: formatted }));
                      }}
                    />
                  ) : (
                    <Input
                      id={campo.chave}
                      placeholder={`Digite ${campo.label.toLowerCase()}...`}
                      value={valores[campo.chave] ?? ""}
                      onChange={(e) =>
                        setValores((prev) => ({ ...prev, [campo.chave]: e.target.value }))
                      }
                    />
                  )}
                </div>
              ))
            )}

            {/* Variáveis não mapeadas (outras variáveis presentes no modelo) */}
            {variaveisPresentes.filter(
              (v) => !VARIAVEIS_JURIDICAS.some((j) => j.chave === v)
            ).length > 0 && (
              <>
                <Separator />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Outras variáveis detectadas
                </p>
                {variaveisPresentes
                  .filter((v) => !VARIAVEIS_JURIDICAS.some((j) => j.chave === v))
                  .map((chave) => (
                    <div key={chave} className="space-y-1.5">
                      <Label htmlFor={`extra_${chave}`} className="text-sm font-medium">
                        {chave}
                      </Label>
                      <Input
                        id={`extra_${chave}`}
                        placeholder={`Valor para {{${chave}}}...`}
                        value={valores[chave] ?? ""}
                        onChange={(e) =>
                          setValores((prev) => ({ ...prev, [chave]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* Preview do documento */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3 flex-shrink-0">
            <CardTitle className="text-base">Pré-visualização</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0">
            <div
              className="min-h-[500px] bg-white text-black p-8 rounded-b-lg text-sm leading-relaxed"
              style={{ fontFamily: "Arial, sans-serif" }}
              dangerouslySetInnerHTML={{ __html: htmlPreview }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
