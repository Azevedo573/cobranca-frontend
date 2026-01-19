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
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function CobrancaForm() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const [formData, setFormData] = useState({
    devedorId: "",
    description: "",
    amount: "",
    dueDate: "",
    monthReference: "",
  });

  const { data: devedores } = trpc.devedores.list.useQuery(
    { condominioId: user?.condominioId! },
    { enabled: !!user?.condominioId }
  );

  const createMutation = trpc.cobrancas.create.useMutation({
    onSuccess: () => {
      toast.success("Cobrança cadastrada com sucesso!");
      setLocation("/cobrancas");
    },
    onError: (error) => {
      toast.error("Erro ao cadastrar: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.devedorId) {
      toast.error("Selecione um devedor");
      return;
    }

    if (!formData.amount) {
      toast.error("Valor é obrigatório");
      return;
    }

    const amountInCents = Math.round(parseFloat(formData.amount) * 100);

    createMutation.mutate({
      devedorId: parseInt(formData.devedorId),
      condominioId: user?.condominioId!,
      description: formData.description || undefined,
      amount: amountInCents,
      dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
      monthReference: formData.monthReference || undefined,
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setLocation("/cobrancas")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-primary">Nova Cobrança</h1>
                <p className="text-sm text-muted-foreground">Preencha os dados abaixo</p>
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
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Dados da Cobrança</CardTitle>
              <CardDescription>Informações da cobrança extrajudicial</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Devedor */}
              <div className="space-y-2">
                <Label htmlFor="devedorId">Devedor *</Label>
                <Select
                  value={formData.devedorId}
                  onValueChange={(value) => setFormData({ ...formData, devedorId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o devedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {devedores?.map((dev) => (
                      <SelectItem key={dev.id} value={dev.id.toString()}>
                        {dev.name} - Unidade {dev.unitNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Descrição */}
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Ex: Condomínio atrasado, taxa de manutenção..."
                  rows={3}
                />
              </div>

              {/* Valor e Mês */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor (R$) *</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={handleChange}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthReference">Mês de Referência</Label>
                  <Input
                    id="monthReference"
                    name="monthReference"
                    value={formData.monthReference}
                    onChange={handleChange}
                    placeholder="Ex: 01/2024"
                  />
                </div>
              </div>

              {/* Data de Vencimento */}
              <div className="space-y-2">
                <Label htmlFor="dueDate">Data de Vencimento</Label>
                <Input
                  id="dueDate"
                  name="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={handleChange}
                />
              </div>

              {/* Botões */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/cobrancas")}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
                  disabled={createMutation.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {createMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </main>
    </div>
  );
}
