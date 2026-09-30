import React from 'react';

const STEPS = [
  { icon: '🏠', title: 'Home', text: 'Jump straight into any profile you\'ve already set up.' },
  { icon: '🎮', title: 'Profiles', text: 'Create a profile (version + mod loader), then manage its mods, worlds, servers and screenshots.' },
  { icon: '🧩', title: 'Mod Browser', text: 'Search Modrinth or CurseForge and install mods, resourcepacks, shaders or whole modpacks in one click.' },
  { icon: '⚙️', title: 'Settings', text: 'Default RAM, theme, Discord presence and more — applies to every profile.' },
];

export default function OnboardingModal({ onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 460 }}>
        <div className="modal-title">Welcome to Command Launcher</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          {STEPS.map(s => (
            <div key={s.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 22 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{s.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={onClose}>Get started</button>
        </div>
      </div>
    </div>
  );
}
