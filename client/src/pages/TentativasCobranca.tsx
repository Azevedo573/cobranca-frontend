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
import { Phone, Plus, Search, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function TentativasCobranca() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCondominioId, setSelectedCondominioId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    devedorId: "",
    cobrancaId: "",
    contactType: "telefone" as "telefone" | "email" | "pessoal" | "whatsapp",
    result: "" as "sem_resposta" | "promessa_pagamento" | "recusa" | "outro" | "",
    notes: "",
  });
  
  // Para admin, usar condomínio selecionado; para síndico/cobrador, usar o próprio
  const condominioId = user?.role === "admin" ? selectedCondominioId : user?.condominioId;
  
  const { data: condominios } = trpc.condominios.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  
  const { data: tentativas, isLoading } = trpc.tentativas.list.useQuery(
    { condominioId: condominioId ?? 0 },
    { enabled: condominioId !== null && condominioId !== undefined }
  );

  const { data: estatisticas } = trpc.tentativas.getEstatisticas.useQuery(
    { condominioId: condominioId ?? 0 },
    { enabled: condominioId !== null && condominioId !== undefined }
  );

  const { data: devedores } = trpc.devedores.list.useQuery(
    { condominioId: condominioId ?? 0 },
    { enabled: condominioId !== null && condominioId !== undefined }
  );

  const { data: cobrancas } = trpc.cobrancas.list.useQuery(
    { condominioId: condominioId ?? 0 },
    { enabled: condominioId !== null && condominioId !== undefined }
  );

  const utils = trpc.useUtils();
  const createTentativa = trpc.tentativas.create.useMutation({
    onSuccess: () => {
      utils.tentativas.list.invalidate();
      utils.tentativas.getEstatisticas.invalidate();
      setFormData({
        devedorId: "",
        cobrancaId: "",
        contactType: "telefone",
        result: "",
        notes: "",
      });
      setShowForm(false);
      alert("Tentativa registrada com sucesso!");
    },
    onError: (error) => {
      alert(`Erro ao registrar tentativa: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.devedorId || !formData.cobrancaId || !condominioId) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }
    createTentativa.mutate({
      devedorId: Number(formData.devedorId),
      cobrancaId: Number(formData.cobrancaId),
      condominioId,
      contactType: formData.contactType,
      result: formData.result || undefined,
      notes: formData.notes || undefined,
    });
  };

  const filteredTentativas = tentativas?.filter(tent => {
    const devedorName = tent.devedorName || "";
    return (
      devedorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tent.notes?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const getContactTypeBadge = (type: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string; color: string }> = {
      telefone: { variant: "default", label: "Telefone", color: "bg-blue-500" },
      whatsapp: { variant: "secondary", label: "WhatsApp", color: "bg-green-500" },
      email: { variant: "outline", label: "E-mail", color: "bg-gray-500" },
      pessoal: { variant: "destructive", label: "Presencial", color: "bg-purple-500" },
    };
    const config = variants[type] || { variant: "outline" as const, label: type, color: "bg-gray-500" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return <Badge variant="outline">-</Badge>;
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      sem_resposta: { variant: "destructive", label: "Sem Resposta" },
      promessa_pagamento: { variant: "secondary", label: "Promessa de Pagamento" },
      recusa: { variant: "outline", label: "Recusa" },
      outro: { variant: "default", label: "Outro" },
    };
    const config = variants[result] || { variant: "outline" as const, label: result };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getDashboardUrl = () => {
    if (user?.role === "admin") return "/admin/dashboard";
    if (user?.role === "sindico") return "/sindico/dashboard";
    return "/cobrador/dashboard";
  };

  const taxaSucesso = estatisticas && estatisticas.total > 0
    ? ((Number(estatisticas.sucesso) / Number(estatisticas.total)) * 100).toFixed(1)
    : "0.0";

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
                <h1 className="text-2xl font-bold text-primary">Tentativas de Cobrança</h1>
                <p className="text-sm text-muted-foreground">Histórico de contatos realizados</p>
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
        {/* Estatísticas */}
        {estatisticas && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total de Tentativas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Number(estatisticas.total)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Sem Resposta</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{Number(estatisticas.semResposta)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Promessas de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-secondary">{Number(estatisticas.promessaPagamento)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Sucesso</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{taxaSucesso}%</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Formulário Inline */}
        {condominioId && (
          <Card className="mb-6" id="registro-rapido">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Registro Rápido
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowForm(!showForm)}
                >
                  {showForm ? (
                    <><ChevronUp className="h-4 w-4 mr-2" /> Ocultar</>
                  ) : (
                    <><ChevronDown className="h-4 w-4 mr-2" /> Expandir</>
                  )}
                </Button>
              </div>
            </CardHeader>
            {showForm && (
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="devedor">Devedor *</Label>
                      <select
                        id="devedor"
                        className="w-full px-3 py-2 border rounded-md mt-1"
                        value={formData.devedorId}
                        onChange={(e) => setFormData({ ...formData, devedorId: e.target.value })}
                        required
                      >
                        <option value="">Selecione um devedor</option>
                        {devedores?.map((dev) => (
                          <option key={dev.id} value={dev.id}>
                            {dev.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="cobranca">Cobrança/Processo *</Label>
                      <select
                        id="cobranca"
                        className="w-full px-3 py-2 border rounded-md mt-1"
                        value={formData.cobrancaId}
                        onChange={(e) => setFormData({ ...formData, cobrancaId: e.target.value })}
                        required
                      >
                        <option value="">Selecione uma cobrança</option>
                        {cobrancas?.map((cob) => (
                          <option key={cob.id} value={cob.id}>
                            {cob.description || `Ref: ${cob.monthReference}`} - R$ {cob.amount.toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="contactType">Tipo de Contato *</Label>
                      <select
                        id="contactType"
                        className="w-full px-3 py-2 border rounded-md mt-1"
                        value={formData.contactType}
                        onChange={(e) => setFormData({ ...formData, contactType: e.target.value as any })}
                        required
                      >
                        <option value="telefone">Telefone</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">E-mail</option>
                        <option value="pessoal">Presencial</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="result">Resultado</Label>
                      <select
                        id="result"
                        className="w-full px-3 py-2 border rounded-md mt-1"
                        value={formData.result}
                        onChange={(e) => setFormData({ ...formData, result: e.target.value as any })}
                      >
                        <option value="">Selecione um resultado</option>
                        <option value="sem_resposta">Sem Resposta</option>
                        <option value="promessa_pagamento">Promessa de Pagamento</option>
                        <option value="recusa">Recusa</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea
                      id="notes"
                      placeholder="Descreva o que foi conversado, próximos passos, etc..."
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowForm(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      className="bg-accent hover:bg-accent/90 text-accent-foreground"
                      disabled={createTentativa.isPending}
                    >
                      {createTentativa.isPending ? "Salvando..." : "Registrar Tentativa"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            )}
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Lista de Tentativas
                </CardTitle>
                <CardDescription>
                  Total: {filteredTentativas?.length || 0} tentativa(s)
                </CardDescription>
              </div>
              <Button 
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
                onClick={() => {
                  if (!condominioId) {
                    alert("Selecione um condomínio primeiro");
                    return;
                  }
                  setShowForm(true);
                  setTimeout(() => {
                    document.getElementById('registro-rapido')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova Tentativa
              </Button>
            </div>
            <div className="mt-4 space-y-4">
              {user?.role === "admin" && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Selecione o Condomínio</label>
                  <select
                    className="w-full md:w-64 px-3 py-2 border rounded-md"
                    value={selectedCondominioId || ""}
                    onChange={(e) => setSelectedCondominioId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Selecione um condomínio</option>
                    {condominios?.map((cond) => (
                      <option key={cond.id} value={cond.id}>
                        {cond.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por devedor ou observações..."
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
            ) : filteredTentativas && filteredTentativas.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Devedor</TableHead>
                    <TableHead>Tipo de Contato</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTentativas.map((tent) => (
                    <TableRow key={tent.id}>
                      <TableCell className="font-medium">
                        {format(new Date(tent.attemptDate), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell>{tent.devedorName || "Desconhecido"}</TableCell>
                      <TableCell>{getContactTypeBadge(tent.contactType)}</TableCell>
                      <TableCell>{getResultBadge(tent.result)}</TableCell>
                      <TableCell className="max-w-xs truncate">{tent.notes || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <Phone className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchTerm ? "Nenhuma tentativa encontrada" : "Nenhuma tentativa registrada"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm
                    ? "Tente buscar com outros termos"
                    : "Comece registrando as tentativas de cobrança"}
                </p>
                {!searchTerm && (
                  <Link href="/tentativas/nova">
                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                      <Plus className="mr-2 h-4 w-4" />
                      Registrar Primeira Tentativa
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
