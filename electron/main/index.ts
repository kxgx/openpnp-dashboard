import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import express from 'express'
import bodyParser from 'body-parser'
import dgram from 'node:dgram'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Get local network IP (non-internal IPv4)
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

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let httpServer: ReturnType<typeof import('http').Server> | null = null
let discoverySocket: dgram.Socket | null = null
const DISCOVERY_PORT = 10065
const HTTP_PORT = 10064
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

// Status Server Function
function startStatusServer() {
  const serverApp = express()
  const PORT = HTTP_PORT

  // Middleware
  serverApp.use(bodyParser.json())

  // Single machine status object with optional fields
  let machineStatus = {
    done: 0,
    total: 0,
    nozzles: [{ id: "N1" }, { id: "N2" }],
    state: ''
  }

  // Flexible update endpoint
  serverApp.post('/update-status', (req, res) => {
    const { 
      done, 
      total, 
      nozzles: updatedNozzles,
      state
  } = req.body;

  // Update the nozzles while keeping existing nozzles intact
  if (updatedNozzles && Array.isArray(updatedNozzles)) {
      // Create a map for quick lookup of updated nozzle data by ID
      const updatedNozzlesMap = new Map(updatedNozzles.map(nozzle => [nozzle.id, nozzle]));
      
      // Update only the nozzles specified in the request body
      machineStatus.nozzles = machineStatus.nozzles.map(existingNozzle => {
          const updatedNozzle = updatedNozzlesMap.get(existingNozzle.id);
          return updatedNozzle ? { ...existingNozzle, ...updatedNozzle } : existingNozzle;
      });
  }

  // Update the rest of the fields
  machineStatus = {
      done: done ?? machineStatus.done,
      total: total ?? machineStatus.total,
      nozzles: machineStatus.nozzles, // Already updated above
      state: state ?? machineStatus.state
  };

    // Broadcast status update to renderer process
    if (win) {
      win.webContents.send('machine-status-updated', machineStatus)
    }

    res.json({
      message: 'Status updated successfully'
    })
  })

  // Get current status
  serverApp.get('/status', (req, res) => {
    res.json(machineStatus)
  })

  // Start the server on all interfaces
  httpServer = serverApp.listen(PORT, '0.0.0.0', () => {
    console.log(`Machine Status API running on port ${PORT}`)
  })

  return serverApp
}

// UDP Discovery Service - responds to broadcast discovery requests
function startDiscoveryService() {
  const localIP = getLocalIP()
  discoverySocket = dgram.createSocket('udp4')

  discoverySocket.on('message', (msg, rinfo) => {
    try {
      const request = JSON.parse(msg.toString())
      if (request.type === 'discover') {
        const response = JSON.stringify({ type: 'openpnp-dashboard', host: localIP, port: HTTP_PORT })
        discoverySocket!.send(response, rinfo.port, rinfo.address, (err) => {
          if (err) console.error('Discovery response error:', err)
        })
      }
    } catch { /* ignore malformed packets */ }
  })

  discoverySocket.bind(DISCOVERY_PORT, () => {
    console.log(`Discovery service listening on UDP ${DISCOVERY_PORT}`)
  })
}

async function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize; // Excludes taskbar area
  win = new BrowserWindow({
    title: 'Main window',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    width: width, // Set width to the full screen width
    height: height, // Set height to the full work area height
    frame: false,
    webPreferences: {
      preload,
    },
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    const localIP = getLocalIP()
    win?.webContents.send('main-process-message', new Date().toLocaleString())
    win?.webContents.send('connection-info', { host: localIP, httpPort: HTTP_PORT, discoveryPort: DISCOVERY_PORT })
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
  // win.webContents.on('will-navigate', (event, url) => { }) #344

  // Start the status server
  startStatusServer()
  // Start UDP discovery for remote OpenPnP instances
  startDiscoveryService()
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
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

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

// Optional: Add a handler to stop the server when the app is quitting
app.on('will-quit', () => {
  if (discoverySocket) {
    discoverySocket.close()
  }
  if (httpServer) {
    httpServer.close()
  }
})
