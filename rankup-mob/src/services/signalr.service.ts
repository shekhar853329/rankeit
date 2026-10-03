import * as signalR from '@microsoft/signalr';
import { getHubUrl } from './api';
import { ListingClickedPayload, LiveClaimEventDto, RankUpdatedPayload } from '../models';

type Listener<T> = (data: T) => void;

class SignalRManager {
  private connection: signalR.HubConnection | null = null;
  private isConnecting = false;
  private onlineUsersListeners = new Set<Listener<number>>();
  private listingClickedListeners = new Set<Listener<ListingClickedPayload>>();
  private liveClaimListeners = new Set<Listener<LiveClaimEventDto>>();
  private rankUpdatedListeners = new Set<Listener<RankUpdatedPayload>>();
  private leaderboardUpdatedListeners = new Set<Listener<string | null>>();

  private joinedGlobal = false;
  private currentCategory: string | null = null;

  async start(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return;
    }
    if (this.isConnecting) return;

    if (this.connection) {
      try {
        await this.connection.stop();
      } catch {
        // Ignore
      }
      this.connection = null;
    }

    this.isConnecting = true;

    try {
      const hubUrl = await getHubUrl();
      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl, {
          skipNegotiation: false,
          transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
          headers: {
            'X-App-Client': 'Ranker-UI-Client',
          },
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .configureLogging(signalR.LogLevel.None)
        .build();

      // Register event listeners
      this.connection.on('OnlineUsersUpdated', (count: number) => {
        this.onlineUsersListeners.forEach((fn) => fn(count));
      });

      this.connection.on('ListingClicked', (payload: ListingClickedPayload) => {
        this.listingClickedListeners.forEach((fn) => fn(payload));
      });

      this.connection.on('ClaimPlaced', (claimEvent: LiveClaimEventDto) => {
        this.liveClaimListeners.forEach((fn) => fn(claimEvent));
      });

      this.connection.on('RankUpdated', (payload: RankUpdatedPayload) => {
        this.rankUpdatedListeners.forEach((fn) => fn(payload));
      });

      this.connection.on('LeaderboardUpdated', (categorySlug: string) => {
        this.leaderboardUpdatedListeners.forEach((fn) => fn(categorySlug));
      });

      this.connection.onreconnected(async () => {
        if (this.joinedGlobal) {
          await this.connection?.invoke('JoinGlobalGroup').catch(() => {});
        }
        if (this.currentCategory) {
          await this.connection?.invoke('JoinCategoryGroup', this.currentCategory).catch(() => {});
        }
      });

      try {
        await this.connection.start();
      } catch {
        // Will auto-reconnect or be retried on next user interaction
      }

      // Re-join groups if previously requested
      if (this.joinedGlobal && this.connection.state === signalR.HubConnectionState.Connected) {
        await this.connection.invoke('JoinGlobalGroup').catch(() => {});
      }
      if (this.currentCategory && this.connection.state === signalR.HubConnectionState.Connected) {
        await this.connection.invoke('JoinCategoryGroup', this.currentCategory).catch(() => {});
      }
    } catch {
      // Hub may not be reached if backend is offline or network changes
    } finally {
      this.isConnecting = false;
    }
  }

  async stop(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.stop();
      } catch {
        // Ignore
      }
      this.connection = null;
    }
  }

  async joinGlobalGroup(): Promise<void> {
    this.joinedGlobal = true;
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke('JoinGlobalGroup');
      } catch {
        // Ignore
      }
    }
  }

  async leaveGlobalGroup(): Promise<void> {
    this.joinedGlobal = false;
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke('LeaveGlobalGroup');
      } catch {
        // Ignore
      }
    }
  }

  async joinCategoryGroup(categorySlug: string): Promise<void> {
    this.currentCategory = categorySlug;
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke('JoinCategoryGroup', categorySlug);
      } catch {
        // Ignore
      }
    }
  }

  async leaveCategoryGroup(categorySlug: string): Promise<void> {
    if (this.currentCategory === categorySlug) {
      this.currentCategory = null;
    }
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke('LeaveCategoryGroup', categorySlug);
      } catch {
        // Ignore
      }
    }
  }

  onOnlineUsersUpdated(fn: Listener<number>): () => void {
    this.onlineUsersListeners.add(fn);
    return () => this.onlineUsersListeners.delete(fn);
  }

  onUserCountChanged(fn: Listener<number>): () => void {
    return this.onOnlineUsersUpdated(fn);
  }

  onListingClicked(fn: Listener<ListingClickedPayload>): () => void {
    this.listingClickedListeners.add(fn);
    return () => this.listingClickedListeners.delete(fn);
  }

  onLiveClaim(fn: Listener<LiveClaimEventDto>): () => void {
    this.liveClaimListeners.add(fn);
    return () => this.liveClaimListeners.delete(fn);
  }

  onRankUpdated(fn: Listener<RankUpdatedPayload>): () => void {
    this.rankUpdatedListeners.add(fn);
    return () => this.rankUpdatedListeners.delete(fn);
  }

  onLeaderboardUpdated(fn: Listener<string | null>): () => void {
    this.leaderboardUpdatedListeners.add(fn);
    return () => this.leaderboardUpdatedListeners.delete(fn);
  }
}

export const signalRService = new SignalRManager();
