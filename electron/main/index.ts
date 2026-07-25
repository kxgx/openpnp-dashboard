import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { spawn, execSync, ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_BINARY = process.platform === 'win32' ? 'dashboard-server.exe' : 'dashboard-server'
const HTTP_PORT = 10064
const DISCOVERY_PORT = 10065

function getLocalIP(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

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

let win: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null
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

  win.webContents.on('did-finish-load', () => {
    const localIP = getLocalIP()
    win?.webContents.send('connection-info', {
      host: localIP,
      httpPort: HTTP_PORT,
      discoveryPort: DISCOVERY_PORT,
    })
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Start the C backend (auto-compile if binary missing)
  const serverPath = path.join(process.env.APP_ROOT, 'server', SERVER_BINARY)
  if (!existsSync(serverPath)) {
    console.log('[server] Binary not found, trying auto-compile...')
    try {
      const compileScript = path.join(process.env.APP_ROOT, 'build', 'compile-server.mjs')
      execSync(`node "${compileScript}"`, { stdio: 'inherit' })
    } catch {
      console.warn('[server] Auto-compile failed. Run `npm run build:server` manually.')
      console.warn('[server] Dashboard will show "未连接" until the server is started.')
      return
    }
  }

  serverProcess = spawn(serverPath, [], { stdio: 'pipe' })
  serverProcess.stdout?.on('data', (data) => console.log(`[server] ${data}`))
  serverProcess.stderr?.on('data', (data) => console.error(`[server] ${data}`))
  serverProcess.on('error', (err) => console.error('Failed to start server:', err))
  serverProcess.on('exit', (code) => console.log(`Server exited with code ${code}`))
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

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
})
