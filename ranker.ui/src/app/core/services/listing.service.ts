import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { ListingDetailDto } from '../models/listing-detail.model';

@Injectable({ providedIn: 'root' })
export class ListingService {
  private readonly http = inject(HttpClient);

  getListingDetail(listingId: number): Observable<ListingDetailDto> {
    return this.http.get<ListingDetailDto>(`${API_BASE_URL}/api/listings/${listingId}`);
  }
}
