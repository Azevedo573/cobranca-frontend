import { executarTodasReguas } from "../server/job-regua.ts";

try {
  const resultado = await executarTodasReguas();
  console.log(JSON.stringify({ job: "regua-cobranca", ok: resultado.erros.length === 0, ...resultado }));
  process.exitCode = resultado.erros.length > 0 ? 1 : 0;
} catch (error) {
  console.error(JSON.stringify({ job: "regua-cobranca", ok: false, erro: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
