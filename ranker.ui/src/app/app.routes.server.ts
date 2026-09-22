import { RenderMode, ServerRoute } from '@angular/ssr';

// Leaderboards are live/SignalR-driven and paginated by query params, so render them client-side rather
// than prerendering static snapshots.
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client
  }
];
