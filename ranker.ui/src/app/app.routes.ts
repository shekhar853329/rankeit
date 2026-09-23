import { Routes } from '@angular/router';
import { GlobalLeaderboardComponent } from './features/global-leaderboard/global-leaderboard.component';
import { CategoryDirectoryComponent } from './features/category-directory/category-directory.component';
import { LeaderboardComponent } from './features/leaderboard/leaderboard.component';
import { DailyListingsComponent } from './features/daily-listings/daily-listings.component';
import { ContactComponent } from './features/contact/contact.component';
import { RulesComponent } from './features/rules/rules.component';
import { ListingDetailComponent } from './features/listing-detail/listing-detail.component';

export const routes: Routes = [
  { path: '', component: GlobalLeaderboardComponent },
  { path: 'categories', component: CategoryDirectoryComponent },
  { path: 'categories/:parentSlug', component: CategoryDirectoryComponent },
  { path: 'leaderboard/:categorySlug', component: LeaderboardComponent },
  { path: 'listings/:listingId', component: ListingDetailComponent },
  { path: 'daily', component: DailyListingsComponent },
  { path: 'contact', component: ContactComponent },
  { path: 'rules', component: RulesComponent },
];
