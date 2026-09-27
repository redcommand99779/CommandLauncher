import React from 'react';

const api = window.electronAPI || {};

export default function TitleBar({ account, onLogout }) {
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
        {account && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8, marginRight: 12,
              WebkitAppRegion: 'no-drag', fontSize: 12, color: 'var(--text-3)',
            }}
          >
            <span>{account.username}</span>
            <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={onLogout}>
              Logout
            </button>
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
