import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

export default function TentativaForm() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/devedores/:devedorId/tentativa/nova");
  const devedorId = params?.devedorId ? parseInt(params.devedorId) : null;

  const [formData, setFormData] = useState({
    cobrancaId: "",
    contactType: "",
    attemptDate: new Date().toISOString().slice(0, 16),
    result: "",
    notes: "",
  });

  const { data: devedor } = trpc.devedores.getById.useQuery(
    { id: devedorId! },
    { enabled: !!devedorId }
  );

  const { data: cobrancas } = trpc.cobrancas.getByDevedor.useQuery(
    { devedorId: devedorId! },
    { enabled: !!devedorId }
  );

  const utils = trpc.useUtils();

  const createMutation = trpc.tentativas.create.useMutation({
    onSuccess: () => {
      toast.success("Tentativa registrada com sucesso!");
      utils.tentativas.getByDevedor.invalidate();
      navigate(`/devedores/${devedorId}/detalhes`);
    },
    onError: (error) => {
      toast.error(`Erro ao registrar tentativa: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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
      devedorId: devedorId!,
      condominioId: devedor!.condominioId,
      contactType: formData.contactType as "telefone" | "email" | "pessoal" | "whatsapp",
      result: formData.result as "sem_resposta" | "promessa_pagamento" | "recusa" | "outro",
      notes: formData.notes || undefined,
    });
  };

  const getDashboardUrl = () => {
    if (user?.role === "admin") return "/admin/dashboard";
    if (user?.role === "sindico") return "/sindico/dashboard";
    return "/cobrador/dashboard";
  };

  if (!devedor) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
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
              <Button variant="ghost" size="icon" onClick={() => navigate(`/devedores/${devedorId}/detalhes`)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-primary">Registrar Tentativa</h1>
                <p className="text-sm text-muted-foreground">{devedor.name} - Unidade {devedor.unitNumber}</p>
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
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Dados da Tentativa de Cobrança</CardTitle>
              <CardDescription>Registre o contato realizado com o devedor</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Cobrança */}
              <div className="space-y-2">
                <Label htmlFor="cobrancaId">Cobrança Relacionada *</Label>
                <Select
                  value={formData.cobrancaId}
                  onValueChange={(value) => setFormData({ ...formData, cobrancaId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a cobrança" />
                  </SelectTrigger>
                  <SelectContent>
                    {cobrancas?.map((cob: any) => (
                      <SelectItem key={cob.id} value={cob.id.toString()}>
                        {cob.description || `Cobrança #${cob.id}`} - R$ {(cob.amount / 100).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo de Contato e Data */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactType">Tipo de Contato *</Label>
                  <Select
                    value={formData.contactType}
                    onValueChange={(value) => setFormData({ ...formData, contactType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="telefone">Telefone</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="pessoal">Pessoal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="attemptDate">Data e Hora do Contato *</Label>
                  <Input
                    id="attemptDate"
                    name="attemptDate"
                    type="datetime-local"
                    value={formData.attemptDate}
                    onChange={(e) => setFormData({ ...formData, attemptDate: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Resultado */}
              <div className="space-y-2">
                <Label htmlFor="result">Resultado *</Label>
                <Select
                  value={formData.result}
                  onValueChange={(value) => setFormData({ ...formData, result: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o resultado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem_resposta">Sem Resposta</SelectItem>
                    <SelectItem value="promessa_pagamento">Promessa de Pagamento</SelectItem>
                    <SelectItem value="recusa">Recusa</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Descreva detalhes da conversa, acordos verbais, próximos passos..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={5}
                />
              </div>

              {/* Botões */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`/devedores/${devedorId}/detalhes`)}
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
                      Salvar Tentativa
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </main>
    </div>
  );
}
