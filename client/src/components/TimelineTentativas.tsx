import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, MessageSquare, User, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Tentativa {
  id: number;
  contactType: string;
  result: string | null;
  attemptDate: Date;
  notes?: string | null;
  userName?: string;
}

interface TimelineTentativasProps {
  tentativas: Tentativa[];
  limite?: number;
}

export function TimelineTentativas({ tentativas, limite = 10 }: TimelineTentativasProps) {
  const tentativasLimitadas = tentativas.slice(0, limite);

  const getIconeContato = (tipo: string) => {
    const icones: Record<string, React.ReactNode> = {
      telefone: <Phone className="h-4 w-4" />,
      email: <Mail className="h-4 w-4" />,
      whatsapp: <MessageSquare className="h-4 w-4" />,
      pessoal: <User className="h-4 w-4" />,
    };
    return icones[tipo] || <Phone className="h-4 w-4" />;
  };

  const getIconeResultado = (resultado: string | null) => {
    const icones: Record<string, { icone: React.ReactNode; cor: string }> = {
      sucesso: { icone: <CheckCircle2 className="h-4 w-4" />, cor: "text-green-600" },
      promessa: { icone: <CheckCircle2 className="h-4 w-4" />, cor: "text-blue-600" },
      deseja_acordo: { icone: <CheckCircle2 className="h-4 w-4" />, cor: "text-green-600" },
      sem_resposta: { icone: <Clock className="h-4 w-4" />, cor: "text-yellow-600" },
      recusa: { icone: <XCircle className="h-4 w-4" />, cor: "text-red-600" },
      recusado: { icone: <XCircle className="h-4 w-4" />, cor: "text-red-600" },
    };
    return icones[resultado || ""] || { icone: <Clock className="h-4 w-4" />, cor: "text-gray-600" };
  };

  const getCorLinha = (resultado: string | null) => {
    const cores: Record<string, string> = {
      sucesso: "bg-green-500",
      promessa: "bg-blue-500",
      deseja_acordo: "bg-green-500",
      sem_resposta: "bg-yellow-500",
      recusa: "bg-red-500",
      recusado: "bg-red-500",
    };
    return cores[resultado || ""] || "bg-gray-400";
  };

  const getLabelResultado = (resultado: string | null) => {
    const labels: Record<string, string> = {
      sucesso: "Sucesso",
      promessa: "Promessa",
      deseja_acordo: "Deseja Acordo",
      sem_resposta: "Sem Resposta",
      recusa: "Recusa",
      recusado: "Recusado",
    };
    return labels[resultado || ""] || (resultado || "desconhecido").replace("_", " ");
  };

  if (tentativas.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Tentativas</CardTitle>
          <CardDescription>Timeline de contatos realizados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma tentativa registrada</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de Tentativas</CardTitle>
        <CardDescription>
          {tentativas.length} tentativa(s) registrada(s)
          {tentativas.length > limite && ` • Mostrando últimas ${limite}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative space-y-4">
          {/* Linha vertical */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

          {tentativasLimitadas.map((tentativa, index) => {
            const resultado = getIconeResultado(tentativa.result);
            const corLinha = getCorLinha(tentativa.result);

            return (
              <div key={tentativa.id} className="relative flex gap-4 pb-4">
                {/* Ícone na timeline */}
                <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background ${corLinha}`}>
                  <div className="text-white">{getIconeContato(tentativa.contactType)}</div>
                </div>

                {/* Conteúdo */}
                <div className="flex-1 space-y-1 pt-0.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="gap-1">
                        {getIconeContato(tentativa.contactType)}
                        {tentativa.contactType.charAt(0).toUpperCase() + tentativa.contactType.slice(1)}
                      </Badge>
                      <div className={`flex items-center gap-1 ${resultado.cor}`}>
                        {resultado.icone}
                        <span className="text-sm font-medium">{getLabelResultado(tentativa.result)}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(tentativa.attemptDate), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                  </div>

                  {tentativa.notes && (
                    <p className="text-sm text-muted-foreground">{tentativa.notes}</p>
                  )}

                  {tentativa.userName && (
                    <p className="text-xs text-muted-foreground">Por: {tentativa.userName}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
