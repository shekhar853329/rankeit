/**
 * Resolves the backend API base URL dynamically based on execution context:
 * 1. Local Browser Dev (localhost:4200) -> uses local backend http://localhost:5196
 * 2. Production Browser (Server IP / Custom Domain) -> uses window.location.origin
 *    (routed cleanly via Nginx reverse proxy to /api and /hubs)
 * 3. Server-Side Rendering (Node.js SSR) -> uses internal loopback or API_INTERNAL_URL
 */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://${host}:5196`;
    }
    return window.location.origin;
  }

  if (typeof process !== 'undefined' && process.env) {
    return process.env['API_INTERNAL_URL'] || 'http://127.0.0.1:5000';
  }

  return 'http://127.0.0.1:5000';
}

function getHubUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://${host}:5196/hubs/leaderboard`;
    }
    return `${window.location.origin}/hubs/leaderboard`;
  }
  return 'http://127.0.0.1:5000/hubs/leaderboard';
}

export const API_BASE_URL = getApiBaseUrl();
export const HUB_URL = getHubUrl();
