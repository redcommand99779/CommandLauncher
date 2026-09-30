const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const AdmZip = require('adm-zip');
const { autoUpdater } = require('electron-updater');
const { microsoftLogin, getValidAccount, logout } = require('./auth');
const { launchMinecraft } = require('./customLaunch');

const isDev = process.env.NODE_ENV === 'development';

// Minimal .env loader (no dotenv dependency): keeps the CurseForge API key out
// of the public source tree while still shipping with the packaged app.
function loadEnvFile(envPath) {
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {}
}
loadEnvFile(path.join(__dirname, '.env'));

const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || '';
const CURSEFORGE_GAME_ID = 432;
const CURSEFORGE_CLASS_IDS = { mod: 6, resourcepack: 12, shader: 6552, datapack: 6945, modpack: 4471 };
const CURSEFORGE_LOADER_IDS = { Fabric: 4, Forge: 1, Quilt: 5, NeoForge: 6 };

// ── Paths ────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(app.getPath('userData'), 'CommandLauncher');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const VERSIONS_DIR = path.join(DATA_DIR, 'versions');

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(PROFILES_DIR);
fs.ensureDirSync(VERSIONS_DIR);

const APP_ICON_PATH = path.join(__dirname, '../../assets/icon.png');

let mainWindow;
let logWindow = null;
const runningProcesses = new Map(); // profileId -> child process

function setProfileRunning(profileId, running) {
  if (running) runningProcesses.set(profileId, true);
  else runningProcesses.delete(profileId);
  mainWindow?.webContents.send('process:status', { profileId, running });
}

