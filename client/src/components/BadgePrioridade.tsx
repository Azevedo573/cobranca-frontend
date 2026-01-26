import { getCorPrioridade, getIconePrioridade, type Prioridade } from '../../../shared/scoring';

interface BadgePrioridadeProps {
  prioridade: Prioridade;
  score?: number;
  showScore?: boolean;
  className?: string;
}

export function BadgePrioridade({ prioridade, score, showScore = false, className = '' }: BadgePrioridadeProps) {
  const cor = getCorPrioridade(prioridade);
  const icone = getIconePrioridade(prioridade);
  
  const labels = {
    alta: 'Alta Prioridade',
    media: 'Prioridade Média',
    baixa: 'Baixa Prioridade',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cor} ${className}`}>
      <span>{icone}</span>
      <span>{labels[prioridade]}</span>
      {showScore && score !== undefined && (
        <span className="ml-1 opacity-75">({score})</span>
      )}
    </span>
  );
}
