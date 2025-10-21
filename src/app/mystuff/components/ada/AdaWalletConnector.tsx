'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Modal from '@/components/ui/Modal';
import Link from 'next/link';

interface WalletAPI {
    getUsedAddresses: () => Promise<string[]>;
    getNetworkId: () => Promise<number>;
}

interface CardanoWallet {
    enable: () => Promise<WalletAPI>;
}

interface CardanoWindow extends Window {
    cardano?: {
        [key: string]: CardanoWallet | undefined;
        lace?: CardanoWallet;
        nami?: CardanoWallet;
    };
}

declare const window: CardanoWindow;

interface AdaWalletConnectorProps {
    onWalletConnected: (address: string, isConnected: boolean, networkId: number | undefined) => void;
}

export default function AdaWalletConnector({ onWalletConnected }: AdaWalletConnectorProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [network, setNetwork] = useState<number>();
    const [selectedWallet, setSelectedWallet] = useState("");
    const [availableWallets, setAvailableWallets] = useState<string[]>([]);
    const [noWalletsDetected, setNoWalletsDetected] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const connectWallet = async (wallet: string) => {
        setError(null);
        try {
            if (window.cardano && window.cardano[wallet]) {
                const walletAPI = await window.cardano[wallet]?.enable();
                const addresses = await walletAPI?.getUsedAddresses();
                
                if (addresses && addresses.length > 0) {
                    const hexAddress = addresses[0];
                    
                    const networkId = await walletAPI?.getNetworkId();
                    if (networkId !== 1) {
                        setError("Please connect to the Cardano mainnet.");
                        setIsConnected(false);
                        onWalletConnected("", false, networkId);
                        return;
                    }
                    
                    // Passamos o endereço hex - a conversão será feita no backend
                    setIsConnected(true);
                    setNetwork(networkId);
                    onWalletConnected(hexAddress, true, networkId);
                    setIsModalOpen(false);
                } else {
                    setError(`No used addresses found in this ${wallet} wallet. Please make sure the selected account has a transaction history.`);
                    setIsConnected(false);
                    onWalletConnected("", false, undefined);
                }
            } else {
                throw new Error("Selected wallet not available");
            }
        } catch (err) {
            console.error("Error connecting to the wallet:", err);
            setError(err instanceof Error ? err.message : "An unknown error occurred");
            setIsConnected(false);
        }
    };
    
    const detectWallets = async () => {
        const wallets: string[] = [];
        if (window.cardano) {
            if (window.cardano.nami) wallets.push('nami');
            if (window.cardano.lace) wallets.push('lace');
        }
        setAvailableWallets(wallets);
        
        if (wallets.length === 0) {
            setNoWalletsDetected(true);
        } else if (wallets.length === 1) {
            await connectWallet(wallets[0]);
        } else {
            setIsModalOpen(true);
        }
    };
    
    const handleConnectClick = () => {
        setNoWalletsDetected(false);
        setError(null);
        detectWallets();
    };

    return (
        <>
            {!isConnected && !noWalletsDetected && (
                <button 
                    onClick={handleConnectClick}
                    className="ml-2 px-4 py-2 bg-blue-800 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
                >
                    <Image src="/Ada/lace.svg" alt="Lace" width={20} height={20} className="mr-2" />
                    Connect Wallet
                    <Image src="/Ada/nami.svg" alt="Nami" width={20} height={20} className="ml-2" />
                </button>
            )}

            {noWalletsDetected && (
                <p className="text-red-500 mt-4">
                    Install <Link href="https://www.lace.io/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Lace</Link> or <Link href="https://namiwallet.io/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Nami</Link> to claim Warriors.
                </p>
            )}

            {error && <p className="text-red-500">{error}</p>}
            
            {isConnected && network !== 1 && (
                <p className="text-red-500">
                    Please connect to the Cardano mainnet.
                </p>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Select Wallet">
                <div className="flex flex-col gap-4">
                    {availableWallets.length > 0 ? (
                        availableWallets.map(wallet => (
                            <div key={wallet} className="flex items-center">
                                <input
                                    type="radio"
                                    id={wallet}
                                    name="wallet"
                                    value={wallet}
                                    checked={selectedWallet === wallet}
                                    onChange={(e) => setSelectedWallet(e.target.value)}
                                    className="mr-2"
                                />
                                <label htmlFor={wallet} className="flex items-center cursor-pointer">
                                    {wallet === 'lace' && <Image src="/Ada/lace.svg" alt="Lace" width={20} height={20} className="mr-2"/>}
                                    {wallet === 'nami' && <Image src="/Ada/nami.svg" alt="Nami" width={20} height={20} className="mr-2"/>}
                                    {`${wallet.charAt(0).toUpperCase() + wallet.slice(1)} Wallet`}
                                </label>
                            </div>
                        ))
                    ) : (
                        <p>No compatible wallets found.</p>
                    )}
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button
                        onClick={() => setIsModalOpen(false)}
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => connectWallet(selectedWallet)}
                        disabled={!selectedWallet}
                        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400"
                    >
                        Connect
                    </button>
                </div>
            </Modal>
        </>
    );
}