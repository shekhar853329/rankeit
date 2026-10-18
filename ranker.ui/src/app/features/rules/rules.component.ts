import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-rules',
  standalone: true,
  imports: [RouterLink],
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
      breadcrumbs: [
        { name: 'Home', url: 'https://rankup.cyou' },
        { name: 'Rules & Governance' },
      ],
      schema: [
        {
          '@type': 'FAQPage',
          '@id': 'https://rankup.cyou/rules#faq',
          mainEntity: [
            {
              '@type': 'Question',
              name: 'Do I have to pay every day to stay on the leaderboard?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'No! Once placed, your placement is permanent on the All-Time Leaderboard for as long as your listing is active. To appear on Today, you simply need to have placed a placement or top-up on that day.',
              },
            },
            {
              '@type': 'Question',
              name: 'Can I lower my placement amount or withdraw it?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'No. Placements can only be increased, never decreased. This ensures complete transparency, stability, and fairness for all competing products on the leaderboard.',
              },
            },
            {
              '@type': 'Question',
              name: 'Can someone else change or promote my website URL?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'No. Every listing is securely tied to the contact email you provided during your first placement. If someone tries to submit a placement on your website using a different email, the system rejects it immediately.',
              },
            },
            {
              '@type': 'Question',
              name: 'What if another creator places a placement at the exact same moment?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Our system processes transactions securely in real time. If a competitor payment confirms a fraction of a second before yours and renders your placement too low, your funds are never lost—they are automatically held safely for immediate reconciliation or refund.',
              },
            },
            {
              '@type': 'Question',
              name: 'Where do users go when they click on my listing?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Visitors are sent directly to your website URL in a new browser tab without annoying interstitial pages or ad walls.',
              },
            },
            {
              '@type': 'Question',
              name: 'Can I update my product name, description, or logo?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: "Yes! Whenever you place an upgrade on your existing listing, our system automatically re-scrapes your URL's updated metadata to keep your profile fresh.",
              },
            },
          ],
        },
        {
          '@type': 'HowTo',
          name: 'How to Rank Your Product on RankUp',
          description: 'Three simple steps to gain live global visibility for your project on RankUp.',
          step: [
            {
              '@type': 'HowToStep',
              position: 1,
              name: 'Choose Your Category',
              text: 'Pick the vertical where your audience browses and submit your website URL.',
              url: 'https://rankup.cyou/categories',
            },
            {
              '@type': 'HowToStep',
              position: 2,
              name: 'Set Your Placement',
              text: 'Enter any amount to claim the #1 spotlight or secure any spot fitting your budget with 100% credit rollover.',
              url: 'https://rankup.cyou/rules',
            },
            {
              '@type': 'HowToStep',
              position: 3,
              name: 'Get Instant Direct Traffic',
              text: 'Upon payment confirmation, your listing goes live across global and category leaderboards immediately.',
              url: 'https://rankup.cyou/',
            },
          ],
        },
      ],
    });
  }
}
