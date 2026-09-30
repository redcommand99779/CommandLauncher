export function formatPlaytime(ms) {
  if (!ms) return null;
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m played`;
  return `${hours}h ${minutes}m played`;
}
