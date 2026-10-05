import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';
import { LEGAL_CONFIG } from '../../core/constants/legal.constants';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyComponent implements OnInit {
  private readonly seo = inject(SeoService);
  readonly legal = LEGAL_CONFIG;

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Privacy Policy & Data Disclosures - RankUp',
      description: 'Review RankUp privacy policy, data collection disclosures, cookie practices, and analytics tracking.',
      url: `${this.legal.websiteUrl}/privacy`,
    });
  }
}
