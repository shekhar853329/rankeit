import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { catchError, of, switchMap } from 'rxjs';
import { WebsiteProfileDto, RelatedListingDto } from '../../core/models/website-profile.model';
import { ListingService } from '../../core/services/listing.service';
import { SeoService } from '../../core/services/seo.service';
import { resolveUrl } from '../../core/utils/url.utils';
import { API_BASE_URL } from '../../core/config/api-config';

export type BadgeStyleType = 'light' | 'dark' | 'brand' | 'compact' | 'crown';
export type BadgeMetricType = 'category' | 'global';
export type BadgeFormatType = 'html' | 'markdown' | 'url';
export type BadgePreviewBgType = 'light' | 'dark' | 'checker';

@Component({
  selector: 'app-website-profile',
  standalone: true,
  imports: [RouterLink, DecimalPipe, DatePipe],
  templateUrl: './website-profile.component.html',
  styleUrl: './website-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebsiteProfileComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly listingService = inject(ListingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly seo = inject(SeoService);

  readonly profile = signal<WebsiteProfileDto | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  // ── Badge Customizer State ─────────────────────────────────────────────────
  readonly badgePanelOpen = signal(true);
  readonly badgeStyle = signal<BadgeStyleType>('light');
  readonly badgeMetric = signal<BadgeMetricType>('category');
  readonly badgeFormat = signal<BadgeFormatType>('html');
  readonly badgePreviewBg = signal<BadgePreviewBgType>('light');
  readonly badgeCopied = signal(false);
  readonly badgeVerifying = signal(false);
  readonly badgeVerifyStatus = signal<'success' | 'warning' | null>(null);
  readonly badgeVerifyMessage = signal<string | null>(null);
  readonly previewKey = signal(Date.now());

  private badgeCopyTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.loading.set(true);
          this.notFound.set(false);
          const slug = params.get('slug') || '';
          return this.listingService.getWebsiteProfile(slug).pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.loading.set(false);
        this.notFound.set(!result);
        this.profile.set(result);

        if (result) {
          // If #1 ranked, default to crown style for maximum bragging rights
          if (result.currentRankInCategory === 1) {
            this.badgeStyle.set('crown');
          }

          const desc =
            result.description ||
            `${result.listingName} is ranked #${result.currentRankInCategory} in ${result.categoryName} on RankUp. Visit their profile to see stats, ranking history, and similar websites.`;

          this.seo.updateTags({
            title: `${result.listingName} – ${result.categoryName} | Website Profile`,
            description: desc,
            url: `https://rankup.cyou/website/${result.slug}`,
            image: result.logoUrl || result.faviconUrl || undefined,
            type: 'website',
            keywords: [
              result.listingName,
              result.categoryName,
              'website ranking',
              'RankUp',
              this.formatDomain(result.listingUrl),
            ],
            breadcrumbs: [
              { name: 'Home', url: 'https://rankup.cyou' },
              { name: result.categoryName, url: `https://rankup.cyou/leaderboard/${result.categorySlug}` },
              { name: result.listingName },
            ],
            schema: [
              {
                '@type': 'WebSite',
                name: result.listingName,
                url: result.listingUrl,
                description: result.description || `${result.listingName} on RankUp`,
                image: result.logoUrl || result.faviconUrl || undefined,
              },
              {
                '@type': 'SoftwareApplication',
                name: result.listingName,
                url: result.listingUrl,
                applicationCategory: result.categoryName,
                description: desc,
                operatingSystem: 'All',
              },
              {
                '@type': 'WebPage',
                name: `${result.listingName} – Website Profile`,
                url: `https://rankup.cyou/website/${result.slug}`,
                description: desc,
                isPartOf: {
                  '@type': 'WebSite',
                  name: 'RankUp',
                  url: 'https://rankup.cyou',
                },
                mainEntity: {
                  '@type': 'WebSite',
                  name: result.listingName,
                  url: result.listingUrl,
                },
              },
            ],
          });
        }
      });
  }

  /** Exposes the shared URL normalizer to the template. */
  readonly resolveUrl = resolveUrl;

  onOutboundLinkClick(id: number): void {
    this.listingService.recordClick(id).subscribe((count) => {
      const current = this.profile();
      if (current && current.listingId === id) {
        this.profile.set({ ...current, clickCount: count });
      }
    });
  }

  openExternalUrl(url: string, id: number): void {
    window.open(resolveUrl(url), '_blank', 'noopener');
    this.onOutboundLinkClick(id);
  }

  getFaviconUrl(url: string): string {
    try {
      const host = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
    } catch {
      return '';
    }
  }

  formatDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLElement;
    target.style.display = 'none';
  }

  timeAgo(iso: string): string {
    const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }

  getRankBadgeClass(rank: number): string {
    if (rank === 1) return 'badge-rank--gold';
    if (rank === 2) return 'badge-rank--silver';
    if (rank === 3) return 'badge-rank--bronze';
    return 'badge-rank--standard';
  }

  getRankLabel(rank: number): string {
    if (rank === 1) return '🏆 #1 Champion';
    if (rank === 2) return '🥈 #2 Contender';
    if (rank === 3) return '🥉 #3 Contender';
    return `#${rank}`;
  }

  getProfileSlug(url: string): string {
    try {
      const parsed = new URL(url.includes('://') ? url : 'https://' + url);
      const host = parsed.hostname.replace(/^www\./, '');
      const hostSlug = host.replace(/\./g, '-');
      const path = parsed.pathname.replace(/^\/|\/$/g, '');
      if (path) {
        const pathSlug = path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (pathSlug) return `${hostSlug}-${pathSlug}`;
      }
      return hostSlug;
    } catch {
      return url.replace(/\./g, '-');
    }
  }

  // ── Badge Panel Methods ────────────────────────────────────────────────────
  toggleBadgePanel(): void {
    this.badgePanelOpen.update((v) => !v);
  }

  setBadgeStyle(s: BadgeStyleType): void {
    this.badgeStyle.set(s);
    this.previewKey.set(Date.now());
    // Auto-adjust preview background if user picks dark or light style
    if (s === 'dark') {
      this.badgePreviewBg.set('dark');
    } else if (s === 'light' || s === 'crown') {
      this.badgePreviewBg.set('light');
    }
  }

  setBadgeMetric(m: BadgeMetricType): void {
    this.badgeMetric.set(m);
    this.previewKey.set(Date.now());
  }

  setBadgeFormat(f: BadgeFormatType): void {
    this.badgeFormat.set(f);
  }

  setBadgePreviewBg(bg: BadgePreviewBgType): void {
    this.badgePreviewBg.set(bg);
  }

  /** URL for local preview rendering */
  getBadgePreviewUrl(slug: string): string {
    return `${API_BASE_URL}/api/badge/${encodeURIComponent(slug)}?style=${this.badgeStyle()}&metric=${this.badgeMetric()}&v=${this.previewKey()}`;
  }

  /** Production embeddable URL pointing to rankup.cyou */
  getBadgeEmbedUrl(slug: string): string {
    return `https://rankup.cyou/api/badge/${encodeURIComponent(slug)}?style=${this.badgeStyle()}&metric=${this.badgeMetric()}`;
  }

  getBadgeSnippet(slug: string): string {
    const embedUrl = this.getBadgeEmbedUrl(slug);
    const profileUrl = `https://rankup.cyou/website/${encodeURIComponent(slug)}`;

    switch (this.badgeFormat()) {
      case 'markdown':
        return `[![Ranked on RankUp](${embedUrl})](${profileUrl})`;
      case 'url':
        return embedUrl;
      case 'html':
      default:
        return `<a href="${profileUrl}" target="_blank" rel="noopener">\n  <img src="${embedUrl}" alt="Ranked on RankUp" />\n</a>`;
    }
  }

  copyBadgeSnippet(slug: string): void {
    const snippet = this.getBadgeSnippet(slug);
    navigator.clipboard.writeText(snippet).then(() => {
      this.badgeCopied.set(true);
      if (this.badgeCopyTimer) clearTimeout(this.badgeCopyTimer);
      this.badgeCopyTimer = setTimeout(() => this.badgeCopied.set(false), 2200);
    });
  }

  verifyBadge(slug: string): void {
    if (this.badgeVerifying()) return;
    this.badgeVerifying.set(true);
    this.badgeVerifyStatus.set(null);
    this.badgeVerifyMessage.set(null);

    this.listingService.verifyBadge(slug).subscribe({
      next: (res) => {
        this.badgeVerifying.set(false);
        if (res.verified) {
          const current = this.profile();
          if (current) {
            this.profile.set({
              ...current,
              badgeVerified: true,
              badgeVerifiedAt: res.checkedAt,
            });
          }
          this.badgeVerifyStatus.set('success');
          this.badgeVerifyMessage.set('✓ Badge verified! The backlink was detected on your website.');
          this.previewKey.set(Date.now());
        } else {
          this.badgeVerifyStatus.set('warning');
          this.badgeVerifyMessage.set(
            'We could not detect the badge link on your website homepage yet. Make sure your site HTML contains a link to your RankUp profile and try again.',
          );
        }
      },
      error: () => {
        this.badgeVerifying.set(false);
        this.badgeVerifyStatus.set('warning');
        this.badgeVerifyMessage.set('Could not verify at this time. Please check your website URL and try again.');
      },
    });
  }
}
