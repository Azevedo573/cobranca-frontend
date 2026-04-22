import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  Building2,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import * as XLSX from "xlsx";

type Resultado = {
  linha: number;
  nome: string;
  status: "ok" | "erro" | "aviso";
  mensagem: string;
  dados?: Record<string, unknown>;
};

type Etapa = "upload" | "preview" | "resultado";

export default function ImportarCondominios() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [preview, setPreview] = useState<Resultado[]>([]);
  const [resultado, setResultado] = useState<{
    total: number;
    sucesso: number;
    erros: number;
    resultados: Resultado[];
  } | null>(null);

  const validarMutation = trpc.condominios.importarPlanilha.useMutation();
  const importarMutation = trpc.condominios.importarPlanilha.useMutation();
  const utils = trpc.useUtils();

  // Gerar e baixar template Excel
  const baixarTemplate = () => {
    const wb = XLSX.utils.book_new();
    const dados = [
      {
        Nome: "Condomínio Exemplo",
        CNPJ: "00.000.000/0001-00",
        "Endereço": "Rua das Flores, 100",
        Cidade: "São Paulo",
        Estado: "SP",
        CEP: "01310-100",
        Telefone: "(11) 99999-9999",
        Email: "contato@condominio.com.br",
        Síndico: "João Silva",
        "Email Síndico": "joao@email.com",
        "Juros Mensal (%)": "1.00",
        "Multa (%)": "2.00",
        "Honorários (%)": "10.00",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = [
      { wch: 35 }, { wch: 20 }, { wch: 35 }, { wch: 20 }, { wch: 8 },
      { wch: 12 }, { wch: 18 }, { wch: 30 }, { wch: 25 }, { wch: 30 },
      { wch: 16 }, { wch: 12 }, { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Condomínios");
    XLSX.writeFile(wb, "template_condominios.xlsx");
    toast.success("Template baixado", { description: "Preencha o arquivo e faça o upload." });
  };

  // Ler arquivo e converter para base64
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Formato inválido", { description: "Selecione um arquivo .xlsx ou .xls" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande", { description: "Tamanho máximo: 5MB" });
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      setFileBase64(base64);

      try {
        const res = await validarMutation.mutateAsync({
          fileBase64: base64,
          fileName: file.name,
          apenasValidar: true,
        });
        setPreview(res.resultados);
        setEtapa("preview");
      } catch (err) {
        toast.error("Erro ao ler arquivo", { description: String(err) });
      }
    };
    reader.readAsDataURL(file);
  };

  // Confirmar importação
  const confirmarImportacao = async () => {
    try {
      const res = await importarMutation.mutateAsync({
        fileBase64,
        fileName,
        apenasValidar: false,
      });
      setResultado(res);
      setEtapa("resultado");
      utils.condominios.list.invalidate();
      if (res.erros === 0) {
        toast.success("Importação concluída!", {
          description: `${res.sucesso} condomínio(s) importado(s) com sucesso.`,
        });
      } else {
        toast.warning("Importação parcial", {
          description: `${res.sucesso} importado(s), ${res.erros} erro(s).`,
        });
      }
    } catch (err) {
      toast.error("Erro na importação", { description: String(err) });
    }
  };

  const reiniciar = () => {
    setEtapa("upload");
    setFileName("");
    setFileBase64("");
    setPreview([]);
    setResultado(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const totalErrosPreview = preview.filter((r) => r.status === "erro").length;
  const totalOkPreview = preview.filter((r) => r.status === "ok").length;

  const etapas: Etapa[] = ["upload", "preview", "resultado"];
  const etapaLabels: Record<Etapa, string> = {
    upload: "Selecionar arquivo",
    preview: "Revisar dados",
    resultado: "Resultado",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Importar Condomínios
          </h1>
          <p className="text-muted-foreground mt-1">
            Importe múltiplos condomínios de uma vez através de uma planilha Excel.
          </p>
        </div>
        <Button variant="outline" onClick={baixarTemplate} className="gap-2">
          <Download className="h-4 w-4" />
          Baixar Template
        </Button>
      </div>

      {/* Indicador de etapas */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        {etapas.map((e, idx) => (
          <div key={e} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-colors ${
              etapa === e
                ? "bg-primary text-primary-foreground"
                : idx < etapas.indexOf(etapa)
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground"
            }`}>
              <span>{idx + 1}.</span>
              <span>{etapaLabels[e]}</span>
            </div>
            {idx < 2 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* ── Etapa 1: Upload ── */}
      {etapa === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Selecionar Planilha</CardTitle>
            <CardDescription>
              Faça o upload de um arquivo Excel (.xlsx ou .xls) com os dados dos condomínios.
              Use o botão "Baixar Template" para obter o modelo correto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div
              className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">Clique para selecionar o arquivo</p>
              <p className="text-sm text-muted-foreground mt-1">Formatos aceitos: .xlsx, .xls — Máximo 5MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {validarMutation.isPending && (
              <div className="flex items-center gap-2 text-muted-foreground justify-center">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                Lendo e validando arquivo...
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div>
                <p className="font-medium text-sm mb-2">Coluna obrigatória:</p>
                <Badge variant="default" className="text-xs">Nome</Badge>
              </div>
              <div>
                <p className="font-medium text-sm mb-2">Colunas opcionais:</p>
                <div className="flex flex-wrap gap-2">
                  {["CNPJ", "Endereço", "Cidade", "Estado", "CEP", "Telefone", "Email",
                    "Síndico", "Email Síndico", "Juros Mensal (%)", "Multa (%)", "Honorários (%)"].map((col) => (
                    <Badge key={col} variant="outline" className="text-xs">{col}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Etapa 2: Preview ── */}
      {etapa === "preview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <CardContent className="pt-4 text-center">
                <p className="text-3xl font-bold text-blue-600">{preview.length}</p>
                <p className="text-sm text-muted-foreground">Total de linhas</p>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
              <CardContent className="pt-4 text-center">
                <p className="text-3xl font-bold text-green-600">{totalOkPreview}</p>
                <p className="text-sm text-muted-foreground">Prontos para importar</p>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
              <CardContent className="pt-4 text-center">
                <p className="text-3xl font-bold text-red-600">{totalErrosPreview}</p>
                <p className="text-sm text-muted-foreground">Com erros</p>
              </CardContent>
            </Card>
          </div>

          {totalErrosPreview > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-lg text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                {totalErrosPreview} linha(s) com erros serão ignoradas. Corrija o arquivo e reimporte para incluí-las.
              </span>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revisão — {fileName}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Linha</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>Síndico</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead>Mensagem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((r) => (
                      <TableRow key={r.linha} className={r.status === "erro" ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                        <TableCell className="text-muted-foreground text-xs">{r.linha}</TableCell>
                        <TableCell className="font-medium">{r.nome}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{(r.dados?.cnpj as string) || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {[r.dados?.city, r.dados?.state].filter(Boolean).join("/") || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{(r.dados?.managerName as string) || "—"}</TableCell>
                        <TableCell>
                          {r.status === "ok" ? (
                            <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Válido
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              <XCircle className="h-3 w-3 mr-1" /> Erro
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.mensagem}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={reiniciar} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Selecionar outro arquivo
            </Button>
            <Button
              onClick={confirmarImportacao}
              disabled={totalOkPreview === 0 || importarMutation.isPending}
              className="gap-2"
            >
              {importarMutation.isPending ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Importar {totalOkPreview} condomínio(s)
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Etapa 3: Resultado ── */}
      {etapa === "resultado" && resultado && (
        <div className="space-y-4">
          <Card className={resultado.erros === 0
            ? "border-green-300 bg-green-50 dark:bg-green-950/20"
            : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"}>
            <CardContent className="pt-6 flex items-center gap-4">
              {resultado.erros === 0 ? (
                <CheckCircle2 className="h-10 w-10 text-green-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-10 w-10 text-amber-600 flex-shrink-0" />
              )}
              <div>
                <p className="text-lg font-bold">
                  {resultado.erros === 0 ? "Importação concluída com sucesso!" : "Importação concluída com erros"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {resultado.sucesso} importado(s) · {resultado.erros} erro(s) · {resultado.total} linha(s) total
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhes da importação</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Linha</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead>Mensagem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultado.resultados.map((r) => (
                      <TableRow key={r.linha} className={r.status === "erro" ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                        <TableCell className="text-muted-foreground text-xs">{r.linha}</TableCell>
                        <TableCell className="font-medium">{r.nome}</TableCell>
                        <TableCell>
                          {r.status === "ok" ? (
                            <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Importado
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              <XCircle className="h-3 w-3 mr-1" /> Erro
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.mensagem}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button onClick={reiniciar} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Nova importação
            </Button>
            <Button asChild>
              <a href="/admin/condominios">Ver condomínios cadastrados</a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
