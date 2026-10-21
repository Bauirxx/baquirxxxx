// GuardianLink — Constantes de jurisdição e textos legais
import type { Jurisdiction, Locale } from './types'

export const LEGAL_VERSIONS = {
  BR_TOS: 'tos-1.0-lgpd',
  EU_TOS: 'tos-1.0-gdpr',
  US_TOS: 'tos-1.0-coppa',
} as const

export interface JurisdictionMeta {
  code: Jurisdiction
  label: { 'pt-BR': string; en: string }
  law: { 'pt-BR': string; en: string }
  ageOfConsent: number // idade mínima de consentimento digital assistido
  requiresParentalConsent: boolean
  rightToBeForgotten: boolean
  requiresDPIA: boolean
}

export const JURISDICTIONS: JurisdictionMeta[] = [
  {
    code: 'BR',
    label: { 'pt-BR': 'Brasil — LGPD', en: 'Brazil — LGPD' },
    law: { 'pt-BR': 'Lei nº 13.709/2018', en: 'Law No. 13.709/2018' },
    ageOfConsent: 18,
    requiresParentalConsent: true,
    rightToBeForgotten: true,
    requiresDPIA: false,
  },
  {
    code: 'EU',
    label: { 'pt-BR': 'União Europeia — GDPR', en: 'European Union — GDPR' },
    law: { 'pt-BR': 'Regulamento (UE) 2016/679', en: 'Regulation (EU) 2016/679' },
    ageOfConsent: 16,
    requiresParentalConsent: true,
    rightToBeForgotten: true,
    requiresDPIA: true,
  },
  {
    code: 'US',
    label: { 'pt-BR': 'EUA — COPPA + leis estaduais', en: 'USA — COPPA + state laws' },
    law: { 'pt-BR': '15 U.S.C. §§ 6501–6506', en: '15 U.S.C. §§ 6501–6506' },
    ageOfConsent: 13,
    requiresParentalConsent: true,
    rightToBeForgotten: false,
    requiresDPIA: false,
  },
]

export function getJurisdiction(code: Jurisdiction): JurisdictionMeta {
  return JURISDICTIONS.find(j => j.code === code) ?? JURISDICTIONS[0]
}

export function legalVersionFor(jurisdiction: Jurisdiction): string {
  switch (jurisdiction) {
    case 'BR': return LEGAL_VERSIONS.BR_TOS
    case 'EU': return LEGAL_VERSIONS.EU_TOS
    case 'US': return LEGAL_VERSIONS.US_TOS
  }
}

// Texto legal resumido (trecho exibido no onboarding) — versão bilíngue
export const LEGAL_SNIPPETS: Record<Jurisdiction, Record<Locale, string>> = {
  BR: {
    'pt-BR': 'Nos termos da Lei nº 13.709/2018 (LGPD), você declara que (i) é pai, mãe ou responsável legal do menor cujo dispositivo será monitorado; (ii) possui o consentimento para tratar os dados pessoais da criança/adolescente (art. 14, LGPD); (iii) informará o titular do dispositivo sobre a existência do monitoramento. O titular poderá exercer os direitos previstos no art. 18 da LGPD.',
    en: 'Pursuant to Law No. 13.709/2018 (LGPD), you declare that (i) you are the parent or legal guardian of the minor whose device will be monitored; (ii) you are authorized to process the child/adolescent\'s personal data (Art. 14); (iii) you will inform the device holder about the monitoring. The holder may exercise the rights set forth in Art. 18.',
  },
  EU: {
    'pt-BR': 'Nos termos do Regulamento (UE) 2016/679 (GDPR), você declara que (i) é titular do poder de representação legal do menor (art. 8º); (ii) possui base legal para o tratamento (art. 6º); (iii) informará o titular dos dados sobre o monitoramento. Os direitos dos arts. 15–22 são garantidos, incluindo o direito ao esquecimento (art. 17). Foi realizada Avaliação de Impacto à Proteção de Dados (DPIA — art. 35) dada a natureza de monitoramento sistemático.',
    en: 'Under Regulation (EU) 2016/679 (GDPR), you declare that (i) you hold parental responsibility for the minor (Art. 8); (ii) you have a lawful basis for processing (Art. 6); (iii) you will inform the data subject about the monitoring. The rights under Arts. 15–22 are guaranteed, including the right to erasure (Art. 17). A Data Protection Impact Assessment (DPIA — Art. 35) has been performed given the systematic monitoring nature.',
  },
  US: {
    'pt-BR': 'Nos termos da Children\'s Online Privacy Protection Act (COPPA, 15 U.S.C. §§ 6501–6506), você declara que (i) é pai, mãe ou guardião legal da criança menor de 13 anos; (ii) fornece consentimento verificável para coleta, uso e divulgação de informações pessoais (§ 6505); (iii) pode solicitar revisão e exclusão dos dados a qualquer momento (§ 6505(h)). Leis estaduais aplicáveis (CCPA/CPRA na Califórnia, etc.) são observadas.',
    en: 'Under the Children\'s Online Privacy Protection Act (COPPA, 15 U.S.C. §§ 6501–6506), you declare that (i) you are the parent or legal guardian of the child under 13; (ii) you provide verifiable consent for collection, use, and disclosure of personal information (§ 6505); (iii) you may request review and deletion of the data at any time (§ 6505(h)). Applicable state laws (CCPA/CPRA in California, etc.) are observed.',
  },
}

