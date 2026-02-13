import { useState, useMemo } from "react";
import { trpc } from "../lib/trpc";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Calendar, DollarSign, User, Home, Copy, Check } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Vencimentos() {
  const { user } = useAuth();
  const [selectedCondominio, setSelectedCondominio] = useState<number | undefined>(undefined);
  const [filtroDias, setFiltroDias] = useState<7 | 15 | 30>(7);
  const [copiado, setCopiado] = useState<number | null>(null);

  // Buscar condomínios (apenas para admin)
  const { data: condominios } = trpc.condominios.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  // Buscar vencimentos próximos
  const { data: vencimentos = [], isLoading } = trpc.acordos.getVencimentosProximos.useQuery({
    condominioId: selectedCondominio,
    dias: filtroDias,
  });

  // Calcular estatísticas
  const stats = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const vencendoHoje = vencimentos.filter(v => {
      const dataVenc = new Date(v.dataVencimento);
      dataVenc.setHours(0, 0, 0, 0);
      return dataVenc.getTime() === hoje.getTime();
    });
    
    const proximos7Dias = vencimentos.filter(v => {
      const dataVenc = new Date(v.dataVencimento);
      const diff = Math.ceil((dataVenc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 7;
    });
    
    const valorTotal = vencimentos.reduce((sum, v) => sum + Number(v.parcelaValor), 0);
    
    return {
      vencendoHoje: vencendoHoje.length,
      proximos7Dias: proximos7Dias.length,
      total: vencimentos.length,
      valorTotal,
    };
  }, [vencimentos]);

  const formatarData = (data: Date) => {
    return new Date(data).toLocaleDateString("pt-BR");
  };

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor);
  };

  const copiarMensagemWhatsApp = (vencimento: typeof vencimentos[0]) => {
    const mensagem = `Olá ${vencimento.devedorNome}!

Lembramos que você possui uma parcela do acordo vencendo em ${formatarData(vencimento.dataVencimento)}.

📋 Detalhes:
• Parcela: ${vencimento.parcelaNumero}
• Valor: ${formatarMoeda(Number(vencimento.parcelaValor))}
• Unidade: ${vencimento.devedorUnidade}${vencimento.devedorBloco ? ` - Bloco ${vencimento.devedorBloco}` : ""}

Por favor, realize o pagamento até a data de vencimento para manter seu acordo em dia.

Qualquer dúvida, estamos à disposição!`;

    navigator.clipboard.writeText(mensagem);
    setCopiado(vencimento.parcelaId);
    setTimeout(() => setCopiado(null), 2000);
  };

  const getDiasRestantes = (dataVencimento: Date) => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(dataVencimento);
    venc.setHours(0, 0, 0, 0);
    const diff = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diff === 0) return "Vence hoje";
    if (diff === 1) return "Vence amanhã";
    return `${diff} dias`;
  };

  const getCorUrgencia = (dataVencimento: Date) => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(dataVencimento);
    venc.setHours(0, 0, 0, 0);
    const diff = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diff === 0) return "text-red-600 font-bold";
    if (diff <= 3) return "text-orange-600 font-semibold";
    return "text-gray-700";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Vencimentos Próximos</h1>
            <p className="text-gray-600 mt-1">Acompanhe parcelas de acordos vencendo</p>
          </div>
        </div>

        {/* Filtros */}
        <Card className="p-6">
          <div className="flex flex-wrap gap-4">
            {user?.role === "admin" && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Condomínio
                </label>
                <select
                  value={selectedCondominio || ""}
                  onChange={(e) => setSelectedCondominio(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todos os condomínios</option>
                  {condominios?.map((cond) => (
                    <option key={cond.id} value={cond.id}>
                      {cond.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Período
              </label>
              <div className="flex gap-2">
                <Button
                  variant={filtroDias === 7 ? "default" : "outline"}
                  onClick={() => setFiltroDias(7)}
                  className="flex-1"
                >
                  7 dias
                </Button>
                <Button
                  variant={filtroDias === 15 ? "default" : "outline"}
                  onClick={() => setFiltroDias(15)}
                  className="flex-1"
                >
                  15 dias
                </Button>
                <Button
                  variant={filtroDias === 30 ? "default" : "outline"}
                  onClick={() => setFiltroDias(30)}
                  className="flex-1"
                >
                  30 dias
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Vencendo Hoje</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{stats.vencendoHoje}</p>
              </div>
              <Calendar className="h-8 w-8 text-red-600" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Próximos 7 Dias</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{stats.proximos7Dias}</p>
              </div>
              <Calendar className="h-8 w-8 text-orange-600" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total no Período</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{stats.total}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Valor Total</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {formatarMoeda(stats.valorTotal)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </Card>
        </div>

        {/* Lista de Vencimentos */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Parcelas Vencendo</h2>
          
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Carregando...</div>
          ) : vencimentos.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p>Nenhuma parcela vencendo no período selecionado</p>
            </div>
          ) : (
            <div className="space-y-3">
              {vencimentos.map((vencimento) => (
                <div
                  key={vencimento.parcelaId}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="font-medium text-gray-900">{vencimento.devedorNome}</p>
                        <p className="text-sm text-gray-500">
                          {vencimento.devedorUnidade}
                          {vencimento.devedorBloco && ` - Bloco ${vencimento.devedorBloco}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Home className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Parcela</p>
                        <p className="font-medium">{vencimento.parcelaNumero}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Valor</p>
                        <p className="font-medium">{formatarMoeda(Number(vencimento.parcelaValor))}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Vencimento</p>
                        <p className="font-medium">{formatarData(vencimento.dataVencimento)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-sm text-gray-600">Urgência</p>
                        <p className={getCorUrgencia(vencimento.dataVencimento)}>
                          {getDiasRestantes(vencimento.dataVencimento)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copiarMensagemWhatsApp(vencimento)}
                    className="ml-4"
                  >
                    {copiado === vencimento.parcelaId ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar Mensagem
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
