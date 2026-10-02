import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { ListingDetailDto, ListingLookupResultDto } from '../models/listing-detail.model';
import { WebsiteProfileDto } from '../models/website-profile.model';

@Injectable({ providedIn: 'root' })
export class ListingService {
  private readonly http = inject(HttpClient);

  getListingDetail(listingId: number): Observable<ListingDetailDto> {
    return this.http.get<ListingDetailDto>(`${API_BASE_URL}/api/listings/${listingId}`);
  }

  /** Fetches the full public website profile by URL-slug (e.g. "example-com"). */
  getWebsiteProfile(slug: string): Observable<WebsiteProfileDto> {
    return this.http.get<WebsiteProfileDto>(`${API_BASE_URL}/api/listings/profile/${encodeURIComponent(slug)}`);
  }

  /** Records a click-through to the listing's product URL; the hub broadcasts the new count live. */
  recordClick(listingId: number): Observable<number> {
    return this.http.post<number>(`${API_BASE_URL}/api/listings/${listingId}/click`, {});
  }

  /** Checks if a domain/URL already has an active listing in the specified category. */
  lookupListing(categoryId: number, url: string): Observable<ListingLookupResultDto> {
    return this.http.get<ListingLookupResultDto>(`${API_BASE_URL}/api/listings/lookup`, {
      params: { categoryId: String(categoryId), url: url.trim() },
    });
  }
}

