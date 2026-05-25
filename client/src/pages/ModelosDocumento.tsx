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
  proposta_acordo: { label: "Proposta de Acordo", icon: <Handshake className="h-3.5 w-3.5" />, color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  termo_acordo: { label: "Termo de Acordo", icon: <FileCheck className="h-3.5 w-3.5" />, color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  notificacao_debito: { label: "Notificação de Débito", icon: <FileWarning className="h-3.5 w-3.5" />, color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  carta_cobranca: { label: "Carta de Cobrança", icon: <Mail className="h-3.5 w-3.5" />, color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  recibo_pagamento: { label: "Recibo de Pagamento", icon: <Receipt className="h-3.5 w-3.5" />, color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  contrato_parcelamento: { label: "Contrato de Parcelamento", icon: <ScrollText className="h-3.5 w-3.5" />, color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300" },
  outro: { label: "Outro", icon: <FileText className="h-3.5 w-3.5" />, color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" },
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
      <div className="p-4 sm:p-6 space-y-5">
        {/* Cabeçalho */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 truncate">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
              <span className="truncate">Modelos de Documentos</span>
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-1 leading-relaxed">
              Crie e gerencie modelos reutilizáveis com variáveis dinâmicas para geração automática de PDFs.
            </p>
          </div>
          {podeEditar && (
            <Link href="/modelos-documento/novo" className="shrink-0">
              <Button className="gap-2 w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                Novo Modelo
              </Button>
            </Link>
          )}
        </div>

        {/* Lista de modelos */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
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
          <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center px-4">
            <FileText className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-muted-foreground">Nenhum modelo cadastrado</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-sm">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {modelos.map((modelo) => {
              const tipoInfo = TIPO_LABELS[modelo.tipo] ?? TIPO_LABELS.outro;
              return (
                <Card key={modelo.id} className="hover:shadow-md transition-shadow group flex flex-col">
                  <CardHeader className="pb-2 flex-shrink-0">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm sm:text-base font-semibold leading-tight line-clamp-2 min-w-0 flex-1">
                        {modelo.nome}
                      </CardTitle>
                      {podeEditar && (
                        <div className="flex gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
                    <Badge className={`w-fit text-xs gap-1 ${tipoInfo.color} border-0 mt-1`}>
                      {tipoInfo.icon}
                      <span className="truncate max-w-[160px]">{tipoInfo.label}</span>
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2 flex-1 flex flex-col justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {modelo.logoUrl && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                          Logo
                        </span>
                      )}
                      {modelo.marcaDaguaUrl && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                          Marca d'água
                        </span>
                      )}
                      {!modelo.logoUrl && !modelo.marcaDaguaUrl && (
                        <span className="italic text-muted-foreground/60">Sem logo ou marca d'água</span>
                      )}
                    </div>
                    <div className="space-y-2 mt-auto pt-2">
                      <p className="text-xs text-muted-foreground">
                        Atualizado em {new Date(modelo.updatedAt).toLocaleDateString("pt-BR")}
                      </p>
                      <Link href={`/modelos-documento/${modelo.id}/editar`}>
                        <Button variant="outline" size="sm" className="w-full gap-2">
                          <Pencil className="h-3.5 w-3.5" />
                          Editar Modelo
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Diálogo de confirmação de exclusão */}
      <AlertDialog open={deletandoId !== null} onOpenChange={() => setDeletandoId(null)}>
        <AlertDialogContent className="max-w-sm mx-4 sm:mx-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O modelo será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto"
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
