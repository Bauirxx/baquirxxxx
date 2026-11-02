import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

// Atalho curto para instalar no telemóvel: <servidor>/apk
// Serve o APK DIRETAMENTE (sem redirect). Um redirect baseado em `req.url` resolvia
// para localhost no telemóvel (o dev server liga em 0.0.0.0 e refere-se a si como
// localhost), por isso o telemóvel era atirado para localhost e falhava.
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
