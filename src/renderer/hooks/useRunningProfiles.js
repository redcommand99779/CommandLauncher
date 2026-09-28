import { useState, useEffect } from 'react';

const api = window.electronAPI || {};

// Tracks which profiles currently have a live Minecraft process, kept in
// sync with the main process via push events so "▶ Play" disables itself
// the moment a session starts, without needing to poll.
export default function useRunningProfiles() {
  const [runningIds, setRunningIds] = useState(new Set());

  useEffect(() => {
    api.listRunningProfiles?.().then(ids => setRunningIds(new Set(ids || [])));
    api.onProcessStatus?.(({ profileId, running }) => {
      setRunningIds(prev => {
        const next = new Set(prev);
        if (running) next.add(profileId);
        else next.delete(profileId);
        return next;
      });
    });
  }, []);

  return runningIds;
}
