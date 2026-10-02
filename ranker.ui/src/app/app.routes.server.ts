import { RenderMode, ServerRoute } from '@angular/ssr';

// Leaderboards are live/SignalR-driven and paginated by query params, so render them client-side rather
// than prerendering static snapshots.
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Server },
  { path: 'categories', renderMode: RenderMode.Server },
  { path: 'categories/:parentSlug', renderMode: RenderMode.Server },
  { path: 'leaderboard/:categorySlug', renderMode: RenderMode.Server },
  { path: 'listings/:listingId', renderMode: RenderMode.Server },
  { path: 'daily', renderMode: RenderMode.Server },
  { path: 'analytics', renderMode: RenderMode.Server },
  { path: 'rules', renderMode: RenderMode.Prerender },
  { path: 'terms', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: 'contact', renderMode: RenderMode.Prerender },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
