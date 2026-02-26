import { useAuth } from "@/_core/hooks/useAuth";
import { getDevedorIdentificador } from "@/lib/devedorUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Save, Phone, Search } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function TentativaRapida() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDevedor, setSelectedDevedor] = useState<any>(null);
  const [formData, setFormData] = useState({
    cobrancaId: "",
    contactType: "",
    result: "",
    notes: "",
  });

  // Carregar devedores do condomínio
  const { data: devedores } = trpc.devedores.list.useQuery(
    { condominioId: user?.condominioId! },
    { enabled: !!user?.condominioId }
  );

  // Carregar cobranças do devedor selecionado
  const { data: cobrancas } = trpc.cobrancas.getByDevedor.useQuery(
    { devedorId: selectedDevedor?.id! },
    { enabled: !!selectedDevedor }
  );

  const utils = trpc.useUtils();

  const createMutation = trpc.tentativas.create.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Tentativa registrada com sucesso!");
      utils.tentativas.list.invalidate();
      
      // Se resultado for "deseja_acordo", redirecionar para detalhes do processo
      if ((variables.result as string) === "deseja_acordo" && variables.cobrancaId) {
        navigate(`/processos/${variables.cobrancaId}`);
        return;
      }
      
      // Limpar formulário
      setSelectedDevedor(null);
      setSearchTerm("");
      setFormData({
        cobrancaId: "",
        contactType: "",
        result: "",
        notes: "",
      });
    },
    onError: (error) => {
      toast.error(`Erro ao registrar tentativa: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDevedor) {
      toast.error("Selecione um devedor");
      return;
    }

    if (!formData.cobrancaId) {
      toast.error("Selecione uma cobrança");
      return;
    }

    if (!formData.contactType) {
      toast.error("Selecione o tipo de contato");
      return;
    }

    if (!formData.result) {
      toast.error("Selecione o resultado");
      return;
    }

    createMutation.mutate({
      cobrancaId: parseInt(formData.cobrancaId),
      devedorId: selectedDevedor.id,
      condominioId: user?.condominioId!,
      contactType: formData.contactType as "telefone" | "email" | "pessoal" | "whatsapp",
      result: formData.result as "sem_resposta" | "promessa_pagamento" | "recusa" | "outro" | "deseja_acordo",
      notes: formData.notes || undefined,
    });
  };

  const getDashboardUrl = () => {
    if (user?.role === "admin") return "/admin/dashboard";
    if (user?.role === "sindico") return "/sindico/dashboard";
    return "/cobrador/dashboard";
  };

  // Filtrar devedores por busca
  const devedoresFiltrados = devedores?.filter(d => 
    (d.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    d.unitNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.bloco?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(getDashboardUrl())}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-primary">Registro Rápido</h1>
                <p className="text-sm text-muted-foreground">Registrar tentativa de cobrança</p>
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
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Seleção de Devedor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Selecionar Devedor
              </CardTitle>
              <CardDescription>Busque pelo nome ou unidade</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search">Buscar</Label>
                <Input
                  id="search"
                  placeholder="Nome ou unidade..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {devedoresFiltrados.length > 0 ? (
                  devedoresFiltrados.map((dev) => (
                    <button
                      key={dev.id}
                      type="button"
                      onClick={() => {
                        setSelectedDevedor(dev);
                        setFormData({ ...formData, cobrancaId: "" }); // Limpar cobrança ao trocar devedor
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedDevedor?.id === dev.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">{getDevedorIdentificador(dev)}</p>
                          <p className="text-xs text-muted-foreground">
                            Unidade {dev.unitNumber}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Deve: R$ {(dev.totalDue / 100).toFixed(2)}
                          </p>
                        </div>
                        <Badge variant="outline" className={
                          dev.status === "ativo" ? "bg-destructive/10 text-destructive" :
                          dev.status === "acordo" ? "bg-accent/10 text-accent" :
                          "bg-muted text-muted-foreground"
                        }>
                          {dev.status}
                        </Badge>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Search className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {searchTerm ? "Nenhum devedor encontrado" : "Digite para buscar"}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Formulário de Tentativa */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Dados da Tentativa
              </CardTitle>
              <CardDescription>
                {selectedDevedor ? `${selectedDevedor.name} - Unidade ${selectedDevedor.unitNumber}` : "Selecione um devedor"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedDevedor ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Cobrança */}
                  <div className="space-y-2">
                    <Label htmlFor="cobrancaId">Cobrança *</Label>
                    <Select
                      value={formData.cobrancaId}
                      onValueChange={(value) => setFormData({ ...formData, cobrancaId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {cobrancas && cobrancas.length > 0 ? (
                          cobrancas.map((cob: any) => (
                            <SelectItem key={cob.id} value={cob.id.toString()}>
                              {cob.description || `Cobrança #${cob.id}`} - R$ {(cob.amount / 100).toFixed(2)}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>Nenhuma cobrança encontrada</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tipo de Contato */}
                  <div className="space-y-2">
                    <Label htmlFor="contactType">Tipo de Contato *</Label>
                    <Select
                      value={formData.contactType}
                      onValueChange={(value) => setFormData({ ...formData, contactType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="telefone">📞 Telefone</SelectItem>
                        <SelectItem value="email">📧 E-mail</SelectItem>
                        <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                        <SelectItem value="pessoal">👤 Pessoal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Resultado */}
                  <div className="space-y-2">
                    <Label htmlFor="result">Resultado *</Label>
                    <Select
                      value={formData.result}
                      onValueChange={(value) => setFormData({ ...formData, result: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sem_resposta">❌ Sem Resposta</SelectItem>
                        <SelectItem value="promessa_pagamento">✅ Promessa de Pagamento</SelectItem>
                        <SelectItem value="recusa">🚫 Recusa</SelectItem>
                        <SelectItem value="deseja_acordo">🤝 Deseja Realizar Acordo</SelectItem>
                        <SelectItem value="outro">📝 Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Observações */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea
                      id="notes"
                      placeholder="Detalhes da conversa..."
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={4}
                    />
                  </div>

                  {/* Botões */}
                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate(getDashboardUrl())}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending}
                      className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
                    >
                      {createMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Salvar
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="text-center py-12">
                  <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Selecione um devedor ao lado para registrar a tentativa
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
