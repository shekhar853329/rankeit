import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface ClaimHeroCategory {
  slug: string;
  name: string;
  icon?: string;
}

@Component({
  selector: 'app-claim-hero',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './claim-hero.component.html',
  styleUrl: './claim-hero.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClaimHeroComponent {
  readonly rank = input.required<number>();
  readonly amount = input<number | null>(null);
  readonly url = input('');
  readonly faviconUrl = input<string | null>(null);
  readonly metadataLoading = input(false);
  readonly invalid = input(false);
  readonly showInvalid = input(false);
  readonly disabled = input(false);
  readonly inputType = input<'text' | 'url'>('url');
  readonly placeholder = input('Your product URL or @handle');
  readonly categories = input<ClaimHeroCategory[]>([]);
  readonly selectedCategory = input<string | null>(null);

  readonly urlChange = output<string>();
  readonly urlBlur = output<void>();
  readonly categoryChange = output<string | null>();
  readonly decrement = output<void>();
  readonly increment = output<void>();
  readonly claim = output<void>();
  readonly faviconError = output<Event>();
}
