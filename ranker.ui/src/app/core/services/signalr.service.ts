import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { HUB_URL } from '../config/api-config';
import { ListingClickedPayload, RankUpdatedPayload } from '../models/leaderboard.model';

/**
 * Wraps the @microsoft/signalr connection lifecycle and exposes it as RxJS observables so components
 * never touch the HubConnection directly (rule D2).
 */
@Injectable({ providedIn: 'root' })
export class SignalrService implements OnDestroy {
  private connection: signalR.HubConnection | null = null;
  private startPromise: Promise<void> | null = null;

  private readonly rankUpdatedSubject = new Subject<RankUpdatedPayload>();
  private readonly onlineUsersSubject = new BehaviorSubject<number>(0);
  private readonly listingClickedSubject = new Subject<ListingClickedPayload>();

  /** Emits every "RankUpdated" event received, regardless of which group(s) it came from. */
  readonly rankUpdated$: Observable<RankUpdatedPayload> = this.rankUpdatedSubject.asObservable();

  /** Emits the live count of connected clients, pushed by the hub on every connect/disconnect. */
  readonly onlineUsers$: Observable<number> = this.onlineUsersSubject.asObservable();

  /** Emits every "ListingClicked" event, so all viewers see click-through counts update live. */
  readonly listingClicked$: Observable<ListingClickedPayload> = this.listingClickedSubject.asObservable();

  private async ensureConnected(): Promise<void> {
    if (!this.connection) {
      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(HUB_URL)
        .withAutomaticReconnect()
        .build();

      this.connection.on('RankUpdated', (payload: RankUpdatedPayload) => {
        this.rankUpdatedSubject.next(payload);
      });

      this.connection.on('OnlineUsersUpdated', (count: number) => {
        this.onlineUsersSubject.next(count);
      });

      this.connection.on('ListingClicked', (payload: ListingClickedPayload) => {
        this.listingClickedSubject.next(payload);
      });
    }

    if (!this.startPromise) {
      this.startPromise = this.connection.start().catch((err) => {
        this.startPromise = null;
        throw err;
      });
    }

    return this.startPromise;
  }

  /** Opens the hub connection if it isn't already open, without joining any group. */
  async connect(): Promise<void> {
    await this.ensureConnected();
  }

  async joinCategoryGroup(categorySlug: string): Promise<void> {
    await this.ensureConnected();
    await this.connection!.invoke('JoinCategoryGroup', categorySlug);
  }

  async leaveCategoryGroup(categorySlug: string): Promise<void> {
    if (!this.connection) {
      return;
    }
    await this.connection.invoke('LeaveCategoryGroup', categorySlug);
  }

  async joinGlobalGroup(): Promise<void> {
    await this.ensureConnected();
    await this.connection!.invoke('JoinGlobalGroup');
  }

  async leaveGlobalGroup(): Promise<void> {
    if (!this.connection) {
      return;
    }
    await this.connection.invoke('LeaveGlobalGroup');
  }

  ngOnDestroy(): void {
    void this.connection?.stop();
  }
}
