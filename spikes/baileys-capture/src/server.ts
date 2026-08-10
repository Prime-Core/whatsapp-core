/**
 * Spike KYC — Webview de captura (HTTPS self-signed).
 *
 * Principio de protección de datos: la cámara y el formulario viven en ESTE servidor
 * (no en WhatsApp). WhatsApp solo transporta el enlace. Las imágenes llegan al backend
 * y en este PoC NO se persisten (se registran metadatos y se descartan).
 */
import express from 'express'
import https from 'node:https'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import selfsigned from 'selfsigned'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 8443)
const PORT_HTTP = Number(process.env.PORT_HTTP ?? 8080)

function getLanIp(): string {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return '127.0.0.1'
}

const lanIp = getLanIp()

// Certificado self-signed en memoria (válido para localhost + IP de LAN).
const pems = selfsigned.generate([{ name: 'commonName', value: lanIp }], {
  days: 365,
  keySize: 2048,
  algorithm: 'sha256',
  extensions: [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
        { type: 7, ip: lanIp },
      ],
    },
  ],
})

const app = express()
app.use(express.json({ limit: '30mb' }))
app.use(express.static(path.join(__dirname, '..', 'public')))

const kb = (s?: string): number =>
  typeof s === 'string' ? Math.round((s.length * 0.75) / 1024) : 0

app.post('/api/capture', (req, res) => {
  const { session, form, cedulaFront, cedulaBack, selfie } = req.body ?? {}

  const summary = {
    receivedAt: new Date().toISOString(),
    session: session ?? null,
    form: form ?? null,
    images: {
      cedulaFront: `${kb(cedulaFront)} KB`,
      cedulaBack: `${kb(cedulaBack)} KB`,
      selfie: `${kb(selfie)} KB`,
    },
  }

  // ⚠️ PoC: NO se almacena nada. Solo log de metadatos (sin imágenes) y se descarta.
  // Aquí, en el módulo real, se llamaría a la API biométrica REST y al servicio de firma.
  console.log('[capture] recibido:', JSON.stringify(summary, null, 2))

  res.json({
    ok: true,
    ...summary,
    note: 'Recibido en el backend y descartado (PoC, sin almacenamiento). WhatsApp nunca vio estos datos.',
  })
})

https
  .createServer({ key: pems.private, cert: pems.cert }, app)
  .listen(PORT, () => {
    console.log('\n[whatsapp-core] Webview de captura KYC')
    console.log(`  HTTPS Local:  https://localhost:${PORT}`)
    console.log(`  HTTPS LAN:    https://${lanIp}:${PORT}   <-- abrí esta en el teléfono (misma wifi)`)
    console.log('  Aceptá la advertencia de certificado self-signed para habilitar la cámara.')
  })

// HTTP solo en localhost: es "contexto seguro" para el navegador, la cámara funciona
// sin certificado. Útil para pruebas automatizadas (MCP) y en la PC.
http.createServer(app).listen(PORT_HTTP, () => {
  console.log(`  HTTP  Local:  http://localhost:${PORT_HTTP}  (para pruebas en PC/MCP)\n`)
})
