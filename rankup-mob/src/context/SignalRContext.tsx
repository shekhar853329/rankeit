import React, { createContext, useContext, useEffect, useState } from 'react';
import { recordSiteVisit } from '../services/api';
import { signalRService } from '../services/signalr.service';
import { ListingClickedPayload, LiveClaimEventDto, RankUpdatedPayload } from '../models';

interface SignalRContextType {
  onlineUsers: number;
  visitsToday: number;
  lastLiveClaim: LiveClaimEventDto | null;
  lastRankUpdate: RankUpdatedPayload | null;
  clickCounts: Record<number, number>;
  refreshSignalR: () => void;
}

const SignalRContext = createContext<SignalRContextType>({
  onlineUsers: 1,
  visitsToday: 1,
  lastLiveClaim: null,
  lastRankUpdate: null,
  clickCounts: {},
  refreshSignalR: () => {},
});

export const SignalRProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [onlineUsers, setOnlineUsers] = useState<number>(1);
  const [visitsToday, setVisitsToday] = useState<number>(1);
  const [lastLiveClaim, setLastLiveClaim] = useState<LiveClaimEventDto | null>(null);
  const [lastRankUpdate, setLastRankUpdate] = useState<RankUpdatedPayload | null>(null);
  const [clickCounts, setClickCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    // Record visit
    recordSiteVisit()
      .then((res) => {
        if (res && res.visitsToday) setVisitsToday(res.visitsToday);
      })
      .catch(() => {});

    // Start SignalR
    signalRService.start();
    signalRService.joinGlobalGroup();

    const unsubUsers = signalRService.onOnlineUsersUpdated((count) => {
      setOnlineUsers(count);
    });

    const unsubClicks = signalRService.onListingClicked((payload: ListingClickedPayload) => {
      setClickCounts((prev) => ({ ...prev, [payload.listingId]: payload.clickCount }));
    });

    const unsubClaims = signalRService.onLiveClaim((event: LiveClaimEventDto) => {
      setLastLiveClaim(event);
    });

    const unsubRanks = signalRService.onRankUpdated((payload: RankUpdatedPayload) => {
      setLastRankUpdate({ ...payload });
    });

    return () => {
      unsubUsers();
      unsubClicks();
      unsubClaims();
      unsubRanks();
      signalRService.leaveGlobalGroup();
      signalRService.stop();
    };
  }, []);

  const refreshSignalR = () => {
    signalRService.start();
  };

  return (
    <SignalRContext.Provider
      value={{
        onlineUsers,
        visitsToday,
        lastLiveClaim,
        lastRankUpdate,
        clickCounts,
        refreshSignalR,
      }}>
      {children}
    </SignalRContext.Provider>
  );
};

export function useSignalR(): SignalRContextType {
  return useContext(SignalRContext);
}
