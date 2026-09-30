import React, { useState, useEffect } from 'react';

const api = window.electronAPI || {};

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [backupMsg, setBackupMsg] = useState('');

  useEffect(() => {
    api.getSettings?.().then(setSettings);
    api.getAppVersion?.().then(setAppVersion);
  }, []);

  function set(k, v) {
    setSettings(s => ({ ...s, [k]: v }));
    setSaved(false);
  }

  function setTheme(value) {
    set('theme', value);
    document.documentElement.setAttribute('data-theme', value);
  }

  async function handleSave() {
    setSaving(true);
    const result = await api.saveSettings?.(settings);
    setSettings(result);
    setSaving(false);
    setSaved(true);
  }

  async function handlePickJava() {
    const picked = await api.pickJavaPath?.();
    if (picked) set('javaPathOverride', picked);
  }

  async function handleExportProfiles() {
    const result = await api.exportAllProfiles?.();
    if (result?.success) setBackupMsg(`✓ Exported to ${result.path}`);
    else if (result?.error && result.error !== 'Cancelled') setBackupMsg(`❌ ${result.error}`);
  }

  async function handleImportProfiles() {
    const result = await api.importProfiles?.();
    if (result?.success) setBackupMsg('✓ Profiles imported. Switch tabs to see them.');
    else if (result?.error && result.error !== 'Cancelled') setBackupMsg(`❌ ${result.error}`);
  }

  if (!settings) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', width: '100%', maxWidth: 640 }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>Settings</div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 28 }}>
        Global preferences that apply to every profile.
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 20, marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label">Theme</label>
          <select className="form-select" value={settings.theme} onChange={e => setTheme(e.target.value)}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Default RAM for new profiles (GB)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range" min={1} max={16} step={1}
              value={settings.defaultRam}
              onChange={e => set('defaultRam', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, color: 'var(--accent-light)', minWidth: 40, textAlign: 'right' }}>{settings.defaultRam} GB</span>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">When Minecraft launches</label>
          <select className="form-select" value={settings.onLaunchAction} onChange={e => set('onLaunchAction', e.target.value)}>
            <option value="minimize">Minimize the launcher window</option>
            <option value="none">Do nothing</option>
          </select>
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.discordRpcEnabled}
              onChange={e => set('discordRpcEnabled', e.target.checked)}
            />
            Show what you're playing on Discord (Rich Presence)
          </label>
        </div>

        <div className="form-group">
          <label className="form-label">Java path override (optional)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              value={settings.javaPathOverride}
              onChange={e => set('javaPathOverride', e.target.value)}
              placeholder="Leave empty to auto-detect / auto-download Java"
              style={{ flex: 1, fontSize: 12 }}
            />
            <button className="btn-ghost" onClick={handlePickJava}>Browse...</button>
          </div>
          {settings.javaPathOverride && (
            <button className="btn-ghost" style={{ marginTop: 6, fontSize: 11, padding: '3px 8px' }} onClick={() => set('javaPathOverride', '')}>
              Clear override
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </button>
        {saved && <span style={{ fontSize: 12, color: '#3dcc6e' }}>✓ Saved</span>}
      </div>

      <div className="section-label">Backup</div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
          Export every profile (mods, worlds, settings) to a single .zip, or restore one on another PC.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-ghost" onClick={handleExportProfiles}>⬇ Export all profiles</button>
          <button className="btn-ghost" onClick={handleImportProfiles}>⬆ Import profiles</button>
        </div>
        {backupMsg && (
          <div style={{ marginTop: 8, fontSize: 12, color: backupMsg.startsWith('✓') ? '#3dcc6e' : 'var(--danger)' }}>{backupMsg}</div>
        )}
      </div>

      <div className="section-label">About</div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>Command Launcher {appVersion && `v${appVersion}`}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          A lightweight Minecraft launcher. Mod search powered by Modrinth and CurseForge.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          <div
            style={{ fontSize: 12, color: 'var(--accent-light)', cursor: 'pointer' }}
            onClick={() => api.openExternal?.('https://github.com/redcommand99779/CommandLauncher')}
          >
            🔗 github.com/redcommand99779/CommandLauncher
          </div>
          <div
            style={{ fontSize: 12, color: 'var(--accent-light)', cursor: 'pointer' }}
            onClick={() => api.openExternal?.('https://discord.gg/yM2PSGxW2K')}
          >
            💬 Join the Discord — report bugs, suggest features
          </div>
        </div>
      </div>
    </div>
  );
}