function openLogWindow(title) {
  return new Promise((resolve) => {
    if (logWindow && !logWindow.isDestroyed()) {
      logWindow.webContents.send('log:clear');
      logWindow.webContents.send('log:title', title);
      logWindow.focus();
      return resolve(logWindow);
    }
    logWindow = new BrowserWindow({
      width: 640,
      height: 420,
      title,
      backgroundColor: '#0f1117',
      icon: APP_ICON_PATH,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'logWindowPreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    logWindow.loadFile(path.join(__dirname, 'logWindow.html'));
    logWindow.webContents.once('did-finish-load', () => {
      logWindow.webContents.send('log:title', title);
      resolve(logWindow);
    });
    logWindow.on('closed', () => { logWindow = null; });
  });
}

function sendLog(msg, type = 'info') {
  console.log(`[log:${type}]`, msg);
  if (logWindow && !logWindow.isDestroyed()) logWindow.webContents.send('log:line', { message: msg, type });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f1117',
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../build/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── Auto-Update (GitHub Releases via electron-builder/electron-updater) ────
function setupAutoUpdater() {
  if (isDev) return; // no packaged app / no update feed to check against

  const send = (status, extra = {}) => mainWindow?.webContents.send('update:status', { status, ...extra });

  autoUpdater.autoDownload = true;
  autoUpdater.on('update-available', (info) => send('available', { version: info.version }));
  autoUpdater.on('download-progress', (p) => send('downloading', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send('ready', { version: info.version }));
  autoUpdater.on('error', (err) => console.error('[autoUpdater]', err));

  autoUpdater.checkForUpdates().catch(err => console.error('[autoUpdater]', err));
}

ipcMain.handle('update:installNow', () => {
  autoUpdater.quitAndInstall();
});

// ── Auth ─────────────────────────────────────────────────────────────────
ipcMain.handle('auth:microsoftLogin', async () => {
  try {
    return await microsoftLogin();
  } catch (e) {
    throw new Error(e.message);
  }
});

ipcMain.handle('auth:getAccount', async () => {
  return await getValidAccount();
});

ipcMain.handle('auth:logout', () => {
  logout();
  return { success: true };
});

// ── Window Controls ──────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow.close());

// ── Profile Management ───────────────────────────────────────────────────
ipcMain.handle('profiles:list', () => {
  try {
    const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, f), 'utf8')); }
      catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
});

ipcMain.handle('profiles:save', (_, profile) => {
  const filePath = path.join(PROFILES_DIR, `${profile.id}.json`);
  const profileDir = path.join(PROFILES_DIR, profile.id);
  const worldsDir = path.join(profileDir, 'saves');
  fs.ensureDirSync(profileDir);
  fs.ensureDirSync(worldsDir);
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
  return { success: true, profile };
});

ipcMain.handle('profiles:delete', (_, profileId) => {
  const filePath = path.join(PROFILES_DIR, `${profileId}.json`);
  const profileDir = path.join(PROFILES_DIR, profileId);
  if (fs.existsSync(filePath)) fs.removeSync(filePath);
  if (fs.existsSync(profileDir)) fs.removeSync(profileDir);
  return { success: true };
});

ipcMain.handle('profiles:getWorlds', (_, profileId) => {
  const savesDir = path.join(PROFILES_DIR, profileId, 'saves');
  fs.ensureDirSync(savesDir);
  try {
    return fs.readdirSync(savesDir).filter(f =>
      fs.statSync(path.join(savesDir, f)).isDirectory()
    ).map(f => ({ name: f }));
  } catch { return []; }
});

ipcMain.handle('profiles:openFolder', (_, profileId) => {
  const profileDir = path.join(PROFILES_DIR, profileId);
  fs.ensureDirSync(profileDir);
  shell.openPath(profileDir);
  return { success: true };
});

ipcMain.handle('profiles:getMods', (_, profileId, subFolder = 'mods') => {
  const dir = path.join(PROFILES_DIR, profileId, subFolder);
  fs.ensureDirSync(dir);
  try {
    return fs.readdirSync(dir)
      .filter(f => !fs.statSync(path.join(dir, f)).isDirectory())
      .map(f => ({ filename: f, size: fs.statSync(path.join(dir, f)).size, subFolder }));
  } catch { return []; }
});

ipcMain.handle('profiles:isRunning', (_, profileId) => runningProcesses.has(profileId));
ipcMain.handle('profiles:listRunning', () => [...runningProcesses.keys()]);

// ── Minecraft Versions ───────────────────────────────────────────────────
ipcMain.handle('versions:list', async () => {
  const manifestPath = path.join(VERSIONS_DIR, 'version_manifest.json');
  const ONE_HOUR = 60 * 60 * 1000;
  const needsRefresh = !fs.existsSync(manifestPath) ||
    (Date.now() - fs.statSync(manifestPath).mtimeMs > ONE_HOUR);

  if (needsRefresh) {
    try {
      const data = await httpGet('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
      fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2));
      return data;
    } catch (e) {
      if (fs.existsSync(manifestPath)) return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return { versions: [], latest: {} };
    }
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
});

// ── Modrinth API ─────────────────────────────────────────────────────────
ipcMain.handle('modrinth:search', async (_, { query, gameVersion, loaders, limit = 20, offset = 0, projectType = 'mod' }) => {
  const facets = [[`project_type:${projectType}`]];
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (loaders && loaders.length && projectType === 'mod') facets.push(loaders.map(l => `categories:${l}`));
  const params = new URLSearchParams({
    query: query || '',
    facets: JSON.stringify(facets),
    limit: String(limit),
    offset: String(offset),
    index: 'downloads',
  });
  return await httpGet(`https://api.modrinth.com/v2/search?${params}`, {
    'User-Agent': 'CommandLauncher/1.0.0 (github.com/commandlauncher)',
  });
});

ipcMain.handle('modrinth:getVersions', async (_, { projectId, gameVersion, loaders }) => {
  const params = new URLSearchParams();
  if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]));
  if (loaders && loaders.length) params.set('loaders', JSON.stringify(loaders));
  return await httpGet(`https://api.modrinth.com/v2/project/${projectId}/version?${params}`, {
    'User-Agent': 'CommandLauncher/1.0.0',
  });
});

