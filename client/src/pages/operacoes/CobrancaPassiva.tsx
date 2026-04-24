import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminCondominioSelector } from "@/components/AdminCondominioSelector";
import { useAdminCondominio } from "@/hooks/useAdminCondominio";
import { toast } from "sonner";
import {
  Phone, MessageSquare, Mail, User, CheckCircle2, XCircle,
  Search, PhoneOff, HandshakeIcon, ChevronRight, RefreshCw,
  Inbox, DollarSign, Clock, Building2, ChevronDown, ChevronUp
} from "lucide-react";
import { Link } from "wouter";

const CONTACT_TYPES = [
  { value: "telefone", label: "Telefone", icon: Phone },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { value: "email", label: "E-mail", icon: Mail },
  { value: "pessoal", label: "Pessoal", icon: User },
];

const RESULTS = [
  { value: "sem_resposta", label: "Sem Resposta", icon: PhoneOff, color: "text-gray-500" },
  { value: "promessa_pagamento", label: "Prometeu Pagar", icon: CheckCircle2, color: "text-green-600" },
  { value: "deseja_acordo", label: "Quer Acordo", icon: HandshakeIcon, color: "text-blue-600" },
  { value: "recusa", label: "Recusou", icon: XCircle, color: "text-red-600" },
  { value: "outro", label: "Outro", icon: ChevronRight, color: "text-gray-600" },
];

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);
}

