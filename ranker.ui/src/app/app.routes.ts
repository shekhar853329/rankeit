import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/global-leaderboard/global-leaderboard.component').then(
        (m) => m.GlobalLeaderboardComponent
      ),
  },
  {
    path: 'categories',
    loadComponent: () =>
      import('./features/category-directory/category-directory.component').then(
        (m) => m.CategoryDirectoryComponent
      ),
  },
  {
    path: 'categories/:parentSlug',
    loadComponent: () =>
      import('./features/category-directory/category-directory.component').then(
        (m) => m.CategoryDirectoryComponent
      ),
  },
  {
    path: 'leaderboard/:categorySlug',
    loadComponent: () =>
      import('./features/leaderboard/leaderboard.component').then(
        (m) => m.LeaderboardComponent
      ),
  },
  {
    path: 'listings/:listingId',
    loadComponent: () =>
      import('./features/listing-detail/listing-detail.component').then(
        (m) => m.ListingDetailComponent
      ),
  },
  {
    path: 'website/:slug',
    loadComponent: () =>
      import('./features/website-profile/website-profile.component').then(
        (m) => m.WebsiteProfileComponent
      ),
  },
  {
    path: 'daily',
    loadComponent: () =>
      import('./features/daily-listings/daily-listings.component').then(
        (m) => m.DailyListingsComponent
      ),
  },
  {
    path: 'analytics',
    loadComponent: () =>
      import('./features/analytics-dashboard/analytics-dashboard.component').then(
        (m) => m.AnalyticsDashboardComponent
      ),
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./features/contact/contact.component').then((m) => m.ContactComponent),
  },
  {
    path: 'rules',
    loadComponent: () =>
      import('./features/rules/rules.component').then((m) => m.RulesComponent),
  },
  {
    path: 'terms',
    loadComponent: () =>
      import('./features/terms/terms.component').then((m) => m.TermsComponent),
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./features/privacy/privacy.component').then((m) => m.PrivacyComponent),
  },
  {
    path: 'payment-success',
    loadComponent: () =>
      import('./features/payment-success/payment-success.component').then(
        (m) => m.PaymentSuccessComponent
      ),
  },
];
