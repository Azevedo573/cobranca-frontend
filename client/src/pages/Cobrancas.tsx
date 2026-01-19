import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { FileText, Plus, Eye, ArrowLeft, Search } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { format } from "date-fns";

export default function Cobrancas() {
  const { user, logout } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: cobrancas, isLoading } = trpc.cobrancas.list.useQuery(
    { condominioId: user?.condominioId! },
    { enabled: !!user?.condominioId }
  );

  const { data: devedores } = trpc.devedores.list.useQuery(
    { condominioId: user?.condominioId! },
    { enabled: !!user?.condominioId }
  );

  const getDevedorName = (devedorId: number) => {
    const dev = devedores?.find(d => d.id === devedorId);
    return dev?.name || "Desconhecido";
  };

  const filteredCobrancas = cobrancas?.filter(cob => {
    const devedorName = getDevedorName(cob.devedorId);
    return (
      devedorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cob.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cob.monthReference?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      pendente: { variant: "destructive", label: "Pendente" },
      em_cobranca: { variant: "default", label: "Em Cobrança" },
      pago: { variant: "outline", label: "Pago" },
      acordo: { variant: "secondary", label: "Acordo" },
    };
    const config = variants[status] || { variant: "outline" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getDashboardUrl = () => {
    if (user?.role === "admin") return "/admin/dashboard";
    if (user?.role === "sindico") return "/sindico/dashboard";
    return "/cobrador/dashboard";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={getDashboardUrl()}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-primary">Cobranças</h1>
                <p className="text-sm text-muted-foreground">Gestão de cobranças extrajudiciais</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
              <Button variant="outline" onClick={() => logout()}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Lista de Cobranças
                </CardTitle>
                <CardDescription>
                  Total: {filteredCobrancas?.length || 0} cobrança(s)
                </CardDescription>
              </div>
              {(user?.role === "admin" || user?.role === "sindico") && (
                <Link href="/cobrancas/nova">
                  <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Cobrança
                  </Button>
                </Link>
              )}
            </div>
            <div className="mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por devedor, descrição ou mês..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Carregando...</p>
              </div>
            ) : filteredCobrancas && filteredCobrancas.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Devedor</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Mês Ref.</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCobrancas.map((cob) => (
                    <TableRow key={cob.id}>
                      <TableCell className="font-medium">{getDevedorName(cob.devedorId)}</TableCell>
                      <TableCell>{cob.description || "-"}</TableCell>
                      <TableCell>{cob.monthReference || "-"}</TableCell>
                      <TableCell>
                        {cob.dueDate ? format(new Date(cob.dueDate), "dd/MM/yyyy") : "-"}
                      </TableCell>
                      <TableCell className="font-semibold">
                        R$ {(cob.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>{getStatusBadge(cob.status)}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/cobrancas/${cob.id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchTerm ? "Nenhuma cobrança encontrada" : "Nenhuma cobrança cadastrada"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm
                    ? "Tente buscar com outros termos"
                    : "Comece cadastrando as cobranças dos devedores"}
                </p>
                {!searchTerm && (user?.role === "admin" || user?.role === "sindico") && (
                  <Link href="/cobrancas/nova">
                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                      <Plus className="mr-2 h-4 w-4" />
                      Cadastrar Primeira Cobrança
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
