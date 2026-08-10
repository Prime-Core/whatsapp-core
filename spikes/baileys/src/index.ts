/**
 * Spike TASK-019 — Chat funcional vía Baileys (número personal DESECHABLE).
 *
 * Objetivo: conectar por QR, recibir mensajes y responder "ping" -> "pong",
 * además de sondear capacidades básicas. Código desechable de validación.
 *
 * ⚠️ Usar solo con un número desechable. Baileys viola los ToS de WhatsApp.
 */
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import pino from 'pino'

// Logger silencioso para Baileys; usamos console.* para lo relevante del spike.
const logger = pino({ level: 'silent' })

// Carpeta donde se persiste la sesión (ignorada por git).
const AUTH_DIR = './auth'

// URL del webview de captura KYC (spike baileys-capture). Configurable por env.
// En WhatsApp el navegador embebido necesita HTTPS con cert válido (o self-signed aceptado).
const CAPTURE_URL = process.env.CAPTURE_URL ?? 'https://192.168.88.13:8443'

async function start(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version, isLatest } = await fetchLatestBaileysVersion()
  console.log(`[whatsapp-core] Baileys v${version.join('.')} (latest=${isLatest})`)

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('\n[whatsapp-core] Escaneá este QR con el WhatsApp del número DESECHABLE:\n')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      console.log('\n[whatsapp-core] ✅ Conectado. Enviá "ping" o "capturar" a este número para probar.\n')
      void probeCapabilities(sock)
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut
      console.log(
        `[whatsapp-core] ❌ Conexión cerrada (code=${statusCode}). ` +
          (loggedOut
            ? 'Sesión cerrada: borrá la carpeta ./auth y volvé a escanear.'
            : 'Reintentando conexión...'),
      )
      if (!loggedOut) void start()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue

      const from = msg.key.remoteJid ?? 'desconocido'
      const kind = Object.keys(msg.message)[0]
      const text =
        msg.message.conversation ??
        msg.message.extendedTextMessage?.text ??
        ''

      console.log(`[in]  ${from} | tipo=${kind} | texto="${text}"`)

      if (text.trim().toLowerCase() === 'ping') {
        await sock.sendMessage(from, { text: 'pong ✅ — whatsapp-core (spike Baileys)' })
        console.log(`[out] ${from} | "pong"`)
      }

      if (text.trim().toLowerCase() === 'capturar') {
        await sock.sendMessage(from, {
          text:
            '🪪 *Verificación de identidad*\n\n' +
            'Abrí este enlace para tomar la foto de tu cédula y completar el formulario.\n' +
            '🔒 Tus datos NO se guardan en WhatsApp.\n\n' +
            CAPTURE_URL,
        })
        console.log(`[out] ${from} | enlace de captura enviado`)
      }
    }
  })
}

/** Sondeo mínimo de capacidades para el reporte del spike. */
async function probeCapabilities(sock: WASocket): Promise<void> {
  console.log('[cap] usuario conectado:', sock.user?.id)
  try {
    const groups = await sock.groupFetchAllParticipating()
    console.log(`[cap] grupos en los que participa: ${Object.keys(groups).length}`)
  } catch {
    console.log('[cap] groupFetchAllParticipating: no disponible / error')
  }
}

start().catch((err) => {
  console.error('[whatsapp-core] Error fatal:', err)
  process.exit(1)
})
