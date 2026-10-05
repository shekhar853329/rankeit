import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';
import { LEGAL_CONFIG } from '../../core/constants/legal.constants';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsComponent implements OnInit {
  private readonly seo = inject(SeoService);
  readonly legal = LEGAL_CONFIG;

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Terms of Service & Sponsored Listing Policies - RankUp',
      description: 'Review RankUp terms of service, sponsored advertising policies, payment processing, and user rights.',
      url: `${this.legal.websiteUrl}/terms`,
    });
  }
}
