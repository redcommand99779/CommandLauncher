import React from 'react';
import { CHANGELOG } from '../changelog';

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export default function WhatsNewModal({ fromVersion, toVersion, onClose }) {
  const entries = CHANGELOG.filter(e =>
    compareVersions(e.version, fromVersion) > 0 && compareVersions(e.version, toVersion) <= 0
  );

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 440 }}>
        <div className="modal-title">What's new in {toVersion}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20, maxHeight: '50vh', overflowY: 'auto' }}>
          {entries.map(e => (
            <div key={e.version}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-light)', marginBottom: 6 }}>v{e.version}</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {e.notes.map((n, i) => (
                  <li key={i} style={{ fontSize: 12, color: 'var(--text-2)' }}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
