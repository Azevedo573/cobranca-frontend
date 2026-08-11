import { processarFilaWhatsApp } from "../server/job-whatsapp-fila.ts";

try {
  const resultado = await processarFilaWhatsApp();
  console.log(JSON.stringify({ job: "whatsapp-fila", ok: resultado.erros === 0, ...resultado }));
  process.exitCode = resultado.erros > 0 ? 1 : 0;
} catch (error) {
  console.error(JSON.stringify({ job: "whatsapp-fila", ok: false, erro: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
