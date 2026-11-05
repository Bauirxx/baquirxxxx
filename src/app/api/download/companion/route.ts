import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

// Serve o APK da app Companion para download/instalação no telemóvel.
// Link relativo (/api/download/companion) → funciona quer o painel seja aberto em
// localhost quer via IP do Tailscale, por isso o telemóvel na Tailnet descarrega direto.
export async function GET(_req: NextRequest) {
  try {
    const filePath = path.join(process.cwd(), 'download', 'ScreenPorterCompanion.apk')
    const data = await readFile(filePath)
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="ScreenPorterCompanion.apk"',
        'Content-Length': String(data.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return new Response('Companion APK not found', { status: 404 })
  }
}
