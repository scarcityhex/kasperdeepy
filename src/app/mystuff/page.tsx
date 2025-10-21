'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/app/contexts/AuthContext';
import Header from "@/components/layout/Header";
import AdaWalletConnector from './components/ada/AdaWalletConnector';
import Modal from '@/components/ui/Modal';
import Image from 'next/image';

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
        name: 'Cardano Warriors',
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
        name: 'Cardano Warriors - Assets',
        enabled: true,
        isCustom: false
    }
];

interface NFTAsset {
    assetId: string;
    assetName: string;
    policyId: string;
    metadata: Record<string, unknown>;
    address: string;
}

interface PolicyAssets {
    policyId: string;
    collectionName?: string;
    assets: NFTAsset[];
}

interface SavedAddress {
    address: string;
    label: string;
    addedAt: unknown;
    lastSyncedAt: unknown;
}

// Função helper para truncar endereços
const truncateAddress = (address: string, startChars: number = 12, endChars: number = 8): string => {
    if (address.length <= startChars + endChars) return address;
    return `${address.substring(0, startChars)}...${address.substring(address.length - endChars)}`;
};

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
    
    // Estados para modais de imagens
    const [showItemsModal, setShowItemsModal] = useState(false);
    const [showRacesModal, setShowRacesModal] = useState(false);
    
    const { user } = useAuth();

    // Função para deletar uma NFT específica
    const deleteNFT = async (assetId: string, assetName: string, address: string) => {
        if (!user) return;
        
        const confirmed = window.confirm(`Delete "${assetName}"?\n\nThis will remove it from your collection. You can sync again to restore it if you still own it.`);
        if (!confirmed) return;

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/NFT/DeleteNFT', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ assetId, address }),
            });

            if (response.ok) {
                // Atualizar estado local removendo a NFT
                setUserNFTs(prevNFTs => {
                    return prevNFTs.map(policy => ({
                        ...policy,
                        assets: policy.assets.filter(nft => nft.assetId !== assetId)
                    })).filter(policy => policy.assets.length > 0); // Remover coleções vazias
                });
                
                alert(`✅ "${assetName}" deleted successfully!`);
            } else {
                const errorData = await response.json();
                alert(`❌ Error deleting NFT: ${errorData.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error deleting NFT:', error);
            alert('❌ Error deleting NFT. Please try again.');
        }
    };

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
                    ...customCollections.map((col: Record<string, unknown>) => ({
                        policyId: col.policyId as string,
                        name: col.name as string,
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
                    const formattedCollections = data.collections.map((col: Record<string, unknown>) => ({
                        policyId: col.policyId as string,
                        assets: col.assets as NFTAsset[]
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
        // Primeiro tentar encontrar nas collections configuradas
        const collection = collections.find(c => c.policyId === policyId);
        if (collection) return collection.name;
        
        // Se não encontrou, buscar nos NFTs carregados
        const nftCollection = userNFTs.find(p => p.policyId === policyId);
        if (nftCollection?.collectionName) {
            // Formatar nome da coleção (ex: "Collection_702cbdb0" → "Collection 702cbdb0")
            return nftCollection.collectionName.replace(/_/g, ' ');
        }
        
        // Fallback: mostrar início do policy ID
        return `${policyId.substring(0, 8)}...`;
    };

    const policyColors = defaultPolicyColors;

    return (
        <>
        <div className="min-h-screen bg-gradient-to-br from-green-900 via-gray-800 to-yellow-900 text-white">
            <Header />
            
            <div className="max-w-8xl mx-auto p-3 pt-3 lg:p-6">
                {/* Header */}
                <div className="mb-2 lg:mb-4">
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        My NFTs
                    </h1>
                    <p className="text-sm md:text-base text-gray-400">
                        View your Cardano NFTs. Connect a wallet or add addresses manually to get started. If you change the wallet in your browser extension, please refresh the page.
                    </p>
                </div>

                {/* Wallet Connection & Sync Controls */}
                <div className="mb-4 lg:mb-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                    <AdaWalletConnector onWalletConnected={onWalletConnected} />
                    
                    {/* Sync Button - Aparece se houver endereços salvos OU endereço conectado */}
                    {(savedAddresses.length > 0 || (isConnected && network === 1)) && (
                        <div className="flex flex-col gap-1 w-full sm:w-auto">
                            <button 
                                onClick={syncWithBlockchain} 
                                disabled={syncing}
                                className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition-all duration-200 transform ${
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

                {/* Layout Principal: Sidebar + Conteúdo */}
                <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
                    {/* Sidebar Lateral */}
                    <div className="w-full lg:w-80 flex-shrink-0 space-y-4 lg:space-y-6">
                        {/* Address Management */}
                        <div className="space-y-3 lg:space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">My Addresses</h2>
                        <button
                            onClick={() => setShowAddAddressForm(!showAddAddressForm)}
                            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 rounded text-xs font-medium transition-colors"
                        >
                            ➕ Add Address
                        </button>
                    </div>

                    {/* Add Address Form */}
                    {showAddAddressForm && (
                        <div className="bg-gray-800/50 backdrop-blur-sm p-4 md:p-6 rounded-lg border border-gray-700">
                            <h3 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Add New Address</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Address (addr1...)</label>
                                    <input
                                        type="text"
                                        value={newAddressInput}
                                        onChange={(e) => setNewAddressInput(e.target.value)}
                                        placeholder="addr1..."
                                        className="w-full px-3 py-2 md:px-4 bg-gray-900 border border-gray-700 rounded-lg text-sm md:text-base text-white font-mono focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Label (optional)</label>
                                    <input
                                        type="text"
                                        value={newAddressLabel}
                                        onChange={(e) => setNewAddressLabel(e.target.value)}
                                        placeholder="My Wallet"
                                        className="w-full px-3 py-2 md:px-4 bg-gray-900 border border-gray-700 rounded-lg text-sm md:text-base text-white focus:outline-none focus:border-blue-500"
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
                        <div className="bg-green-900/20 backdrop-blur-sm p-3 md:p-4 rounded-lg border border-green-700">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-green-400 text-sm mb-1 font-semibold">🟢 Connected Wallet</p>
                                    <p className="text-xs font-mono">{truncateAddress(connectedAddress)}</p>
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
                        <div className="space-y-2">
                            {/* All Addresses Card */}
                            <div
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                    selectedAddress === 'ALL'
                                        ? 'bg-gradient-to-br from-purple-900/30 to-blue-900/30 border-purple-500'
                                        : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                                }`}
                                onClick={() => setSelectedAddress('ALL')}
                            >
                                <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-xs mb-1">🌐 All Addresses</p>
                                        <p className="text-xs text-gray-400">View all NFTs</p>
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
                                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                        selectedAddress === addr.address
                                            ? 'bg-blue-900/30 border-blue-500'
                                            : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                                    }`}
                                    onClick={() => setSelectedAddress(addr.address)}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-xs mb-1">{addr.label}</p>
                                            <p className="text-xs font-mono text-gray-400">{truncateAddress(addr.address, 10, 6)}</p>
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
                        <div className="space-y-3 lg:space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold">Collections</h2>
                        <button
                                onClick={() => setShowAddCollectionForm(!showAddCollectionForm)}
                                className="px-3 py-1 bg-purple-500 hover:bg-purple-600 rounded text-xs font-medium transition-colors"
                        >
                            ➕ Add Custom Collection
                        </button>
                    </div>

                    {/* Add Collection Form */}
                    {showAddCollectionForm && (
                        <div className="bg-gray-800/50 backdrop-blur-sm p-4 md:p-6 rounded-lg border border-gray-700">
                            <h3 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Add Custom Collection</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Policy ID</label>
                                    <input
                                        type="text"
                                        value={newCollectionPolicyId}
                                        onChange={(e) => setNewCollectionPolicyId(e.target.value)}
                                        placeholder="e.g., 8f80ebfaf62a8c33ae2adf047572604c74db8bc1daba2b43f9a65635"
                                        className="w-full px-3 py-2 md:px-4 bg-gray-900 border border-gray-700 rounded-lg text-white font-mono text-xs md:text-sm focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Collection Name</label>
                                    <input
                                        type="text"
                                        value={newCollectionName}
                                        onChange={(e) => setNewCollectionName(e.target.value)}
                                        placeholder="e.g., My Custom Collection"
                                        className="w-full px-3 py-2 md:px-4 bg-gray-900 border border-gray-700 rounded-lg text-sm md:text-base text-white focus:outline-none focus:border-purple-500"
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
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <input
                                            type="checkbox"
                                            id={`collection-${collection.policyId}`}
                                            checked={collection.enabled}
                                            onChange={() => toggleCollection(collection.policyId)}
                                            className="w-5 h-5 rounded border-gray-600 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900 cursor-pointer"
                                        />
                                        <label
                                            htmlFor={`collection-${collection.policyId}`}
                                            className="flex-1 min-w-0 cursor-pointer"
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
                                                {truncateAddress(collection.policyId, 16, 8)}
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
                        
                        {/* Botões para Modais de Imagens */}
                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => setShowItemsModal(true)}
                                className="group flex-1 px-2 py-1 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 rounded-lg font-medium transition-all shadow-lg hover:shadow-purple-500/50 flex items-center justify-center gap-2 overflow-hidden"
                            >
                                <Image
                                    src="/Ada/CW7800noBG.png"
                                    alt="Items icon"
                                    width={50}
                                    height={50}
                                    className="w-8 h-8 object-contain transition-all duration-300 group-hover:scale-125 group-hover:-scale-x-125 group-hover:order-2"
                                />
                                <span className="group-hover:order-1">View Items</span>
                            </button>
                            <button
                                onClick={() => setShowRacesModal(true)}
                                className="group flex-1 px-2 py-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 rounded-lg font-medium transition-all shadow-lg hover:shadow-blue-500/50 flex items-center justify-center gap-2 overflow-hidden"
                            >
                                <Image
                                    src="/Ada/CW6740noBG.png"
                                    alt="Races icon"
                                    width={50}
                                    height={50}
                                    className="w-8 h-8 object-contain transition-all duration-300 group-hover:scale-125 group-hover:-scale-x-125 group-hover:order-2"
                                />
                                <span className="group-hover:order-1">View Races</span>
                            </button>
                        </div>
                        </div>
                    </div>

                    {/* Área Principal - NFTs */}
                    <div className="flex-1 min-w-0">
                        {/* Error Message */}
                        {error && (
                            <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg">
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
                    <div className="space-y-2">
                        {/* Summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="bg-gray-800/50 backdrop-blur-sm p-2 rounded-lg border border-gray-700">
                                <p className="text-gray-400 text-sm mb-1">Total NFTs</p>
                                <p className="text-3xl font-bold text-green-400">{totalNFTs}</p>
                            </div>
                            <div className="bg-gray-800/50 backdrop-blur-sm p-2 rounded-lg border border-gray-700">
                                <p className="text-gray-400 text-sm mb-1">Collections Found</p>
                                <p className="text-3xl font-bold">{userNFTs.length}</p>
                            </div>
                            <div className="bg-gray-800/50 backdrop-blur-sm p-2 rounded-lg border border-gray-700">
                                <p className="text-gray-400 text-sm mb-1">Filtered View</p>
                                <p className="text-3xl font-bold text-blue-400">{filteredAssets.length}</p>
                            </div>
                        </div>

                        {/* Collection Breakdown */}
                        <div className="bg-gray-800/50 backdrop-blur-sm p-2 rounded-lg border border-gray-700">
                            <h2 className="text-lg md:text-xl font-semibold mb-2">Collections</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                            <button
                                onClick={() => setSelectedPolicy('ALL')}
                                className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
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
                                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
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
                            <div className="p-2 border-b border-gray-700">
                                <h2 className="text-lg md:text-xl font-semibold">
                                    Your NFTs ({filteredAssets.length})
                                </h2>
                            </div>
                            
                            <div className="max-h-[70vh] lg:max-h-[950px] overflow-y-auto">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 p-3">
                                    {filteredAssets.map((asset) => (
                                        <div 
                                            key={asset.assetId}
                                            className="bg-gray-900/50 rounded-lg p-2 border border-gray-700 hover:border-gray-600 transition-colors"
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <h3 className="font-semibold text-sm flex-1 min-w-0 pr-2">
                                                    {(asset.metadata?.name as string) || asset.assetName}
                                                </h3>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    <span className={`text-xs px-2 py-1 rounded ${getPolicyColor(asset.policyId)} text-white`}>
                                                        NFT
                                                    </span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteNFT(asset.assetId, (asset.metadata?.name as string) || asset.assetName, asset.address);
                                                        }}
                                                        className="p-1 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 transition-colors"
                                                        title="Delete NFT"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            {(() => {
                                                // Tentar diferentes formatos de URL de imagem
                                                let imageUrl = asset.metadata?.image as string | undefined;
                                                
                                                // Se não tem image direta, buscar em files array
                                                if (!imageUrl && asset.metadata?.files && Array.isArray(asset.metadata.files)) {
                                                    // Priorizar imagens (png, gif, jpg) sobre vídeos
                                                    const imageFile = asset.metadata.files.find((f: Record<string, unknown>) => 
                                                        (f.mediaType as string)?.startsWith('image/') || (f.mime as string)?.startsWith('image/')
                                                    ) as Record<string, unknown> | undefined;
                                                    
                                                    if (imageFile) {
                                                        imageUrl = imageFile.src as string;
                                                    } else if (asset.metadata.files.length > 0) {
                                                        // Se não encontrou imagem, usar primeiro arquivo
                                                        const firstFile = asset.metadata.files[0] as Record<string, unknown>;
                                                        imageUrl = firstFile.src as string;
                                                    }
                                                }
                                                
                                                if (imageUrl && typeof imageUrl === 'string') {
                                                    // Extrair hash IPFS
                                                    const ipfsHash = imageUrl.replace('ipfs://', '');
                                                    
                                                    // Lista de gateways IPFS (ordem de prioridade)
                                                    const gateways = [
                                                        `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
                                                        `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
                                                        `https://ipfs.io/ipfs/${ipfsHash}`,
                                                        `https://dweb.link/ipfs/${ipfsHash}`
                                                    ];
                                                    
                                                    return (
                                                        <div className="mb-3 rounded overflow-hidden bg-gray-800 h-48 flex items-center justify-center">
                                                            <img 
                                                                src={gateways[0]} 
                                                                alt={(asset.metadata?.name as string) || asset.assetName}
                                                                className="max-w-full max-h-full object-contain"
                                                                onError={(e) => {
                                                                    const img = e.currentTarget;
                                                                    const currentSrc = img.src;
                                                                    const currentIndex = gateways.findIndex(g => g === currentSrc);
                                                                    
                                                                    // Tentar próximo gateway
                                                                    if (currentIndex < gateways.length - 1) {
                                                                        img.src = gateways[currentIndex + 1];
                                                                    } else {
                                                                        // Todos os gateways falharam
                                                                        img.style.display = 'none';
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                            
                                            <div className="space-y-1 text-xs">
                                                {asset.metadata?.rarity !== undefined && (
                                                    <p className="text-gray-400">
                                                        <span className="text-gray-500">Rarity:</span> {String(asset.metadata.rarity)}
                                                    </p>
                                                )}
                                                {asset.metadata?.edition !== undefined && (
                                                    <p className="text-gray-400">
                                                        <span className="text-gray-500">Edition:</span> {String(asset.metadata.edition)}
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
                                                <pre className="text-xs mt-2 p-2 bg-gray-950 rounded overflow-x-auto max-h-84">
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
            </div>
        </div>
        
        {/* Modal de Items */}
        <Modal
            isOpen={showItemsModal}
            onClose={() => setShowItemsModal(false)}
            size="lg"
        >
            <div className="flex flex-col items-center">
                <h2 className="text-2xl font-bold mb-4">Cardano Warriors - Items</h2>
                <div className="w-full max-w-full overflow-auto">
                    <Image
                        src="/Ada/CWitems.png"
                        alt="Cardano Warriors Items"
                        width={1200}
                        height={800}
                        className="w-full h-auto rounded-lg"
                    />
                </div>
            </div>
        </Modal>
        
        {/* Modal de Races */}
        <Modal
            isOpen={showRacesModal}
            onClose={() => setShowRacesModal(false)}
            size="lg"
        >
            <div className="flex flex-col items-center">
                <h2 className="text-2xl font-bold mb-4">Cardano Warriors - Races</h2>
                <div className="w-full max-w-full overflow-auto">
                    <Image
                        src="/Ada/CWraces.png"
                        alt="Cardano Warriors Races"
                        width={1200}
                        height={800}
                        className="w-full h-auto rounded-lg"
                    />
                </div>
            </div>
        </Modal>
        </>
    );
}