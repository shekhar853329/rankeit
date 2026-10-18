import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'About RankUp',
      description:
        'RankUp is a live product leaderboard built by indie developer Shekhar. Learn how our transparent, claim-based ranking system helps founders, makers, and creators gain real visibility.',
      url: 'https://rankup.cyou/about',
      breadcrumbs: [
        { name: 'Home', url: 'https://rankup.cyou' },
        { name: 'About RankUp' },
      ],
      schema: {
        '@type': 'AboutPage',
        name: 'About RankUp',
        description:
          'RankUp is a live product leaderboard built by indie developer Shekhar. Learn how our transparent, claim-based ranking system helps founders, makers, and creators gain real visibility.',
        url: 'https://rankup.cyou/about',
        mainEntity: {
          '@type': 'Organization',
          name: 'RankUp',
          url: 'https://rankup.cyou/',
          founder: {
            '@type': 'Person',
            name: 'Shekhar',
            jobTitle: 'Founder & Developer',
          },
        },
      },
    });
  }
}
