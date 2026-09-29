import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { SignalrService } from '../../core/services/signalr.service';
import { SiteVisitService } from '../../core/services/site-visit.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent implements OnInit {
  protected readonly theme = inject(ThemeService);
  private readonly signalr = inject(SignalrService);
  private readonly siteVisits = inject(SiteVisitService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly onlineUsers = signal(0);
  protected readonly visitsToday = signal<number | null>(null);
  protected readonly menuOpen = signal(false);

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  /** Close mobile menu when viewport grows past the desktop breakpoint */
  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth >= 860) {
      this.menuOpen.set(false);
    }
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const initNetwork = () => {
      void this.signalr.connect();
      this.signalr.onlineUsers$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((count) => this.onlineUsers.set(count));
      this.signalr.visitsToday$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((count) => {
        if (count !== null) {
          this.visitsToday.set(count);
        }
      });
      this.siteVisits
        .trackVisit()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((result) => this.visitsToday.set(result.visitsToday));
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(initNetwork, { timeout: 1500 });
    } else {
      setTimeout(initNetwork, 300);
    }
  }
}
