import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from './shared/toast-host/toast-host.component';
import { HeaderComponent } from './shared/header/header.component';
import { ConfirmClaimModalComponent } from './shared/confirm-claim-modal/confirm-claim-modal.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, HeaderComponent, ConfirmClaimModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('ranker.ui');
}
