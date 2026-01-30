import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HandshakeIcon, Search, Eye, Calendar, DollarSign, User, Building2 } from "lucide-react";

export default function Acordos() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCondominio, setSelectedCondominio] = useState<number | null>(null);

  // Buscar condomínios para o filtro
  const { data: condominios } = trpc.condominios.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  // Determinar condominioId baseado no role
  const condominioId = user?.role === "admin" 
    ? (selectedCondominio || condominios?.[0]?.id || 0)
    : (user?.condominioId || 0);

  // Buscar acordos
  const { data: acordos, isLoading } = trpc.acordos.list.useQuery(
    { condominioId },
    { enabled: !!condominioId }
  );

  // Filtrar acordos pelo termo de busca
  const filteredAcordos = acordos?.filter((acordo) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      acordo.devedorName?.toLowerCase().includes(searchLower) ||
      acordo.notes?.toLowerCase().includes(searchLower)
    );
  }) || [];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      ativo: "default",
      pago: "secondary",
      cancelado: "destructive",
    };
    return (
      <Badge variant={variants[status] || "outline"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando acordos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <HandshakeIcon className="h-8 w-8 text-primary" />
              Acordos
            </h1>
            <p className="text-muted-foreground mt-1">
              Gestão de acordos e parcelamentos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {user?.name}
            </span>
            <Badge variant="outline" className="capitalize">
              {user?.role}
            </Badge>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Filtro de Condomínio (apenas para admin) */}
              {user?.role === "admin" && condominios && (
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Condomínio
                  </label>
                  <select
                    className="w-full border border-input rounded-md px-3 py-2 bg-background"
                    value={selectedCondominio || ""}
                    onChange={(e) =>
                      setSelectedCondominio(Number(e.target.value) || null)
                    }
                  >
                    {condominios.map((cond) => (
                      <option key={cond.id} value={cond.id}>
                        {cond.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Busca */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Buscar
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por devedor ou observações..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total de Acordos</CardDescription>
              <CardTitle className="text-3xl">
                {filteredAcordos.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Acordos Ativos</CardDescription>
              <CardTitle className="text-3xl text-green-600">
                {filteredAcordos.filter((a) => a.status === "ativo").length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Acordos Pagos</CardDescription>
              <CardTitle className="text-3xl text-blue-600">
                {filteredAcordos.filter((a) => a.status === "pago").length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Lista de Acordos */}
        <Card>
          <CardHeader>
            <CardTitle>
              Lista de Acordos
              <span className="text-sm font-normal text-muted-foreground ml-2">
                Total: {filteredAcordos.length} acordo(s)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredAcordos.length === 0 ? (
              <div className="text-center py-12">
                <HandshakeIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  Nenhum acordo encontrado
                </h3>
                <p className="text-muted-foreground">
                  Os acordos criados aparecerão aqui
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAcordos.map((acordo) => (
                  <Card key={acordo.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-3 flex-1">
                          {/* Cabeçalho */}
                          <div className="flex items-center gap-3">
                            <User className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <h3 className="font-semibold text-lg">
                                {acordo.devedorName}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Acordo #{acordo.id}
                              </p>
                            </div>
                            <div className="ml-auto">
                              {getStatusBadge(acordo.status)}
                            </div>
                          </div>

                          {/* Detalhes */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-muted-foreground">Valor Total</p>
                                <p className="font-medium">
                                  {formatCurrency(acordo.totalAmount)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-green-600" />
                              <div>
                                <p className="text-muted-foreground">Valor Acordado</p>
                                <p className="font-medium text-green-600">
                                  {formatCurrency(acordo.agreedAmount)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-muted-foreground">Parcelas</p>
                                <p className="font-medium">
                                  {acordo.installments}x
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-muted-foreground">Primeiro Pagamento</p>
                                <p className="font-medium">
                                  {formatDate(acordo.firstPaymentDate)}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Observações */}
                          {acordo.notes && (
                            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                              {acordo.notes}
                            </div>
                          )}
                        </div>

                        {/* Ações */}
                        <div className="ml-4">
                          <Link href={`/acordos/${acordo.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Detalhes
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
