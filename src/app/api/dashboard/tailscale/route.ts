import { NextRequest } from 'next/server'
import { getUserOr401, json } from '@/lib/api-helpers'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { TailscaleStatusDTO } from '@/lib/types'

const execAsync = promisify(exec)

// Tenta ler o estado real do Tailscale chamando a CLI `tailscale status --json`.
// Em ambientes sem Tailscale instalado, retorna { installed: false, connected: false, ... }.
async function getRealTailscaleStatus(): Promise<TailscaleStatusDTO> {
  // Corre `tailscale status --json` diretamente (cross-platform: Windows/Linux/macOS).
  // Nota: o antigo pré-check `which tailscale` não existe no Windows e reportava
  // incorretamente "não instalado". Aqui distinguimos "não instalado" (binário não
  // encontrado) de "instalado mas com erro" (daemon em baixo, sem permissões, etc.).
  try {
    const { stdout } = await execAsync('tailscale status --json', { timeout: 5000 })
    const data = JSON.parse(stdout)
    const self = data.Self ?? {}
    const peers: TailscaleStatusDTO['peers'] = []
    if (data.Peer && typeof data.Peer === 'object') {
      for (const key of Object.keys(data.Peer)) {
        const p = data.Peer[key]
        peers.push({
          hostname: p.HostName ?? p.DNSName?.split('.')[0] ?? key,
          ip: Array.isArray(p.TailscaleIPs) ? p.TailscaleIPs[0] ?? '' : '',
          os: p.OS ?? 'unknown',
          online: !p.Offline,
        })
      }
    }
    // Prefere o IPv4 (100.x) para o endereço do dispositivo.
    const ips: string[] = Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs : []
    const ipv4 = ips.find((ip) => ip.includes('.')) ?? ips[0] ?? null
    return {
      installed: true,
      connected: data.BackendState === 'Running',
      version: data.Version ?? null,
      tailnetName: data.CurrentTailnet?.Name ?? null,
      thisDeviceIp: ipv4,
      thisDeviceName: self.HostName ?? null,
      peers,
    }
  } catch (err: unknown) {
    // ENOENT / "not recognized" / "command not found" → binário não existe.
    const e = err as { code?: string; message?: string }
    const msg = String(e?.message ?? '')
    const notFound =
      e?.code === 'ENOENT' ||
      /not recognized|not found|no such file|command not found/i.test(msg)
    return {
      installed: !notFound,
      connected: false,
      version: null,
      tailnetName: null,
      thisDeviceIp: null,
      thisDeviceName: null,
      peers: [],
    }
  }
}

// GET — estado real do Tailscale (sem mocks)
export async function GET(_req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const status = await getRealTailscaleStatus()
  return json(status)
}
