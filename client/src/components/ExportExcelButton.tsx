import { useState } from "react";
import { Button } from "./ui/button";
import { Download, Loader2 } from "lucide-react";

interface ExportExcelButtonProps {
  onClick: () => Promise<{ success: boolean; base64: string; filename: string }>;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

export function ExportExcelButton({
  onClick,
  label = "Exportar Excel",
  variant = "outline",
  size = "default",
}: ExportExcelButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    try {
      setLoading(true);
      const result = await onClick();

      if (result.success) {
        // Converter base64 para blob e fazer download
        const byteCharacters = atob(result.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        // Criar link de download
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        // Sucesso silencioso - arquivo foi baixado
      } else {
        throw new Error("Falha na exportação");
      }
    } catch (error: any) {
      console.error("Erro ao exportar:", error);
      alert(`Erro ao exportar: ${error.message || "Não foi possível exportar o arquivo."}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={loading}
      variant={variant}
      size={size}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Exportando...
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" />
          {label}
        </>
      )}
    </Button>
  );
}
