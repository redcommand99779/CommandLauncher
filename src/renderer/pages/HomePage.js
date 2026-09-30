import React, { useState, useEffect } from 'react';
import useLaunch from '../hooks/useLaunch';
import useRunningProfiles from '../hooks/useRunningProfiles';
import { formatPlaytime } from '../utils';

const api = window.electronAPI || {};

export default function HomePage({ account, setPage }) {
  const [profiles, setProfiles] = useState([]);
  const { launching, play } = useLaunch();
  const runningProfileIds = useRunningProfiles();

  useEffect(() => {
    api.listProfiles?.().then(list => setProfiles(list || []));
  }, []);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', width: '100%' }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>
        Welcome, {account?.username}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 28 }}>
        {profiles.length === 0 ? 'Create your first profile to get started.' : 'Choose a profile to play.'}
      </div>

      {profiles.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎮</div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16 }}>No profiles yet</div>
          <button className="btn-primary" onClick={() => setPage('profiles')}>+ Create profile</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {profiles.map(p => (
            <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 28 }}>{p.icon || '🎮'}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{p.gameVersion} · {p.modLoader || 'Vanilla'}</div>
                  {formatPlaytime(p.totalPlaytimeMs) && (
                    <div style={{ fontSize: 10, color: 'var(--text-4)' }}>{formatPlaytime(p.totalPlaytimeMs)}</div>
                  )}
                </div>
              </div>
              <button
                className="btn-primary"
                style={{ justifyContent: 'center' }}
                onClick={() => play(p)}
                disabled={launching || runningProfileIds.has(p.id)}
              >
                {runningProfileIds.has(p.id) ? '● Already running' : '▶ Play'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
