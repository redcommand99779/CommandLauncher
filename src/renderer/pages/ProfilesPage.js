import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import useLaunch from '../hooks/useLaunch';
import useRunningProfiles from '../hooks/useRunningProfiles';

const api = window.electronAPI || {};
const ICONS = ['🎮', '⚔️', '🏰', '🌲', '⛏️', '🐉'];
const VERSION_FALLBACK = ['1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2'];
const LOADERS = ['Vanilla', 'Fabric', 'Forge', 'Quilt', 'NeoForge'];
const CONTENT_TABS = [
  { id: 'mods', label: 'Mods', subFolder: 'mods', needsLoader: true },
  { id: 'resourcepacks', label: 'Resourcepacks', subFolder: 'resourcepacks', needsLoader: false },
  { id: 'shaders', label: 'Shaders', subFolder: 'shaderpacks', needsLoader: false },
  { id: 'datapacks', label: 'Datapacks', subFolder: 'datapacks', needsLoader: false },
  { id: 'welten', label: 'Worlds', subFolder: null, needsLoader: false },
];

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [worlds, setWorlds] = useState([]);
  const [folderItems, setFolderItems] = useState([]);
  const [contentTab, setContentTab] = useState('mods');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [versions, setVersions] = useState(VERSION_FALLBACK);
  const { launching, play, prepare } = useLaunch();
  const runningProfileIds = useRunningProfiles();

  useEffect(() => {
    loadProfiles();
    loadVersions();
  }, []);

  useEffect(() => {
    if (selected) loadWorlds(selected.id);
  }, [selected?.id]);

  useEffect(() => {
    if (selected && contentTab !== 'welten') loadFolderItems(selected.id, contentTab);
  }, [selected?.id, contentTab]);

  async function loadProfiles() {
    const list = await api.listProfiles?.() || [];
    setProfiles(list);
    setSelected(prev => (prev && list.find(p => p.id === prev.id)) || list[0] || null);
  }

  async function loadVersions() {
    try {
      const data = await api.listVersions?.() || {};
      const releases = (data.versions || [])
        .filter(v => v.type === 'release')
        .map(v => v.id);
      if (releases.length > 0) setVersions(releases);
    } catch {}
  }

  async function loadWorlds(id) {
    const w = await api.getProfileWorlds?.(id) || [];
    setWorlds(w);
  }

  async function loadFolderItems(id, tabId) {
    const subFolder = CONTENT_TABS.find(t => t.id === tabId)?.subFolder || 'mods';
    const items = await api.getProfileMods?.(id, subFolder) || [];
    setFolderItems(items);
  }

  async function handleRemoveItem(filename) {
    const subFolder = CONTENT_TABS.find(t => t.id === contentTab)?.subFolder || 'mods';
    await api.modrinthRemoveMod?.({ filename, profileId: selected.id, subFolder });
    await loadFolderItems(selected.id, contentTab);
  }

  function openCreate() {
    if (launching) return;
    setEditing(null);
    setShowModal(true);
  }

  function openEdit(profile) {
    if (launching) return;
    setEditing(profile);
    setShowModal(true);
  }

  async function handleSave(profile) {
    await api.saveProfile?.(profile);
    setShowModal(false);
    setEditing(null);
    await loadProfiles();
    setSelected(profile);
    if ((profile.modLoader || 'Vanilla') !== 'Vanilla') {
      await prepare(profile);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Really delete this profile? All worlds will be deleted!')) return;
    await api.deleteProfile?.(id);
    await loadProfiles();
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 240, borderRight: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px 16px 10px', borderBottom: '0.5px solid var(--border)' }}>
          <div className="section-label">Profiles ({profiles.length})</div>
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={openCreate} disabled={launching}>
            + New profile
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
          {profiles.map(p => (
            <div
              key={p.id}
              onClick={() => setSelected(p)}
              style={{
                padding: '10px 12px', borderRadius: 'var(--radius)', cursor: 'pointer', marginBottom: 4,
                background: selected?.id === p.id ? '#1e3a5f' : 'transparent',
                border: `0.5px solid ${selected?.id === p.id ? '#1a5fbf' : 'transparent'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{p.icon || '🎮'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: selected?.id === p.id ? 'var(--text-1)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{p.gameVersion} · {p.modLoader || 'Vanilla'}</div>
                </div>
                {runningProfileIds.has(p.id) && (
                  <span title="Running" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                )}
              </div>
            </div>
          ))}
          {profiles.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-4)', fontSize: 12 }}>
              No profiles yet.<br />Create your first one!
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)' }}>
            Select or create a profile
          </div>
        ) : (
          <>
            <div style={{ padding: '20px 24px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ fontSize: 36 }}>{selected.icon || '🎮'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{selected.name}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span className="badge badge-blue">{selected.gameVersion}</span>
                    <span className="badge badge-green">{selected.modLoader || 'Vanilla'}</span>
                    <span className="badge badge-gray">{selected.ram || 4} GB RAM</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" onClick={() => api.openProfileFolder?.(selected.id)}>📂 Folder</button>
                  <button className="btn-ghost" onClick={() => openEdit(selected)} disabled={launching}>✎ Edit</button>
                  <button
                    className="btn-primary"
                    onClick={() => play(selected)}
                    disabled={launching || runningProfileIds.has(selected.id)}
                  >
                    {runningProfileIds.has(selected.id) ? '● Already running' : launching ? 'Starting...' : '▶ Play'}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
                {CONTENT_TABS.map(t => (
                  <button key={t.id} onClick={() => setContentTab(t.id)} style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 12,
                    border: `0.5px solid ${contentTab === t.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: contentTab === t.id ? '#1e3a5f' : 'var(--bg-2)',
                    color: contentTab === t.id ? 'var(--accent-light)' : 'var(--text-4)',
                    cursor: 'pointer',
                  }}>{t.label}</button>
                ))}
              </div>

              {contentTab === 'welten' ? (
                worlds.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-4)' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🌍</div>
                    <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No worlds yet</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>Launch the game with this profile to create a world.</div>
                  </div>
                ) : (
                  worlds.map(w => (
                    <div key={w.name} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 24 }}>🌍</div>
                      <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{w.name}</div>
                    </div>
                  ))
                )
              ) : CONTENT_TABS.find(t => t.id === contentTab)?.needsLoader && (selected.modLoader || 'Vanilla') === 'Vanilla' ? (
                <div className="card" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-4)' }}>
                  <div style={{ fontSize: 12 }}>Vanilla profiles don't support mods. Set a mod loader in "Edit".</div>
                </div>
              ) : folderItems.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-4)' }}>
                  <div style={{ fontSize: 12 }}>Nothing installed. Use the Mod Browser to add some.</div>
                </div>
              ) : (
                folderItems.map(m => (
                  <div key={m.filename} className="card" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 18 }}>📦</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.filename}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{(m.size / 1024).toFixed(0)} KB</div>
                    </div>
                    <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => handleRemoveItem(m.filename)}>✕</button>
                  </div>
                ))
              )}

              <div style={{ marginTop: 20 }}>
                <button className="btn-danger" onClick={() => handleDelete(selected.id)}>🗑 Delete profile</button>
              </div>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <ProfileModal
          profile={editing}
          versions={versions}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ProfileModal({ profile, versions, onSave, onClose }) {
  const [form, setForm] = useState({
    id: profile?.id || uuidv4(),
    name: profile?.name || '',
    gameVersion: profile?.gameVersion || versions[0] || '1.21.4',
    modLoader: profile?.modLoader || 'Vanilla',
    ram: profile?.ram || 4,
    icon: profile?.icon || '🎮',
    createdAt: profile?.createdAt || new Date().toISOString(),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 440 }}>
        <div className="modal-title">{profile ? 'Edit profile' : 'New profile'}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Icon</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {ICONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => set('icon', ic)}
                  style={{
                    width: 36, height: 36, borderRadius: 8, fontSize: 18, cursor: 'pointer',
                    border: `1.5px solid ${form.icon === ic ? 'var(--accent)' : 'var(--border)'}`,
                    background: form.icon === ic ? '#0d1f3c' : 'var(--bg-2)',
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Profile name *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Survival World" autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">Minecraft Version *</label>
            <select className="form-select" value={form.gameVersion} onChange={e => set('gameVersion', e.target.value)}>
              {versions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Mod Loader</label>
            <select className="form-select" value={form.modLoader} onChange={e => set('modLoader', e.target.value)}>
              {LOADERS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">RAM (GB)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="range" min={1} max={16} step={1} value={form.ram} onChange={e => set('ram', Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: 13, color: 'var(--accent-light)', minWidth: 40, textAlign: 'right' }}>{form.ram} GB</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => form.name && onSave(form)} disabled={!form.name}>
            {profile ? 'Save' : 'Create profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
