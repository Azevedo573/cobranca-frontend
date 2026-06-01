import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminCondominioSelector } from "@/components/AdminCondominioSelector";
import { useAdminCondominio } from "@/hooks/useAdminCondominio";
import { toast } from "sonner";
import {
  Phone, MessageSquare, Mail, User, AlertTriangle, Clock,
  CheckCircle2, XCircle, ChevronRight, PhoneOff, HandshakeIcon,
  TrendingUp, Target, RefreshCw, Calendar, DollarSign, Building2
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

function getPrioridadeBadge(score: number | null) {
  const s = score ?? 0;
  if (s >= 80) return <Badge className="bg-red-600 text-white text-xs">URGENTE</Badge>;
  if (s >= 60) return <Badge className="bg-orange-500 text-white text-xs">ALTA</Badge>;
  if (s >= 40) return <Badge className="bg-yellow-500 text-white text-xs">MÉDIA</Badge>;
  return <Badge className="bg-gray-400 text-white text-xs">BAIXA</Badge>;
}

export default function CobrancaAtiva() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { condominioId, condominios, isAdmin: isAdminHook, setSelectedCondominioId } = useAdminCondominio();
  const setCondominioId = setSelectedCondominioId ?? (() => {});

  const [devedorSelecionadoId, setDevedorSelecionadoId] = useState<number | null>(null);
  const [contactType, setContactType] = useState<string>("telefone");
  const [result, setResult] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [cobrancaIdSelecionada, setCobrancaIdSelecionada] = useState<number | null>(null);
  const [atendimentosHoje, setAtendimentosHoje] = useState(0);

  const condIdQuery = isAdmin ? (condominioId ?? undefined) : undefined;

  const { data: fila, isLoading: loadingFila, refetch: refetchFila } = trpc.operacoes.filaAtiva.useQuery(
    { condominioId: condIdQuery ?? null, limite: 50 },
    { enabled: !isAdmin || !!condominioId }
  );

  const { data: devedorDetalhes, isLoading: loadingDetalhes } = trpc.operacoes.devedorParaAtendimento.useQuery(
    { devedorId: devedorSelecionadoId! },
    { enabled: !!devedorSelecionadoId }
  );

  const registrarMutation = trpc.operacoes.registrarAcaoAtiva.useMutation({
    onSuccess: () => {
      toast.success("Atendimento registrado com sucesso!");
      setAtendimentosHoje(a => a + 1);
      setResult("");
      setNotes("");
      setCobrancaIdSelecionada(null);
      refetchFila();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const utils = trpc.useUtils();

  const handleRegistrar = () => {
    if (!devedorSelecionadoId || !result || !cobrancaIdSelecionada) {
      toast.error("Selecione a cobrança, o canal e o resultado antes de registrar.");
      return;
    }
    registrarMutation.mutate({
      devedorId: devedorSelecionadoId,
      cobrancaId: cobrancaIdSelecionada,
      contactType: contactType as any,
      result: result as any,
      notes: notes || undefined,
    });
  };

  const devedorAtual = useMemo(
    () => fila?.find(d => d.id === devedorSelecionadoId),
    [fila, devedorSelecionadoId]
  );

  if (isAdmin && !condominioId) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Target className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Cobrança Ativa</h1>
            <p className="text-muted-foreground text-sm">Fila priorizada de atendimento</p>
          </div>
        </div>
        <AdminCondominioSelector
          condominios={condominios ?? []}
          selectedId={condominioId}
          onSelect={setCondominioId}
        />
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Selecione um condomínio para ver a fila de cobrança.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Target className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Cobrança Ativa</h1>
            <p className="text-muted-foreground text-sm">Fila priorizada de atendimento</p>
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
          <Button variant="outline" size="sm" onClick={() => refetchFila()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Layout dividido: fila à esquerda, painel à direita */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 min-h-0">
        {/* Fila de devedores */}
        <div className="lg:col-span-2 flex flex-col gap-2 overflow-y-auto pr-1">
          {loadingFila ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : !fila || fila.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500 opacity-60" />
                <p className="font-medium">Fila vazia!</p>
                <p className="text-sm">Nenhum devedor pendente de contato.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-xs text-muted-foreground px-1">
                {fila.length} devedor{fila.length !== 1 ? "es" : ""} na fila · ordenado por prioridade
              </p>
              {fila.map((devedor, idx) => (
                <button
                  key={devedor.id}
                  onClick={() => {
                    setDevedorSelecionadoId(devedor.id);
                    setCobrancaIdSelecionada(null);
                    setResult("");
                    setNotes("");
                  }}
                  className={`w-full text-left rounded-lg border p-3 transition-all hover:shadow-md ${
                    devedorSelecionadoId === devedor.id
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {devedor.name || `Unid. ${devedor.unitNumber}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {devedor.bloco ? `Bloco ${devedor.bloco} · ` : ""}Unid. {devedor.unitNumber}
                        </p>
                      </div>
                    </div>
                    {getPrioridadeBadge(devedor.score)}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-red-600 font-semibold">
                      {formatCurrency(devedor.valorTotalDevido)}
                    </span>
                    <span className="text-muted-foreground">
                      {devedor.diasMaxAtraso}d atraso · {devedor.totalTentativas} tentativa{devedor.totalTentativas !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {devedor.ultimaTentativa && (
                    <p className="mt-1 text-xs text-muted-foreground truncate">
                      Último contato: {new Date((devedor.ultimaTentativa as any).attemptDate).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Painel de atendimento */}
        <div className="lg:col-span-3 flex flex-col gap-3 overflow-y-auto h-full">
          {!devedorSelecionadoId ? (
            <Card className="border-dashed h-full">
              <CardContent className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground">
                <Target className="h-14 w-14 mb-4 opacity-20" />
                <p className="font-medium text-lg">Selecione um devedor</p>
                <p className="text-sm">Clique em um devedor na fila ao lado para iniciar o atendimento.</p>
              </CardContent>
            </Card>
          ) : loadingDetalhes ? (
            <div className="space-y-3">
              <div className="h-32 bg-muted animate-pulse rounded-lg" />
              <div className="h-48 bg-muted animate-pulse rounded-lg" />
            </div>
          ) : devedorDetalhes ? (
            <>
              {/* Card do devedor */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />
                        {devedorDetalhes.devedor.name || `Unidade ${devedorDetalhes.devedor.unitNumber}`}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        <Building2 className="h-3.5 w-3.5 inline mr-1" />
                        {devedorDetalhes.condominio?.name} ·{" "}
                        {devedorDetalhes.devedor.bloco ? `Bloco ${devedorDetalhes.devedor.bloco} · ` : ""}
                        Unid. {devedorDetalhes.devedor.unitNumber}
                      </p>
                    </div>
                    {getPrioridadeBadge(devedorDetalhes.devedor.score)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div className="bg-red-50 dark:bg-red-950 rounded-lg p-2.5 text-center">
                      <DollarSign className="h-4 w-4 mx-auto text-red-600 mb-1" />
                      <p className="text-xs text-muted-foreground">Total Devido</p>
                      <p className="font-bold text-red-600 text-sm">{formatCurrency(devedorDetalhes.valorTotalDevido)}</p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-950 rounded-lg p-2.5 text-center">
                      <Clock className="h-4 w-4 mx-auto text-orange-600 mb-1" />
                      <p className="text-xs text-muted-foreground">Dias Atraso</p>
                      <p className="font-bold text-orange-600 text-sm">{devedorDetalhes.diasMaxAtraso}d</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-2.5 text-center">
                      <Phone className="h-4 w-4 mx-auto text-blue-600 mb-1" />
                      <p className="text-xs text-muted-foreground">Tentativas</p>
                      <p className="font-bold text-blue-600 text-sm">{devedorDetalhes.tentativas.length}</p>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-950 rounded-lg p-2.5 text-center">
                      <AlertTriangle className="h-4 w-4 mx-auto text-purple-600 mb-1" />
                      <p className="text-xs text-muted-foreground">Cobranças</p>
                      <p className="font-bold text-purple-600 text-sm">{devedorDetalhes.cobrancasPendentes.length}</p>
                    </div>
                  </div>

                  {/* Contatos */}
                  <div className="flex gap-3 flex-wrap">
                    {devedorDetalhes.devedor.phone && (
                      <a href={`tel:${devedorDetalhes.devedor.phone}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                        <Phone className="h-3.5 w-3.5" />
                        {devedorDetalhes.devedor.phone}
                      </a>
                    )}
                    {devedorDetalhes.devedor.phone && (
                      <a
                        href={`https://wa.me/55${devedorDetalhes.devedor.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-green-600 hover:underline"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        WhatsApp
                      </a>
                    )}
                    {devedorDetalhes.devedor.email && (
                      <a href={`mailto:${devedorDetalhes.devedor.email}`} className="flex items-center gap-1.5 text-sm text-gray-600 hover:underline">
                        <Mail className="h-3.5 w-3.5" />
                        {devedorDetalhes.devedor.email}
                      </a>
                    )}
                    <Link href={`/devedores/${devedorDetalhes.devedor.id}/detalhes`} className="flex items-center gap-1.5 text-sm text-primary hover:underline ml-auto">
                      Ver perfil completo →
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Cobranças pendentes */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Cobranças Pendentes — Selecione a que será tratada
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {devedorDetalhes.cobrancasPendentes.map((cob) => (
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
                            Venc: {cob.dueDate ? new Date(cob.dueDate).toLocaleDateString("pt-BR") : "—"} ·{" "}
                            <span className="text-orange-600">{(cob as any).diasAtraso}d em atraso</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600 text-sm">{formatCurrency((cob as any).valorAtualizado || cob.amount)}</p>
                          <p className="text-xs text-muted-foreground">Original: {formatCurrency(cob.amount)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>

              {/* Formulário de registro */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Registrar Atendimento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Canal de contato */}
                  <div>
                    <p className="text-xs font-medium mb-1.5 text-muted-foreground">Canal utilizado</p>
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
                    <p className="text-xs font-medium mb-1.5 text-muted-foreground">Observações (opcional)</p>
                    <Textarea
                      placeholder="Ex: Devedor disse que vai pagar na sexta-feira..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                  </div>

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
                    Registrar e Avançar Fila
                  </Button>
                </CardContent>
              </Card>

              {/* Histórico recente */}
              {devedorDetalhes.tentativas.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Histórico de Contatos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {devedorDetalhes.tentativas.slice(0, 5).map((t: any) => (
                      <div key={t.id} className="flex items-start gap-2 text-sm border-b last:border-0 pb-2 last:pb-0">
                        <div className="mt-0.5">
                          {t.contactType === "telefone" && <Phone className="h-3.5 w-3.5 text-blue-500" />}
                          {t.contactType === "whatsapp" && <MessageSquare className="h-3.5 w-3.5 text-green-500" />}
                          {t.contactType === "email" && <Mail className="h-3.5 w-3.5 text-gray-500" />}
                          {t.contactType === "pessoal" && <User className="h-3.5 w-3.5 text-purple-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">
                            {new Date(t.attemptDate).toLocaleDateString("pt-BR")} ·{" "}
                            <span className={
                              t.result === "promessa_pagamento" ? "text-green-600" :
                              t.result === "recusa" ? "text-red-600" :
                              t.result === "deseja_acordo" ? "text-blue-600" :
                              "text-gray-500"
                            }>
                              {RESULTS.find(r => r.value === t.result)?.label || t.result}
                            </span>
                          </p>
                          {t.notes && <p className="text-xs text-muted-foreground truncate">{t.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
