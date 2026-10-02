import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-rules',
  standalone: true,
  templateUrl: './rules.component.html',
  styleUrl: './rules.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RulesComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Bidding Rules, Governance & Auction Mechanics',
      description:
        'Understand how RankUp rankings work: credit rollover rules, continuous English ascending auctions, anti-sniping protection, and transparent bid calculations.',
      url: 'https://rankup.cyou/rules',
    });
  }
}