ipcMain.handle('modrinth:downloadMod', async (_, { url, filename, profileId, subFolder = 'mods' }) => {
  const destDir = path.join(PROFILES_DIR, profileId, subFolder);
  fs.ensureDirSync(destDir);
  const destPath = path.join(destDir, filename);
  try {
    await downloadFile(url, destPath);
    return { success: true, path: destPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('modrinth:removeMod', (_, { filename, profileId, subFolder = 'mods' }) => {
  const filePath = path.join(PROFILES_DIR, profileId, subFolder, filename);
  if (fs.existsSync(filePath)) fs.removeSync(filePath);
  return { success: true };
});

// ── CurseForge API ───────────────────────────────────────────────────────
function curseforgeGet(pathAndQuery) {
  return httpGet(`https://api.curseforge.com${pathAndQuery}`, {
    'x-api-key': CURSEFORGE_API_KEY,
    'Accept': 'application/json',
  });
}

async function curseforgeGetFilesBulk(fileIds) {
  if (!fileIds.length) return [];
  const res = await httpPostJson('https://api.curseforge.com/v1/mods/files', {
    'x-api-key': CURSEFORGE_API_KEY,
    'Accept': 'application/json',
  }, { fileIds });
  return res.data || [];
}

ipcMain.handle('curseforge:search', async (_, { query, gameVersion, modLoader, limit = 20, offset = 0, projectType = 'mod' }) => {
  const classId = CURSEFORGE_CLASS_IDS[projectType] || 6;
  const params = new URLSearchParams({
    gameId: String(CURSEFORGE_GAME_ID),
    classId: String(classId),
    searchFilter: query || '',
    pageSize: String(limit),
    index: String(offset),
    sortField: '2',
    sortOrder: 'desc',
  });
  if (gameVersion) params.set('gameVersion', gameVersion);
  if (modLoader && projectType === 'mod' && CURSEFORGE_LOADER_IDS[modLoader]) {
    params.set('modLoaderType', String(CURSEFORGE_LOADER_IDS[modLoader]));
  }
  const res = await curseforgeGet(`/v1/mods/search?${params}`);
  return {
    hits: (res.data || []).map(m => ({
      project_id: String(m.id),
      slug: m.slug,
      title: m.name,
      description: m.summary,
      icon_url: m.logo?.thumbnailUrl,
      downloads: m.downloadCount,
      categories: (m.categories || []).map(c => c.name),
    })),
    total_hits: res.pagination?.totalCount || 0,
  };
});

ipcMain.handle('curseforge:getFiles', async (_, { modId, gameVersion, modLoader }) => {
  const params = new URLSearchParams({ pageSize: '20' });
  if (gameVersion) params.set('gameVersion', gameVersion);
  if (modLoader && CURSEFORGE_LOADER_IDS[modLoader]) params.set('modLoaderType', String(CURSEFORGE_LOADER_IDS[modLoader]));
  const res = await curseforgeGet(`/v1/mods/${modId}/files?${params}`);
  return (res.data || []).map(f => ({ id: f.id, fileName: f.fileName, downloadUrl: f.downloadUrl }));
});

ipcMain.handle('curseforge:downloadFile', async (_, { url, filename, profileId, subFolder = 'mods' }) => {
  if (!url) return { success: false, error: 'No download link available for this file (author disabled 3rd-party downloads)' };
  const destDir = path.join(PROFILES_DIR, profileId, subFolder);
  fs.ensureDirSync(destDir);
  const destPath = path.join(destDir, filename);
  try {
    await downloadFile(url, destPath);
    return { success: true, path: destPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('curseforge:installModpack', async (_, { modId, fileId, packName, ram }) => {
  await openLogWindow(`Installing modpack "${packName}"...`);
  const send = sendLog;

  const tmpDir = path.join(app.getPath('temp'), `command-launcher-cfpack-${Date.now()}`);
  fs.ensureDirSync(tmpDir);

  try {
    send('Fetching modpack file info...');
    const [fileInfo] = await curseforgeGetFilesBulk([fileId]);
    if (!fileInfo?.downloadUrl) throw new Error('No download link available for this modpack file');

    const packZipPath = path.join(tmpDir, fileInfo.fileName);
    send(`Downloading modpack "${packName}"...`);
    await downloadFile(fileInfo.downloadUrl, packZipPath);

    send('Extracting modpack...');
    const extractDir = path.join(tmpDir, 'extracted');
    new AdmZip(packZipPath).extractAllTo(extractDir, true);

    const manifestPath = path.join(extractDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('manifest.json is missing from the modpack');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const gameVersion = manifest.minecraft?.version;
    if (!gameVersion) throw new Error('No Minecraft version specified in the modpack');
    const loaderEntry = (manifest.minecraft?.modLoaders || []).find(l => l.primary) || manifest.minecraft?.modLoaders?.[0];
    let modLoader = 'Vanilla';
    if (loaderEntry?.id?.startsWith('fabric-')) modLoader = 'Fabric';
    else if (loaderEntry?.id?.startsWith('forge-')) modLoader = 'Forge';
    else if (loaderEntry?.id?.startsWith('quilt-')) modLoader = 'Quilt';
    else if (loaderEntry?.id?.startsWith('neoforge-')) modLoader = 'NeoForge';

    const profileId = uuidv4();
    const profileDir = path.join(PROFILES_DIR, profileId);
    fs.ensureDirSync(path.join(profileDir, 'saves'));

    const entries = manifest.files || [];
    send(`Resolving download links for ${entries.length} mods...`);
    const fileIds = entries.map(f => f.fileID);
    const resolvedFiles = [];
    for (let i = 0; i < fileIds.length; i += 50) {
      resolvedFiles.push(...(await curseforgeGetFilesBulk(fileIds.slice(i, i + 50))));
    }
    const byId = new Map(resolvedFiles.map(f => [f.id, f]));

    const modsDir = path.join(profileDir, 'mods');
    fs.ensureDirSync(modsDir);
    let completed = 0;
    await runWithConcurrency(entries, 8, async (entry) => {
      const f = byId.get(entry.fileID);
      if (!f?.downloadUrl) { send(`Skipping mod without download link (fileID ${entry.fileID})`, 'info'); return; }
      const destPath = path.join(modsDir, f.fileName);
      await downloadFile(f.downloadUrl, destPath);
      completed++;
      send(`Mod ${completed}/${entries.length}: ${f.fileName}`);
    });

    const src = path.join(extractDir, manifest.overrides || 'overrides');
    if (fs.existsSync(src)) fs.copySync(src, profileDir);

    const profile = {
      id: profileId,
      name: packName,
      gameVersion,
      modLoader,
      ram: ram || 4,
      icon: '🗂',
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(PROFILES_DIR, `${profileId}.json`), JSON.stringify(profile, null, 2));

    if (modLoader !== 'Vanilla') {
      await prepareLoaderForProfile(profile, send);
    }

    send(`Modpack "${packName}" installed as a new profile.`, 'success');
    return { success: true, profile };
  } catch (e) {
    console.error('[cf-modpack:error]', e);
    send(`Error: ${e.message}`, 'error');
    return { success: false, error: e.message };
  } finally {
    fs.removeSync(tmpDir);
  }
});

// Installs the profile's mod loader (if any) and returns the launch-relevant
// identifiers. Shared by profiles:prepareLoader (run at profile save time, so
// "Play" launches instantly) and minecraft:launch (safety-net fallback in
// case the upfront prepare step never ran or its result went missing).
async function prepareLoaderForProfile(profile, send) {
  const vanillaMcDir = path.join(app.getPath('appData'), '.minecraft');
  const loaderName = profile.modLoader || 'Vanilla';
  let versionId = profile.gameVersion;
  let forgeInstallerPath = null;

  if (loaderName === 'Fabric' || loaderName === 'Quilt') {
    versionId = await installFabricLike(profile.gameVersion, loaderName, vanillaMcDir, send);
  } else if (loaderName === 'Forge' || loaderName === 'NeoForge') {
    forgeInstallerPath = await installForgeLike(profile.gameVersion, loaderName, send);
  }

  return { vanillaMcDir, versionId, forgeInstallerPath };
}

// ── Mod Loader Setup (runs when a profile is created/edited) ───────────────
ipcMain.handle('profiles:prepareLoader', async (_, { profile }) => {
  const loaderName = profile.modLoader || 'Vanilla';
  if (loaderName === 'Vanilla') return { success: true };

  await openLogWindow('Preparing mod loader...');
  try {
    await prepareLoaderForProfile(profile, sendLog);
    sendLog(`${loaderName} is ready.`, 'success');
    return { success: true };
  } catch (e) {
    console.error('[prepare:error]', e);
    sendLog(`${loaderName} installation failed: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
});

// ── Modpack Installation (.mrpack) ──────────────────────────────────────────
ipcMain.handle('modrinth:installModpack', async (_, { url, filename, packName, ram }) => {
  await openLogWindow(`Installing modpack "${packName}"...`);
  const send = sendLog;

  const tmpDir = path.join(app.getPath('temp'), `command-launcher-mrpack-${Date.now()}`);
  fs.ensureDirSync(tmpDir);

  try {
    const mrpackPath = path.join(tmpDir, filename);
    send(`Downloading modpack "${packName}"...`);
    await downloadFile(url, mrpackPath);

    send('Extracting modpack...');
    const extractDir = path.join(tmpDir, 'extracted');
    new AdmZip(mrpackPath).extractAllTo(extractDir, true);

    const manifestPath = path.join(extractDir, 'modrinth.index.json');
    if (!fs.existsSync(manifestPath)) throw new Error('modrinth.index.json is missing from the modpack');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const gameVersion = manifest.dependencies?.minecraft;
    if (!gameVersion) throw new Error('No Minecraft version specified in the modpack');
    let modLoader = 'Vanilla';
    if (manifest.dependencies?.['fabric-loader']) modLoader = 'Fabric';
    else if (manifest.dependencies?.['quilt-loader']) modLoader = 'Quilt';
    else if (manifest.dependencies?.forge) modLoader = 'Forge';
    else if (manifest.dependencies?.neoforge) modLoader = 'NeoForge';

    const profileId = uuidv4();
    const profileDir = path.join(PROFILES_DIR, profileId);
    fs.ensureDirSync(path.join(profileDir, 'saves'));

    const files = manifest.files || [];
    let completed = 0;
    await runWithConcurrency(files, 8, async (f) => {
      const dlUrl = f.downloads?.[0];
      if (!dlUrl) return;
      const destPath = path.join(profileDir, f.path);
      fs.ensureDirSync(path.dirname(destPath));
      await downloadFile(dlUrl, destPath);
      completed++;
      send(`Mod ${completed}/${files.length}: ${path.basename(f.path)}`);
    });

    for (const overridesFolder of ['overrides', 'client-overrides']) {
      const src = path.join(extractDir, overridesFolder);
      if (fs.existsSync(src)) fs.copySync(src, profileDir);
    }

    const profile = {
      id: profileId,
      name: packName,
      gameVersion,
      modLoader,
      ram: ram || 4,
      icon: '🗂',
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(PROFILES_DIR, `${profileId}.json`), JSON.stringify(profile, null, 2));

    if (modLoader !== 'Vanilla') {
      await prepareLoaderForProfile(profile, send);
    }

    send(`Modpack "${packName}" installed as a new profile.`, 'success');
    return { success: true, profile };
  } catch (e) {
    console.error('[modpack:error]', e);
    send(`Error: ${e.message}`, 'error');
    return { success: false, error: e.message };
  } finally {
    fs.removeSync(tmpDir);
  }
});

// ── Launch Minecraft ─────────────────────────────────────────────────────
ipcMain.handle('minecraft:launch', async (_, { profile }) => {
  if (runningProcesses.has(profile.id)) {
    return { success: false, error: 'A session is already running for this profile.' };
  }

  await openLogWindow('Launching Minecraft...');
  const send = sendLog;

  try {
    const profileDir = path.join(PROFILES_DIR, profile.id);
    const savesDir = path.join(profileDir, 'saves');
    fs.ensureDirSync(savesDir);

    send(`Loading Minecraft ${profile.gameVersion}...`);

    const account = await getValidAccount();
    if (!account) {
      send('No valid account – please sign in again.', 'error');
      return { success: false, error: 'Not signed in' };
    }
    send(`Account: ${account.username} (${account.uuid})`);

    const ramMb = (profile.ram || 4) * 1024;

    let javaPath;
    try {
      javaPath = await resolveJavaPath(profile.gameVersion, send);
    } catch (e) {
      send(`No suitable Java installation available: ${e.message}`, 'error');
      return { success: false, error: 'Java not available' };
    }
    send(`Java ready: ${javaPath}`, 'success');

    const loaderName = profile.modLoader || 'Vanilla';
    let vanillaMcDir, versionId, forgeInstallerPath;

    try {
      ({ vanillaMcDir, versionId, forgeInstallerPath } = await prepareLoaderForProfile(profile, send));
    } catch (e) {
      send(`${loaderName} installation failed: ${e.message}`, 'error');
      return { success: false, error: e.message };
    }

    const auth = {
      access_token: account.accessToken,
      client_token: account.uuid,
      uuid: account.uuid,
      name: account.username,
      user_properties: '{}',
      meta: { type: 'msa' },
    };

    const opts = {
      authorization: auth,
      root: vanillaMcDir,
      version: {
        number: profile.gameVersion,
        type: 'release',
        custom: versionId !== profile.gameVersion ? versionId : undefined,
      },
      memory: {
        max: `${ramMb}M`,
        min: '512M',
      },
      overrides: {
        gameDirectory: profileDir,
      },
      javaPath,
      forge: forgeInstallerPath || undefined,
      customArgs: [
        // Nothing writes a JVM crash log with the default settings when this
        // profile's game crashes (0xC0000005), so force one to a known,
        // predictable path we can actually read afterward instead of guessing.
        `-XX:ErrorFile=${path.join(profileDir, 'hs_err_pid%p.log')}`,
        '-XX:+CreateMinidumpOnCrash',
        // Java 24+ (JEP 472) warns on every native/JNI call libraries like LWJGL
        // make without this flag, and our logs show exactly that warning firing
        // right before the crash. Official launchers set this themselves for
        // their bundled runtimes; ours needs to opt in explicitly too.
        '--enable-native-access=ALL-UNNAMED',
      ],
    };

    // Minimize our own GPU-accelerated window before spawning the game process:
    // it's been crashing intermittently on OpenGL/SDL init with an access violation
    // that a reference launcher (CurseForge) never hits, and GPU context contention
    // between two concurrently-compositing processes is a plausible, testable cause.
    mainWindow?.minimize();

    const { proc } = await launchMinecraft(opts, (emitter) => {
      emitter.on('debug', (e) => send(e, 'info'));
      emitter.on('data', (e) => send(e, 'info'));
      emitter.on('progress', (e) => {
        if (e.task && e.total) send(`${e.type}: ${e.task}/${e.total}`, 'info');
      });
      emitter.on('close', (code) => {
        send(`Minecraft exited (code ${code})`, 'info');
        setProfileRunning(profile.id, false);
      });
    });

    if (!proc) {
      send('Launch failed: no process started.', 'error');
      return { success: false, error: 'launch() returned no process' };
    }

    setProfileRunning(profile.id, true);
    send('Minecraft launched.', 'success');
    return { success: true };
  } catch (e) {
    console.error('[launch:error]', e);
    send(`Error: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const opts = { headers: { 'User-Agent': 'CommandLauncher/1.0.0', ...headers } };
    const req = mod.get(url, opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location, headers));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function httpPostJson(url, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const body = JSON.stringify(bodyObj);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
    };
    const req = mod.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    mod.get(url, { headers: { 'User-Agent': 'CommandLauncher/1.0.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); return resolve(downloadFile(res.headers.location, dest));
      }
      if (res.statusCode >= 400) {
        file.close(); fs.removeSync(dest); return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', e => { fs.removeSync(dest); reject(e); });
  });
}

// Runs `worker` over `items` with at most `concurrency` in flight at once,
// instead of either fully sequential (slow) or all-at-once (can overwhelm
// the network/API with hundreds of simultaneous requests for large packs).
async function runWithConcurrency(items, concurrency, worker) {
  let index = 0;
  async function runNext() {
    while (index < items.length) {
      const i = index++;
      await worker(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, runNext);
  await Promise.all(workers);
}

function findJavaCandidates() {
  const candidates = new Set(['java', '/usr/bin/java', '/usr/local/bin/java']);
  const roots = [
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Microsoft',
    'C:\\Program Files (x86)\\Java',
  ];
  for (const root of roots) {
    try {
      for (const dir of fs.readdirSync(root)) {
        const exe = path.join(root, dir, 'bin', 'javaw.exe');
        if (fs.existsSync(exe)) candidates.add(exe);
      }
    } catch {}
  }
  return [...candidates];
}

function getJavaMajorVersion(javaPath) {
  return new Promise((resolve) => {
    execFile(javaPath, ['-version'], {}, (err, stdout, stderr) => {
      const out = `${stdout}${stderr}`;
      const match = out.match(/version "(\d+)(?:\.(\d+))?/);
      if (!match) return resolve(null);
      const major = match[1] === '1' && match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10);
      resolve(Number.isNaN(major) ? null : major);
    });
  });
}

function getJavaFullVersion(javaPath) {
  return new Promise((resolve) => {
    execFile(javaPath, ['-version'], {}, (err, stdout, stderr) => {
      const match = `${stdout}${stderr}`.match(/version "([^"]+)"/);
      resolve(match ? match[1] : null);
    });
  });
}

// Compares dotted version strings of unequal length (e.g. "25.0.1" vs "25.0.4.1").
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Finds an installed Java that satisfies requiredMajor (JVMs run older bytecode fine,
// so the closest version >= requiredMajor is preferred over an unnecessarily newer one).
async function findJava(requiredMajor = 8) {
  const versioned = [];
  for (const c of findJavaCandidates()) {
    const major = await getJavaMajorVersion(c);
    if (major != null) versioned.push({ path: c, major });
  }
  if (versioned.length === 0) return { javaPath: null, major: null, satisfied: false };

  const qualifying = versioned.filter(v => v.major >= requiredMajor).sort((a, b) => a.major - b.major);
  if (qualifying.length > 0) return { javaPath: qualifying[0].path, major: qualifying[0].major, satisfied: true };

  const best = versioned.sort((a, b) => b.major - a.major)[0];
  return { javaPath: best.path, major: best.major, satisfied: false };
}

// Fabric and Quilt both publish version metadata in the same shape, just under
// different hosts/prefixes, so one function handles both.
async function installFabricLike(mcVersion, loaderName, mcDir, send) {
  const metaBase = loaderName === 'Quilt' ? 'https://meta.quiltmc.org/v3' : 'https://meta.fabricmc.net/v2';
  const prefix = loaderName === 'Quilt' ? 'quilt-loader' : 'fabric-loader';
  const versionsDir = path.join(mcDir, 'versions');
  fs.ensureDirSync(versionsDir);

  const existing = fs.readdirSync(versionsDir).find(d => d.startsWith(prefix) && d.endsWith(`-${mcVersion}`));
  if (existing) { send(`${loaderName} already installed: ${existing}`); return existing; }

  send(`Looking up ${loaderName} build for ${mcVersion}...`);
  const loaders = await httpGet(`${metaBase}/versions/loader/${mcVersion}`);
  if (!Array.isArray(loaders) || loaders.length === 0) {
    throw new Error(`No ${loaderName} build found for Minecraft ${mcVersion}`);
  }
  const loaderVersion = loaders[0].loader.version;
  const profileJson = await httpGet(`${metaBase}/versions/loader/${mcVersion}/${loaderVersion}/profile/json`);
  const versionId = `${prefix}-${loaderVersion}-${mcVersion}`;
  const versionDir = path.join(versionsDir, versionId);
  fs.ensureDirSync(versionDir);
  fs.writeFileSync(path.join(versionDir, `${versionId}.json`), JSON.stringify(profileJson, null, 2));
  send(`${loaderName} installed: ${versionId}`, 'success');
  return versionId;
}

function extractXmlVersions(xml) {
  return [...String(xml).matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]);
}

// Forge and NeoForge ship an installer jar rather than plain JSON metadata;
// minecraft-launcher-core runs it via ForgeWrapper when passed as opts.forge.
async function resolveForgeInstaller(mcVersion, loaderName) {
  if (loaderName === 'Forge') {
    const xml = await httpGet('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
    const matches = extractXmlVersions(xml).filter(v => v.startsWith(`${mcVersion}-`));
    if (!matches.length) throw new Error(`No Forge build found for Minecraft ${mcVersion}`);
    const full = matches[matches.length - 1];
    return { full, url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar` };
  }

  // NeoForge versions drop the leading "1." from the Minecraft version, e.g. 1.21.4 -> 21.4.x
  const nfPrefix = mcVersion.replace(/^1\./, '');
  const xml = await httpGet('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
  const matches = extractXmlVersions(xml).filter(v => v.startsWith(`${nfPrefix}.`));
  if (!matches.length) throw new Error(`No NeoForge build found for Minecraft ${mcVersion}`);
  const full = matches[matches.length - 1];
  return { full, url: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${full}/neoforge-${full}-installer.jar` };
}

async function installForgeLike(mcVersion, loaderName, send) {
  send(`Looking up ${loaderName} build for ${mcVersion}...`);
  const { full, url } = await resolveForgeInstaller(mcVersion, loaderName);
  const cacheDir = path.join(VERSIONS_DIR, 'installers');
  fs.ensureDirSync(cacheDir);
  const destPath = path.join(cacheDir, `${loaderName.toLowerCase()}-${full}-installer.jar`);
  if (!fs.existsSync(destPath)) {
    send(`Downloading ${loaderName} ${full} installer...`);
    await downloadFile(url, destPath);
  }
  send(`${loaderName} installer ready: ${full}`, 'success');
  return destPath;
}

async function getJavaRuntimeInfo(gameVersion) {
  try {
    const manifestPath = path.join(VERSIONS_DIR, 'version_manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const entry = manifest.versions.find(v => v.id === gameVersion);
    if (!entry) return { majorVersion: 8, component: 'jre-legacy' };

    const detailPath = path.join(VERSIONS_DIR, `${gameVersion}.json`);
    let detail;
    if (fs.existsSync(detailPath)) {
      detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
    } else {
      detail = await httpGet(entry.url);
      fs.writeFileSync(detailPath, JSON.stringify(detail, null, 2));
    }
    return {
      majorVersion: detail.javaVersion?.majorVersion || 8,
      component: detail.javaVersion?.component || 'jre-legacy',
    };
  } catch {
    return { majorVersion: 8, component: 'jre-legacy' };
  }
}

// ── Mojang-bundled Java runtime (so players never need Java installed) ─────
// Same public catalog every serious third-party launcher uses (Prism, official
// launcher, CurseForge): a components list per OS, each pointing at a
// manifest.json with a hash-verified file listing. We mirror that mechanism
// instead of relying on whatever Java happens to be on the user's system —
// which is also how we sidestep buggy/mismatched vendor builds entirely.
const JAVA_RUNTIME_CATALOG_URL = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
const RUNTIMES_DIR = path.join(DATA_DIR, 'runtimes');

async function getMojangRuntimeCatalogEntry(component) {
  const platform = 'windows-x64';
  const catalogPath = path.join(VERSIONS_DIR, 'java_runtime_catalog.json');
  const ONE_DAY = 24 * 60 * 60 * 1000;
  let catalog;
  const needsRefresh = !fs.existsSync(catalogPath) || (Date.now() - fs.statSync(catalogPath).mtimeMs > ONE_DAY);
  if (needsRefresh) {
    try {
      catalog = await httpGet(JAVA_RUNTIME_CATALOG_URL);
      fs.writeFileSync(catalogPath, JSON.stringify(catalog));
    } catch (e) {
      if (fs.existsSync(catalogPath)) catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      else throw new Error(`Java runtime catalog unreachable: ${e.message}`);
    }
  } else {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  }

  const entries = catalog[platform]?.[component];
  if (!entries || !entries.length) throw new Error(`No Java runtime "${component}" available for ${platform}`);
  return entries[0];
}

async function ensureMojangRuntime(component, send) {
  const runtimeDir = path.join(RUNTIMES_DIR, component);
  const javawPath = path.join(runtimeDir, 'bin', 'javaw.exe');
  const versionMarkerPath = path.join(runtimeDir, '.version');

  const entry = await getMojangRuntimeCatalogEntry(component);
  const remoteVersion = entry.version.name;

  if (fs.existsSync(javawPath) && fs.existsSync(versionMarkerPath)) {
    if (fs.readFileSync(versionMarkerPath, 'utf8').trim() === remoteVersion) {
      return javawPath;
    }
  }

  send(`Downloading Java runtime ${component} (${remoteVersion})...`);
  const fileManifest = await httpGet(entry.manifest.url);
  const files = Object.entries(fileManifest.files).filter(([, info]) => info.type === 'file');

  fs.ensureDirSync(runtimeDir);
  let completed = 0;
  await runWithConcurrency(files, 10, async ([relPath, info]) => {
    const destPath = path.join(runtimeDir, relPath);
    const expectedSize = info.downloads.raw.size;
    if (!fs.existsSync(destPath) || fs.statSync(destPath).size !== expectedSize) {
      fs.ensureDirSync(path.dirname(destPath));
      await downloadFile(info.downloads.raw.url, destPath);
    }
    completed++;
    if (completed % 20 === 0 || completed === files.length) {
      send(`Java runtime: ${completed}/${files.length}`);
    }
  });

  fs.writeFileSync(versionMarkerPath, remoteVersion);
  send(`Java runtime ${component} ready (${remoteVersion})`, 'success');
  return javawPath;
}

// Prefers whichever Java is actually newer: a local install can easily be
// ahead of Mojang's own bundled-runtime catalog (we've seen it lag behind by
// several patch releases), and using the older of the two would silently
// reintroduce bugs a newer patch already fixed.
async function resolveJavaPath(gameVersion, send) {
  const { majorVersion: requiredMajor, component } = await getJavaRuntimeInfo(gameVersion);
  const local = await findJava(requiredMajor);

  let remoteEntry = null;
  try {
    remoteEntry = await getMojangRuntimeCatalogEntry(component);
  } catch {}

  if (local.javaPath && local.satisfied && remoteEntry) {
    const localFull = await getJavaFullVersion(local.javaPath);
    if (localFull && compareVersions(localFull, remoteEntry.version.name) >= 0) {
      send(`Local Java installation is up to date enough (${localFull} ≥ Mojang runtime ${remoteEntry.version.name}): ${local.javaPath}`);
      return local.javaPath;
    }
  }

  try {
    return await ensureMojangRuntime(component, send);
  } catch (e) {
    if (local.javaPath && local.satisfied) {
      send(`Mojang Java runtime unavailable (${e.message}) – using local installation.`, 'info');
      return local.javaPath;
    }
    throw e;
  }
}
