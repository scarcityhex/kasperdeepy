'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/app/contexts/AuthContext';
import Header from "@/components/layout/Header";
import AdaWalletConnector from './components/ada/AdaWalletConnector';

// Policy IDs das coleções que queremos verificar
const POLICY_IDS = [
    '8f80ebfaf62a8c33ae2adf047572604c74db8bc1daba2b43f9a65635',
    'b7761c472eef3b6e0505441efaf940892bb59c01be96070b0a0a89b3',
    'b9c188390e53e10833f17650ccf1b2704b2f67dccfae7352be3c9533'
];

interface NFTAsset {
    assetId: string;
    assetName: string;
    policyId: string;
    metadata: any;
}

interface PolicyAssets {
    policyId: string;
    assets: NFTAsset[];
}

interface SavedAddress {
    address: string;
    label: string;
    addedAt: any;
    lastSyncedAt: any;
}

export default function MyStuff() {
    const [connectedAddress, setConnectedAddress] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [network, setNetwork] = useState<number | undefined>();
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [userNFTs, setUserNFTs] = useState<PolicyAssets[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedPolicy, setSelectedPolicy] = useState<string>('ALL');
    const [dataSource, setDataSource] = useState<'cache' | 'blockchain' | null>(null);
    const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
    const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
    const [newAddressInput, setNewAddressInput] = useState("");
    const [newAddressLabel, setNewAddressLabel] = useState("");
    const [showAddAddressForm, setShowAddAddressForm] = useState(false);
    const { user } = useAuth();

    const onWalletConnected = (addr: string, connected: boolean, netId: number | undefined) => {
        setConnectedAddress(addr);
        setIsConnected(connected);
        setNetwork(netId);
        
        // Limpar dados quando desconectar
        if (!connected) {
            setConnectedAddress("");
        }
    };

    // Carregar endereços salvos e NFTs do cache automaticamente
    useEffect(() => {
        if (user) {
            loadSavedAddresses();
            loadCachedNFTs();
        }
    }, [user]);

    // Recarregar NFTs quando endereço selecionado mudar
    useEffect(() => {
        if (user && selectedAddress) {
            loadCachedNFTs();
        }
    }, [selectedAddress]);

    const loadSavedAddresses = async () => {
        if (!user) return;

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/NFT/UserAddresses', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                setSavedAddresses(data.addresses || []);
            }
        } catch (error) {
            console.error('Error loading saved addresses:', error);
        }
    };

    const addAddress = async () => {
        if (!user || !newAddressInput) return;

        if (!newAddressInput.startsWith('addr1')) {
            setError('Invalid Cardano address format. Must start with addr1');
            return;
        }

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/NFT/UserAddresses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    address: newAddressInput,
                    label: newAddressLabel || undefined
                })
            });

            if (response.ok) {
                await loadSavedAddresses();
                setNewAddressInput("");
                setNewAddressLabel("");
                setShowAddAddressForm(false);
                setError(null);
            } else {
                const data = await response.json();
                setError(data.error || 'Failed to add address');
            }
        } catch (error) {
            console.error('Error adding address:', error);
            setError('Error adding address');
        }
    };

    const removeAddress = async (address: string) => {
        if (!user) return;

        try {
            const token = await user.getIdToken();
            const response = await fetch(`/api/NFT/UserAddresses?address=${encodeURIComponent(address)}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.ok) {
                await loadSavedAddresses();
                if (selectedAddress === address) {
                    setSelectedAddress(null);
                }
            }
        } catch (error) {
            console.error('Error removing address:', error);
        }
    };

    const saveConnectedAddress = async () => {
        if (!connectedAddress || !user) return;

        setError(null);

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/NFT/UserAddresses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    address: connectedAddress,
                    label: 'Connected Wallet'
                })
            });

            if (response.ok) {
                const data = await response.json();
                await loadSavedAddresses();
                // Usar o endereço convertido retornado pela API
                if (data.address && data.address.address) {
                    setSelectedAddress(data.address.address);
                }
            } else {
                const data = await response.json();
                setError(data.error || 'Failed to save connected address');
            }
        } catch (error) {
            console.error('Error saving connected address:', error);
            setError('Error saving connected address');
        }
    };

    const loadCachedNFTs = async () => {
        if (!user) return;

        setLoading(true);
        setError(null);

        try {
            const token = await user.getIdToken();
            const url = selectedAddress 
                ? `/api/NFT/UserNFTs?address=${encodeURIComponent(selectedAddress)}`
                : '/api/NFT/UserNFTs';
            
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                if (data.collections && data.collections.length > 0) {
                    const formattedCollections = data.collections.map((col: any) => ({
                        policyId: col.policyId,
                        assets: col.assets
                    }));
                    setUserNFTs(formattedCollections);
                    setDataSource('cache');
                } else {
                    setUserNFTs([]);
                    setDataSource('cache');
                }
            }
        } catch (error) {
            console.error('Error loading cached NFTs:', error);
            // Não mostrar erro, apenas não carregar cache
        } finally {
            setLoading(false);
        }
    };

    const syncWithBlockchain = async () => {
        const addressToSync = selectedAddress || connectedAddress;
        
        if (!addressToSync || !user) {
            alert("No address selected or user not authenticated.");
            return;
        }

        setSyncing(true);
        setError(null);

        try {
            const token = await user.getIdToken();

            // Sincronizar NFTs de cada policy ID com blockchain
            const allAssets: PolicyAssets[] = [];

            for (const policyId of POLICY_IDS) {
                try {
                    const response = await fetch(`/api/NFT/blockfrost/UserAssets?address=${addressToSync}&policyId=${policyId}&sync=true`, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.assets && data.assets.length > 0) {
                            allAssets.push({
                                policyId,
                                assets: data.assets
                            });
                        }
                    }
                } catch (err) {
                    console.error(`Error syncing assets for policy ${policyId}:`, err);
                }
            }

            setUserNFTs(allAssets);
            setDataSource('blockchain');

            if (allAssets.length === 0) {
                setError("No NFTs found from the specified collections in this wallet.");
            }

        } catch (error) {
            console.error("Error syncing user NFTs:", error);
            setError("Error syncing NFTs. See console for details.");
        } finally {
            setSyncing(false);
        }
    };

    // Filtrar assets baseado na policy selecionada
    const filteredAssets = selectedPolicy === 'ALL' 
        ? userNFTs.flatMap(p => p.assets)
        : userNFTs.find(p => p.policyId === selectedPolicy)?.assets || [];

    const totalNFTs = userNFTs.reduce((sum, p) => sum + p.assets.length, 0);

    const policyColors: Record<string, string> = {
        '8f80ebfaf62a8c33ae2adf047572604c74db8bc1daba2b43f9a65635': 'bg-purple-500',
        'b7761c472eef3b6e0505441efaf940892bb59c01be96070b0a0a89b3': 'bg-blue-500',
        'b9c188390e53e10833f17650ccf1b2704b2f67dccfae7352be3c9533': 'bg-green-500',
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
            <Header />
            
            <div className="max-w-7xl mx-auto p-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        My NFTs
                    </h1>
                    <p className="text-gray-400">
                        Connect your Cardano wallet to view your NFTs from selected collections
                    </p>
                </div>

                {/* Wallet Connection */}
                <div className="mb-8 flex items-center gap-4 flex-wrap">
                    <AdaWalletConnector onWalletConnected={onWalletConnected} />
                    
                    {isConnected && network === 1 && (
                        <button 
                            onClick={syncWithBlockchain} 
                            disabled={syncing}
                            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 transform ${
                                syncing 
                                    ? 'bg-gray-600 cursor-not-allowed' 
                                    : 'bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 hover:scale-105 shadow-lg'
                            }`}
                        >
                            {syncing ? (
                                <div className="flex items-center gap-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    <span>Syncing...</span>
                                </div>
                            ) : (
                                '🔄 Sync with Blockchain'
                            )}
                        </button>
                    )}

                    {dataSource && (
                        <div className="px-4 py-2 bg-gray-700 rounded-lg text-sm">
                            <span className="text-gray-400">Data source:</span>{' '}
                            <span className={dataSource === 'blockchain' ? 'text-green-400' : 'text-blue-400'}>
                                {dataSource === 'blockchain' ? '🔗 Blockchain' : '💾 Cache'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Address Management */}
                <div className="mb-8 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-semibold">My Addresses</h2>
                        <button
                            onClick={() => setShowAddAddressForm(!showAddAddressForm)}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors"
                        >
                            ➕ Add Address
                        </button>
                    </div>

                    {/* Add Address Form */}
                    {showAddAddressForm && (
                        <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                            <h3 className="text-lg font-semibold mb-4">Add New Address</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Address (addr1...)</label>
                                    <input
                                        type="text"
                                        value={newAddressInput}
                                        onChange={(e) => setNewAddressInput(e.target.value)}
                                        placeholder="addr1..."
                                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Label (optional)</label>
                                    <input
                                        type="text"
                                        value={newAddressLabel}
                                        onChange={(e) => setNewAddressLabel(e.target.value)}
                                        placeholder="My Wallet"
                                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={addAddress}
                                        className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        Save Address
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowAddAddressForm(false);
                                            setNewAddressInput("");
                                            setNewAddressLabel("");
                                            setError(null);
                                        }}
                                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Connected Wallet */}
                    {isConnected && connectedAddress && (
                        <div className="bg-green-900/20 backdrop-blur-sm p-4 rounded-lg border border-green-700">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-green-400 text-sm mb-1 font-semibold">🟢 Connected Wallet</p>
                                    <p className="text-xs font-mono break-all">{connectedAddress}</p>
                                </div>
                                {!savedAddresses.some(addr => addr.address === connectedAddress) && (
                                    <button
                                        onClick={saveConnectedAddress}
                                        className="px-3 py-1 bg-green-500 hover:bg-green-600 rounded text-xs font-medium transition-colors"
                                    >
                                        💾 Save
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Saved Addresses */}
                    {savedAddresses.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {savedAddresses.map((addr) => (
                                <div
                                    key={addr.address}
                                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                        selectedAddress === addr.address
                                            ? 'bg-blue-900/30 border-blue-500'
                                            : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                                    }`}
                                    onClick={() => setSelectedAddress(addr.address)}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                            <p className="font-semibold text-sm mb-1">{addr.label}</p>
                                            <p className="text-xs font-mono text-gray-400 break-all">{addr.address}</p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeAddress(addr.address);
                                            }}
                                            className="ml-2 px-2 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded text-xs transition-colors"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                    {selectedAddress === addr.address && (
                                        <div className="mt-2 pt-2 border-t border-blue-500/30">
                                            <p className="text-xs text-blue-400">✓ Selected</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {savedAddresses.length === 0 && !isConnected && (
                        <div className="text-center py-8 bg-gray-800/30 rounded-lg border border-gray-700">
                            <p className="text-gray-400">No saved addresses yet. Connect a wallet or add an address manually.</p>
                        </div>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-8 p-4 bg-red-500/20 border border-red-500 rounded-lg">
                        <p className="text-red-300">❌ {error}</p>
                    </div>
                )}

                {/* Results */}
                {userNFTs.length > 0 && (
                    <div className="space-y-8">
                        {/* Summary */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                                <p className="text-gray-400 text-sm mb-1">Total NFTs</p>
                                <p className="text-3xl font-bold text-green-400">{totalNFTs}</p>
                            </div>
                            <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                                <p className="text-gray-400 text-sm mb-1">Collections Found</p>
                                <p className="text-3xl font-bold">{userNFTs.length}</p>
                            </div>
                            <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                                <p className="text-gray-400 text-sm mb-1">Filtered View</p>
                                <p className="text-3xl font-bold text-blue-400">{filteredAssets.length}</p>
                            </div>
                        </div>

                        {/* Collection Breakdown */}
                        <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                            <h2 className="text-xl font-semibold mb-4">Collections</h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {userNFTs.map((policyAssets) => (
                                    <div 
                                        key={policyAssets.policyId}
                                        className="bg-gray-900/50 p-4 rounded-lg cursor-pointer hover:bg-gray-900 transition-colors"
                                        onClick={() => setSelectedPolicy(policyAssets.policyId)}
                                    >
                                        <div className={`w-3 h-3 rounded-full ${policyColors[policyAssets.policyId]} mb-2`}></div>
                                        <p className="text-gray-400 text-xs font-mono mb-2 break-all">
                                            {policyAssets.policyId.substring(0, 20)}...
                                        </p>
                                        <p className="text-2xl font-bold">{policyAssets.assets.length} NFTs</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Filter Buttons */}
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={() => setSelectedPolicy('ALL')}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                    selectedPolicy === 'ALL' 
                                        ? 'bg-white text-gray-900' 
                                        : 'bg-gray-700 hover:bg-gray-600'
                                }`}
                            >
                                All ({totalNFTs})
                            </button>
                            {userNFTs.map((policyAssets) => (
                                <button
                                    key={policyAssets.policyId}
                                    onClick={() => setSelectedPolicy(policyAssets.policyId)}
                                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                        selectedPolicy === policyAssets.policyId 
                                            ? `${policyColors[policyAssets.policyId]} text-white` 
                                            : 'bg-gray-700 hover:bg-gray-600'
                                    }`}
                                >
                                    {policyAssets.policyId.substring(0, 8)}... ({policyAssets.assets.length})
                                </button>
                            ))}
                        </div>

                        {/* NFTs Grid */}
                        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
                            <div className="p-6 border-b border-gray-700">
                                <h2 className="text-xl font-semibold">
                                    Your NFTs ({filteredAssets.length})
                                </h2>
                            </div>
                            
                            <div className="max-h-[600px] overflow-y-auto">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                                    {filteredAssets.map((asset) => (
                                        <div 
                                            key={asset.assetId}
                                            className="bg-gray-900/50 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <h3 className="font-semibold text-sm">
                                                    {asset.metadata?.name || asset.assetName}
                                                </h3>
                                                <span className={`text-xs px-2 py-1 rounded ${policyColors[asset.policyId]} text-white`}>
                                                    NFT
                                                </span>
                                            </div>
                                            
                                            {asset.metadata?.image && (
                                                <div className="mb-3 rounded overflow-hidden bg-gray-800 h-48 flex items-center justify-center">
                                                    <img 
                                                        src={asset.metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')} 
                                                        alt={asset.metadata.name || asset.assetName}
                                                        className="max-w-full max-h-full object-contain"
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = 'none';
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            
                                            <div className="space-y-1 text-xs">
                                                {asset.metadata?.rarity && (
                                                    <p className="text-gray-400">
                                                        <span className="text-gray-500">Rarity:</span> {asset.metadata.rarity}
                                                    </p>
                                                )}
                                                {asset.metadata?.edition && (
                                                    <p className="text-gray-400">
                                                        <span className="text-gray-500">Edition:</span> {asset.metadata.edition}
                                                    </p>
                                                )}
                                                <p className="text-gray-400">
                                                    <span className="text-gray-500">Asset ID:</span>
                                                    <span className="font-mono text-xs block mt-1 break-all">
                                                        {asset.assetId.substring(0, 30)}...
                                                    </span>
                                                </p>
                                            </div>
                                            
                                            <details className="mt-3">
                                                <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                                                    View Metadata
                                                </summary>
                                                <pre className="text-xs mt-2 p-2 bg-gray-950 rounded overflow-x-auto max-h-40">
                                                    {JSON.stringify(asset.metadata, null, 2)}
                                                </pre>
                                            </details>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {userNFTs.length === 0 && !loading && !syncing && (
                    <div className="text-center py-16">
                        <div className="text-6xl mb-4">{isConnected ? '📭' : '🔗'}</div>
                        <h2 className="text-2xl font-semibold mb-2">
                            {isConnected ? 'No NFTs Found' : 'View Your NFTs'}
                        </h2>
                        <p className="text-gray-400">
                            {isConnected 
                                ? 'Connect your wallet and sync to discover your NFTs from the blockchain'
                                : 'Your cached NFTs will appear here automatically when you log in'
                            }
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}