# ScreenPorter Companion — App Android (Kotlin)

> **App dual-purpose:** espelhar/controllar Android à distância (ScreenPorter) + monitorização parental consentida (GuardianLink).

App nativa Android que o dono instala **uma vez** no telemóvel. A partir daí:

- **Fim 1 — ScreenPorter (controlo remoto)**: o telemóvel transmite o ecrã H.264 ao vivo e recebe toques/teclado/comandos do PC
- **Fim 2 — GuardianLink (monitorização parental)**: reporta GPS, registo de chamadas, SMS (com sinalização de risco), tempo de uso por app, histórico de navegação, e sinais de risco em notificações de mensagens. Botão de pânico (SOS) flutuante.

Tudo através de qualquer rede (Wi-Fi, dados móveis, Tailscale), porque é o telemóvel que se liga ao servidor (outbound).

> Princípio: **operação ABERTA e CONSENTIDA** — app visível (ícone + notificação permanente), todas as permissões pedidas explicitamente. Não há modo oculto, não há keyloggers, não há gravação de chamadas nem interceção de mensagens.

## Especificação
- **Linguagem:** Kotlin
- **minSdk 26** (Android 8.0) · **target/compileSdk 35** (Android 15)
- **UI:** Android Views (AppCompat + Material 3)
- **Rede:** OkHttp 4.12.0 (HTTP login + WebSocket em tempo real)
- **Captura:** MediaProjection → Surface → MediaCodec H.264 (Annex-B)
- **Controlo:** AccessibilityService (dispatchGesture + takeScreenshot)
- **QR scanner:** ZXing (`com.journeyapps:zxing-android-embedded:4.3.0`)

## Estrutura do projeto

```
app/src/main/
├── AndroidManifest.xml                  (permissões + 6 componentes + deep link)
├── kotlin/com/screenporter/companion/
│   ├── ScreenPorterApp.kt              (Application)
│   ├── MainActivity.kt                 (ecrã de instalação: 5 passos + QR + SOS)
│   ├── CaptureService.kt              (foreground service: 3 modos + todos monitoring)
│   ├── ControlAccessibilityService.kt (gestos + screenshots + nav buttons)
│   ├── AdminReceiver.kt               (Device Owner, opcional)
│   ├── BootReceiver.kt                (auto-restart após reboot)
│   ├── network/
│   │   ├── ApiClient.kt                (HTTP login + ingest)
│   │   ├── WebSocketClient.kt          (OkHttp WebSocket + binary frames)
│   │   └── Models.kt                   (data classes)
│   ├── capture/
│   │   ├── VideoEncoder.kt             (MediaCodec H.264)
│   │   └── NalUnitParser.kt            (keyframe NAL type 5 + config-prepend)
│   ├── location/
│   │   └── LocationReporter.kt         (GPS + NETWORK, 30s/25m)
│   ├── monitoring/  ← GuardianLink features
│   │   ├── CallLogReporter.kt          (READ_CALL_LOG, 5min polling)
│   │   ├── SmsReporter.kt              (READ_SMS, 3min polling)
│   │   ├── SmsReceiver.kt             (real-time SMS_RECEIVED broadcast)
│   │   ├── AppUsageReporter.kt        (PACKAGE_USAGE_STATS, 1h)
│   │   ├── BrowserHistoryReporter.kt (READ_HISTORY_BOOKMARKS, 10min)
│   │   ├── AlertDetector.kt           (rule-based: cyberbullying, drugs, self_harm, sexting, predator)
│   │   └── NotificationListener.kt   (NotificationListenerService para WhatsApp/IG/TikTok/etc.)
│   ├── consent/
│   │   └── ConsentActivity.kt         (wizard multi-jurisdição LGPD/GDPR/COPPA)
│   ├── sos/
│   │   └── SosOverlayService.kt        (botão flutuante de pânico + localização)
│   ├── install/
│   │   ├── QrScannerActivity.kt       (ZXing scanner para setup em 1 toque)
│   │   └── DeepLinkHandler.kt         (scheme screenporter://setup?...)
│   └── ui/
│       └── PermissionItemAdapter.kt   (10 itens de permissão)
└── res/...
```

## 5 passos de instalação (MainActivity)

1. **Servidor** (com QR scanner em 1 toque) — botão **Ler QR code** abre a câmara e lê o QR mostrado no painel do ScreenPorter. O QR contém `{"server":"...","user":"...","token":"...","jurisdiction":"BR"}` ou `screenporter://setup?...`
2. **Consentimento legítimo** — wizard multi-jurisdição (LGPD/GDPR/COPPA) com 3 checkboxes + texto legal. Guarda registo auditável local + envia para o servidor.
3. **Permissões** (10 itens) — cada uma com botão Conceder + estado ✓/⚠:
   - Acessibilidade (obrigatória para controlo + screenshots)
   - Bateria (isenção de poupança)
   - Notificações (Android 13+)
   - Localização (GPS)
   - Registo de chamadas
   - SMS
   - Uso de apps (special Settings permission)
   - Notification Listener (special Settings permission)
   - Overlay (SYSTEM_ALERT_WINDOW para botão SOS)
   - Histórico de browser
4. **Ligar / Desligar** — pede autorização de captura de ecrã (uma vez) e arranca o serviço. A partir daqui pode fechar a app.
5. **Proteção contra remoção** (opcional, Device Owner via adb).

## Instalação fácil (deep link + QR)

A app pode ser configurada automaticamente por:

