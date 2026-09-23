import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { catchError, of, switchMap } from 'rxjs';
import { ListingDetailDto } from '../../core/models/listing-detail.model';
import { ListingService } from '../../core/services/listing.service';
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
  private readonly signalr = inject(SignalrService);
  private readonly destroyRef = inject(DestroyRef);

  private joinedCategoryGroup: string | null = null;

  readonly listing = signal<ListingDetailDto | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.loading.set(true);
          const id = Number(params.get('listingId'));
          return this.listingService.getListingDetail(id).pipe(catchError(() => of(null)));
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
}
