/**
 * Módulo de envio de e-mail para recuperação de senha.
 * Usa a API de notificações integrada do Manus (BUILT_IN_FORGE_API_URL).
 * Se não estiver disponível, registra o link no console (modo desenvolvimento).
 */

interface SendPasswordResetEmailOptions {
  to: string;
  name: string;
  token: string;
  ip?: string;
}

function buildResetUrl(token: string): string {
  // Em produção, usar a URL pública do site
  const baseUrl =
    process.env.VITE_APP_URL ||
    process.env.PUBLIC_URL ||
    "https://sistemadecobranca.manus.space";
  return `${baseUrl}/reset-password?token=${token}`;
}

function buildEmailHtml(name: string, resetUrl: string, ip?: string): string {
  const year = new Date().getFullYear();
  const ipInfo = ip && ip !== "unknown" ? `<p style="color:#6b7280;font-size:12px;margin:0 0 4px">Solicitado do IP: ${ip}</p>` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recuperação de Senha — Gomes &amp; Silva</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f2d5e 0%,#1a4a8a 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
                Gomes &amp; Silva
              </h1>
              <p style="margin:6px 0 0;color:#93c5fd;font-size:13px;letter-spacing:0.5px;text-transform:uppercase;">
                Sistema de Gestão de Cobranças
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:600;">
                Recuperação de senha
              </h2>
              <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
                Olá, <strong>${name}</strong>!
              </p>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                Recebemos uma solicitação para redefinir a senha da sua conta.
                Clique no botão abaixo para criar uma nova senha. O link é válido por
                <strong>15 minutos</strong>.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${resetUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#0f2d5e,#1a4a8a);color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
                      Redefinir senha
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;" />

              <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.5;">
                Se o botão não funcionar, copie e cole o link abaixo no seu navegador:
              </p>
              <p style="margin:0 0 24px;word-break:break-all;">
                <a href="${resetUrl}" style="color:#1a4a8a;font-size:12px;text-decoration:underline;">${resetUrl}</a>
              </p>

              <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
                <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5;">
                  ⚠️ <strong>Não solicitou a redefinição?</strong>
                  Ignore este e-mail. Sua senha permanece a mesma e nenhuma alteração foi feita.
                </p>
              </div>

              ${ipInfo}
              <p style="color:#6b7280;font-size:12px;margin:0;">
                Este link expira em 15 minutos e só pode ser usado uma vez.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${year} Gomes &amp; Silva — Sistema de Gestão de Cobranças Condominiais
              </p>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:11px;">
                Este é um e-mail automático. Não responda a esta mensagem.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendPasswordResetEmail(opts: SendPasswordResetEmailOptions): Promise<void> {
  const { to, name, token, ip } = opts;
  const resetUrl = buildResetUrl(token);
  const html = buildEmailHtml(name, resetUrl, ip);

  const apiUrl = process.env.BUILT_IN_FORGE_API_URL;
  const apiKey = process.env.BUILT_IN_FORGE_API_KEY;

  // Tentar enviar via API integrada do Manus
  if (apiUrl && apiKey) {
    try {
      const response = await fetch(`${apiUrl}/v1/email/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          to,
          subject: "Recuperação de senha — Gomes & Silva",
          html,
          text: `Olá, ${name}!\n\nClique no link abaixo para redefinir sua senha (válido por 15 minutos):\n${resetUrl}\n\nSe não solicitou, ignore este e-mail.`,
        }),
      });

      if (response.ok) {
        console.log(`[password-reset] E-mail enviado para ${to}`);
        return;
      }

      const body = await response.text();
      console.warn(`[password-reset] Falha ao enviar e-mail (${response.status}): ${body}`);
    } catch (err) {
      console.warn("[password-reset] Erro ao chamar API de e-mail:", err);
    }
  }

  // Fallback: exibir link no console (desenvolvimento / API indisponível)
  console.log(`\n[password-reset] ⚠️  API de e-mail indisponível. Link de redefinição para ${to}:`);
  console.log(`  ${resetUrl}\n`);
}
