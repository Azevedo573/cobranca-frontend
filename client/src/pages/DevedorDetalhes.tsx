import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, User, Phone, Mail, Home, DollarSign, FileText, Plus, Calendar } from "lucide-react";
import { Link, useRoute } from "wouter";
import { format } from "date-fns";

export default function DevedorDetalhes() {
  const { user, logout } = useAuth();
  const [, params] = useRoute("/devedores/:id/detalhes");
  const devedorId = params?.id ? parseInt(params.id) : null;

  const { data: devedor, isLoading } = trpc.devedores.getById.useQuery(
    { id: devedorId! },
    { enabled: !!devedorId }
  );

  const { data: tentativas } = trpc.tentativas.getByDevedor.useQuery(
    { devedorId: devedorId! },
    { enabled: !!devedorId }
  );

  const { data: cobrancas } = trpc.cobrancas.getByDevedor.useQuery(
    { devedorId: devedorId! },
    { enabled: !!devedorId }
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
      ativo: { variant: "default", label: "Ativo" },
      acordo: { variant: "secondary", label: "Acordo" },
      pago: { variant: "outline", label: "Pago" },
    };
    const config = variants[status] || { variant: "outline" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTipoContatoBadge = (tipo: string) => {
    const icons: Record<string, React.ReactNode> = {
      telefone: <Phone className="h-3 w-3" />,
      email: <Mail className="h-3 w-3" />,
      whatsapp: <Phone className="h-3 w-3" />,
      pessoal: <User className="h-3 w-3" />,
    };
    return (
      <Badge variant="outline" className="gap-1">
        {icons[tipo]}
        {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
      </Badge>
    );
  };

  const getResultadoBadge = (resultado: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      sucesso: "default",
      sem_resposta: "secondary",
      recusado: "destructive",
    };
    return <Badge variant={variants[resultado] || "outline"}>{resultado.replace("_", " ")}</Badge>;
  };

  const getDashboardUrl = () => {
    if (user?.role === "admin") return "/admin/dashboard";
    if (user?.role === "sindico") return "/sindico/dashboard";
    return "/cobrador/dashboard";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!devedor) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Devedor não encontrado</p>
          <Link href="/devedores">
            <Button className="mt-4">Voltar</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/devedores">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-primary">Detalhes do Devedor</h1>
                <p className="text-sm text-muted-foreground">{devedor.name}</p>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Informações do Devedor */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Informações Pessoais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Nome</p>
                  <p className="font-medium">{devedor.name}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Unidade</p>
                  <p className="font-medium flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    {devedor.unitNumber}
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Telefone</p>
                  <p className="font-medium flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {devedor.phone || "-"}
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">E-mail</p>
                  <p className="font-medium flex items-center gap-2 text-sm break-all">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    {devedor.email || "-"}
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="mt-1">{getStatusBadge(devedor.status)}</div>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Valor Devido</p>
                  <p className="text-2xl font-bold text-destructive flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    R$ {(devedor.totalDue / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                {(user?.role === "admin" || user?.role === "sindico") && (
                  <>
                    <Separator />
                    <Link href={`/devedores/${devedor.id}`}>
                      <Button className="w-full" variant="outline">
                        Editar Devedor
                      </Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Histórico e Ações */}
          <div className="lg:col-span-2 space-y-6">
            {/* Cobranças */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Cobranças
                    </CardTitle>
                    <CardDescription>
                      Total: {cobrancas?.length || 0} cobrança(s)
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {cobrancas && cobrancas.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cobrancas.map((cob: any) => (
                        <TableRow key={cob.id}>
                          <TableCell>{cob.description || "-"}</TableCell>
                          <TableCell>
                            {cob.dueDate ? format(new Date(cob.dueDate), "dd/MM/yyyy") : "-"}
                          </TableCell>
                          <TableCell className="font-semibold">
                            R$ {(cob.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={cob.status === "pago" ? "outline" : "default"}>
                              {cob.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8">Nenhuma cobrança registrada</p>
                )}
              </CardContent>
            </Card>

            {/* Tentativas de Cobrança */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Histórico de Tentativas
                    </CardTitle>
                    <CardDescription>
                      Total: {tentativas?.length || 0} tentativa(s)
                    </CardDescription>
                  </div>
                  <Link href={`/devedores/${devedor.id}/tentativa/nova`}>
                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                      <Plus className="mr-2 h-4 w-4" />
                      Nova Tentativa
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {tentativas && tentativas.length > 0 ? (
                  <div className="space-y-4">
                    {tentativas.map((tent: any) => (
                      <div key={tent.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getTipoContatoBadge(tent.contactType)}
                            {getResultadoBadge(tent.result)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(tent.attemptDate), "dd/MM/yyyy HH:mm")}
                          </p>
                        </div>
                        {tent.notes && (
                          <p className="text-sm text-muted-foreground">{tent.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-4">Nenhuma tentativa registrada</p>
                    <Link href={`/devedores/${devedor.id}/tentativa/nova`}>
                      <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                        <Plus className="mr-2 h-4 w-4" />
                        Registrar Primeira Tentativa
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
