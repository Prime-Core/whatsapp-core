/**
 * Test v6: Función sendInteractiveMessage propia que usa el pipeline
 * interno correcto de Baileys para enviar mensajes interactivos.
 */
import makeWASocket, {
  useMultiFileAuthState, fetchLatestBaileysVersion,
  DisconnectReason, proto, type WASocket, WAProto,
} from '@whiskeysockets/baileys'
import { generateWAMessageFromContent } from '@whiskeysockets/baileys/lib/Utils/messages'
import { generateMessageIDV2 } from '@whiskeysockets/baileys/lib/Utils/generics'
import pino from 'pino'
import qrcode from 'qrcode-terminal'

const TARGET = process.argv[2]
if (!TARGET) { console.error('Uso: npm run test-buttons +593999259153'); process.exit(1) }

const jid = TARGET.replace(/^\+/, '') + '@s.whatsapp.net'
const logger = pino({ level: 'silent' })
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Envía un mensaje con contenido interactivo (buttonsMessage, listMessage, etc.)
 * usando el pipeline interno de Baileys (generateWAMessageFromContent + relayMessage).
 */
async function sendInteractiveMessage(
  sock: WASocket,
  jid: string,
  buttonsMessage?: proto.Message.IButtonsMessage,
  listMessage?: proto.Message.IListMessage,
  templateMessage?: proto.Message.ITemplateMessage,
) {
  const meId = sock.user!.id

  // Construir el contenido del mensaje como proto.Message
  const content: proto.IMessage = {}
  if (buttonsMessage) content.buttonsMessage = buttonsMessage
  if (listMessage) content.listMessage = listMessage
  if (templateMessage) content.templateMessage = templateMessage

  // Crear el WebMessageInfo usando el mismo pipeline que sendMessage
  const fullMsg = generateWAMessageFromContent(jid, content, {
    userJid: meId,
    messageId: generateMessageIDV2(meId),
  })

  // Enviar via relayMessage (mismo que sendMessage usa internamente)
  await sock.relayMessage(jid, fullMsg.message!, { messageId: fullMsg.key.id! })
  return fullMsg.key.id!
}

let testRun = false

async function start(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({ version, auth: state, logger })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      console.log('\n📱 Escaneá el QR:\n')
      qrcode.generate(qr, { small: true })
      return
    }

    if (connection === 'open') {
      console.log('[test] ✅ Conectado como', sock.user?.name)
      if (testRun) return
      testRun = true

      // Verificación: sendMessage texto normal
      console.log('\n0/4 → sendMessage texto (verificación)')
      try {
        const s = await sock.sendMessage(jid, { text: '🧪 [DIAG] sendMessage funciona correctamente.' })
        console.log('   ✅', s?.key?.id)
      } catch (e: any) { console.log('   ❌', e.message); return }
      await wait(2000)

      // 1. ButtonsMessage
      console.log('1/4 → sendInteractiveMessage (buttonsMessage)')
      try {
        const id = await sendInteractiveMessage(sock, jid,
          {
            contentText: '¿Querés continuar con la verificación?',
            footerText: 'Tocá una opción',
            headerType: proto.Message.ButtonsMessage.HeaderType.EMPTY,
            buttons: [
              {
                buttonId: 'btn:si',
                buttonText: { displayText: '✅ Sí, continuar' },
                type: proto.Message.ButtonsMessage.Button.Type.RESPONSE,
              },
              {
                buttonId: 'btn:no',
                buttonText: { displayText: '❌ Ahora no' },
                type: proto.Message.ButtonsMessage.Button.Type.RESPONSE,
              },
            ],
          },
        )
        console.log('   ✅', id)
      } catch (e: any) { console.log('   ❌', e.message); console.error(e) }
      await wait(3000)

      // 2. ButtonsMessage con header de texto
      console.log('2/4 → sendInteractiveMessage (buttonsMessage + header texto)')
      try {
        const id = await sendInteractiveMessage(sock, jid,
          {
            text: '📌 Verificación de identidad',
            contentText: 'Seleccioná cómo capturar tu documento:',
            footerText: 'WhatsApp Business',
            headerType: proto.Message.ButtonsMessage.HeaderType.TEXT,
            buttons: [
              {
                buttonId: 'cap:camera',
                buttonText: { displayText: '📷 Cámara' },
                type: proto.Message.ButtonsMessage.Button.Type.RESPONSE,
              },
              {
                buttonId: 'cap:gallery',
                buttonText: { displayText: '📂 Galería' },
                type: proto.Message.ButtonsMessage.Button.Type.RESPONSE,
              },
              {
                buttonId: 'cap:skip',
                buttonText: { displayText: '⏭️ Omitir' },
                type: proto.Message.ButtonsMessage.Button.Type.RESPONSE,
              },
            ],
          },
        )
        console.log('   ✅', id)
      } catch (e: any) { console.log('   ❌', e.message); console.error(e) }
      await wait(3000)

      // 3. ListMessage
      console.log('3/4 → sendInteractiveMessage (listMessage)')
      try {
        const id = await sendInteractiveMessage(sock, jid,
          undefined,
          {
            title: 'Tipo de documento',
            description: 'Seleccioná el documento para verificación',
            footerText: 'WhatsApp Business',
            buttonText: '📋 Ver opciones',
            listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
            sections: [{
              title: 'Documentos de identidad',
              rows: [
                { title: 'Cédula', description: 'Ecuador', rowId: 'doc:cedula' },
                { title: 'Pasaporte', description: 'Extranjero', rowId: 'doc:pasaporte' },
              ],
            }],
          },
        )
        console.log('   ✅', id)
      } catch (e: any) { console.log('   ❌', e.message); console.error(e) }
      await wait(3000)

      // 4. TemplateMessage (CTA URL)
      console.log('4/4 → sendInteractiveMessage (templateMessage)')
      try {
        const id = await sendInteractiveMessage(sock, jid,
          undefined,
          undefined,
          {
            hydratedTemplate: {
              hydratedContentText: 'Abrí el formulario de captura.',
              hydratedFooterText: 'Enlace externo',
              hydratedButtons: [{
                urlButton: { displayText: '🔗 Abrir formulario', url: 'https://www.google.com' },
                index: 0,
              }],
            },
          },
        )
        console.log('   ✅', id)
      } catch (e: any) { console.log('   ❌', e.message); console.error(e) }

      console.log('\n✅ Pruebas enviadas. Revisá WhatsApp en', TARGET)
      await wait(5000)
      process.exit(0)
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('❌ Sesión cerrada. Borrá ./auth y volvé a correr.')
        process.exit(1)
      }
      console.log('[test] Reconectando (code=' + statusCode + ')...')
      void start()
    }
  })
}

start().catch(err => { console.error(err); process.exit(1) })
