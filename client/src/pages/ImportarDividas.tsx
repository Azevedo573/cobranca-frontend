import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";

export default function ImportarDividas() {
  const params = useParams();
  const devedorId = parseInt(params.id!);
  const [, navigate] = useLocation();

  
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const { data: devedor } = trpc.devedores.getById.useQuery({ id: devedorId });
  const importMutation = trpc.cobrancas.importarPlanilha.useMutation();
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validar extensão
      if (!selectedFile.name.endsWith(".xlsx") && !selectedFile.name.endsWith(".xls")) {
        alert("Arquivo inválido. Por favor, selecione um arquivo Excel (.xlsx ou .xls)");
        return;
      }
      setFile(selectedFile);
    }
  };
  
  const handleUpload = async () => {
    if (!file || !devedor) return;
    
    setUploading(true);
    
    try {
      // Ler arquivo como base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        
        try {
          const result = await importMutation.mutateAsync({
            devedorId,
            condominioId: devedor.condominioId,
            fileBase64: base64,
          });
          
          if (result.success) {
            alert(`Importação concluída! ${result.imported} cobrança(s) importada(s) com sucesso.`);
            navigate(`/devedores/${devedorId}/detalhes`);
          } else {
            alert(`Importação concluída com erros: ${result.imported} cobrança(s) importada(s). ${result.errors.length} erro(s) encontrado(s).`);
          }
        } catch (error: any) {
          alert(`Erro na importação: ${error.message || "Ocorreu um erro ao processar a planilha"}`);
        } finally {
          setUploading(false);
        }
      };
      
      reader.readAsDataURL(file);
    } catch (error: any) {
      alert(`Erro ao ler arquivo: ${error.message}`);
      setUploading(false);
    }
  };
  
  const downloadTemplate = () => {
    // Criar workbook Excel
    const wb = XLSX.utils.book_new();
    
    // Dados do template
    const data = [
      ["Descrição", "Valor", "Vencimento", "Tipo", "Custas Judiciais", "Mês Referência"],
      ["Condomínio Janeiro/2024", 500.00, "31/01/2024", "condominio", "", "2024-01"],
      ["Condomínio Fevereiro/2024", 500.00, "28/02/2024", "condominio", "", "2024-02"],
      ["Multa por barulho", 150.00, "15/03/2024", "multa", "", ""]
    ];
    
    // Criar worksheet
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Definir largura das colunas
    ws['!cols'] = [
      { wch: 30 }, // Descrição
      { wch: 12 }, // Valor
      { wch: 15 }, // Vencimento
      { wch: 15 }, // Tipo
      { wch: 18 }, // Custas Judiciais
      { wch: 18 }  // Mês Referência
    ];
    
    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    
    // Gerar arquivo Excel
    XLSX.writeFile(wb, "template_importacao_dividas.xlsx");
  };
  
  if (!devedor) {
    return <div className="p-8">Carregando...</div>;
  }
  
  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Importar Dívidas</h1>
        <p className="text-muted-foreground">
          Devedor: <span className="font-medium">{devedor.name}</span>
        </p>
      </div>
      
      <div className="grid gap-6">
        {/* Instruções */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <FileSpreadsheet className="w-8 h-8 text-primary mt-1" />
            <div className="flex-1">
              <h2 className="text-lg font-semibold mb-2">Como importar dívidas</h2>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Baixe o template de planilha clicando no botão abaixo</li>
                <li>Preencha a planilha com os dados das cobranças</li>
                <li>Salve o arquivo no formato Excel (.xlsx)</li>
                <li>Faça o upload do arquivo preenchido</li>
              </ol>
              
              <Button
                variant="outline"
                className="mt-4"
                onClick={downloadTemplate}
              >
                <Download className="w-4 h-4 mr-2" />
                Baixar Template
              </Button>
            </div>
          </div>
        </Card>
        
        {/* Formato da Planilha */}
        <Card className="p-6">
          <h3 className="font-semibold mb-3">Formato da Planilha</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Coluna</th>
                  <th className="text-left p-2">Obrigatório</th>
                  <th className="text-left p-2">Formato</th>
                  <th className="text-left p-2">Exemplo</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="p-2 font-medium">Descrição</td>
                  <td className="p-2">Sim</td>
                  <td className="p-2">Texto</td>
                  <td className="p-2">Condomínio Janeiro/2024</td>
                </tr>
                <tr className="border-b">
                  <td className="p-2 font-medium">Valor</td>
                  <td className="p-2">Sim</td>
                  <td className="p-2">Número (use ponto ou vírgula)</td>
                  <td className="p-2">500.00 ou 500,00</td>
                </tr>
                <tr className="border-b">
                  <td className="p-2 font-medium">Vencimento</td>
                  <td className="p-2">Sim</td>
                  <td className="p-2">Data (DD/MM/YYYY)</td>
                  <td className="p-2">31/01/2024</td>
                </tr>
                <tr className="border-b">
                  <td className="p-2 font-medium">Tipo</td>
                  <td className="p-2">Não</td>
                  <td className="p-2">condominio, multa, cota_extra, etc.</td>
                  <td className="p-2">condominio</td>
                </tr>
                <tr className="border-b">
                  <td className="p-2 font-medium">Custas Judiciais</td>
                  <td className="p-2">Não</td>
                  <td className="p-2">Número</td>
                  <td className="p-2">100.00</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Mês Referência</td>
                  <td className="p-2">Não</td>
                  <td className="p-2">YYYY-MM</td>
                  <td className="p-2">2024-01</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
        
        {/* Upload */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Upload da Planilha</h3>
          
          <div className="space-y-4">
            <div>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={uploading}
              />
              {file && (
                <p className="text-sm text-muted-foreground mt-2">
                  Arquivo selecionado: {file.name}
                </p>
              )}
            </div>
            
            <div className="flex gap-3">
              <Button
                onClick={handleUpload}
                disabled={!file || uploading}
              >
                {uploading ? (
                  <>Processando...</>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar Dívidas
                  </>
                )}
              </Button>
              
              <Button
                variant="outline"
                onClick={() => navigate(`/devedores/${devedorId}/detalhes`)}
                disabled={uploading}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
        
        {/* Resultado da importação */}
        {importMutation.data && (
          <Card className="p-6">
            <div className="flex items-start gap-4">
              {importMutation.data.success ? (
                <CheckCircle2 className="w-6 h-6 text-green-600 mt-1" />
              ) : (
                <AlertCircle className="w-6 h-6 text-yellow-600 mt-1" />
              )}
              
              <div className="flex-1">
                <h3 className="font-semibold mb-2">
                  {importMutation.data.success ? "Importação concluída!" : "Importação concluída com erros"}
                </h3>
                
                <p className="text-sm text-muted-foreground mb-3">
                  {importMutation.data.imported} cobrança(s) importada(s) com sucesso.
                </p>
                
                {importMutation.data.errors.length > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
                    <h4 className="font-medium text-sm mb-2">Erros encontrados:</h4>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {importMutation.data.errors.map((error, i) => (
                        <li key={i} className="text-yellow-800 dark:text-yellow-200">{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
