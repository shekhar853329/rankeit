import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HealthService } from '../../core/services/health.service';
import { LEGAL_CONFIG } from '../../core/constants/legal.constants';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  protected readonly healthService = inject(HealthService);
  readonly legal = LEGAL_CONFIG;
  readonly currentYear = new Date().getFullYear();

  onCheckHealth(): void {
    this.healthService.checkHealth();
  }
}
