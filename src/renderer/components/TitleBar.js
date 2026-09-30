import React, { useState, useEffect } from 'react';

const api = window.electronAPI || {};

export default function TitleBar({ account, onLogout, onAccountChange }) {
  const [update, setUpdate] = useState(null); // { status: 'available'|'downloading'|'ready', version, percent }
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    api.onUpdateStatus?.(data => setUpdate(data));
  }, []);

  async function toggleAccountMenu() {
    if (!showAccountMenu) setAccounts(await api.listAccounts?.() || []);
    setShowAccountMenu(v => !v);
  }

  async function handleSwitch(uuid) {
    if (uuid === account?.uuid) { setShowAccountMenu(false); return; }
    setSwitching(true);
    const next = await api.switchAccount?.(uuid);
    setSwitching(false);
    setShowAccountMenu(false);
    if (next) onAccountChange?.(next);
  }

  async function handleAddAccount() {
    setSwitching(true);
    try {
      const next = await api.microsoftLogin?.();
      setShowAccountMenu(false);
      if (next) onAccountChange?.(next);
    } catch {} finally {
      setSwitching(false);
    }
  }

  async function handleRemoveAccount(e, uuid) {
    e.stopPropagation();
    await api.removeAccount?.(uuid);
    const remaining = await api.listAccounts?.() || [];
    setAccounts(remaining);
    if (uuid === account?.uuid) {
      const next = remaining[0] ? await api.switchAccount?.(remaining[0].uuid) : null;
      onAccountChange?.(next);
      if (!next) setShowAccountMenu(false);
    }
  }

  return (
    <div
      style={{
        height: 38,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#0b0d13',
        borderBottom: '0.5px solid var(--border)',
        WebkitAppRegion: 'drag',
        padding: '0 0 0 14px',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.02em' }}>
        Command Launcher
      </div>

      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        {update?.status === 'downloading' && (
          <div style={{ WebkitAppRegion: 'no-drag', fontSize: 11, color: 'var(--text-4)', marginRight: 12 }}>
            ⬇ Downloading update... {update.percent}%
          </div>
        )}
        {update?.status === 'ready' && (
          <button
            className="btn-primary"
            style={{ WebkitAppRegion: 'no-drag', padding: '4px 10px', fontSize: 11, marginRight: 12 }}
            onClick={() => api.installUpdate?.()}
          >
            🔄 Update {update.version} — Restart
          </button>
        )}
        {account && (
          <div style={{ position: 'relative', WebkitAppRegion: 'no-drag', marginRight: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
              <span
                onClick={toggleAccountMenu}
                style={{ cursor: 'pointer', color: showAccountMenu ? 'var(--accent-light)' : 'var(--text-3)' }}
              >
                {account.username} ▾
              </span>
              <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={onLogout}>
                Logout
              </button>
            </div>

            {showAccountMenu && (
              <div style={{
                position: 'absolute', top: 28, right: 0, width: 220, zIndex: 50,
                background: 'var(--bg-2)', border: '0.5px solid var(--border)', borderRadius: 8,
                padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {accounts.map(a => (
                  <div
                    key={a.uuid}
                    onClick={() => handleSwitch(a.uuid)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      background: a.uuid === account.uuid ? '#1e3a5f' : 'transparent',
                      color: a.uuid === account.uuid ? 'var(--accent-light)' : 'var(--text-2)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.uuid === account.uuid ? '● ' : ''}{a.username}
                    </span>
                    {a.uuid !== account.uuid && (
                      <span onClick={e => handleRemoveAccount(e, a.uuid)} style={{ color: 'var(--danger)', fontSize: 11 }}>✕</span>
                    )}
                  </div>
                ))}
                <button
                  className="btn-ghost"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 6, fontSize: 11, padding: '5px 8px' }}
                  onClick={handleAddAccount}
                  disabled={switching}
                >
                  {switching ? '...' : '+ Add account'}
                </button>
              </div>
            )}
          </div>
        )}
        <TitleBarButton onClick={() => api.minimizeWindow?.()} label="─" />
        <TitleBarButton onClick={() => api.maximizeWindow?.()} label="☐" />
        <TitleBarButton onClick={() => api.closeWindow?.()} label="✕" danger />
      </div>
    </div>
  );
}

function TitleBarButton({ onClick, label, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        WebkitAppRegion: 'no-drag',
        width: 44,
        height: 38,
        background: 'transparent',
        border: 'none',
        color: 'var(--text-3)',
        cursor: 'pointer',
        fontSize: 12,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? '#c84040' : '#1a1d2a'; e.currentTarget.style.color = '#fff'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; }}
    >
      {label}
    </button>
  );
}
