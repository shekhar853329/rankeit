import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import {
  GaConfigStatusDto,
  GaRealtimeReportDto,
  GoogleAnalyticsReportDto,
} from '../models/google-analytics.model';

@Injectable({ providedIn: 'root' })
export class GoogleAnalyticsService {
  private readonly http = inject(HttpClient);

  getOverview(days = 30): Observable<GoogleAnalyticsReportDto> {
    const params = new HttpParams().set('days', days.toString());
    return this.http.get<GoogleAnalyticsReportDto>(`${API_BASE_URL}/api/analytics/ga/overview`, {
      params,
    });
  }

  getRealtime(): Observable<GaRealtimeReportDto> {
    return this.http.get<GaRealtimeReportDto>(`${API_BASE_URL}/api/analytics/ga/realtime`);
  }

  getStatus(): Observable<GaConfigStatusDto> {
    return this.http.get<GaConfigStatusDto>(`${API_BASE_URL}/api/analytics/ga/status`);
  }
}
