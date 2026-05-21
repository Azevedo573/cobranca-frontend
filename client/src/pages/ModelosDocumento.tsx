import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  FileCheck,
  FileWarning,
  Mail,
  Handshake,
  Receipt,
  ScrollText,
} from "lucide-react";

const TIPO_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  proposta_acordo: { label: "Proposta de Acordo", icon: <Handshake className="h-4 w-4" />, color: "bg-blue-100 text-blue-800" },
  termo_acordo: { label: "Termo de Acordo", icon: <FileCheck className="h-4 w-4" />, color: "bg-green-100 text-green-800" },
  notificacao_debito: { label: "Notificação de Débito", icon: <FileWarning className="h-4 w-4" />, color: "bg-red-100 text-red-800" },
  carta_cobranca: { label: "Carta de Cobrança", icon: <Mail className="h-4 w-4" />, color: "bg-orange-100 text-orange-800" },
  recibo_pagamento: { label: "Recibo de Pagamento", icon: <Receipt className="h-4 w-4" />, color: "bg-purple-100 text-purple-800" },
  contrato_parcelamento: { label: "Contrato de Parcelamento", icon: <ScrollText className="h-4 w-4" />, color: "bg-indigo-100 text-indigo-800" },
  outro: { label: "Outro", icon: <FileText className="h-4 w-4" />, color: "bg-gray-100 text-gray-800" },
};

export default function ModelosDocumento() {
  const { user } = useAuth();
  const [deletandoId, setDeletandoId] = useState<number | null>(null);

  const { data: modelos = [], isLoading, refetch } = trpc.modelosDocumento.list.useQuery({});

  const deleteMutation = trpc.modelosDocumento.delete.useMutation({
    onSuccess: () => {
      toast.success("Modelo excluído com sucesso");
      setDeletandoId(null);
      refetch();
    },
    onError: (err) => {
      toast.error("Erro ao excluir modelo: " + err.message);
    },
  });

  const podeEditar = user?.role === "admin" || user?.role === "cobrador";

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Modelos de Documentos
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Crie e gerencie modelos reutilizáveis com variáveis dinâmicas para geração automática de PDFs.
            </p>
          </div>
          {podeEditar && (
            <Link href="/modelos-documento/novo">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Modelo
              </Button>
            </Link>
          )}
        </div>

        {/* Lista de modelos */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-2">
                  <div className="h-5 bg-muted rounded w-3/4" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                  <div className="h-4 bg-muted rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : modelos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">Nenhum modelo cadastrado</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Crie modelos de documentos reutilizáveis com variáveis dinâmicas como nome do devedor, valor do acordo e parcelas.
            </p>
            {podeEditar && (
              <Link href="/modelos-documento/novo">
                <Button className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Criar Primeiro Modelo
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modelos.map((modelo) => {
              const tipoInfo = TIPO_LABELS[modelo.tipo] ?? TIPO_LABELS.outro;
              return (
                <Card key={modelo.id} className="hover:shadow-md transition-shadow group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-semibold leading-tight line-clamp-2">
                        {modelo.nome}
                      </CardTitle>
                      {podeEditar && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Link href={`/modelos-documento/${modelo.id}/editar`}>
                            <Button size="icon" variant="ghost" className="h-7 w-7">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeletandoId(modelo.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <Badge className={`w-fit text-xs gap-1 ${tipoInfo.color} border-0`}>
                      {tipoInfo.icon}
                      {tipoInfo.label}
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {modelo.logoUrl && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Logo
                        </span>
                      )}
                      {modelo.marcaDaguaUrl && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          Marca d'água
                        </span>
                      )}
                      {!modelo.logoUrl && !modelo.marcaDaguaUrl && (
                        <span className="italic">Sem logo ou marca d'água</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Atualizado em {new Date(modelo.updatedAt).toLocaleDateString("pt-BR")}
                    </p>
                    <Link href={`/modelos-documento/${modelo.id}/editar`}>
                      <Button variant="outline" size="sm" className="w-full gap-2 mt-1">
                        <Pencil className="h-3.5 w-3.5" />
                        Editar Modelo
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Diálogo de confirmação de exclusão */}
      <AlertDialog open={deletandoId !== null} onOpenChange={() => setDeletandoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O modelo será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletandoId && deleteMutation.mutate({ id: deletandoId })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
