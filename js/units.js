import { CONFIG } from './config.js';

/** Format a distance in meters for display (miles/feet in the U.S.). */
export function formatDistance(m) {
  if (m == null || isNaN(m)) return '';
  if (CONFIG.UNITS === 'metric') return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
  const ft = m * 3.28084;
  if (ft < 900) return `${Math.max(50, Math.round(ft / 50) * 50)} ft`;
  const mi = m / 1609.34;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

export const walkMinutes = (m) => Math.max(1, Math.round(m / 80)); // ~3 mph
