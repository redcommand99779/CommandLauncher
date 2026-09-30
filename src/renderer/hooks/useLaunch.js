import { useState } from 'react';

const api = window.electronAPI || {};

// The progress log itself is streamed live to a separate native window
// (opened by the main process); this hook only tracks whether an action
// is in flight, so buttons can disable themselves and show a result.
export default function useLaunch() {
  const [launching, setLaunching] = useState(false);
  const [mode, setMode] = useState('launch'); // 'launch' | 'prepare' | 'modpack'
  const [result, setResult] = useState(null);

  async function run(payload, runMode, action) {
    if (launching) return null;
    setMode(runMode);
    setLaunching(true);
    setResult(null);
    const res = await action(payload);
    setResult(res);
    setLaunching(false);
    return res;
  }

  const play = (profile) => run(profile, 'launch', (p) => api.launchMinecraft?.({ profile: p }));
  const prepare = (profile) => run(profile, 'prepare', (p) => api.prepareLoader?.(p));
  const installModpack = (params) => run(params, 'modpack', (p) => api.installModpack?.(p));
  const installModpackCF = (params) => run(params, 'modpack', (p) => api.curseforgeInstallModpack?.(p));

  return { launching, mode, result, play, prepare, installModpack, installModpackCF };
}
