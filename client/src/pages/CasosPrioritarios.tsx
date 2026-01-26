import { useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '../lib/trpc';
import { useAuth } from '../_core/hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { BadgePrioridade } from '../components/BadgePrioridade';
import { RefreshCw, Eye, AlertTriangle } from 'lucide-react';

export default function CasosPrioritarios() {
  const { user } = useAuth();
  const [atualizando, setAtualizando] = useState(false);

  const condominioId = user?.role === 'sindico' && user.condominioId ? user.condominioId : undefined;

  const { data: devedores, isLoading, refetch } = trpc.scoring.listarPorPrioridade.useQuery({
    condominioId,
  });

  const atualizarScoreMutation = trpc.scoring.atualizarTodos.useMutation({
    onSuccess: () => {
      refetch();
      setAtualizando(false);
    },
  });

  const handleAtualizarScores = () => {
    setAtualizando(true);
    atualizarScoreMutation.mutate();
  };

  const formatarValor = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor / 100);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-gray-500">Carregando casos prioritários...</p>
        </div>
      </div>
    );
  }

  const devedoresAlta = devedores?.filter(d => d.prioridade === 'alta') || [];
  const devedoresMedia = devedores?.filter(d => d.prioridade === 'media') || [];
  const devedoresBaixa = devedores?.filter(d => d.prioridade === 'baixa') || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Casos Prioritários</h1>
              <p className="text-sm text-gray-600 mt-1">
                Devedores ordenados por prioridade de cobrança
              </p>
            </div>
            {user?.role === 'admin' && (
              <Button
                onClick={handleAtualizarScores}
                disabled={atualizando}
                variant="outline"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${atualizando ? 'animate-spin' : ''}`} />
                {atualizando ? 'Atualizando...' : 'Atualizar Scores'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Alta Prioridade</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{devedoresAlta.length}</p>
              </div>
              <div className="text-4xl">🔴</div>
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Prioridade Média</p>
                <p className="text-3xl font-bold text-yellow-600 mt-2">{devedoresMedia.length}</p>
              </div>
              <div className="text-4xl">🟡</div>
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Baixa Prioridade</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{devedoresBaixa.length}</p>
              </div>
              <div className="text-4xl">🟢</div>
            </div>
          </Card>
        </div>

        {/* Lista de Devedores */}
        {devedores && devedores.length > 0 ? (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prioridade
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Devedor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unidade
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valor Devido
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {devedores.map((devedor) => (
                    <tr key={devedor.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <BadgePrioridade prioridade={devedor.prioridade || 'media'} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {devedor.score || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{devedor.name}</div>
                        {devedor.email && (
                          <div className="text-sm text-gray-500">{devedor.email}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {devedor.unitNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatarValor(devedor.totalDue)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            devedor.status === 'pago'
                              ? 'bg-green-100 text-green-800'
                              : devedor.status === 'acordo'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {devedor.status === 'pago'
                            ? 'Pago'
                            : devedor.status === 'acordo'
                            ? 'Em Acordo'
                            : 'Ativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link href={`/devedores/${devedor.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className="p-12 text-center">
            <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Nenhum devedor encontrado</p>
          </Card>
        )}
      </div>
    </div>
  );
}
