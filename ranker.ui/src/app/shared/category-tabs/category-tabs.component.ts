import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryDto } from '../../core/models/category.model';

@Component({
  selector: 'app-category-tabs',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './category-tabs.component.html',
  styleUrl: './category-tabs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryTabsComponent {
  readonly categories = input<CategoryDto[]>([]);
  readonly selected = input<string | null>(null);
  readonly select = output<string | null>();
}