export const SOS_TRIGGERS = ['button', 'keyword', 'fall_detection'] as const
export const ALERT_CATEGORIES = ['cyberbullying', 'sexting', 'drugs', 'violence', 'self_harm', 'predator'] as const
export const ALERT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export const BROWSER_CATEGORIES = ['social', 'news', 'adult', 'games', 'education', 'shopping', 'other'] as const

// ============================================================
// ScreenPorter — constantes
// ============================================================

export type ConnectionType = 'usb' | 'wifi' | 'tailscale' | 'companion'
export type SyncMode = 'rigid' | 'adaptive' | 'independent'
export type RemoteCommand = 'touch' | 'key' | 'text' | 'back' | 'home' | 'recents' | 'power' | 'volume_up' | 'volume_down' | 'open_app' | 'reboot'

export interface ConnectionTypeMeta {
  code: ConnectionType
  label: { 'pt-BR': string; en: string }
  description: { 'pt-BR': string; en: string }
  icon: string // lucide icon name
}

export const CONNECTION_TYPES: ConnectionTypeMeta[] = [
  {
    code: 'usb',
    label: { 'pt-BR': 'USB (cabo)', en: 'USB (cable)' },
    description: {
      'pt-BR': 'Deteção automática por ADB com depuração ativada.',
      en: 'Automatic detection via ADB with debugging enabled.',
    },
    icon: 'Usb',
  },
  {
    code: 'wifi',
    label: { 'pt-BR': 'Wi-Fi local', en: 'Local Wi-Fi' },
    description: {
      'pt-BR': 'Descoberta por mDNS, emparelhamento por código QR.',
      en: 'mDNS discovery, QR code pairing.',
    },
    icon: 'Wifi',
  },
  {
    code: 'tailscale',
    label: { 'pt-BR': 'Remoto (Tailscale)', en: 'Remote (Tailscale)' },
    description: {
      'pt-BR': 'WireGuard atravancando NAT sem proxy nem abrir portas.',
      en: 'WireGuard traversing NAT without proxy or port forwarding.',
    },
    icon: 'Globe',
  },
  {
    code: 'companion',
    label: { 'pt-BR': 'App Companion', en: 'Companion app' },
    description: {
      'pt-BR': 'Telemóvel liga-se ao servidor de fora para dentro (qualquer rede).',
      en: 'Phone connects outbound to server (works on any network).',
    },
    icon: 'Smartphone',
  },
]

export function getConnectionType(code: string): ConnectionTypeMeta | null {
  return CONNECTION_TYPES.find(c => c.code === code) ?? null
}

export interface SyncModeMeta {
  code: SyncMode
  label: { 'pt-BR': string; en: string }
  description: { 'pt-BR': string; en: string }
}

export const SYNC_MODES: SyncModeMeta[] = [
  {
    code: 'rigid',
    label: { 'pt-BR': 'Rígido', en: 'Rigid' },
    description: {
      'pt-BR': 'Espera todos ficarem prontos antes de agir.',
      en: 'Waits for all devices to be ready before acting.',
    },
  },
  {
    code: 'adaptive',
    label: { 'pt-BR': 'Adaptativo', en: 'Adaptive' },
    description: {
      'pt-BR': 'Compensa a latência de cada aparelho.',
      en: 'Compensates per-device latency.',
    },
  },
  {
    code: 'independent',
    label: { 'pt-BR': 'Independente', en: 'Independent' },
    description: {
      'pt-BR': 'Cada aparelho age por si.',
      en: 'Each device acts on its own.',
    },
  },
]
