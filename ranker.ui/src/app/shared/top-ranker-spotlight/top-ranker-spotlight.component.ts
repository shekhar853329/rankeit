import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-top-ranker-spotlight',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './top-ranker-spotlight.component.html',
  styleUrl: './top-ranker-spotlight.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopRankerSpotlightComponent {
  /** Name / title of the top-ranked listing. */
  readonly listingName = input.required<string>();

  /** Current bid amount for the top-ranked listing. */
  readonly currentBidAmount = input.required<number>();

  /**
   * Optional category context shown below the name.
   * When provided renders "🥇 #1 in <categoryName>".
   * Pass null / undefined to hide the category line.
   */
  readonly categoryName = input<string | null>(null);

  /**
   * Whether to show the decorative ✦ ✦ ✦ stars and the animated label.
   * Global leaderboard uses true; category leaderboard omits stars.
   * Defaults to false so the category page gets its simpler look.
   */
  readonly showStars = input<boolean>(false);
}
