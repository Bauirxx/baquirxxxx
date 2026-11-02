import { getDebug } from '@/lib/debug-log'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Página de diagnóstico (apenas para testes): mostra as últimas tentativas de login
// ao vivo. Abre <servidor>/debug no telemóvel e toca "Guardar servidor" na app.
export function GET() {
  const entries = getDebug().slice().reverse()
  const rows = entries
    .map(
      (e) =>
        `<tr><td>${esc(new Date(e.t).toLocaleTimeString())}</td><td>${esc(e.kind)}</td><td><pre>${esc(
          JSON.stringify(e.detail, null, 1)
        )}</pre></td></tr>`
    )
    .join('')

  const html = `<!doctype html><html lang="pt"><head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="2">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Debug — logins</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#0b0b0c;color:#eaeaea;margin:0;padding:14px}
  h3{margin:0 0 6px}
  .hint{color:#9a9a9a;font-size:12px;margin-bottom:12px;line-height:1.4}
  table{width:100%;border-collapse:collapse;font-size:12px}
  td,th{border:1px solid #2a2a2a;padding:6px 8px;text-align:left;vertical-align:top;word-break:break-word}
  th{background:#17171a}
  pre{margin:0;white-space:pre-wrap;font-size:11px}
  .ok{color:#34d399}.fail{color:#f87171}
</style></head><body>
<h3>Tentativas de login — atualiza a cada 2s</h3>
<div class="hint">Mantém esta página aberta e toca em <b>"Guardar servidor"</b> na app.<br>
• Se <b>nada</b> aparecer ⇒ a app não chega ao servidor (erro no Endereço/porta).<br>
• <b>userFound=false</b> ⇒ email diferente. • <b>passwordMatch=false</b> ⇒ senha diferente.<br>
• <b>ua=okhttp…</b> ⇒ veio da app. <b>ua=Mozilla…</b> ⇒ veio de um browser.</div>
<table><tr><th>hora</th><th>tipo</th><th>detalhe</th></tr>${
    rows || '<tr><td colspan="3">Sem tentativas ainda.</td></tr>'
  }</table>
</body></html>`

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
