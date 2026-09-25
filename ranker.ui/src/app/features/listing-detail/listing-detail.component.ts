import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { catchError, of, switchMap } from 'rxjs';
import { ListingDetailDto } from '../../core/models/listing-detail.model';
import { ListingService } from '../../core/services/listing.service';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { ModalService } from '../../core/services/modal.service';
import { SignalrService } from '../../core/services/signalr.service';

@Component({
  selector: 'app-listing-detail',
  standalone: true,
  imports: [RouterLink, DecimalPipe, DatePipe],
  templateUrl: './listing-detail.component.html',
  styleUrl: './listing-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly listingService = inject(ListingService);
  private readonly leaderboardService = inject(LeaderboardService);
  private readonly modalService = inject(ModalService);
  private readonly signalr = inject(SignalrService);
  private readonly destroyRef = inject(DestroyRef);

  private joinedCategoryGroup: string | null = null;
  private currentListingId = 0;

  readonly listing = signal<ListingDetailDto | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.loading.set(true);
          this.currentListingId = Number(params.get('listingId'));
          return this.listingService.getListingDetail(this.currentListingId).pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.loading.set(false);
        this.notFound.set(!result);
        this.listing.set(result);

        if (this.joinedCategoryGroup) {
          void this.signalr.leaveCategoryGroup(this.joinedCategoryGroup);
          this.joinedCategoryGroup = null;
        }
        if (result) {
          this.joinedCategoryGroup = result.categorySlug;
          void this.signalr.joinCategoryGroup(result.categorySlug);
        }
      });

    this.signalr.listingClicked$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ listingId, clickCount }) => {
      const current = this.listing();
      if (current && current.listingId === listingId) {
        this.listing.set({ ...current, clickCount });
      }
    });

    this.destroyRef.onDestroy(() => {
      if (this.joinedCategoryGroup) {
        void this.signalr.leaveCategoryGroup(this.joinedCategoryGroup);
      }
    });
  }

  refreshListing(): void {
    if (this.currentListingId) {
      this.listingService.getListingDetail(this.currentListingId).subscribe({
        next: (res) => {
          if (res) this.listing.set(res);
        }
      });
    }
  }

  openOutbidModal(): void {
    const l = this.listing();
    if (!l) return;

    this.leaderboardService.getCategoryLeaderboard(l.categorySlug).subscribe({
      next: (catData) => {
        const minInc = catData.minBidIncrement || 1;
        this.modalService.openClaimModal({
          rank: l.currentRankInCategory,
          categoryName: l.categoryName,
          amount: l.currentBidAmount + minInc,
          categoryId: catData.categoryId,
          minStartingBid: catData.minStartingBid,
          minBidIncrement: minInc,
          listingId: l.listingId,
          listingName: l.listingName,
          listingUrl: l.listingUrl,
          siteName: l.siteName,
          logoUrl: l.logoUrl,
          description: l.description,
          faviconUrl: l.faviconUrl,
          onSuccess: () => this.refreshListing(),
        });
      },
      error: () => {
        this.modalService.openClaimModal({
          rank: l.currentRankInCategory,
          categoryName: l.categoryName,
          amount: l.currentBidAmount + 1,
          categoryId: 0,
          minStartingBid: 1,
          minBidIncrement: 1,
          listingId: l.listingId,
          listingName: l.listingName,
          listingUrl: l.listingUrl,
          siteName: l.siteName,
          logoUrl: l.logoUrl,
          description: l.description,
          faviconUrl: l.faviconUrl,
          onSuccess: () => this.refreshListing(),
        });
      }
    });
  }

  openExternalUrl(url: string, id: number): void {
    window.open(url, '_blank', 'noopener,noreferrer');
    this.listingService.recordClick(id).subscribe((count) => {
      const current = this.listing();
      if (current && current.listingId === id) {
        this.listing.set({ ...current, clickCount: count });
      }
    });
  }

  getFaviconUrl(url: string): string {
    try {
      const host = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
    } catch {
      return '';
    }
  }

  formatDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLElement;
    target.style.display = 'none';
  }

  timeAgo(iso: string): string {
    const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
