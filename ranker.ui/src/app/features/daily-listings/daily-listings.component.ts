import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { DailyListingGroupDto } from '../../core/models/daily-listing.model';

const TOP_ENTRIES_PREVIEW = 3;

@Component({
  selector: 'app-daily-listings',
  standalone: true,
  imports: [RouterLink, DecimalPipe, DatePipe],
  templateUrl: './daily-listings.component.html',
  styleUrl: './daily-listings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyListingsComponent implements OnInit {
  private readonly leaderboardService = inject(LeaderboardService);

  readonly groups = signal<DailyListingGroupDto[]>([]);
  readonly expandedDays = signal<ReadonlySet<string>>(new Set());
  readonly page = signal(1);
  readonly pageSize = 5;
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);

  readonly previewCount = TOP_ENTRIES_PREVIEW;

  ngOnInit(): void {
    this.load(1, false);
  }

  loadMore(): void {
    this.load(this.page() + 1, true);
  }

  hasMore(): boolean {
    return this.groups().length < this.totalCount();
  }

  isExpanded(day: string): boolean {
    return this.expandedDays().has(day);
  }

  toggleExpand(day: string): void {
    const next = new Set(this.expandedDays());
    if (next.has(day)) {
      next.delete(day);
    } else {
      next.add(day);
    }
    this.expandedDays.set(next);
  }

  visibleEntries(group: DailyListingGroupDto) {
    return this.isExpanded(group.day) ? group.entries : group.entries.slice(0, this.previewCount);
  }

  timeAgo(iso: string): string {
    const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) {
      return 'just now';
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  private load(page: number, append: boolean): void {
    append ? this.loadingMore.set(true) : this.loading.set(true);
    this.leaderboardService.getDailyListings(page, this.pageSize).subscribe((result) => {
      this.groups.set(append ? [...this.groups(), ...result.items] : result.items);
      this.totalCount.set(result.totalCount);
      this.page.set(page);
      this.loading.set(false);
      this.loadingMore.set(false);
    });
  }
}
