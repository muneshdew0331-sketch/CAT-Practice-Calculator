const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow = null;
let isCollapsed = false;
let logoAnchor = null;                // saved logo screen position (restore anchor)
let manualMovedSinceRestore = false;  // user manually dragged the open calculator since last restore
let suppressAnchorUpdate = false;     // true during programmatic setBounds calls

function createMainWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const scale = Math.min(
    1,
    screenWidth / 1440,
    screenHeight / 900
  );
  
  const windowWidth = Math.round(222 * scale);
  const windowHeight = Math.round(311 * scale);

  const x = Math.round((screenWidth - windowWidth) / 2);
  const y = Math.round((screenHeight - windowHeight) / 2);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    backgroundColor: '#ffffff'
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('move', () => {
    if (!isCollapsed && mainWindow && !suppressAnchorUpdate) {
      const b = mainWindow.getBounds();
      mainWindow._lastBounds = b;
      // A user dragging the open calculator is a deliberate new position:
      // it becomes the next restore anchor.
      logoAnchor = { x: b.x, y: b.y };
      manualMovedSinceRestore = true;
    }
  });

  mainWindow.on('resize', () => {
    if (!isCollapsed && mainWindow && !suppressAnchorUpdate) {
      mainWindow._lastBounds = mainWindow.getBounds();
    }
  });

  mainWindow.on('close', (e) => {
    if (isCollapsed) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function collapseToLogo() {
  if (!mainWindow || isCollapsed) return;

  isCollapsed = true;

  // Save the current calculator position and size
  const current = mainWindow.getBounds();
  mainWindow._lastBounds = current;

  // Decide where the logo should appear:
  // - If the calculator was manually dragged since the last restore, collapse
  //   the logo at the calculator's current position (a deliberate new spot).
  // - Otherwise return the logo to the saved logo anchor. On the very first
  //   collapse there is no anchor yet, so the calculator's position is used.
  let logoPosition;
  if (manualMovedSinceRestore || !logoAnchor) {
    logoPosition = { x: current.x, y: current.y };
    logoAnchor = logoPosition;
  } else {
    logoPosition = logoAnchor;
  }
  manualMovedSinceRestore = false;

  // Resize to a small logo window at the decided position
  mainWindow.setBounds({
    x: logoPosition.x,
    y: logoPosition.y,
    width: 55,
    height: 55
  });
   // Tell the calculator UI to switch to logo mode
   mainWindow.webContents.send('collapse');
}

function restoreFromLogo() {
  if (!mainWindow || !isCollapsed) return;

  isCollapsed = false;

  // Keep the responsive calculator size saved at collapse time
  const calcWidth = mainWindow._lastBounds ? (mainWindow._lastBounds.width || 350) : 350;
  const calcHeight = mainWindow._lastBounds ? (mainWindow._lastBounds.height || 450) : 450;

  // The logo's exact on-screen position is the restore anchor
  const logo = mainWindow.getBounds();
  logoAnchor = { x: logo.x, y: logo.y };

  // Prefer keeping the calculator's top-left at the logo position, but clamp
  // so the entire calculator fits inside the work area of the display the logo
  // is on (taskbar and other reserved areas are excluded by workArea). The
  // automatic shift must NOT replace the saved logo anchor.
  const display = screen.getDisplayMatching(logo);
  const workArea = display.workArea;
  const maxX = workArea.x + Math.max(0, workArea.width - calcWidth);
  const maxY = workArea.y + Math.max(0, workArea.height - calcHeight);
  const x = Math.max(workArea.x, Math.min(logo.x, maxX));
  const y = Math.max(workArea.y, Math.min(logo.y, maxY));

  suppressAnchorUpdate = true;
  mainWindow.setBounds({ x: x, y: y, width: calcWidth, height: calcHeight });
  suppressAnchorUpdate = false;

  mainWindow.show();
  manualMovedSinceRestore = false;

  // Send the restore event so the renderer removes the collapsed state
  mainWindow.webContents.send('restore');
}

function closeApp() {
  if (mainWindow) {
    mainWindow.close();
  }
  app.quit();
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for renderer communication
ipcMain.on('collapse-calculator', () => {
  collapseToLogo();
});

ipcMain.on('restore-calculator', () => {
  restoreFromLogo();
});

ipcMain.on('close-calculator', () => {
  closeApp();
});

ipcMain.on('move-window', (_event, x, y) => {
  if (mainWindow) {
    // While collapsed, dragging the logo makes its new position the restore anchor.
    // The logo's CENTER is the boundary: clamp it to the display bounds so the
    // center never crosses the screen edge. The logo may hang up to half its size
    // off an edge and a full half off both directions at a corner.
    if (isCollapsed) {
      const b = mainWindow.getBounds();
      const display = screen.getDisplayMatching({ x: Math.round(x), y: Math.round(y), width: 1, height: 1 });
      const bounds = display.bounds;
      const centerX = Math.max(bounds.x, Math.min(x + b.width / 2, bounds.x + bounds.width));
      const centerY = Math.max(bounds.y, Math.min(y + b.height / 2, bounds.y + bounds.height));
      x = centerX - b.width / 2;
      y = centerY - b.height / 2;
      logoAnchor = { x: Math.round(x), y: Math.round(y) };
    }
    const b = mainWindow.getBounds();
    mainWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: b.width, height: b.height });
    // Frameless Windows builds can drift the HWND size by 1px per programmatic move
    // on scaled displays; snap the logo back to its collapsed size when that happens.
    if (isCollapsed) {
      const a = mainWindow.getBounds();
      if (a.width > 56 || a.height > 56) {
        mainWindow.setBounds({ x: a.x, y: a.y, width: 55, height: 55 });
      }
    }
  }
});