import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { catchError, of, switchMap } from 'rxjs';
import { CategoryLeaderboardResponseDto, LeaderboardEntryDto } from '../../core/models/leaderboard.model';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { BidService } from '../../core/services/bid.service';
import { SignalrService } from '../../core/services/signalr.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe, DatePipe],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaderboardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly leaderboardService = inject(LeaderboardService);
  private readonly bidService = inject(BidService);
  private readonly signalr = inject(SignalrService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly categorySlug = signal('');
  readonly categoryId = signal<number | null>(null);
  readonly categoryName = signal('');
  readonly minBidIncrement = signal(0);
  readonly minStartingBid = signal(0);
  readonly entries = signal<LeaderboardEntryDto[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly submitting = signal(false);

  // Bid form state.
  readonly bidListingId = signal<number | null>(null);
  readonly bidListingName = signal('');
  readonly bidListingUrl = signal('');
  readonly bidOwnerEmail = signal('');
  readonly bidTargetAmount = signal<number | null>(null);
  readonly bidPaymentReference = signal('');
  readonly bidConfirmedAmount = signal<number | null>(null);

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const slug = params.get('categorySlug') ?? '';
          this.categorySlug.set(slug);
          this.loading.set(true);
          void this.joinGroup(slug);
          return this.leaderboardService.getCategoryLeaderboard(slug, this.page(), this.pageSize()).pipe(
            catchError(() => of(null as CategoryLeaderboardResponseDto | null)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (!result) {
          this.notFound.set(true);
          return;
        }
        this.notFound.set(false);
        this.categoryId.set(result.categoryId);
        this.categoryName.set(result.categoryName);
        this.minBidIncrement.set(result.minBidIncrement);
        this.minStartingBid.set(result.minStartingBid);
        this.entries.set(result.leaderboard.items);
        this.totalCount.set(result.leaderboard.totalCount);
      });

    this.signalr.rankUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((payload) => {
      if (payload.categorySlug === this.categorySlug()) {
        // Patch the leaderboard array reactively instead of a full page reload.
        this.refresh();
      }
    });

    this.destroyRef.onDestroy(() => {
      void this.signalr.leaveCategoryGroup(this.categorySlug());
    });
  }

  private async joinGroup(slug: string): Promise<void> {
    if (slug) {
      await this.signalr.joinCategoryGroup(slug);
    }
  }

  refresh(): void {
    this.leaderboardService
      .getCategoryLeaderboard(this.categorySlug(), this.page(), this.pageSize())
      .subscribe((result) => {
        this.entries.set(result.leaderboard.items);
        this.totalCount.set(result.leaderboard.totalCount);
      });
  }

  goToPage(page: number): void {
    if (page < 1) {
      return;
    }
    this.page.set(page);
    this.refresh();
  }

  selectListingToRebid(entry: LeaderboardEntryDto): void {
    this.bidListingId.set(entry.listingId);
    this.bidListingName.set(entry.listingName);
    this.bidListingUrl.set(entry.listingUrl);
  }

  startNewListing(): void {
    this.bidListingId.set(null);
    this.bidListingName.set('');
    this.bidListingUrl.set('');
  }

  submitBid(): void {
    const targetAmount = this.bidTargetAmount();
    const confirmedAmount = this.bidConfirmedAmount();
    const categoryId = this.categoryId();
    if (
      categoryId === null ||
      targetAmount === null ||
      confirmedAmount === null ||
      !this.bidOwnerEmail() ||
      !this.bidPaymentReference()
    ) {
      this.toast.show('Please fill in all bid fields.', 'error');
      return;
    }

    this.submitting.set(true);
    this.bidService
      .placeBid({
        categoryId,
        listingId: this.bidListingId(),
        listingName: this.bidListingName() || null,
        listingUrl: this.bidListingUrl() || null,
        ownerContactEmail: this.bidOwnerEmail(),
        targetBidAmount: targetAmount,
        paymentReference: this.bidPaymentReference(),
        confirmedPaymentAmount: confirmedAmount,
      })
      .subscribe({
        next: (result) => {
          this.submitting.set(false);
          if (result.success) {
            this.toast.show(`Bid confirmed! New bid: ${result.newCurrentBidAmount}`, 'success');
            this.refresh();
          } else {
            this.toast.show(result.errorMessage ?? 'Bid rejected.', 'error');
          }
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('Something went wrong placing your bid.', 'error');
        },
      });
  }
}
