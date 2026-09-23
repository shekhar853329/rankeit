import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { SignalrService } from '../../core/services/signalr.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent implements OnInit {
  protected readonly theme = inject(ThemeService);
  private readonly signalr = inject(SignalrService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly onlineUsers = signal(0);

  ngOnInit(): void {
    void this.signalr.connect();
    this.signalr.onlineUsers$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((count) => this.onlineUsers.set(count));
  }
}
