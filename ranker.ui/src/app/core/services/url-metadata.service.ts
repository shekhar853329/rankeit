import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { API_BASE_URL } from '../config/api-config';
import { UrlMetadataDto } from '../models/url-metadata.model';

@Injectable({ providedIn: 'root' })
export class UrlMetadataService {
  private readonly http = inject(HttpClient);

  /** Fetches OG/meta data for the given URL. Returns an all-null result on any error. */
  fetch(url: string): Observable<UrlMetadataDto> {
    return this.http
      .get<UrlMetadataDto>(`${API_BASE_URL}/api/url-metadata`, {
        params: { url },
      })
      .pipe(
        catchError(() => of({ siteName: null, logoUrl: null, description: null, faviconUrl: null })),
      );
  }
}
