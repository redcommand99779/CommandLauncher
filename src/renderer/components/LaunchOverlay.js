import React from 'react';

export default function LaunchOverlay({ log, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-title">Minecraft wird gestartet...</div>
        <div style={{
          background: '#050609', border: '0.5px solid var(--border)', borderRadius: 6,
          padding: 12, height: 260, overflowY: 'auto', fontFamily: 'var(--mono)', fontSize: 11.5,
        }}>
          {log.length === 0 && <div style={{ color: 'var(--text-4)' }}>Warte auf Log...</div>}
          {log.map((l, i) => (
            <div key={i} style={{ color: l.type === 'error' ? 'var(--danger)' : l.type === 'success' ? 'var(--green)' : 'var(--text-3)', marginBottom: 3 }}>
              {l.message}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn-ghost" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}
