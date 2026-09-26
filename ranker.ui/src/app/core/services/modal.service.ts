import { Injectable, signal } from '@angular/core';

export interface ClaimModalPayload {
  rank: number;
  categoryName: string;
  amount: number;
  categoryId: number;
  minStartingBid: number;
  minBidIncrement: number;
  /** Pre-fill for a re-bid on an existing listing; null means new listing. */
  listingId: number | null;
  listingName: string;
  listingUrl: string;
  /** Scraped metadata from the submitted URL — stored alongside the listing on creation. */
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
  /** Current bid amount on this listing (if raising an existing bid; 0 for new listing). */
  currentBidAmount?: number;
  /** Current highest bid in this category (null if category empty). */
  currentTopBid?: number | null;
  /** Category slug for routing or listings lookup. */
  categorySlug?: string;
  /** Called after a successful bid so the leaderboard can refresh. */
  onSuccess: () => void;
}

@Injectable({ providedIn: 'root' })
export class ModalService {
  readonly claimModal = signal<ClaimModalPayload | null>(null);

  openClaimModal(payload: ClaimModalPayload): void {
    this.claimModal.set(payload);
  }

  closeClaimModal(): void {
    this.claimModal.set(null);
  }
}
