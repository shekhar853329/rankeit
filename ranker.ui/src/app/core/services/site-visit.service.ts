import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { SiteVisitsTodayDto } from '../models/site-visit.model';

@Injectable({ providedIn: 'root' })
export class SiteVisitService {
  private readonly http = inject(HttpClient);

  /** Increments today's visit counter by one (e.g. once per tab/page load) and returns today's total. */
  trackVisit(): Observable<SiteVisitsTodayDto> {
    return this.http.post<SiteVisitsTodayDto>(`${API_BASE_URL}/api/analytics/visits/track`, {});
  }
}
