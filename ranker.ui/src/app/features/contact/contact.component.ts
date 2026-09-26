import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent {
  private readonly toast = inject(ToastService);

  readonly email = 'shekharshine25@gmail.com';
  readonly creationDate = 'September 22, 2026';
  readonly copied = signal(false);

  copyEmail(): void {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(this.email).then(() => {
        this.copied.set(true);
        this.toast.show('Email address copied to clipboard!', 'success');
        setTimeout(() => this.copied.set(false), 2500);
      }).catch(() => {
        this.fallbackCopy();
      });
    } else {
      this.fallbackCopy();
    }
  }

  private fallbackCopy(): void {
    const el = document.createElement('textarea');
    el.value = this.email;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    this.copied.set(true);
    this.toast.show('Email address copied to clipboard!', 'success');
    setTimeout(() => this.copied.set(false), 2500);
  }
}
