import React, { createContext, useContext, useState } from 'react';

export interface ClaimModalPayload {
  rank?: number;
  categoryName?: string;
  categorySlug?: string;
  categoryId?: number;
  amount?: number;
  minStartingBid?: number;
  minBidIncrement?: number;
  listingId?: number | null;
  listingName?: string;
  listingUrl?: string;
  siteName?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  faviconUrl?: string | null;
  currentBidAmount?: number;
  currentTopBid?: number | null;
  onSuccess?: () => void;
}

interface ModalContextType {
  modalPayload: ClaimModalPayload | null;
  openClaimModal: (payload: ClaimModalPayload) => void;
  closeClaimModal: () => void;
}

const ModalContext = createContext<ModalContextType>({
  modalPayload: null,
  openClaimModal: () => {},
  closeClaimModal: () => {},
});

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalPayload, setModalPayload] = useState<ClaimModalPayload | null>(null);

  const openClaimModal = (payload: ClaimModalPayload) => {
    setModalPayload(payload);
  };

  const closeClaimModal = () => {
    setModalPayload(null);
  };

  return (
    <ModalContext.Provider value={{ modalPayload, openClaimModal, closeClaimModal }}>
      {children}
    </ModalContext.Provider>
  );
};

export function useClaimModal(): ModalContextType {
  return useContext(ModalContext);
}
