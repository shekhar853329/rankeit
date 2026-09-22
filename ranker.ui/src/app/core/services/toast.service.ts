import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: number;
  text: string;
  kind: 'success' | 'error' | 'info';
}

/** Minimal toast/banner store consumed by a <app-toast-host> in the shell template. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<ToastMessage[]>([]);

  show(text: string, kind: ToastMessage['kind'] = 'info', durationMs = 4000): void {
    const toast: ToastMessage = { id: this.nextId++, text, kind };
    this.toasts.update((current) => [...current, toast]);
    setTimeout(() => this.dismiss(toast.id), durationMs);
  }

  dismiss(id: number): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }
}
