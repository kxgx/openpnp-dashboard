import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import express from 'express'
import bodyParser from 'body-parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

// Status Server Function
function startStatusServer() {
  const serverApp = express()
  const PORT = 10064

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

  // Start the server
  httpServer = serverApp.listen(PORT, () => {
    console.log(`Machine Status API running on port ${PORT}`)
  })

  return serverApp
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
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
  // win.webContents.on('will-navigate', (event, url) => { }) #344

  // Start the status server
  startStatusServer()
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
  if (httpServer) {
    httpServer.close()
  }
})