### Opção A: QR code do painel
O painel web do ScreenPorter mostra um QR code que contém:
```json
{"server":"100.88.155.59:4820","user":"parent","token":"abc123","jurisdiction":"BR"}
```
O utilizador instala a app, abre, toca em "Ler QR code", aponta a câmara → tudo fica preenchido + o consentimento abre automaticamente com a jurisdição correta.

### Opção B: Deep link (e-mail/SMS/link)
Link `screenporter://setup?server=100.88.155.59:4820&user=parent&token=abc123&jurisdiction=BR` abre a app e configura tudo automaticamente.

### Opção C: Configuração manual
Preencher os 3 campos (servidor, utilizador, senha) + guardar.

## Eventos enviados via /api/agent/ingest

| Tipo              | Origem                            | Frequência         |
|-------------------|-----------------------------------|---------------------|
| `location`        | LocationManager GPS + NETWORK     | 30s ou 25m          |
| `call`            | CallLog (READ_CALL_LOG)          | 5 min               |
| `sms`             | SmsReporter (poll) + SmsReceiver (real-time) | 3 min + imediato |
| `app`             | UsageStatsManager (PACKAGE_USAGE_STATS) | 1 h          |
| `browser`         | Browser.BOOKMARKS_URI (READ_HISTORY_BOOKMARKS) | 10 min |
| `alert`           | NotificationListener (WhatsApp/IG/TikTok/Snapchat/Messenger) | em tempo real |
| `sos`             | Botão flutuante overlay          | on-demand (user click) |
| `consent`         | ConsentActivity (assina jurisdição + versão legal) | uma vez no setup |
| `installed_apps`  | (futuro: agente reporta lista)    | manual              |

O servidor Web (Next.js) recebe todos estes eventos via `/api/agent/ingest` com header `X-Agent-Token`.

## 3 modos de captura de ecrã

| Modo   | Captura                            | Permissões necessárias            | Persistente pós-reboot? |
|--------|------------------------------------|------------------------------------|--------------------------|
| VÍDEO  | MediaProjection → MediaCodec H.264 | MediaProjection (autorização do user) | Não (precisa re-autorizar) |
| ECRÃ   | takeScreenshot via Accessibility   | AccessibilityService (Android 11+) | **Sim**                  |
| CONTROLO | Sem captura (só relé)            | AccessibilityService               | **Sim**                  |

**Regra de escolha:** VÍDEO se há token de captura; senão ECRÃ se há Accessibility; senão CONTROLO.

## Permissões no AndroidManifest

**Standard runtime permissions:**
- `INTERNET`, `ACCESS_NETWORK_STATE`
- `FOREGROUND_SERVICE` (+ tipos: MEDIA_PROJECTION, SPECIAL_USE, LOCATION)
- `POST_NOTIFICATIONS` (Android 13+)
- `RECEIVE_BOOT_COMPLETED`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`
- `READ_CALL_LOG`, `READ_SMS`, `RECEIVE_SMS`, `READ_PHONE_STATE`
- `READ_HISTORY_BOOKMARKS`, `QUERY_ALL_PACKAGES`
- `SYSTEM_ALERT_WINDOW` (overlay para botão SOS)
- `CAMERA` (para QR scanner)

**Special permissions (Settings, não runtime):**
- `PACKAGE_USAGE_STATS` → `Settings.ACTION_USAGE_ACCESS_SETTINGS`
- `BIND_ACCESSIBILITY_SERVICE` → `Settings.ACTION_ACCESSIBILITY_SETTINGS`
- `BIND_NOTIFICATION_LISTENER_SERVICE` → `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`

## Como compilar

1. Abrir o projeto no Android Studio (Hedgehog 2023.1.1+ ou superior).
2. Aguardar a sincronização do Gradle (Gradle 8.11.1 + AGP 8.7.2 + Kotlin 2.0.21).
3. Conectar um telemóvel (debugging USB ativado) ou iniciar um emulador Android 11+.
4. **Build > Make Project** (`Ctrl+F9`) ou **Run > Run 'app'** (`Shift+F10`).

Pré-requisitos no PC de build:
- JDK 17
- Android SDK 35
- Android Studio Hedgehog (ou superior)

## Fluxo de utilização (1 minuto)

1. **No PC** — abrir o painel ScreenPorter no browser. Em Definições > Dispositivos, gerar um código de instalação (6 dígitos) e mostrar o QR.
2. **No telemóvel** — instalar o APK da Companion.
3. Abrir a app → tocar em **"Ler QR code"** → apontar a câmara ao QR do painel.
4. A app preenche servidor + utilizador + token automaticamente e abre o wizard de consentimento.
5. Selecionar jurisdição (pré-preenchida pelo QR) → marcar 3 checkboxes → **Assinar consentimento**.
6. Voltar ao ecrã principal → conceder as 5+ permissões essenciais (Acessibilidade, Bateria, Notificações, Localização, etc.).
7. Tocar em **Ligar** → conceder captura de ecrã → o serviço arranca em primeiro plano.
8. **(Opcional)** Tocar em **"Ativar botão SOS"** → conceder permissão de overlay → botão flutuante vermelho aparece.

A partir daqui, o painel mostra em tempo real: ecrã ao vivo, GPS no mapa, chamadas, SMS, apps, navegação, alertas sociais + botão SOS.

## Compromisso ético

A app **não** implementa:
- ❌ Modo oculto / esconder o ícone
- ❌ Keylogger
- ❌ Gravação de chamadas
- ❌ Interceção de mensagens privadas (só flags + snippets redigidos são enviados)
- ❌ Acesso à câmara/microfone para gravação

A fronteira contra software-espião é intencional e mantida.
