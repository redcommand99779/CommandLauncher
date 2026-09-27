const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');
const { microsoftLogin, getValidAccount, logout } = require('./auth');

const isDev = process.env.NODE_ENV === 'development';

// ── Paths ────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(app.getPath('userData'), 'CommandLauncher');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const VERSIONS_DIR = path.join(DATA_DIR, 'versions');

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(PROFILES_DIR);
fs.ensureDirSync(VERSIONS_DIR);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f1117',
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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

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

// ── Launch Minecraft ─────────────────────────────────────────────────────
ipcMain.handle('minecraft:launch', async (event, { profile }) => {
  const send = (msg, type = 'info') => {
    console.log(`[launch:${type}]`, msg);
    event.sender.send('launch:log', { message: msg, type });
  };

  try {
    const { Client } = require('minecraft-launcher-core');
    const launcher = new Client();

    const profileDir = path.join(PROFILES_DIR, profile.id);
    const savesDir = path.join(profileDir, 'saves');
    fs.ensureDirSync(savesDir);

    send(`Lade Minecraft ${profile.gameVersion}...`);

    const account = await getValidAccount();
    if (!account) {
      send('Kein gültiger Account – bitte erneut anmelden.', 'error');
      return { success: false, error: 'Nicht angemeldet' };
    }
    send(`Account: ${account.username} (${account.uuid})`);

    const ramMb = (profile.ram || 4) * 1024;
    const requiredJavaMajor = await getRequiredJavaMajor(profile.gameVersion);
    const { javaPath, major, satisfied } = await findJava(requiredJavaMajor);
    if (!javaPath) {
      send(`Keine Java-Installation gefunden (benötigt: Java ${requiredJavaMajor}+). Bitte Java installieren (adoptium.net) und erneut versuchen.`, 'error');
      return { success: false, error: 'Java nicht gefunden' };
    }
    if (!satisfied) {
      send(`Installierte Java-Version (${major}) ist zu alt für Minecraft ${profile.gameVersion} (benötigt: Java ${requiredJavaMajor}+). Bitte eine neuere Java-Version installieren (adoptium.net).`, 'error');
      return { success: false, error: `Java ${requiredJavaMajor}+ benötigt, gefunden: ${major}` };
    }
    send(`Java gefunden: ${javaPath} (Version ${major})`);

    const vanillaMcDir = path.join(app.getPath('appData'), '.minecraft');
    const loaderName = profile.modLoader || 'Vanilla';
    let versionId = profile.gameVersion;
    let forgeInstallerPath = null;

    try {
      if (loaderName === 'Fabric' || loaderName === 'Quilt') {
        versionId = await installFabricLike(profile.gameVersion, loaderName, vanillaMcDir, send);
      } else if (loaderName === 'Forge' || loaderName === 'NeoForge') {
        forgeInstallerPath = await installForgeLike(profile.gameVersion, loaderName, send);
      }
    } catch (e) {
      send(`${loaderName}-Installation fehlgeschlagen: ${e.message}`, 'error');
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
    };

    launcher.on('debug', (e) => send(e, 'info'));
    launcher.on('data', (e) => send(e, 'info'));
    launcher.on('progress', (e) => {
      if (e.task && e.total) send(`${e.type}: ${e.task}/${e.total}`, 'info');
    });
    launcher.on('close', (code) => send(`Minecraft beendet (Code ${code})`, 'info'));

    const proc = await launcher.launch(opts);
    if (!proc) {
      send('Start fehlgeschlagen: kein Prozess gestartet.', 'error');
      return { success: false, error: 'launch() gab keinen Prozess zurück' };
    }

    send('Minecraft gestartet.', 'success');
    return { success: true };
  } catch (e) {
    console.error('[launch:error]', e);
    send(`Fehler: ${e.message}`, 'error');
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
  if (existing) { send(`${loaderName} bereits installiert: ${existing}`); return existing; }

  send(`Suche ${loaderName}-Build für ${mcVersion}...`);
  const loaders = await httpGet(`${metaBase}/versions/loader/${mcVersion}`);
  if (!Array.isArray(loaders) || loaders.length === 0) {
    throw new Error(`Kein ${loaderName}-Build für Minecraft ${mcVersion} gefunden`);
  }
  const loaderVersion = loaders[0].loader.version;
  const profileJson = await httpGet(`${metaBase}/versions/loader/${mcVersion}/${loaderVersion}/profile/json`);
  const versionId = `${prefix}-${loaderVersion}-${mcVersion}`;
  const versionDir = path.join(versionsDir, versionId);
  fs.ensureDirSync(versionDir);
  fs.writeFileSync(path.join(versionDir, `${versionId}.json`), JSON.stringify(profileJson, null, 2));
  send(`${loaderName} installiert: ${versionId}`, 'success');
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
    if (!matches.length) throw new Error(`Kein Forge-Build für Minecraft ${mcVersion} gefunden`);
    const full = matches[matches.length - 1];
    return { full, url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar` };
  }

  // NeoForge versions drop the leading "1." from the Minecraft version, e.g. 1.21.4 -> 21.4.x
  const nfPrefix = mcVersion.replace(/^1\./, '');
  const xml = await httpGet('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
  const matches = extractXmlVersions(xml).filter(v => v.startsWith(`${nfPrefix}.`));
  if (!matches.length) throw new Error(`Kein NeoForge-Build für Minecraft ${mcVersion} gefunden`);
  const full = matches[matches.length - 1];
  return { full, url: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${full}/neoforge-${full}-installer.jar` };
}

async function installForgeLike(mcVersion, loaderName, send) {
  send(`Suche ${loaderName}-Build für ${mcVersion}...`);
  const { full, url } = await resolveForgeInstaller(mcVersion, loaderName);
  const cacheDir = path.join(VERSIONS_DIR, 'installers');
  fs.ensureDirSync(cacheDir);
  const destPath = path.join(cacheDir, `${loaderName.toLowerCase()}-${full}-installer.jar`);
  if (!fs.existsSync(destPath)) {
    send(`Lade ${loaderName} ${full} Installer herunter...`);
    await downloadFile(url, destPath);
  }
  send(`${loaderName} Installer bereit: ${full}`, 'success');
  return destPath;
}

async function getRequiredJavaMajor(gameVersion) {
  try {
    const manifestPath = path.join(VERSIONS_DIR, 'version_manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const entry = manifest.versions.find(v => v.id === gameVersion);
    if (!entry) return 8;

    const detailPath = path.join(VERSIONS_DIR, `${gameVersion}.json`);
    let detail;
    if (fs.existsSync(detailPath)) {
      detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
    } else {
      detail = await httpGet(entry.url);
      fs.writeFileSync(detailPath, JSON.stringify(detail, null, 2));
    }
    return detail.javaVersion?.majorVersion || 8;
  } catch {
    return 8;
  }
}
