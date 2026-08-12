import { executarTodasReguas } from "../server/job-regua";

async function main() {
  const resultado = await executarTodasReguas();
  console.log(`[ReguaVPS] Resultado: ${JSON.stringify(resultado)}`);
  process.exitCode = resultado.erros.length > 0 ? 1 : 0;
}

main().catch((erro) => {
  console.error("[ReguaVPS] Falha não tratada:", erro);
  process.exitCode = 1;
});
