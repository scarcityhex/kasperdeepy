'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import AdaWalletConnector from './AdaWalletConnector';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';

interface AdaClaimButtonProps {
  isDisabled?: boolean;
}

export default function AdaClaimButton({ isDisabled = false }: AdaClaimButtonProps) {
  const [address, setAddress] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const onWalletConnected = (addr: string, connected: boolean, netId: number | undefined) => {
    setAddress(addr);
    setIsConnected(connected);
    setNetwork(netId);
  };

  const handleClaimClick = async () => {
    if (!address || !user) {
      alert("Wallet not connected or user not authenticated.");
      return;
    }

    setLoading(true);

    try {
      const token = await user.getIdToken();

      await axios.post(
        '/api/NFT/blockfrost',
        { address },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      alert("NFTs Claimed with Success!");

    } catch (error) {
      console.error("Error claiming NFTs:", error);
      alert("Error claiming NFTs. See console for details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AdaWalletConnector onWalletConnected={onWalletConnected} />

      {isConnected && network === 1 && (
        <button 
          onClick={handleClaimClick} 
          disabled={loading || isDisabled}
          className="ml-2 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center gap-2 disabled:bg-gray-400"
        >
          <Image src="/Ada/CardanoADA.png" alt="Cardano" width={20} height={20} />
          <span>{loading ? 'Claiming...' : 'Claim'}</span>
        </button>
      )}
    </>
  );
} 