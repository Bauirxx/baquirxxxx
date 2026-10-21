# ScreenPorter Web — Plataforma (Next.js)

Plataforma web unificada de espelhar/controlar Android + monitorização parental consentida.

## Requisitos

- **Node.js 20+** (recomendado) ou **Bun** (mais rápido)
- **SQLite** (já vem com Node/Bun, não precisas instalar nada extra)

## Como correr localmente

1. **Descompactar o ZIP** para uma pasta (ex.: `screenporter-web`)

2. **Entrar na pasta:**
   ```bash
   cd screenporter-web
   ```

3. **Instalar dependências** (escolhe uma das opções):
   ```bash
   # Com Bun (recomendado — mais rápido)
   bun install
   
   # Ou com npm
   npm install
   ```

4. **Criar a base de dados SQLite** (cria automaticamente o ficheiro `db/custom.db`):
   ```bash
   bun run db:push
   # Ou: npx prisma db push
   ```

5. **Arrancar o servidor de desenvolvimento:**
   ```bash
   bun run dev
   # Ou: npm run dev
   ```

6. **Abrir no navegador:** http://localhost:3000

## Serviço de tempo real (WebSocket)

A app tem um mini-service separado para broadcasts em tempo real (eventos do agente Android chegam ao painel em tempo real). Para o arrancar:

```bash
cd mini-services/realtime-service
bun install         # instala socket.io
bun index.ts        # arranca nas portas 3003 (socket.io) + 3004 (webhook interno)
```

Se vires "Tempo real desconectado" no painel, é porque este serviço não está a correr.

## Estrutura do projeto

```
screenporter-web/
├── src/
│   ├── app/
│   │   ├── api/                    # 14+ endpoints REST (auth, onboarding, dashboard, agent ingest)
│   │   ├── layout.tsx              # Layout root (fonts + theme + i18n providers)
│   │   ├── page.tsx                # Página única (AppShell state machine)
│   │   └── globals.css             # Estilo Tailwind + tema laranja
│   ├── components/
│   │   ├── ui/                     # shadcn/ui primitives (40+ componentes)
│   │   ├── app/
│   │   │   ├── app-shell.tsx       # State machine: landing → auth → onboarding → dashboard
│   │   │   ├── landing/            # Landing page (hero + trust + features + legal)
│   │   │   ├── auth/               # Modal de login/signup
│   │   │   ├── onboarding/         # Wizard 4 passos (jurisdição + consentimento + criança + device)
│   │   │   └── dashboard/          # 14 views + sidebar + topbar + realtime provider
│   │   └── theme-provider.tsx      # Light/dark theme
│   └── lib/
│       ├── auth.ts                 # Cookie session + bcrypt + cookie SameSite=None
│       ├── api-helpers.ts          # Helpers para API routes
│       ├── constants.ts            # Jurisdições LGPD/GDPR/COPPA + connection types
│       ├── realtime.ts             # Cliente WebSocket (socket.io-client)
│       ├── realtime-broadcast.ts   # Server-side: POST para webhook interno
│       ├── db.ts                   # Prisma client singleton
│       ├── types.ts                # DTOs TypeScript
│       └── i18n/
│           ├── translations.ts    # Dicionários PT-BR + EN
│           └── context.tsx        # Provider de idioma
├── prisma/
│   └── schema.prisma               # 13 modelos (User, Session, Child, Device, ConsentRecord, 
│                                   #   LocationEvent, CallEvent, SmsEvent, AppUsageEvent, 
│                                   #   BrowserEvent, SocialAlert, SosEvent, AuditLog, 
│                                   #   InstalledApp, SyncConfig, ScreenSession, Screenshot, SyncEvent)
├── mini-services/
│   └── realtime-service/          # Bun service: socket.io server (porta 3003)
│                                   # + webhook interno (porta 3004)
├── scripts/
│   ├── restart-realtime.sh         # Reinicia o serviço WebSocket
│   ├── clean-db.js                 # Limpa base de dados (mantém 1 utilizador)
│   └── inspect-db.js               # Inspeciona contagem por tabela
├── public/
│   └── logo.svg                    # Logo do ScreenPorter
├── .env                            # DATABASE_URL (caminho relativo SQLite)
├── package.json                    # Dependências + scripts
├── bun.lock                        # Lockfile (se usares bun)
├── tsconfig.json                   # Config TypeScript
├── next.config.ts                  # Next.js config (output: standalone)
├── tailwind.config.ts             # Tailwind config
├── postcss.config.mjs              # PostCSS config
├── eslint.config.mjs              # ESLint config
└── components.json                 # shadcn/ui config
```

