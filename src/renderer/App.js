import React, { useState, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ProfilesPage from './pages/ProfilesPage';
import ModBrowserPage from './pages/ModBrowserPage';

const api = window.electronAPI || {};

export default function App() {
  const [account, setAccount] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState('home');

  useEffect(() => {
    api.getAccount?.().then(acc => {
      setAccount(acc);
      setAuthLoading(false);
    });
  }, []);

  async function handleLogout() {
    await api.logout?.();
    setAccount(null);
  }

  if (authLoading) {
    return (
      <div style={{ height: '100vh', background: 'var(--bg-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>
        Laden...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TitleBar account={account} onLogout={handleLogout} />
      {!account ? (
        <LoginPage onLogin={setAccount} />
      ) : (
        <>
          <nav style={{ display: 'flex', gap: 2, padding: '8px 20px 0', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
            {[['home', 'Start'], ['profiles', 'Profile'], ['mods', 'Mod-Browser']].map(([id, label]) => (
              <button key={id} onClick={() => setPage(id)} style={{
                padding: '8px 16px', background: 'transparent', border: 'none',
                borderBottom: `2px solid ${page === id ? 'var(--accent)' : 'transparent'}`,
                color: page === id ? 'var(--accent-light)' : 'var(--text-3)', fontSize: 13, cursor: 'pointer',
              }}>{label}</button>
            ))}
          </nav>
          <main style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {page === 'home' && <HomePage account={account} setPage={setPage} />}
            {page === 'profiles' && <ProfilesPage />}
            {page === 'mods' && <ModBrowserPage />}
          </main>
        </>
      )}
    </div>
  );
}
