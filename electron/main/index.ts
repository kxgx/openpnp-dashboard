import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'
import express from 'express'
import dgram from 'node:dgram'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HTTP_PORT = 10064
const DISCOVERY_PORT = 10065

// ---- File logger (for packaged app without console) ----
let logFile: string | null = null
function log(msg: string) {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${msg}\n`
  if (logFile) {
    try { fs.appendFileSync(logFile, line, 'utf-8') } catch {}
  }
  process.stdout.write(line)
}

function initLogger() {
  try {
    const dir = path.join(app.getPath('userData'), 'logs')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    logFile = path.join(dir, 'dashboard.log')
    log('========================================')
    log('OpenPnP Dashboard started')
    log(`Log file: ${logFile}`)
  } catch (e) {
    try {
      logFile = path.join(process.cwd(), 'dashboard.log')
      log(`Log fallback: ${logFile}`)
    } catch {}
  }
}

// ---- In-memory machine status (same structure as C backend) ----
interface Nozzle {
  id: string
  isPicking: boolean
  isPlacing: boolean
  isVacActive: boolean
  hasComponent: boolean
}

interface MachineStatus {
  done: number
  total: number
  nozzles: Nozzle[]
  state: string
}

const status: MachineStatus = {
  done: 0,
  total: 0,
  nozzles: [
    { id: 'N1', isPicking: false, isPlacing: false, isVacActive: false, hasComponent: false },
    { id: 'N2', isPicking: false, isPlacing: false, isVacActive: false, hasComponent: false },
  ],
  state: '',
}

// ---- UDP Discovery ----
function startDiscovery(localIP: string) {
  const server = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  server.bind(DISCOVERY_PORT, '0.0.0.0', () => {
    log(`UDP discovery on 0.0.0.0:${DISCOVERY_PORT} (host: ${localIP})`)
  })
  server.on('error', (err) => {
    log(`[Network] UDP discovery error: ${err.message || err}`)
  })
  server.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString())
      if (data.type === 'discover') {
        const response = JSON.stringify({
          type: 'openpnp-dashboard',
          host: localIP,
          port: HTTP_PORT,
        })
        server.send(response, rinfo.port, rinfo.address)
        log(`UDP discover from ${rinfo.address}:${rinfo.port} → responded with ${localIP}:${HTTP_PORT}`)
      }
    } catch { /* ignore malformed packets */ }
  })
}

// ---- HTTP Server ----
function startHttpServer(localIP: string) {
  const app = express()
  app.use(express.json())

  // CORS
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    next()
  })
  app.options('*', (_req, res) => res.sendStatus(204))

  // GET /status
  app.get('/status', (_req, res) => {
    res.json(status)
  })

  // POST /update-status
  app.post('/update-status', (req, res) => {
    const body = req.body
    if (body.done !== undefined) status.done = body.done
    if (body.total !== undefined) status.total = body.total
    if (body.state !== undefined) status.state = body.state
    if (body.nozzles) {
      for (const n of body.nozzles) {
        const existing = status.nozzles.find(s => s.id === n.id)
        if (!existing) continue
        if (n.isPicking !== undefined) existing.isPicking = n.isPicking
        if (n.isPlacing !== undefined) existing.isPlacing = n.isPlacing
        if (n.isVacActive !== undefined) existing.isVacActive = n.isVacActive
        if (n.hasComponent !== undefined) existing.hasComponent = n.hasComponent
      }
    }
    // Push update to renderer via IPC
    win?.webContents.send('machine-status-updated', { ...status })
    res.json({ message: 'Status updated successfully' })
    log(`POST /update-status state=${status.state} done=${status.done}/${status.total}`)
  })

  app.listen(HTTP_PORT, '0.0.0.0', () => {
    log(`HTTP server on 0.0.0.0:${HTTP_PORT} (host: ${localIP})`)
  }).on('error', (err) => {
    log(`[Network] HTTP server error: ${err.message || err}`)
  })
}

// ---- Helpers ----

function getLocalIP(): string {
  const interfaces = os.networkInterfaces()
  const candidates: { name: string; address: string }[] = []

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ name, address: iface.address })
      }
    }
  }

  if (candidates.length === 0) return '127.0.0.1'

  // Skip virtual / tunnel adapters (Hyper-V, VMware, VirtualBox, VPN, WSL, etc.)
  const virtualPatterns = ['hyper-v', 'vmware', 'virtualbox', 'v ethernet', 'vpn', 'tunnel', 'wsl', 'docker', 'pseudo']
  const real = candidates.filter(c => !virtualPatterns.some(p => c.name.toLowerCase().includes(p)))

  const chosen = real.length > 0 ? real[0] : candidates[0]
  log(`[Network] Using IP: ${chosen.address} (${chosen.name}), all candidates: ${candidates.map(c => `${c.name}=${c.address}`).join(', ')}`)
  return chosen.address
}

// ---- Electron App ----

process.env.APP_ROOT = path.join(__dirname, '../..')
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// Initialize file logger for packaged app
initLogger()

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize

  win = new BrowserWindow({
    title: 'Main window',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    width,
    height,
    frame: false,
    webPreferences: { preload },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  const localIP = getLocalIP()

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('connection-info', {
      host: localIP,
      httpPort: HTTP_PORT,
      discoveryPort: DISCOVERY_PORT,
    })
    // Send initial status
    win?.webContents.send('machine-status-updated', { ...status })
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Start networking services
  try {
    startHttpServer(localIP)
  } catch (err: any) {
    log(`[Network] HTTP server failed to start: ${err.message || err}`)
  }
  try {
    startDiscovery(localIP)
  } catch (err: any) {
    log(`[Network] UDP discovery failed to start: ${err.message || err}`)
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: { preload },
  })
  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})
