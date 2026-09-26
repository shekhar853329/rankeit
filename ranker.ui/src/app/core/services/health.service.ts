import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, Subscription, catchError, of, timeout } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { ApiSystemStatus, HealthStatusDto } from '../models/health.model';

@Injectable({ providedIn: 'root' })
export class HealthService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private timerSub?: Subscription;

  readonly status = signal<ApiSystemStatus>('checking');
  readonly healthData = signal<HealthStatusDto | null>(null);
  readonly lastChecked = signal<Date | null>(null);
  readonly isChecking = signal<boolean>(false);

  readonly isOperational = computed(() => this.status() === 'operational');

  readonly statusLabel = computed(() => {
    switch (this.status()) {
      case 'operational':
        return 'API Systems Operational';
      case 'degraded':
        return 'API Systems Degraded';
      case 'offline':
        return 'API Systems Offline';
      case 'checking':
      default:
        return 'Checking API Systems...';
    }
  });

  readonly statusTooltip = computed(() => {
    const currentStatus = this.status();
    const data = this.healthData();
    const checked = this.lastChecked()?.toLocaleTimeString();

    if (currentStatus === 'operational') {
      const dbInfo = data?.database ? ` • DB: ${data.database}` : '';
      const uptimeInfo = data?.uptime ? ` • Uptime: ${data.uptime}` : '';
      return `Operational${dbInfo}${uptimeInfo}${checked ? ` • Checked: ${checked}` : ''} • Click to re-check`;
    }

    if (currentStatus === 'degraded') {
      const dbInfo = data?.database ? ` (DB: ${data.database})` : '';
      return `API reachable but service degraded${dbInfo}${checked ? ` • Checked: ${checked}` : ''} • Click to retry`;
    }

    if (currentStatus === 'offline') {
      return `Backend API unreachable (${API_BASE_URL})${checked ? ` • Checked: ${checked}` : ''} • Click to retry`;
    }

    return 'Pinging backend API health check...';
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.checkHealth();
      // Periodically poll every 45 seconds to keep health status accurate
      const intervalMs = 45_000;
      const intervalId = window.setInterval(() => {
        this.checkHealth();
      }, intervalMs);

      this.timerSub = new Subscription(() => window.clearInterval(intervalId));
    }
  }

  checkHealth(): Observable<HealthStatusDto | null> {
    this.isChecking.set(true);

    const check$ = this.http.get<HealthStatusDto>(`${API_BASE_URL}/api/health`).pipe(
      timeout(5000),
      catchError((error) => {
        return of(null);
      })
    );

    check$.subscribe((res) => {
      this.isChecking.set(false);
      this.lastChecked.set(new Date());

      if (res) {
        this.healthData.set(res);
        if (res.status?.toLowerCase() === 'healthy') {
          this.status.set('operational');
        } else {
          this.status.set('degraded');
        }
      } else {
        this.healthData.set(null);
        this.status.set('offline');
      }
    });

    return check$;
  }

  ngOnDestroy(): void {
    this.timerSub?.unsubscribe();
  }
}
