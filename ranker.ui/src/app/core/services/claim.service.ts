import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { PlaceClaimRequestDto, PlaceClaimResultDto, CalculateClaimQuoteRequestDto, CalculateClaimQuoteResponseDto } from '../models/claim.model';

@Injectable({ providedIn: 'root' })
export class ClaimService {
  private readonly http = inject(HttpClient);

  placeClaim(request: PlaceClaimRequestDto): Observable<PlaceClaimResultDto> {
    return this.http.post<PlaceClaimResultDto>(`${API_BASE_URL}/api/claims`, request);
  }

  calculateClaimQuote(request: CalculateClaimQuoteRequestDto): Observable<CalculateClaimQuoteResponseDto> {
    return this.http.post<CalculateClaimQuoteResponseDto>(`${API_BASE_URL}/api/claims/calculate`, request);
  }
}
