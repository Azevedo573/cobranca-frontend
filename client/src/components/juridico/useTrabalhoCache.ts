import { trpc } from "@/lib/trpc";
export function useTrabalhoCache() {
  const utils = trpc.useUtils();
  return async () => {
    await Promise.all([
      utils.juridicoDemandas.tarefas.invalidate(),
      utils.juridicoDemandas.listar.invalidate(),
      utils.juridicoDemandas.getById.invalidate(),
      utils.juridicoDemandas.getTimeline.invalidate(),
    ]);
  };
}
