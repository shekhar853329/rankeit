import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DailyListingEntryDto } from '../../core/models/daily-listing.model';

@Component({
  selector: 'app-todays-leaderboard',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './todays-leaderboard.component.html',
  styleUrl: './todays-leaderboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodaysLeaderboardComponent {
  /** Top bidders to display — typically sliced to 3. */
  readonly bidders = input.required<DailyListingEntryDto[]>();

  /**
   * Whether list items are clickable (navigates to the listing URL).
   * Global leaderboard: false — items are display-only.
   * Category leaderboard: true — items are interactive links.
   */
  readonly clickable = input<boolean>(false);

  /** Emits the clicked entry when clickable is true. */
  readonly itemClick = output<DailyListingEntryDto>();

  onItemClick(bidder: DailyListingEntryDto): void {
    if (this.clickable()) {
      this.itemClick.emit(bidder);
    }
  }
}
