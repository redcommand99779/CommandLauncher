import React, { useState, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ProfilesPage from './pages/ProfilesPage';
import ModBrowserPage from './pages/ModBrowserPage';
import SettingsPage from './pages/SettingsPage';
import OnboardingModal from './components/OnboardingModal';
import WhatsNewModal from './components/WhatsNewModal';

const api = window.electronAPI || {};

export default function App() {
  const [account, setAccount] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState('home');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [whatsNew, setWhatsNew] = useState(null); // { fromVersion, toVersion }

  useEffect(() => {
    api.getAccount?.().then(acc => {
      setAccount(acc);
      setAuthLoading(false);
    });
    // Apply the saved theme immediately, even before login, so the login
    // screen itself isn't stuck on the default theme.
    api.getSettings?.().then(s => {
      if (s) document.documentElement.setAttribute('data-theme', s.theme || 'dark');
    });
  }, []);

  useEffect(() => {
    if (!account) return;
    (async () => {
      const [settings, currentVersion] = await Promise.all([api.getSettings?.(), api.getAppVersion?.()]);
      if (!settings) return;

      if (!settings.onboardingSeen) {
        setShowOnboarding(true);
      } else if (currentVersion && settings.lastSeenVersion && settings.lastSeenVersion !== currentVersion) {
        setWhatsNew({ fromVersion: settings.lastSeenVersion, toVersion: currentVersion });
      } else if (currentVersion && settings.lastSeenVersion !== currentVersion) {
        await api.saveSettings?.({ ...settings, lastSeenVersion: currentVersion });
      }
    })();
  }, [account?.uuid]);

  async function dismissOnboarding() {
    setShowOnboarding(false);
    const settings = await api.getSettings?.();
    const currentVersion = await api.getAppVersion?.();
    await api.saveSettings?.({ ...settings, onboardingSeen: true, lastSeenVersion: currentVersion || settings.lastSeenVersion });
  }

  async function dismissWhatsNew() {
    const toVersion = whatsNew?.toVersion;
    setWhatsNew(null);
    const settings = await api.getSettings?.();
    await api.saveSettings?.({ ...settings, lastSeenVersion: toVersion });
  }

  async function handleLogout() {
    await api.logout?.();
    // logout() switches to another saved account if one remains, rather than
    // always clearing to the login screen, so re-fetch the new active state.
    const next = await api.getAccount?.();
    setAccount(next);
  }

  if (authLoading) {
    return (
      <div style={{ height: '100vh', background: 'var(--bg-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TitleBar account={account} onLogout={handleLogout} onAccountChange={setAccount} />
      {!account ? (
        <LoginPage onLogin={setAccount} />
      ) : (
        <>
          <nav style={{ display: 'flex', gap: 2, padding: '8px 20px 0', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
            {[['home', 'Home'], ['profiles', 'Profiles'], ['mods', 'Mod Browser'], ['settings', 'Settings']].map(([id, label]) => (
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
            {page === 'settings' && <SettingsPage />}
          </main>
        </>
      )}
      {showOnboarding && <OnboardingModal onClose={dismissOnboarding} />}
      {whatsNew && <WhatsNewModal fromVersion={whatsNew.fromVersion} toVersion={whatsNew.toVersion} onClose={dismissWhatsNew} />}
    </div>
  );
}
