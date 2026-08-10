/**
 * One-shot sender: conecta con sesión existente, envía mensaje, reporta y sale.
 * Uso: npm run send +593999259153
 */
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import pino from 'pino'

const TARGET = process.argv[2] ?? process.env.ONE_SHOT_TARGET
const CAPTURE_URL = process.env.CAPTURE_URL ?? 'https://192.168.88.13:8443'

if (!TARGET) {
  console.error('Uso: npm run send +593999259153')
  process.exit(1)
}

// Baileys espera JID sin el "+"
const jid = TARGET.replace(/^\+/, '') + '@s.whatsapp.net'
const logger = pino({ level: 'silent' })

async function main() {
  const { state } = await useMultiFileAuthState('./auth')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({ version, auth: state, logger })

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('[send] Conectado. Enviando a', TARGET, '->', jid)

      const result = await sock.sendMessage(jid, {
        text:
          '🪪 *Verificación de identidad — whatsapp-core*\n\n' +
          'Abrí este enlace para tomar la foto de tu cédula y completar el formulario:\n\n' +
          CAPTURE_URL + '\n\n' +
          '🔒 Tus datos NO se guardan en WhatsApp. Van cifrados a nuestro backend.\n' +
          '⚠️ Aceptá la advertencia de certificado (es entorno de pruebas).\n\n' +
          'Fijate en la línea verde/naranja/roja si la cámara funciona dentro de WhatsApp.',
      })

      console.log('[send] ✅ Enviado. MessageID:', result?.key?.id ?? 'desconocido')
      console.log('[send] RemoteJid:', result?.key?.remoteJid ?? jid)
      await sock.logout()
      process.exit(0)
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode
      console.error('[send] ❌ Conexión cerrada (code=' + statusCode + ') antes de enviar.')
      process.exit(1)
    }
  })
}

main().catch((err) => {
  console.error('[send] Error:', err)
  process.exit(1)
})
