import React, { useState, useEffect, useCallback } from 'react';
import useLaunch from '../hooks/useLaunch';

const api = window.electronAPI || {};

const CONTENT_TYPES = [
  { id: 'mod', label: '⊞ Mods', subFolder: 'mods' },
  { id: 'resourcepack', label: '🎨 Resourcepacks', subFolder: 'resourcepacks' },
  { id: 'shader', label: '✨ Shaders', subFolder: 'shaderpacks' },
  { id: 'datapack', label: '📦 Datapacks', subFolder: 'datapacks' },
  { id: 'modpack', label: '🗂 Modpacks', subFolder: null },
];

const LOADER_SLUGS = { Fabric: ['fabric'], Forge: ['forge'], Quilt: ['quilt'], NeoForge: ['neoforge'] };

export default function ModBrowserPage() {
  const [profiles, setProfiles] = useState([]);
  const [profileId, setProfileId] = useState('');
  const [contentType, setContentType] = useState('mod');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [installedItems, setInstalledItems] = useState([]);
  const [installing, setInstalling] = useState({});
  const [statusMsg, setStatusMsg] = useState('');
  const [offset, setOffset] = useState(0);
  const [totalHits, setTotalHits] = useState(0);
  const { installModpack } = useLaunch();

  const isModpackTab = contentType === 'modpack';
  const activeProfile = profiles.find(p => p.id === profileId) || null;
  const subFolder = CONTENT_TYPES.find(t => t.id === contentType)?.subFolder || 'mods';
  const needsLoader = contentType === 'mod' && (!activeProfile || (activeProfile.modLoader || 'Vanilla') === 'Vanilla');
  const noProfilesYet = !isModpackTab && profiles.length === 0;

  useEffect(() => { loadProfiles(); }, []);

  async function loadProfiles() {
    const list = await api.listProfiles?.() || [];
    setProfiles(list);
    if (list.length && !profileId) setProfileId(list[0].id);
  }

  useEffect(() => { if (activeProfile && !isModpackTab) loadInstalled(); }, [activeProfile?.id, contentType]);
  useEffect(() => {
    if (isModpackTab || (!needsLoader && !noProfilesYet)) doSearch(0);
    else { setResults([]); setTotalHits(0); }
  }, [contentType, activeProfile?.id]);

  async function loadInstalled() {
    const items = await api.getProfileMods?.(activeProfile.id, subFolder) || [];
    setInstalledItems(items.map(m => m.filename));
  }

  const doSearch = useCallback(async (newOffset = 0) => {
    if (!isModpackTab && (!activeProfile || needsLoader)) return;
    setLoading(true);
    try {
      const loaders = contentType === 'mod' ? (LOADER_SLUGS[activeProfile.modLoader] || []) : [];
      const res = await api.modrinthSearch?.({
        query,
        gameVersion: isModpackTab ? '' : activeProfile.gameVersion,
        loaders,
        limit: 20,
        offset: newOffset,
        projectType: contentType,
      });
      if (res?.hits) { setResults(res.hits); setTotalHits(res.total_hits || 0); setOffset(newOffset); }
      else { setResults([]); setTotalHits(0); }
    } finally { setLoading(false); }
  }, [query, contentType, activeProfile?.id, needsLoader, isModpackTab]);

  async function installMod(item) {
    const loaders = contentType === 'mod' ? (LOADER_SLUGS[activeProfile.modLoader] || []) : [];
    const versions = await api.modrinthGetVersions?.({
      projectId: item.project_id || item.slug,
      gameVersion: activeProfile.gameVersion,
      loaders,
    });
    if (!versions?.length) { setStatusMsg('❌ No compatible version found.'); return; }

    const ver = versions[0];
    const file = ver.files?.find(f => f.primary) || ver.files?.[0];
    if (!file) { setStatusMsg('❌ No download file found.'); return; }

    setStatusMsg(`⬇ Downloading ${item.title}...`);
    const result = await api.modrinthDownloadMod?.({
      url: file.url, filename: file.filename, profileId: activeProfile.id, subFolder,
    });
    if (result?.success) {
      setInstalledItems(p => [...p, file.filename]);
      setStatusMsg(`✓ ${item.title} installed!`);
    } else {
      setStatusMsg(`❌ Error: ${result?.error || 'Unknown'}`);
    }
  }

  async function installPack(item) {
    const versions = await api.modrinthGetVersions?.({ projectId: item.project_id || item.slug, gameVersion: '', loaders: [] });
    if (!versions?.length) { setStatusMsg('❌ No version found.'); return; }
    const ver = versions[0];
    const file = ver.files?.find(f => f.filename?.endsWith('.mrpack')) || ver.files?.[0];
    if (!file) { setStatusMsg('❌ No .mrpack file found.'); return; }

    const result = await installModpack({ url: file.url, filename: file.filename, packName: item.title });
    if (result?.success) {
      setStatusMsg(`✓ "${item.title}" installed as a new profile!`);
      await loadProfiles();
    } else {
      setStatusMsg(`❌ Error: ${result?.error || 'Unknown'}`);
    }
  }

  async function installItem(item) {
    const id = item.project_id || item.slug;
    setInstalling(p => ({ ...p, [id]: true }));
    setStatusMsg('');
    try {
      if (isModpackTab) await installPack(item);
      else await installMod(item);
    } catch (e) {
      setStatusMsg(`❌ Error: ${e.message}`);
    } finally {
      setInstalling(p => ({ ...p, [id]: false }));
    }
  }

  const isInstalled = (item) => {
    if (isModpackTab) return false;
    const slug = (item.slug || '').toLowerCase();
    const title = (item.title || '').toLowerCase().replace(/\s+/g, '-');
    return installedItems.some(f => {
      const fl = f.toLowerCase();
      return (slug && fl.includes(slug)) || (title.length > 3 && fl.includes(title));
    });
  };

  const handleSearch = (e) => { e.preventDefault(); doSearch(0); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', width: '100%' }}>
      <div style={{ padding: '12px 20px 10px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
          {CONTENT_TYPES.map(t => (
            <button key={t.id} onClick={() => { setContentType(t.id); setQuery(''); }}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12,
                border: `0.5px solid ${contentType === t.id ? 'var(--accent)' : 'var(--border)'}`,
                background: contentType === t.id ? '#1e3a5f' : 'var(--bg-2)',
                color: contentType === t.id ? 'var(--accent-light)' : 'var(--text-4)',
                cursor: 'pointer',
              }}>{t.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-4)' }}>🟢 Modrinth</div>
          {!isModpackTab && profiles.length > 0 && (
            <select className="form-select" value={profileId} onChange={e => setProfileId(e.target.value)} style={{ fontSize: 12 }}>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name} · {p.gameVersion} · {p.modLoader || 'Vanilla'}</option>)}
            </select>
          )}
        </div>

        {isModpackTab && (
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 10 }}>
            Installing automatically creates a new profile with the matching version, mod loader, and all included mods.
          </div>
        )}

        {noProfilesYet ? (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 10 }}>
            Create a profile on the Profiles page first.
          </div>
        ) : needsLoader ? (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 10 }}>
            This profile uses Vanilla (no mod loader). Set Fabric, Forge, Quilt, or NeoForge in "Edit profile" to install mods.
          </div>
        ) : (
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="form-input"
              placeholder={`Search ${CONTENT_TYPES.find(t => t.id === contentType)?.label || 'Mods'}...`}
              style={{ flex: 1, fontSize: 13 }}
            />
            <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: '8px 16px' }}>
              🔍 Search
            </button>
          </form>
        )}

        {statusMsg && (
          <div style={{ marginTop: 8, fontSize: 12, color: statusMsg.startsWith('✓') ? '#3dcc6e' : statusMsg.startsWith('⬇') ? 'var(--accent-light)' : 'var(--danger)' }}>
            {statusMsg}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
        {noProfilesYet || needsLoader ? null : loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-4)' }}>Searching...</div>
        ) : results.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-4)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No results</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 10 }}>{totalHits.toLocaleString()} results</div>
            {results.map(item => (
              <ResultCard
                key={item.project_id || item.slug}
                item={item}
                isModpack={isModpackTab}
                installed={isInstalled(item)}
                installing={!!installing[item.project_id || item.slug]}
                onInstall={() => installItem(item)}
              />
            ))}
            {totalHits > offset + 20 && (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <button className="btn-ghost" onClick={() => doSearch(offset + 20)}>Load more</button>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}

function ResultCard({ item, isModpack, installed, installing, onInstall }) {
  return (
    <div style={{
      background: 'var(--bg-2)', border: '0.5px solid var(--border)',
      borderRadius: 10, padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 8, overflow: 'hidden',
        background: '#1a1d2a', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {item.icon_url ? <img src={item.icon_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 22 }}>{isModpack ? '🗂' : '📦'}</span>}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', marginBottom: 2 }}>{item.title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <span className="badge badge-gray">⬇ {formatNum(item.downloads)}</span>
          {(item.categories || []).slice(0, 2).map(c => <span key={c} className="badge badge-blue">{c}</span>)}
        </div>
      </div>

      <div style={{ flexShrink: 0 }}>
        {installed ? (
          <div style={{ fontSize: 12, color: '#3dcc6e' }}>✓ Installed</div>
        ) : (
          <button className="btn-primary" onClick={onInstall} disabled={installing} style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}>
            {installing ? '⏳' : isModpack ? '+ As profile' : '⬇ Install'}
          </button>
        )}
      </div>
    </div>
  );
}

function formatNum(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return String(n);
}
