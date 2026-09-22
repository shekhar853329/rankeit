import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GlobalLeaderboardEntryDto } from '../../core/models/leaderboard.model';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { SignalrService } from '../../core/services/signalr.service';

@Component({
  selector: 'app-global-leaderboard',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './global-leaderboard.component.html',
  styleUrl: './global-leaderboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalLeaderboardComponent implements OnInit {
  private readonly leaderboardService = inject(LeaderboardService);
  private readonly signalr = inject(SignalrService);
  private readonly destroyRef = inject(DestroyRef);

  readonly entries = signal<GlobalLeaderboardEntryDto[]>([]);
  readonly loading = signal(true);
  readonly topN = signal(20);

  ngOnInit(): void {
    this.load();

    void this.signalr.joinGlobalGroup();
    this.destroyRef.onDestroy(() => void this.signalr.leaveGlobalGroup());

    // Any RankUpdated event flagged as "became category top" can change the global board's normalized
    // ranking, so re-fetch the (cached, cheap) read model rather than trying to patch it locally.
    this.signalr.rankUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((payload) => {
      if (payload.becameCategoryTop) {
        this.load();
      }
    });
  }

  private load(): void {
    this.leaderboardService.getGlobalLeaderboard(this.topN()).subscribe((entries) => {
      this.entries.set(entries);
      this.loading.set(false);
    });
  }
}