export default function CobrancaPassiva() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { condominioId, condominios, setSelectedCondominioId } = useAdminCondominio();
  const setCondominioId = setSelectedCondominioId ?? (() => {});

  const [termo, setTermo] = useState("");
  const [termoBusca, setTermoBusca] = useState("");
  const [devedorSelecionado, setDevedorSelecionado] = useState<any>(null);
  const [cobrancaIdSelecionada, setCobrancaIdSelecionada] = useState<number | null>(null);
  const [contactType, setContactType] = useState<string>("telefone");
  const [result, setResult] = useState<string>("");
  const [propostaDevedor, setPropostaDevedor] = useState("");
  const [notes, setNotes] = useState("");
  const [atendimentosHoje, setAtendimentosHoje] = useState(0);
  const [expandirCobrancas, setExpandirCobrancas] = useState(false);

  const condIdQuery = isAdmin ? (condominioId ?? undefined) : undefined;

  const { data: resultados, isLoading: buscando, refetch: buscar } = trpc.operacoes.buscarDevedorPassivo.useQuery(
    { termo: termoBusca, condominioId: condIdQuery ?? null },
    { enabled: termoBusca.length >= 2 }
  );

  const registrarMutation = trpc.operacoes.registrarContatoPassivo.useMutation({
    onSuccess: () => {
      toast.success("Contato passivo registrado com sucesso!");
      setAtendimentosHoje(a => a + 1);
      setResult("");
      setNotes("");
      setPropostaDevedor("");
      setCobrancaIdSelecionada(null);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const handleBuscar = () => {
    if (termo.trim().length < 2) {
      toast.error("Digite ao menos 2 caracteres para buscar.");
      return;
    }
    setTermoBusca(termo.trim());
    setDevedorSelecionado(null);
  };

  const handleRegistrar = () => {
    if (!devedorSelecionado || !result || !cobrancaIdSelecionada) {
      toast.error("Selecione o devedor, a cobrança, o canal e o resultado.");
      return;
    }
    registrarMutation.mutate({
      devedorId: devedorSelecionado.id,
      cobrancaId: cobrancaIdSelecionada,
      contactType: contactType as any,
      result: result as any,
      propostaDevedor: propostaDevedor || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Inbox className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Cobrança Passiva</h1>
            <p className="text-muted-foreground text-sm">Devedor entrou em contato — registre o atendimento</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <AdminCondominioSelector
              condominios={condominios ?? []}
              selectedId={condominioId}
              onSelect={setCondominioId}
            />
          )}
          <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg px-3 py-1.5">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              {atendimentosHoje} atendimento{atendimentosHoje !== 1 ? "s" : ""} hoje
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Busca de devedor */}
        <div className="lg:col-span-2 space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Search className="h-4 w-4" />
                Identificar Devedor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Busque por nome, CPF, unidade ou e-mail do devedor que entrou em contato.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Nome, CPF, unidade ou e-mail..."
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
                  className="text-sm"
                />
                <Button onClick={handleBuscar} disabled={buscando} size="sm" className="shrink-0">
                  {buscando ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {/* Resultados da busca */}
              {termoBusca && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {buscando ? (
                    <div className="space-y-2">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                      ))}
                    </div>
                  ) : !resultados || resultados.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhum devedor encontrado para "{termoBusca}".</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">{resultados.length} resultado{resultados.length !== 1 ? "s" : ""}</p>
                      {resultados.map((dev: any) => (
                        <button
                          key={dev.id}
                          onClick={() => {
                            setDevedorSelecionado(dev);
                            setCobrancaIdSelecionada(null);
                            setResult("");
                            setNotes("");
                            setPropostaDevedor("");
                          }}
                          className={`w-full text-left rounded-lg border p-3 transition-all ${
                            devedorSelecionado?.id === dev.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{dev.name || `Unid. ${dev.unitNumber}`}</p>
                              <p className="text-xs text-muted-foreground">
                                {dev.bloco ? `Bloco ${dev.bloco} · ` : ""}Unid. {dev.unitNumber}
                                {dev.cpf ? ` · CPF: ${dev.cpf}` : ""}
                              </p>
                            </div>
                            {dev.totalDevido > 0 && (
                              <span className="text-xs font-bold text-red-600 shrink-0">
                                {formatCurrency(dev.totalDevido)}
                              </span>
                            )}
                          </div>
                          {dev.condominio && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {dev.condominio}
                            </p>
                          )}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}

              {!termoBusca && (
                <div className="text-center py-8 text-muted-foreground">
                  <Inbox className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Digite para buscar o devedor que entrou em contato.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Painel de registro */}
        <div className="lg:col-span-3 space-y-3">
          {!devedorSelecionado ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Inbox className="h-14 w-14 mb-4 opacity-20" />
                <p className="font-medium text-lg">Aguardando identificação</p>
                <p className="text-sm text-center max-w-xs">
                  Busque e selecione o devedor ao lado para registrar o contato passivo.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Card do devedor selecionado */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold">{devedorSelecionado.name || `Unidade ${devedorSelecionado.unitNumber}`}</p>
                        <p className="text-sm text-muted-foreground">
                          {devedorSelecionado.bloco ? `Bloco ${devedorSelecionado.bloco} · ` : ""}
                          Unid. {devedorSelecionado.unitNumber}
                          {devedorSelecionado.cpf ? ` · ${devedorSelecionado.cpf}` : ""}
                        </p>
                        {devedorSelecionado.condominio && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Building2 className="h-3 w-3" />
                            {devedorSelecionado.condominio}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {devedorSelecionado.totalDevido > 0 && (
                        <p className="font-bold text-red-600">{formatCurrency(devedorSelecionado.totalDevido)}</p>
                      )}
                      <Link href={`/devedores/${devedorSelecionado.id}`} className="text-xs text-primary hover:underline">
                        Ver perfil →
                      </Link>
                    </div>
                  </div>

                  {/* Contatos rápidos */}
                  <div className="flex gap-3 flex-wrap mt-3 pt-3 border-t border-primary/20">
                    {devedorSelecionado.phone && (
                      <a href={`tel:${devedorSelecionado.phone}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
                        <Phone className="h-3 w-3" />
                        {devedorSelecionado.phone}
                      </a>
                    )}
                    {devedorSelecionado.phone && (
                      <a
                        href={`https://wa.me/55${devedorSelecionado.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-green-600 hover:underline"
                      >
                        <MessageSquare className="h-3 w-3" />
                        WhatsApp
                      </a>
                    )}
                    {devedorSelecionado.email && (
                      <a href={`mailto:${devedorSelecionado.email}`} className="flex items-center gap-1.5 text-xs text-gray-600 hover:underline">
                        <Mail className="h-3 w-3" />
                        {devedorSelecionado.email}
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Cobranças pendentes */}
              {devedorSelecionado.cobrancasPendentes && devedorSelecionado.cobrancasPendentes.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <button
                      className="flex items-center justify-between w-full"
                      onClick={() => setExpandirCobrancas(!expandirCobrancas)}
                    >
                      <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Cobranças Pendentes ({devedorSelecionado.cobrancasPendentes.length})
                        {cobrancaIdSelecionada && <Badge className="ml-2 bg-primary text-primary-foreground text-xs">1 selecionada</Badge>}
                      </CardTitle>
                      {expandirCobrancas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </CardHeader>
                  {expandirCobrancas && (
                    <CardContent className="space-y-2">
                      {devedorSelecionado.cobrancasPendentes.map((cob: any) => (
                        <button
                          key={cob.id}
                          onClick={() => setCobrancaIdSelecionada(cob.id)}
                          className={`w-full text-left rounded-lg border p-3 transition-all ${
                            cobrancaIdSelecionada === cob.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">{cob.description || cob.monthReference || `Cobrança #${cob.id}`}</p>
                              <p className="text-xs text-muted-foreground">
                                Venc: {cob.dueDate ? new Date(cob.dueDate).toLocaleDateString("pt-BR") : "—"}
                              </p>
                            </div>
                            <p className="font-bold text-red-600 text-sm">{formatCurrency(cob.amount)}</p>
                          </div>
                        </button>
                      ))}
                    </CardContent>
                  )}
                  {!expandirCobrancas && !cobrancaIdSelecionada && (
                    <CardContent className="pt-0 pb-3">
                      <button
                        onClick={() => setExpandirCobrancas(true)}
                        className="text-xs text-primary hover:underline"
                      >
                        Clique para selecionar uma cobrança →
                      </button>
                    </CardContent>
                  )}
                </Card>
              )}

              {/* Formulário de registro */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Registrar Contato Passivo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Canal */}
                  <div>
                    <p className="text-xs font-medium mb-1.5 text-muted-foreground">Como o devedor entrou em contato?</p>
                    <div className="flex gap-2 flex-wrap">
                      {CONTACT_TYPES.map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          onClick={() => setContactType(value)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                            contactType === value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Proposta do devedor */}
                  <div>
                    <p className="text-xs font-medium mb-1.5 text-muted-foreground">Proposta do devedor (opcional)</p>
                    <Input
                      placeholder="Ex: Quer pagar em 3x, propôs R$ 500 de entrada..."
                      value={propostaDevedor}
                      onChange={(e) => setPropostaDevedor(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Resultado */}
                  <div>
                    <p className="text-xs font-medium mb-1.5 text-muted-foreground">Resultado do contato</p>
                    <div className="flex gap-2 flex-wrap">
                      {RESULTS.map(({ value, label, icon: Icon, color }) => (
                        <button
                          key={value}
                          onClick={() => setResult(value)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                            result === value
                              ? "border-primary bg-primary text-primary-foreground"
                              : `border-border hover:border-primary/40 ${color}`
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Observações */}
                  <div>
                    <p className="text-xs font-medium mb-1.5 text-muted-foreground">Observações adicionais (opcional)</p>
                    <Textarea
                      placeholder="Detalhes do atendimento, combinados, próximos passos..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                  </div>

                  {!cobrancaIdSelecionada && devedorSelecionado.cobrancasPendentes?.length > 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      ⚠️ Expanda as cobranças acima e selecione qual será tratada neste atendimento.
                    </p>
                  )}

                  <Button
                    onClick={handleRegistrar}
                    disabled={!result || !cobrancaIdSelecionada || registrarMutation.isPending}
                    className="w-full"
                  >
                    {registrarMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Registrar Contato Passivo
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
