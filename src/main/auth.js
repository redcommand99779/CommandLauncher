const https = require('https');
const http = require('http');
const { BrowserWindow } = require('electron');
const Store = require('electron-store');

const store = new Store();

// Microsoft OAuth - using Minecraft's official client ID (same as Prism/MultiMC)
const CLIENT_ID = '00000000402b5328';
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const SCOPE = 'XboxLive.signin%20offline_access';

function httpPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = {
      hostname, path, method: 'POST',
      headers: { 'Content-Length': Buffer.byteLength(data), ...headers },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Step 1: Open Microsoft login window
async function openMicrosoftLogin() {
  return new Promise((resolve, reject) => {
    const authUrl = `https://login.live.com/oauth20_authorize.srf?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPE}`;

    const win = new BrowserWindow({
      width: 520, height: 680,
      title: 'Microsoft Login — Command Launcher',
      webPreferences: { nodeIntegration: false, contextIsolation: true },
      autoHideMenuBar: true,
    });

    win.loadURL(authUrl);

    win.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith('https://login.live.com/oauth20_desktop.srf')) {
        const parsed = new URL(url);
        const code = parsed.searchParams.get('code');
        const error = parsed.searchParams.get('error');
        win.close();
        if (code) resolve(code);
        else reject(new Error(error || 'Login abgebrochen'));
      }
    });

    win.on('closed', () => reject(new Error('Fenster geschlossen')));
  });
}

// Step 2: Exchange code for Microsoft token
async function getMicrosoftToken(code) {
  const body = `client_id=${CLIENT_ID}&code=${code}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPE}`;
  return await httpPost('login.live.com', '/oauth20_token.srf',
    { 'Content-Type': 'application/x-www-form-urlencoded' }, body);
}

// Step 3: Xbox Live auth
async function getXboxToken(msToken) {
  const body = {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: `d=${msToken}`,
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT',
  };
  return await httpPost('user.auth.xboxlive.com', '/user/authenticate',
    { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    JSON.stringify(body));
}

// Step 4: XSTS token
async function getXSTSToken(xblToken) {
  const body = {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT',
  };
  return await httpPost('xsts.auth.xboxlive.com', '/xsts/authorize',
    { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    JSON.stringify(body));
}

// Step 5: Minecraft token
async function getMinecraftToken(uhs, xstsToken) {
  const body = { identityToken: `XBL3.0 x=${uhs};${xstsToken}` };
  return await httpPost('api.minecraftservices.com', '/authentication/login_with_xbox',
    { 'Content-Type': 'application/json' },
    JSON.stringify(body));
}

// Step 6: Get Minecraft profile
async function getMinecraftProfile(mcToken) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.minecraftservices.com',
      path: '/minecraft/profile',
      headers: { 'Authorization': `Bearer ${mcToken}` },
    };
    https.get(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { reject(new Error('Profile error')); }
      });
    }).on('error', reject);
  });
}

// Refresh token
async function refreshMicrosoftToken(refreshToken) {
  const body = `client_id=${CLIENT_ID}&refresh_token=${refreshToken}&grant_type=refresh_token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPE}`;
  return await httpPost('login.live.com', '/oauth20_token.srf',
    { 'Content-Type': 'application/x-www-form-urlencoded' }, body);
}

// Main login flow
async function microsoftLogin() {
  const code = await openMicrosoftLogin();
  const msToken = await getMicrosoftToken(code);
  if (!msToken.access_token) throw new Error('Microsoft token error');

  const xbl = await getXboxToken(msToken.access_token);
  if (!xbl.Token) throw new Error('Xbox Live error');

  const uhs = xbl.DisplayClaims?.xui?.[0]?.uhs;
  const xsts = await getXSTSToken(xbl.Token);
  if (!xsts.Token) {
    if (xsts.XErr === 2148916233) throw new Error('No Microsoft account — please create a Microsoft account');
    if (xsts.XErr === 2148916238) throw new Error('Child account — please add it to a family');
    throw new Error('XSTS error: ' + xsts.XErr);
  }

  const mc = await getMinecraftToken(uhs, xsts.Token);
  if (!mc.access_token) throw new Error('Minecraft token error');

  const profile = await getMinecraftProfile(mc.access_token);
  if (!profile.id) throw new Error('No Minecraft account found — buy Minecraft first!');

  const account = {
    username: profile.name,
    uuid: profile.id,
    accessToken: mc.access_token,
    refreshToken: msToken.refresh_token,
    expiresAt: Date.now() + (msToken.expires_in * 1000),
    skins: profile.skins || [],
    loggedIn: true,
  };

  store.set('account', account);
  return account;
}

// Auto refresh if needed
async function getValidAccount() {
  const account = store.get('account');
  if (!account) return null;
  if (Date.now() < account.expiresAt - 60000) return account;

  try {
    const refreshed = await refreshMicrosoftToken(account.refreshToken);
    const xbl = await getXboxToken(refreshed.access_token);
    const uhs = xbl.DisplayClaims?.xui?.[0]?.uhs;
    const xsts = await getXSTSToken(xbl.Token);
    const mc = await getMinecraftToken(uhs, xsts.Token);
    const updated = {
      ...account,
      accessToken: mc.access_token,
      refreshToken: refreshed.refresh_token || account.refreshToken,
      expiresAt: Date.now() + (refreshed.expires_in * 1000),
    };
    store.set('account', updated);
    return updated;
  } catch {
    store.delete('account');
    return null;
  }
}

function logout() {
  store.delete('account');
}

module.exports = { microsoftLogin, getValidAccount, logout };
