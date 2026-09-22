import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { PlaceBidRequestDto, PlaceBidResultDto } from '../models/bid.model';

@Injectable({ providedIn: 'root' })
export class BidService {
  private readonly http = inject(HttpClient);

  placeBid(request: PlaceBidRequestDto): Observable<PlaceBidResultDto> {
    return this.http.post<PlaceBidResultDto>(`${API_BASE_URL}/api/bids`, request);
  }
}
