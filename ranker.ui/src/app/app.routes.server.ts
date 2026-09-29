import { RenderMode, ServerRoute } from '@angular/ssr';

// Leaderboards are live/SignalR-driven and paginated by query params, so render them client-side rather
// than prerendering static snapshots.
export const serverRoutes: ServerRoute[] = [
  { path: 'rules', renderMode: RenderMode.Prerender },
  { path: 'terms', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: 'contact', renderMode: RenderMode.Prerender },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
