import { processarFilaWhatsApp } from "../server/job-whatsapp-fila";

async function main() {
  const resultado = await processarFilaWhatsApp();
  console.log(`[WhatsAppFilaVPS] Resultado: ${JSON.stringify(resultado)}`);
  process.exitCode = resultado.erros > 0 ? 1 : 0;
}

main().catch((erro) => {
  console.error("[WhatsAppFilaVPS] Falha não tratada:", erro);
  process.exitCode = 1;
});
