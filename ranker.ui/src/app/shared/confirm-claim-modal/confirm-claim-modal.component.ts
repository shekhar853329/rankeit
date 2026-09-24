import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { ModalService } from '../../core/services/modal.service';

@Component({
  selector: 'app-confirm-claim-modal',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe],
  templateUrl: './confirm-claim-modal.component.html',
  styleUrl: './confirm-claim-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmClaimModalComponent {
  protected readonly modal = inject(ModalService);
  protected agreed = false;

  confirm(): void {
    if (!this.agreed) return;
    this.agreed = false;
    this.modal.confirmClaim();
  }
}
