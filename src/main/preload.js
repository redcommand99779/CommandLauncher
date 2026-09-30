const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Auth
  microsoftLogin: () => ipcRenderer.invoke('auth:microsoftLogin'),
  getAccount: () => ipcRenderer.invoke('auth:getAccount'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // Profiles
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfile: (profile) => ipcRenderer.invoke('profiles:save', profile),
  deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),
  duplicateProfile: (id) => ipcRenderer.invoke('profiles:duplicate', id),
  getProfileWorlds: (id) => ipcRenderer.invoke('profiles:getWorlds', id),
  openProfileFolder: (id) => ipcRenderer.invoke('profiles:openFolder', id),
  getProfileMods: (id, subFolder) => ipcRenderer.invoke('profiles:getMods', id, subFolder),
  prepareLoader: (profile) => ipcRenderer.invoke('profiles:prepareLoader', { profile }),
  isProfileRunning: (id) => ipcRenderer.invoke('profiles:isRunning', id),
  listRunningProfiles: () => ipcRenderer.invoke('profiles:listRunning'),
  onProcessStatus: (cb) => ipcRenderer.on('process:status', (_, data) => cb(data)),
  getScreenshots: (id) => ipcRenderer.invoke('profiles:getScreenshots', id),
  openScreenshot: (filePath) => ipcRenderer.invoke('profiles:openScreenshot', filePath),
  deleteScreenshot: (filePath) => ipcRenderer.invoke('profiles:deleteScreenshot', filePath),
  getCrashLogs: (id) => ipcRenderer.invoke('profiles:getCrashLogs', id),
  readCrashLog: (logPath) => ipcRenderer.invoke('profiles:readCrashLog', logPath),
  openCrashLog: (logPath) => ipcRenderer.invoke('profiles:openCrashLog', logPath),
  deleteCrashLog: (logPath) => ipcRenderer.invoke('profiles:deleteCrashLog', logPath),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  pickJavaPath: () => ipcRenderer.invoke('settings:pickJavaPath'),

  // Versions
  listVersions: () => ipcRenderer.invoke('versions:list'),

  // Modrinth
  modrinthSearch: (params) => ipcRenderer.invoke('modrinth:search', params),
  modrinthGetVersions: (params) => ipcRenderer.invoke('modrinth:getVersions', params),
  modrinthDownloadMod: (params) => ipcRenderer.invoke('modrinth:downloadMod', params),
  modrinthRemoveMod: (params) => ipcRenderer.invoke('modrinth:removeMod', params),
  installModpack: (params) => ipcRenderer.invoke('modrinth:installModpack', params),

  // CurseForge
  curseforgeSearch: (params) => ipcRenderer.invoke('curseforge:search', params),
  curseforgeGetFiles: (params) => ipcRenderer.invoke('curseforge:getFiles', params),
  curseforgeDownloadFile: (params) => ipcRenderer.invoke('curseforge:downloadFile', params),
  curseforgeInstallModpack: (params) => ipcRenderer.invoke('curseforge:installModpack', params),

  // Mod updates
  checkModUpdates: (params) => ipcRenderer.invoke('mods:checkUpdates', params),
  applyModUpdate: (params) => ipcRenderer.invoke('mods:applyUpdate', params),

  // Launch
  launchMinecraft: (params) => ipcRenderer.invoke('minecraft:launch', params),

  // Auto-Update
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_, data) => cb(data)),
  installUpdate: () => ipcRenderer.invoke('update:installNow'),
});
