import React, { useState, useEffect } from 'react';

const api = window.electronAPI || {};

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings?.().then(setSettings);
  }, []);

  function set(k, v) {
    setSettings(s => ({ ...s, [k]: v }));
    setSaved(false);
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </button>
        {saved && <span style={{ fontSize: 12, color: '#3dcc6e' }}>✓ Saved</span>}
      </div>
    </div>
  );
}
