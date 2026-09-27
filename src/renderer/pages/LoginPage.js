import React, { useState } from 'react';

const api = window.electronAPI || {};

export default function LoginPage({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    setLoading(true);
    setError('');
    try {
      const account = await api.microsoftLogin?.();
      if (account) onLogin(account);
    } catch (e) {
      setError(e.message || 'Login fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 48 }}>⛏️</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-1)' }}>Command Launcher</div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 8 }}>
        Melde dich mit deinem Minecraft-Account an
      </div>
      <button className="btn-primary" style={{ padding: '10px 22px', fontSize: 14 }} onClick={handleLogin} disabled={loading}>
        {loading ? 'Anmelden...' : 'Mit Microsoft anmelden'}
      </button>
      {error && <div style={{ color: 'var(--danger)', fontSize: 12, maxWidth: 360, textAlign: 'center' }}>{error}</div>}
    </div>
  );
}
