import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { createHeartbeatJob, listHeartbeatJobs } from "./heartbeat";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  configurarJobAlertasPrazos: adminProcedure
    .input(z.object({ sessionToken: z.string() }))
    .mutation(async ({ input }) => {
      const { jobs } = await listHeartbeatJobs(input.sessionToken);
      const jaExiste = jobs.some((j: { name: string }) => j.name === "alertas-prazos-juridicos");
      if (jaExiste) return { criado: false, mensagem: "Job ja configurado" };
      await createHeartbeatJob(
        {
          name: "alertas-prazos-juridicos",
          cron: "0 0 8 * * *",
          path: "/api/scheduled/alertas-prazos",
          method: "POST",
          description: "Alertas automaticos de prazos juridicos (vencidos + proximos 1/3/7 dias)",
        },
        input.sessionToken
      );
      return { criado: true, mensagem: "Job de alertas de prazos configurado com sucesso" };
    }),
});
