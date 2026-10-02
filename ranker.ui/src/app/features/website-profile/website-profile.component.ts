import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { catchError, of, switchMap } from 'rxjs';
import { WebsiteProfileDto, RelatedListingDto } from '../../core/models/website-profile.model';
import { ListingService } from '../../core/services/listing.service';
import { SeoService } from '../../core/services/seo.service';

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
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: result.listingName,
                url: result.listingUrl,
                description: result.description || `${result.listingName} on RankUp`,
                image: result.logoUrl || result.faviconUrl || undefined,
              },
              {
                '@context': 'https://schema.org',
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
                breadcrumb: {
                  '@type': 'BreadcrumbList',
                  itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rankup.cyou' },
                    {
                      '@type': 'ListItem',
                      position: 2,
                      name: result.categoryName,
                      item: `https://rankup.cyou/leaderboard/${result.categorySlug}`,
                    },
                    { '@type': 'ListItem', position: 3, name: result.listingName },
                  ],
                },
              },
            ],
          });
        }
      });
  }

  openExternalUrl(url: string, id: number): void {
    window.open(url, '_blank', 'noopener,noreferrer');
    this.listingService.recordClick(id).subscribe((count) => {
      const current = this.profile();
      if (current && current.listingId === id) {
        this.profile.set({ ...current, clickCount: count });
      }
    });
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
      const host = new URL(url.includes('://') ? url : 'https://' + url).hostname
        .replace(/^www\./, '')
        .replace(/\./g, '-');
      return host;
    } catch {
      return url.replace(/\./g, '-');
    }
  }
}
