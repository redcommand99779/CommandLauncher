import { useState } from 'react';

const api = window.electronAPI || {};

export default function useLaunch() {
  const [launching, setLaunching] = useState(false);
  const [log, setLog] = useState([]);

  async function play(profile) {
    if (launching) return;
    setLaunching(true);
    setLog([]);
    api.onLaunchLog?.(entry => setLog(prev => [...prev, entry]));
    const result = await api.launchMinecraft?.({ profile });
    api.offLaunchLog?.();
    if (!result?.success) {
      setLog(prev => [...prev, { message: result?.error || 'Start fehlgeschlagen', type: 'error' }]);
    }
    setLaunching(false);
  }

  function closeLog() {
    // Detach the listener immediately so a launch the user gave up on can't
    // keep writing into this closed overlay's state, or collide with the next play().
    api.offLaunchLog?.();
    setLaunching(false);
  }

  return { launching, log, play, closeLog };
}
