import { DOCUMENT } from '@angular/common';
import { Injectable, PLATFORM_ID, RendererFactory2, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface SeoConfig {
  title: string;
  description: string;
  url?: string;
  image?: string;
  type?: 'website' | 'article' | 'product';
  keywords?: string[];
  schema?: Record<string, unknown> | Array<Record<string, unknown>>;
  breadcrumbs?: Array<{ name: string; url?: string }>;
}

const DEFAULT_ORIGIN = 'https://rankup.cyou';
const DEFAULT_IMAGE = 'https://rankup.cyou/apple-touch-icon.png';
const DEFAULT_SITE_NAME = 'RankUp';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly rendererFactory = inject(RendererFactory2);
  private readonly renderer = this.rendererFactory.createRenderer(null, null);

  private readonly jsonLdScriptId = 'rankup-jsonld-schema';

  updateTags(config: SeoConfig): void {
    const formattedTitle = config.title.includes(DEFAULT_SITE_NAME)
      ? config.title
      : `${config.title} | ${DEFAULT_SITE_NAME}`;

    const canonicalUrl = config.url
      ? (config.url.startsWith('http') ? config.url : `${DEFAULT_ORIGIN}${config.url}`)
      : DEFAULT_ORIGIN;

    const imageUrl = config.image
      ? (config.image.startsWith('http') ? config.image : `${DEFAULT_ORIGIN}/${config.image.replace(/^\//, '')}`)
      : DEFAULT_IMAGE;

    // 1. Document Title
    this.titleService.setTitle(formattedTitle);

    // 2. Primary Meta Tags
    this.metaService.updateTag({ name: 'description', content: config.description });
    this.metaService.updateTag({ name: 'robots', content: 'index, follow, max-snippet:-1, max-image-preview:large' });

    if (config.keywords && config.keywords.length > 0) {
      this.metaService.updateTag({ name: 'keywords', content: config.keywords.join(', ') });
    }

    // 3. Open Graph Tags
    this.metaService.updateTag({ property: 'og:site_name', content: DEFAULT_SITE_NAME });
    this.metaService.updateTag({ property: 'og:type', content: config.type || 'website' });
    this.metaService.updateTag({ property: 'og:title', content: formattedTitle });
    this.metaService.updateTag({ property: 'og:description', content: config.description });
    this.metaService.updateTag({ property: 'og:url', content: canonicalUrl });
    this.metaService.updateTag({ property: 'og:image', content: imageUrl });

    // 4. Twitter Card Tags
    this.metaService.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.metaService.updateTag({ name: 'twitter:title', content: formattedTitle });
    this.metaService.updateTag({ name: 'twitter:description', content: config.description });
    this.metaService.updateTag({ name: 'twitter:image', content: imageUrl });

    // 5. Canonical Link
    this.updateCanonicalLink(canonicalUrl);

    // 6. JSON-LD Structured Data
    if (config.breadcrumbs && config.breadcrumbs.length > 0) {
      const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': config.breadcrumbs.map((b, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: b.name,
          item: b.url ? b.url : undefined
        }))
      };
      this.setJsonLd(breadcrumbSchema);
    } else if (config.schema) {
      this.setJsonLd(config.schema);
    } else {
      this.removeJsonLd();
    }
  }

  private updateCanonicalLink(url: string): void {
    let link: HTMLLinkElement | null = this.document.querySelector("link[rel='canonical']");
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  setJsonLd(schema: Record<string, unknown> | Array<Record<string, unknown>>): void {
    let script: HTMLScriptElement | null = this.document.getElementById(this.jsonLdScriptId) as HTMLScriptElement;
    if (!script) {
      script = this.renderer.createElement('script');
      this.renderer.setAttribute(script, 'id', this.jsonLdScriptId);
      this.renderer.setAttribute(script, 'type', 'application/ld+json');
      this.renderer.appendChild(this.document.head, script);
    }
    const json = JSON.stringify(schema, null, 2);
    this.renderer.setProperty(script, 'textContent', json);
  }

  removeJsonLd(): void {
    const script = this.document.getElementById(this.jsonLdScriptId);
    if (script && script.parentNode) {
      this.renderer.removeChild(script.parentNode, script);
    }
  }
}
