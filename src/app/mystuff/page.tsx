'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/app/contexts/AuthContext';
import Header from "@/components/layout/Header";
import AdaWalletConnector from './components/ada/AdaWalletConnector';

// Coleções padrão
interface Collection {
    policyId: string;
    name: string;
    enabled: boolean;
    isCustom?: boolean;
}

const DEFAULT_COLLECTIONS: Collection[] = [
    {
        policyId: '8f80ebfaf62a8c33ae2adf047572604c74db8bc1daba2b43f9a65635',
        name: 'Cardano Warriors - Assets',
        enabled: true,
        isCustom: false
    },
    {
        policyId: 'b7761c472eef3b6e0505441efaf940892bb59c01be96070b0a0a89b3',
        name: 'Cardano Warriors - Islands',
        enabled: true,
        isCustom: false
    },
    {
        policyId: 'b9c188390e53e10833f17650ccf1b2704b2f67dccfae7352be3c9533',
        name: 'Cardano Warriors',
        enabled: true,
        isCustom: false
    }
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
    const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
    const [selectedAddress, setSelectedAddress] = useState<string | null>('ALL');
    const [loadingAddresses, setLoadingAddresses] = useState(false);
    const [savingAddress, setSavingAddress] = useState(false);
    const [newAddressInput, setNewAddressInput] = useState("");
    const [newAddressLabel, setNewAddressLabel] = useState("");
    const [showAddAddressForm, setShowAddAddressForm] = useState(false);
    
    // Estados para coleções
    const [collections, setCollections] = useState<Collection[]>(DEFAULT_COLLECTIONS);
    const [showAddCollectionForm, setShowAddCollectionForm] = useState(false);
    const [newCollectionPolicyId, setNewCollectionPolicyId] = useState("");
    const [newCollectionName, setNewCollectionName] = useState("");
    
    const { user } = useAuth();

    // Funções para gerenciar coleções
    const toggleCollection = async (policyId: string) => {
        const updatedCollections = collections.map(col => 
            col.policyId === policyId ? { ...col, enabled: !col.enabled } : col
        );
        setCollections(updatedCollections);
        
        // Salvar no Firestore se for coleção customizada
        const toggledCollection = updatedCollections.find(col => col.policyId === policyId);
        if (toggledCollection?.isCustom) {
            await saveCustomCollectionsToFirestore(updatedCollections);
        }
    };

    const addCustomCollection = async () => {
        if (!newCollectionPolicyId || !newCollectionName) {
            setError('Policy ID and Collection Name are required');
            return;
        }

        // Verificar se já existe
        if (collections.some(col => col.policyId === newCollectionPolicyId)) {
            setError('This collection already exists');
            return;
        }

        const newCollection: Collection = {
            policyId: newCollectionPolicyId,
            name: newCollectionName,
            enabled: true,
            isCustom: true
        };

        const updatedCollections = [...collections, newCollection];
        setCollections(updatedCollections);
        setNewCollectionPolicyId("");
        setNewCollectionName("");
        setShowAddCollectionForm(false);
        setError(null);

        // Salvar no Firestore
        await saveCustomCollectionsToFirestore(updatedCollections);
    };

    const removeCustomCollection = async (policyId: string) => {
        const updatedCollections = collections.filter(col => col.policyId !== policyId);
        setCollections(updatedCollections);
        
        // Salvar no Firestore
        await saveCustomCollectionsToFirestore(updatedCollections);
    };

    const saveCustomCollectionsToFirestore = async (collectionsToSave: Collection[]) => {
        if (!user) return;

        try {
            const token = await user.getIdToken();
            const customCollections = collectionsToSave
                .filter(col => col.isCustom)
                .map(col => ({
                    policyId: col.policyId,
                    name: col.name,
                    enabled: col.enabled
                }));

            await fetch('/api/NFT/UserCollections', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ collections: customCollections }),
            });
        } catch (error) {
            console.error('Error saving custom collections:', error);
        }
    };

    // Obter apenas coleções habilitadas
    const getEnabledPolicyIds = () => {
        return collections.filter(col => col.enabled).map(col => col.policyId);
    };

    const onWalletConnected = (addr: string, connected: boolean, netId: number | undefined) => {
        setConnectedAddress(addr);
        setIsConnected(connected);
        setNetwork(netId);
        
        // Limpar dados quando desconectar
        if (!connected) {
            setConnectedAddress("");
        }
    };

    // Carregar endereços salvos, coleções customizadas e NFTs do cache automaticamente
    useEffect(() => {
        if (user) {
            loadSavedAddresses();
            loadCustomCollections();
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

        setLoadingAddresses(true);
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
        } finally {
            setLoadingAddresses(false);
        }
    };

    const loadCustomCollections = async () => {
        if (!user) return;

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/NFT/UserCollections', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                const customCollections = data.collections || [];
                
                // Mesclar coleções padrão com customizadas
                const allCollections = [
                    ...DEFAULT_COLLECTIONS,
                    ...customCollections.map((col: any) => ({
                        policyId: col.policyId,
                        name: col.name,
                        enabled: col.enabled !== false, // Default true
                        isCustom: true
                    }))
                ];
                
                setCollections(allCollections);
            }
        } catch (error) {
            console.error('Error loading custom collections:', error);
        }
    };

    const addAddress = async () => {
        if (!user || !newAddressInput) return;

        if (!newAddressInput.startsWith('addr1')) {
            setError('Invalid Cardano address format. Must start with addr1');
            return;
        }

        setSavingAddress(true);
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
        } finally {
            setSavingAddress(false);
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

        setSavingAddress(true);
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
        } finally {
            setSavingAddress(false);
        }
    };

    const loadCachedNFTs = async () => {
        if (!user) return;

        setLoading(true);
        setError(null);

        try {
            const token = await user.getIdToken();
            const url = (selectedAddress && selectedAddress !== 'ALL')
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
                } else {
                    setUserNFTs([]);
                }
            }
        } catch (error) {
            console.error('Error loading cached NFTs:', error);
            // Não mostrar erro, apenas não carregar cache
        } finally {
            setLoading(false);
        }
    };

    const syncAllAddresses = async () => {
        if (!user) return;
        
        setSyncing(true);
        setError(null);

        try {
            const token = await user.getIdToken();

            // Sincronizar cada endereço salvo
            const enabledPolicyIds = getEnabledPolicyIds();
            for (const savedAddr of savedAddresses) {
                for (const policyId of enabledPolicyIds) {
                    try {
                        await fetch(`/api/NFT/blockfrost/UserAssets?address=${savedAddr.address}&policyId=${policyId}&sync=true`, {
                            headers: {
                                Authorization: `Bearer ${token}`,
                            },
                        });
                    } catch (err) {
                        console.error(`Error syncing ${savedAddr.label}:`, err);
                    }
                }
            }

            // Após sincronizar todos, recarregar do cache
            await loadCachedNFTs();

        } catch (error) {
            console.error("Error syncing all addresses:", error);
            setError("Error syncing all addresses. See console for details.");
        } finally {
            setSyncing(false);
        }
    };

    const syncWithBlockchain = async () => {
        if (!user) {
            alert("User not authenticated.");
            return;
        }

        // Se "All Addresses" estiver selecionado, sincronizar todos os endereços salvos
        if (selectedAddress === 'ALL') {
            if (savedAddresses.length === 0) {
                alert("No saved addresses to sync. Please add or connect a wallet first.");
                return;
            }
            await syncAllAddresses();
            return;
        }

        // Determinar qual endereço sincronizar
        // Prioridade: 1) Endereço selecionado, 2) Endereço conectado
        let addressToSync: string | null = null;
        
        if (selectedAddress && selectedAddress !== 'ALL') {
            addressToSync = selectedAddress;
        } else if (connectedAddress) {
            addressToSync = connectedAddress;
        }
        
        if (!addressToSync) {
            alert("Please select an address or connect a wallet to sync.");
            return;
        }

        setSyncing(true);
        setError(null);

        try {
            const token = await user.getIdToken();

            // Sincronizar NFTs de cada policy ID com blockchain
            const allAssets: PolicyAssets[] = [];
            const enabledPolicyIds = getEnabledPolicyIds();

            for (const policyId of enabledPolicyIds) {
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

    const defaultPolicyColors: Record<string, string> = {
        '8f80ebfaf62a8c33ae2adf047572604c74db8bc1daba2b43f9a65635': 'bg-purple-500',
        'b7761c472eef3b6e0505441efaf940892bb59c01be96070b0a0a89b3': 'bg-blue-500',
        'b9c188390e53e10833f17650ccf1b2704b2f67dccfae7352be3c9533': 'bg-green-500',
    };

    // Função para obter cor de uma policy (usa cor padrão ou gera uma para customizadas)
    const getPolicyColor = (policyId: string): string => {
        return defaultPolicyColors[policyId] || 'bg-orange-500';
    };

    // Função para obter nome da coleção
    const getCollectionName = (policyId: string): string => {
        const collection = collections.find(c => c.policyId === policyId);
        return collection?.name || `${policyId.substring(0, 8)}...`;
    };

    const policyColors = defaultPolicyColors;

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
                        View your Cardano NFTs. Connect a wallet or add addresses manually to get started. If you change the wallet in your browser extension, please refresh the page.
                    </p>
                </div>

                {/* Wallet Connection & Sync Controls */}
                <div className="mb-8 flex items-center gap-4 flex-wrap">
                    <AdaWalletConnector onWalletConnected={onWalletConnected} />
                    
                    {/* Sync Button - Aparece se houver endereços salvos OU endereço conectado */}
                    {(savedAddresses.length > 0 || (isConnected && network === 1)) && (
                        <div className="flex flex-col gap-1">
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
                                    <>
                                        🔄 Sync {selectedAddress === 'ALL' ? 'All Addresses' : 'Selected Address'}
                                    </>
                                )}
                            </button>
                            {!syncing && selectedAddress && selectedAddress !== 'ALL' && (
                                <p className="text-xs text-gray-400 px-2">
                                    Will sync: {savedAddresses.find(a => a.address === selectedAddress)?.label || 'Selected address'}
                                </p>
                            )}
                            {!syncing && selectedAddress === 'ALL' && savedAddresses.length > 0 && (
                                <p className="text-xs text-gray-400 px-2">
                                    Will sync {savedAddresses.length} address{savedAddresses.length > 1 ? 'es' : ''}
                                </p>
                            )}
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
                                        disabled={savingAddress}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            savingAddress 
                                                ? 'bg-gray-600 cursor-not-allowed' 
                                                : 'bg-green-500 hover:bg-green-600'
                                        }`}
                                    >
                                        {savingAddress ? (
                                            <div className="flex items-center gap-2">
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                <span>Saving...</span>
                                            </div>
                                        ) : (
                                            'Save Address'
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowAddAddressForm(false);
                                            setNewAddressInput("");
                                            setNewAddressLabel("");
                                            setError(null);
                                        }}
                                        disabled={savingAddress}
                                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
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
                                        disabled={savingAddress}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                            savingAddress 
                                                ? 'bg-gray-600 cursor-not-allowed' 
                                                : 'bg-green-500 hover:bg-green-600'
                                        }`}
                                    >
                                        {savingAddress ? (
                                            <div className="flex items-center gap-1">
                                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                            </div>
                                        ) : (
                                            '💾 Save'
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Loading Spinner */}
                    {loadingAddresses && (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            <span className="ml-3 text-gray-400">Loading addresses...</span>
                        </div>
                    )}

                    {/* Saved Addresses */}
                    {!loadingAddresses && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* All Addresses Card */}
                            <div
                                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                    selectedAddress === 'ALL'
                                        ? 'bg-gradient-to-br from-purple-900/30 to-blue-900/30 border-purple-500'
                                        : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                                }`}
                                onClick={() => setSelectedAddress('ALL')}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                        <p className="font-semibold text-sm mb-1">🌐 All Addresses</p>
                                        <p className="text-xs text-gray-400">View NFTs from all saved addresses</p>
                                    </div>
                                </div>
                                {selectedAddress === 'ALL' && (
                                    <div className="mt-2 pt-2 border-t border-purple-500/30">
                                        <p className="text-xs text-purple-400">✓ Selected</p>
                                    </div>
                                )}
                            </div>
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

                    {!loadingAddresses && savedAddresses.length === 0 && !isConnected && (
                        <div className="text-center py-8 bg-gray-800/30 rounded-lg border border-gray-700">
                            <p className="text-gray-400">No saved addresses yet. Connect a wallet or add an address manually.</p>
                        </div>
                    )}
                </div>

                {/* Collections Management */}
                <div className="mb-8 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-semibold">NFT Collections</h2>
                        <button
                            onClick={() => setShowAddCollectionForm(!showAddCollectionForm)}
                            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-medium transition-colors"
                        >
                            ➕ Add Custom Collection
                        </button>
                    </div>

                    {/* Add Collection Form */}
                    {showAddCollectionForm && (
                        <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                            <h3 className="text-lg font-semibold mb-4">Add Custom Collection</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Policy ID</label>
                                    <input
                                        type="text"
                                        value={newCollectionPolicyId}
                                        onChange={(e) => setNewCollectionPolicyId(e.target.value)}
                                        placeholder="e.g., 8f80ebfaf62a8c33ae2adf047572604c74db8bc1daba2b43f9a65635"
                                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Collection Name</label>
                                    <input
                                        type="text"
                                        value={newCollectionName}
                                        onChange={(e) => setNewCollectionName(e.target.value)}
                                        placeholder="e.g., My Custom Collection"
                                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={addCustomCollection}
                                        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        Add Collection
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowAddCollectionForm(false);
                                            setNewCollectionPolicyId("");
                                            setNewCollectionName("");
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

                    {/* Collections List */}
                    <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                        <p className="text-sm text-gray-400 mb-4">
                            Select which collections to search for NFTs. Only enabled collections will be synced.
                        </p>
                        <div className="space-y-3">
                            {collections.map((collection) => (
                                <div
                                    key={collection.policyId}
                                    className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors"
                                >
                                    <div className="flex items-center gap-3 flex-1">
                                        <input
                                            type="checkbox"
                                            id={`collection-${collection.policyId}`}
                                            checked={collection.enabled}
                                            onChange={() => toggleCollection(collection.policyId)}
                                            className="w-5 h-5 rounded border-gray-600 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900 cursor-pointer"
                                        />
                                        <label
                                            htmlFor={`collection-${collection.policyId}`}
                                            className="flex-1 cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm">
                                                    {collection.name}
                                                </span>
                                                {collection.isCustom && (
                                                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">
                                                        Custom
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs font-mono text-gray-500 mt-1">
                                                {collection.policyId.substring(0, 40)}...
                                            </p>
                                        </label>
                                    </div>
                                    {collection.isCustom && (
                                        <button
                                            onClick={() => removeCustomCollection(collection.policyId)}
                                            className="ml-3 px-2 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded text-xs transition-colors"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-700">
                            <p className="text-xs text-gray-500">
                                {collections.filter(c => c.enabled).length} of {collections.length} collections enabled
                            </p>
                        </div>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-8 p-4 bg-red-500/20 border border-red-500 rounded-lg">
                        <p className="text-red-300">❌ {error}</p>
                    </div>
                )}

                {/* Loading NFTs */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mb-4"></div>
                        <p className="text-gray-400 text-lg">Loading NFTs...</p>
                    </div>
                )}

                {/* Syncing NFTs */}
                {syncing && !loading && (
                    <div className="flex flex-col items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-500 mb-4"></div>
                        <p className="text-gray-400 text-lg">Syncing with blockchain...</p>
                        <p className="text-gray-500 text-sm mt-2">This may take a few moments</p>
                    </div>
                )}

                {/* Results */}
                {!loading && !syncing && userNFTs.length > 0 && (
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
                                            ? `${getPolicyColor(policyAssets.policyId)} text-white` 
                                            : 'bg-gray-700 hover:bg-gray-600'
                                    }`}
                                >
                                    {getCollectionName(policyAssets.policyId)} ({policyAssets.assets.length})
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
                                            
                                            {(() => {
                                                // Tentar diferentes formatos de URL de imagem
                                                let imageUrl = asset.metadata?.image;
                                                
                                                // Verificar se tem array de files
                                                if (!imageUrl && asset.metadata?.files && asset.metadata.files.length > 0) {
                                                    imageUrl = asset.metadata.files[0].src;
                                                }
                                                
                                                // Verificar se tem mediaType image
                                                if (!imageUrl && asset.metadata?.files) {
                                                    const imageFile = asset.metadata.files.find((f: any) => 
                                                        f.mediaType?.startsWith('image/')
                                                    );
                                                    if (imageFile) imageUrl = imageFile.src;
                                                }
                                                
                                                if (imageUrl) {
                                                    // Converter IPFS para HTTP
                                                    const httpUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
                                                    
                                                    return (
                                                        <div className="mb-3 rounded overflow-hidden bg-gray-800 h-48 flex items-center justify-center">
                                                            <img 
                                                                src={httpUrl} 
                                                                alt={asset.metadata?.name || asset.assetName}
                                                                className="max-w-full max-h-full object-contain"
                                                                onError={(e) => {
                                                                    e.currentTarget.style.display = 'none';
                                                                }}
                                                            />
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                            
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
                        <div className="text-6xl mb-4">
                            {selectedAddress === 'ALL' ? '🌐' : (isConnected ? '📭' : '🔗')}
                        </div>
                        <h2 className="text-2xl font-semibold mb-2">
                            {selectedAddress === 'ALL' 
                                ? 'No NFTs Found' 
                                : (isConnected ? 'No NFTs Found' : 'View Your NFTs')
                            }
                        </h2>
                        <p className="text-gray-400 max-w-md mx-auto">
                            {selectedAddress === 'ALL' 
                                ? 'No NFTs found across all your saved addresses. Try syncing with the blockchain or add more addresses.'
                                : (isConnected 
                                    ? 'Connect your wallet and sync to discover your NFTs from the blockchain'
                                    : 'Select an address or "All Addresses" to view your NFTs. Your cached NFTs will load automatically.'
                                )
                            }
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}