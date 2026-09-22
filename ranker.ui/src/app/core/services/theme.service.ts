import { DOCUMENT } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const STORAGE_KEY = 'ranker-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly dark = signal(this.readInitialPreference());

  constructor() {
    this.apply(this.dark());
  }

  toggle(): void {
    this.dark.update((current) => !current);
    this.apply(this.dark());
  }

  private readInitialPreference(): boolean {
    if (!this.isBrowser) {
      return false;
    }
    const stored = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return stored === 'dark';
    }
    return this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  private apply(isDark: boolean): void {
    this.document.documentElement.classList.toggle('dark', isDark);
    if (this.isBrowser) {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    }
  }
}
