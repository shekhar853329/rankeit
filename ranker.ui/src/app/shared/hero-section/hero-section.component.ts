import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-hero-section',
  standalone: true,
  templateUrl: './hero-section.component.html',
  styleUrl: './hero-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroSectionComponent {
  /**
   * `category` — name + listing count after the headline (category leaderboard).
   * `global` — projected category tabs fill the remaining bar (global leaderboard).
   */
  readonly variant = input<'category' | 'global'>('category');

  /** Shown after the headline on the category leaderboard. */
  readonly category = input<string | null>(null);

  /** Listing count badge on the category leaderboard. */
  readonly listingCount = input<number | null>(null);
}
