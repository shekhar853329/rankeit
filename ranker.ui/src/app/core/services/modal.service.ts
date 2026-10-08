import { Injectable, signal } from '@angular/core';

export interface ClaimModalPayload {
  rank: number;
  categoryName: string;
  amount: number;
  categoryId: number;
  minStartingClaim: number;
  minClaimIncrement: number;
  /** Pre-fill for raising a claim on an existing listing; null means new listing. */
  listingId: number | null;
  listingName: string;
  listingUrl: string;
  /** Scraped metadata from the submitted URL — stored alongside the listing on creation. */
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
  /** Current claim amount on this listing (if raising an existing claim; 0 for new listing). */
  currentClaimAmount?: number;
  /** Current highest claim in this category (null if category empty). */
  currentTopClaim?: number | null;
  /** Category slug for routing or listings lookup. */
  categorySlug?: string;
  /** Whether the leaderboard is in all-time mode — drives the all-time cumulative validation. */
  isAllTimeMode?: boolean;
  /** Called after a successful claim so the leaderboard can refresh. */
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
