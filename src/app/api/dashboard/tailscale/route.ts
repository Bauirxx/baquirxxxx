import { NextRequest } from 'next/server'
import { getUserOr401, json } from '@/lib/api-helpers'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { TailscaleStatusDTO } from '@/lib/types'

const execAsync = promisify(exec)

// Tenta ler o estado real do Tailscale chamando a CLI `tailscale status --json`.
// Em ambientes sem Tailscale instalado, retorna { installed: false, connected: false, ... }.
async function getRealTailscaleStatus(): Promise<TailscaleStatusDTO> {
  // Verifica se o binário existe
  let installed = false
  try {
    await execAsync('which tailscale', { timeout: 2000 })
    installed = true
  } catch {
    return {
      installed: false,
      connected: false,
      version: null,
      tailnetName: null,
      thisDeviceIp: null,
      thisDeviceName: null,
      peers: [],
    }
  }

  if (!installed) {
    return {
      installed: false,
      connected: false,
      version: null,
      tailnetName: null,
      thisDeviceIp: null,
      thisDeviceName: null,
      peers: [],
    }
  }

  // Chama `tailscale status --json` para obter estado real
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
    return {
      installed: true,
      connected: data.BackendState === 'Running',
      version: data.Version ?? null,
      tailnetName: data.CurrentTailnet?.Name ?? null,
      thisDeviceIp: Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs[0] ?? null : null,
      thisDeviceName: self.HostName ?? null,
      peers,
    }
  } catch (err) {
    // Tailscale instalado mas a CLI falhou (sem permissões, daemon down, etc.)
    return {
      installed: true,
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
