import { Injectable, signal } from '@angular/core';

export interface ClaimModalPayload {
  rank: number;
  categoryName: string;
  amount: number;
  /** Called when the user clicks "Continue to checkout" and has agreed to ToS. */
  onConfirm: () => void;
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

  confirmClaim(): void {
    const payload = this.claimModal();
    if (!payload) return;
    this.claimModal.set(null);
    payload.onConfirm();
  }
}
