import { Routes } from '@angular/router';
import { GlobalLeaderboardComponent } from './features/global-leaderboard/global-leaderboard.component';
import { CategoryDirectoryComponent } from './features/category-directory/category-directory.component';
import { LeaderboardComponent } from './features/leaderboard/leaderboard.component';

export const routes: Routes = [
  { path: '', component: GlobalLeaderboardComponent },
  { path: 'categories', component: CategoryDirectoryComponent },
  { path: 'categories/:parentSlug', component: CategoryDirectoryComponent },
  { path: 'leaderboard/:categorySlug', component: LeaderboardComponent },
];