## Funcionalidades

### Pilares (dois propósitos, um painel)

1. **Controlo remoto de Android (ScreenPorter):**
   - 4 vias de ligação: USB, Wi-Fi, Tailscale, Companion app
   - Espelho de ecrã H.264 ao vivo (WebCodecs)
   - Controlo: toque, teclado, navegação (Back/Home/Recents/Power/Volume)
   - Sincronização multi-dispositivo (3 modos: Rígido/Adaptativo/Independente)
   - Métricas de sincronização (comandos, precisão, desvios)

2. **Monitorização parental consentida (GuardianLink):**
   - GPS em tempo real
   - Registo de chamadas (sem gravação de áudio)
   - SMS com sinalização de risco (cyberbullying, drogas, etc.)
   - Tempo de tela por app
   - Histórico de navegação
   - Alertas sociais (WhatsApp/IG/TikTok/Snapchat/Messenger via NotificationListener)
   - Botão de pânico (SOS) com localização
   - Consentimento multi-jurisdição: LGPD (Brasil), GDPR (UE), COPPA (EUA)

### Componentes

- **Landing page** completa com hero + trust + features + legal banner + CTA
- **Auth modal** com login/signup (cookies HTTP-only + bcrypt + sessions persistidas em DB)
- **Onboarding wizard 4 passos** (jurisdição → consentimento auditável → criança → device registration)
- **Dashboard 14 views:**
  - MONITORAMENTO: Overview, Localização, Chamadas, SMS, Apps, Navegação, Alertas sociais, SOS
  - CONTROLO REMOTO: Espelho de ecrã, Controlo remoto, Sincronização, Métricas
  - CONTA: Dispositivos, Configurações
- **Multi-jurisdição** com textos legais diferentes por região
- **Audit log** completo (login, consentimento, ações do utilizador)
- **Bilíngue** PT-BR + EN com toggle persistido em cookie
- **Real-time WebSocket** via mini-service separado (porta 3003)

## App Companion Android

Para a app Android nativa (Kotlin) que envia dados reais para esta plataforma, ver o ficheiro separado: `ScreenPorterCompanion.zip`.

## Comandos úteis

```bash
# Reiniciar o serviço de tempo real (se "Tempo real desconectado")
bash scripts/restart-realtime.sh

# Inspecionar a base de dados (contagem por tabela)
node scripts/inspect-db.js

# Limpar base de dados (apaga todos os dados de teste, mantém a tua conta)
# Edita o script para indicar o email a manter, depois:
node scripts/clean-db.js

# Lint (verificar erros de código)
bun run lint

# Build de produção (gera .next/standalone/)
bun run build

# Servidor de produção standalone (mais estável em ambientes com pouca RAM)
NODE_ENV=production PORT=3000 node .next/standalone/server.js
```

## Variáveis de ambiente (.env)

```
DATABASE_URL="file:./db/custom.db"
```

Apenas isto. Não há secrets hardcoded nem mocks — tudo vem de dados reais.

## Limitações conhecidas

- O dev server (next dev + Turbopack) usa bastante RAM (até 2GB). Em máquinas com <8GB RAM, recomenda-se usar o build de produção (`bun run build` + `node .next/standalone/server.js`).
- O **Tailscale** no endpoint `/api/dashboard/tailscale` chama a CLI real `tailscale status --json`. Sem Tailscale instalado no PC, retorna `{installed: false, peers: []}`.
- O **espelho de ecrã** no painel mostra um canvas vazio até a app Companion Android enviar frames H.264 reais (via `/api/agent/ingest`).

## Próximos passos sugeridos

1. Correr o servidor web localmente (ver acima)
2. Criar uma conta e completar o onboarding — receberás um código de instalação de 6 dígitos
3. Abrir `ScreenPorterCompanion.zip` no Android Studio
4. Compilar o APK da app Companion
5. Instalar no telemóvel Android (debugging USB ativado)
6. Na app Companion: ler QR code do painel OU preencher manualmente servidor + login + consentimento + permissões + Ligar com o código
7. Ver dados reais a aparecer no painel em tempo real

## Compromisso ético

A plataforma **não** implementa: modo oculto, keylogger, gravação de chamadas, interceção de mensagens privadas (só flags + snippets redigidos são exibidos), acesso à câmara/microfone para gravação. A fronteira contra software-espião é intencional.
