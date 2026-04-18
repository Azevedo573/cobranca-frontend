import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Upload, AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DadoImportacao {
  nomeCompleto?: string;
  cpfCnpj?: string;
  email?: string;
  telefone?: string;
  unidade: string;
  bloco?: string;
  tipoCobranca?: string;
  descricaoCobranca?: string;
  mesReferencia?: string;
  dataVencimento: string;
  valorOriginal: number;
}

interface ErroValidacao {
  linha: number;
  campo: string;
  mensagem: string;
}

export default function ImportarDevedores() {
  const [condominioId, setCondominioId] = useState<number>(0);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [dadosPrevia, setDadosPrevia] = useState<DadoImportacao[]>([]);
  const [errosValidacao, setErrosValidacao] = useState<ErroValidacao[]>([]);
  const [importando, setImportando] = useState(false);

  const { data: condominios } = trpc.condominios.list.useQuery();
  const downloadTemplateMutation = trpc.importacao.downloadTemplate.useMutation();
  const processarPlanilhaMutation = trpc.importacao.processarPlanilha.useMutation();
  const importarDevedoresMutation = trpc.importacao.importarDevedores.useMutation();

  const handleDownloadTemplate = async () => {
    try {
      const result = await downloadTemplateMutation.mutateAsync();
      
      // Converter base64 para blob
      const byteCharacters = atob(result.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      
      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success("Template baixado com sucesso!");
    } catch (error) {
      toast.error("Erro ao baixar template");
      console.error(error);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!condominioId) {
      toast.error("Selecione um condomínio primeiro");
      return;
    }

    setArquivo(file);
    setDadosPrevia([]);
    setErrosValidacao([]);

    try {
      // Ler arquivo como base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const base64Data = base64.split(",")[1]; // Remover prefixo data:...;base64,

        try {
          const resultado = await processarPlanilhaMutation.mutateAsync({
            base64: base64Data,
            condominioId,
          });

          setDadosPrevia(resultado.dados);
          setErrosValidacao(resultado.erros);

          if (resultado.erros.length > 0) {
            toast.warning(`Planilha processada com ${resultado.erros.length} erro(s) de validação`);
          } else {
            toast.success(`${resultado.dados.length} registro(s) pronto(s) para importação`);
          }
        } catch (error) {
          toast.error("Erro ao processar planilha");
          console.error(error);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error("Erro ao ler arquivo");
      console.error(error);
    }
  };

  const handleImportar = async () => {
    if (!condominioId) {
      toast.error("Selecione um condomínio");
      return;
    }

    if (dadosPrevia.length === 0) {
      toast.error("Nenhum dado para importar");
      return;
    }

    if (errosValidacao.length > 0) {
      toast.error("Corrija os erros de validação antes de importar");
      return;
    }

    setImportando(true);
    try {
      const resultado = await importarDevedoresMutation.mutateAsync({
        condominioId,
        dados: dadosPrevia,
      });

      toast.success(
        `Importação concluída! ${resultado.devedoresCriados} devedor(es) criado(s), ${resultado.cobrancasCriadas} cobrança(s) criada(s)`
      );

      if (resultado.erros.length > 0) {
        console.error("Erros durante importação:", resultado.erros);
        toast.warning(`${resultado.erros.length} erro(s) durante importação. Verifique o console.`);
      }

      // Limpar formulário
      setArquivo(null);
      setDadosPrevia([]);
      setErrosValidacao([]);
    } catch (error) {
      toast.error("Erro ao importar devedores");
      console.error(error);
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Importar Devedores via Planilha</h1>
        <p className="text-muted-foreground mt-2">
          Faça o upload de uma planilha Excel para importar múltiplos devedores e cobranças de uma vez.
          O campo <strong>Nome Completo é opcional</strong> se Bloco + Unidade estiverem preenchidos.
        </p>
      </div>

      {/* Passo 1: Download do Template */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Passo 1: Baixar Template
          </CardTitle>
          <CardDescription>
            Baixe o template padronizado e preencha com os dados dos devedores.
            <strong>Nome é opcional</strong> quando Bloco + Unidade identificam o devedor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleDownloadTemplate} disabled={downloadTemplateMutation.isPending}>
            <Download className="mr-2 h-4 w-4" />
            Baixar Template Excel
          </Button>
        </CardContent>
      </Card>

      {/* Passo 2: Seleção de Condomínio */}
      <Card>
        <CardHeader>
          <CardTitle>Passo 2: Selecionar Condomínio</CardTitle>
          <CardDescription>
            Escolha o condomínio para o qual os devedores serão importados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={condominioId.toString()} onValueChange={(v) => setCondominioId(Number(v))}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione um condomínio" />
            </SelectTrigger>
            <SelectContent>
              {condominios?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Passo 3: Upload da Planilha */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Passo 3: Fazer Upload da Planilha
          </CardTitle>
          <CardDescription>
            Selecione o arquivo Excel preenchido para validação
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={!condominioId || processarPlanilhaMutation.isPending}
            className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-primary file:text-primary-foreground
              hover:file:bg-primary/90
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {arquivo && (
            <p className="mt-2 text-sm text-muted-foreground">
              Arquivo selecionado: {arquivo.name}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Erros de Validação */}
      {errosValidacao.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>{errosValidacao.length} erro(s) de validação encontrado(s):</strong>
            <ul className="mt-2 list-disc list-inside space-y-1">
              {errosValidacao.slice(0, 10).map((erro, idx) => (
                <li key={idx}>
                  Linha {erro.linha}, campo "{erro.campo}": {erro.mensagem}
                </li>
              ))}
              {errosValidacao.length > 10 && (
                <li className="text-muted-foreground">
                  ... e mais {errosValidacao.length - 10} erro(s)
                </li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Prévia dos Dados */}
      {dadosPrevia.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Prévia da Importação
            </CardTitle>
            <CardDescription>
              {dadosPrevia.length} registro(s) serão importados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Bloco</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dadosPrevia.map((dado, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{dado.nomeCompleto}</TableCell>
                      <TableCell>{dado.cpfCnpj}</TableCell>
                      <TableCell>{dado.unidade}</TableCell>
                      <TableCell>{dado.bloco || "-"}</TableCell>
                      <TableCell>{dado.tipoCobranca || "Cota Condominial"}</TableCell>
                      <TableCell>{dado.email || "-"}</TableCell>
                      <TableCell>{dado.telefone || "-"}</TableCell>
                      <TableCell>{dado.dataVencimento}</TableCell>
                      <TableCell className="text-right">
                        R$ {dado.valorOriginal.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                onClick={handleImportar}
                disabled={importando || errosValidacao.length > 0}
                size="lg"
              >
                {importando ? "Importando..." : "Confirmar Importação"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
