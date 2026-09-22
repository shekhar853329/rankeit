import { Component, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ToastHostComponent } from './shared/toast-host/toast-host.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ToastHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('ranker.ui');
}
