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
  getProfileWorlds: (id) => ipcRenderer.invoke('profiles:getWorlds', id),
  openProfileFolder: (id) => ipcRenderer.invoke('profiles:openFolder', id),
  getProfileMods: (id, subFolder) => ipcRenderer.invoke('profiles:getMods', id, subFolder),

  // Versions
  listVersions: () => ipcRenderer.invoke('versions:list'),

  // Modrinth
  modrinthSearch: (params) => ipcRenderer.invoke('modrinth:search', params),
  modrinthGetVersions: (params) => ipcRenderer.invoke('modrinth:getVersions', params),
  modrinthDownloadMod: (params) => ipcRenderer.invoke('modrinth:downloadMod', params),
  modrinthRemoveMod: (params) => ipcRenderer.invoke('modrinth:removeMod', params),

  // Launch
  launchMinecraft: (params) => ipcRenderer.invoke('minecraft:launch', params),
  onLaunchLog: (cb) => ipcRenderer.on('launch:log', (_, data) => cb(data)),
  offLaunchLog: () => ipcRenderer.removeAllListeners('launch:log'),
});
