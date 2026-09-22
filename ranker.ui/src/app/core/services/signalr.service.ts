import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Observable, Subject } from 'rxjs';
import { HUB_URL } from '../config/api-config';
import { RankUpdatedPayload } from '../models/leaderboard.model';

/**
 * Wraps the @microsoft/signalr connection lifecycle and exposes it as RxJS observables so components
 * never touch the HubConnection directly (rule D2).
 */
@Injectable({ providedIn: 'root' })
export class SignalrService implements OnDestroy {
  private connection: signalR.HubConnection | null = null;
  private startPromise: Promise<void> | null = null;

  private readonly rankUpdatedSubject = new Subject<RankUpdatedPayload>();

  /** Emits every "RankUpdated" event received, regardless of which group(s) it came from. */
  readonly rankUpdated$: Observable<RankUpdatedPayload> = this.rankUpdatedSubject.asObservable();

  private async ensureConnected(): Promise<void> {
    if (!this.connection) {
      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(HUB_URL)
        .withAutomaticReconnect()
        .build();

      this.connection.on('RankUpdated', (payload: RankUpdatedPayload) => {
        this.rankUpdatedSubject.next(payload);
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
