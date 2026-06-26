import { createServer } from 'vite'
import { createServer as createHttpServer } from 'http'
import { resolve } from 'path'
import { networkInterfaces } from 'os'

function getLocalIP() {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return 'localhost'
}

async function start() {
  const localIP = getLocalIP()

  // Start Vite with HTTPS (basicSsl plugin handles cert generation)
  const vite = await createServer({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
  })
  await vite.listen(443)

  console.log('')
  console.log(`  ➜  HTTPS:   https://localhost/`)
  console.log(`  ➜  Network: https://${localIP}/`)

  // HTTP server on port 80 - redirect all to HTTPS
  const httpServer = createHttpServer((req, res) => {
    const host = req.headers.host?.split(':')[0] || 'localhost'
    res.writeHead(302, { Location: `https://${host}${req.url}` })
    res.end()
  })

  httpServer.listen(80, '0.0.0.0', () => {
    console.log(`  ➜  HTTP:    http://localhost/ → 302 → HTTPS`)
    console.log(`  ➜  Network: http://${localIP}/ → 302 → HTTPS`)
  })
}

start().catch(console.error)
