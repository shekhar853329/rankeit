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
      title: 'Ranking Rules, Governance & Placement Mechanics',
      description:
        'Understand how RankUp rankings work: credit rollover rules, continuous sponsored rankings, fair placement protection, and transparent ranking calculations.',
      url: 'https://rankup.cyou/rules',
    });
  }
}


