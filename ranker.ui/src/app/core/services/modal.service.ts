import { Injectable, signal } from '@angular/core';

export interface ClaimModalPayload {
  rank: number;
  categoryName: string;
  amount: number;
  /** Called when the user clicks "Continue to checkout" and has agreed to ToS. */
  onConfirm: () => void;
}

export interface BidFormModalPayload {
  categoryId: number;
  categoryName: string;
  minStartingBid: number;
  minBidIncrement: number;
  /** Pre-fill for a re-bid on an existing listing; null means new listing. */
  listingId: number | null;
  listingName: string;
  listingUrl: string;
  /** Pre-fill the bid amount (e.g. from the claim card). */
  prefillAmount: number | null;
  /** Called after a successful bid so the leaderboard can refresh. */
  onSuccess: () => void;
}

@Injectable({ providedIn: 'root' })
export class ModalService {
  readonly claimModal = signal<ClaimModalPayload | null>(null);
  readonly bidFormModal = signal<BidFormModalPayload | null>(null);

  // ── Claim modal ──────────────────────────────────────────────
  openClaimModal(payload: ClaimModalPayload): void {
    this.claimModal.set(payload);
  }

  closeClaimModal(): void {
    this.claimModal.set(null);
  }

  confirmClaim(): void {
    const payload = this.claimModal();
    if (!payload) return;
    this.claimModal.set(null);
    // Defer onConfirm by one task so the current click event fully settles
    // before the DOM changes (avoids backdrop click firing after @if removes the panel).
    setTimeout(() => payload.onConfirm(), 0);
  }

  // ── Bid form modal ───────────────────────────────────────────
  openBidFormModal(payload: BidFormModalPayload): void {
    this.bidFormModal.set(payload);
  }

  closeBidFormModal(): void {
    this.bidFormModal.set(null);
  }
}
