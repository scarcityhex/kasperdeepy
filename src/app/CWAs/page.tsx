'use client';

import { useState } from 'react';

interface CategoryCounts {
  TOTEM: number;
  MOUNT: number;
  WATCHTOWER: number;
  HEADGEAR: number;
  COMPANION: number;
}

interface AssetMetadata {
  assetId: string;
  assetName: string;
  category: 'TOTEM' | 'MOUNT' | 'WATCHTOWER' | 'HEADGEAR' | 'COMPANION';
  metadata: any;
}

interface ApiResponse {
  success: boolean;
  policyId: string;
  totalAssets: number;
  totalFiltered: number;
  categoryCounts: CategoryCounts;
  assets: AssetMetadata[];
}

export default function CWAsPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch('/api/NFT/blockfrost/CardanoAssets');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      setData(result);
      
      // Download JSON file automatically
      const jsonString = JSON.stringify(result, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cardano-assets-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (err: any) {
      setError(err.message || 'Failed to fetch assets');
    } finally {
      setLoading(false);
    }
  };

  const filteredAssets = data?.assets.filter(asset => 
    selectedCategory === 'ALL' || asset.category === selectedCategory
  ) || [];

  const categoryColors: Record<string, string> = {
    TOTEM: 'bg-purple-500',
    MOUNT: 'bg-blue-500',
    WATCHTOWER: 'bg-yellow-500',
    HEADGEAR: 'bg-pink-500',
    COMPANION: 'bg-green-500',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Cardano Warriors Assets
          </h1>
          <p className="text-gray-400">
            Fetch and filter NFTs from the collection
          </p>
        </div>

        {/* Action Button */}
        <div className="mb-8">
          <button
            onClick={fetchAssets}
            disabled={loading}
            className={`
              px-8 py-4 rounded-lg font-semibold text-lg
              transition-all duration-200 transform
              ${loading 
                ? 'bg-gray-600 cursor-not-allowed' 
                : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 hover:scale-105 shadow-lg hover:shadow-xl'
              }
            `}
          >
            {loading ? (
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                <span>Fetching Assets...</span>
              </div>
            ) : (
              '🚀 Fetch All Assets'
            )}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-8 p-4 bg-red-500/20 border border-red-500 rounded-lg">
            <p className="text-red-300">❌ Error: {error}</p>
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">Total Assets Scanned</p>
                <p className="text-3xl font-bold">{data.totalAssets}</p>
              </div>
              <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">Filtered Assets</p>
                <p className="text-3xl font-bold text-green-400">{data.totalFiltered}</p>
              </div>
              <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">Policy ID</p>
                <p className="text-xs font-mono mt-2 break-all">{data.policyId}</p>
              </div>
            </div>

            {/* Category Counts */}
            <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
              <h2 className="text-xl font-semibold mb-4">Category Breakdown</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Object.entries(data.categoryCounts).map(([category, count]) => (
                  <div 
                    key={category}
                    className="bg-gray-900/50 p-4 rounded-lg text-center cursor-pointer hover:bg-gray-900 transition-colors"
                    onClick={() => setSelectedCategory(category)}
                  >
                    <div className={`w-3 h-3 rounded-full ${categoryColors[category]} mx-auto mb-2`}></div>
                    <p className="text-gray-400 text-sm">{category}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Filter */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedCategory === 'ALL' 
                    ? 'bg-white text-gray-900' 
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                All ({data.totalFiltered})
              </button>
              {Object.entries(data.categoryCounts).map(([category, count]) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    selectedCategory === category 
                      ? `${categoryColors[category]} text-white` 
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {category} ({count})
                </button>
              ))}
            </div>

            {/* Assets List */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
              <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-xl font-semibold">
                  Assets ({filteredAssets.length})
                </h2>
                <button
                  onClick={() => {
                    const jsonString = JSON.stringify(filteredAssets, null, 2);
                    const blob = new Blob([jsonString], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `filtered-assets-${selectedCategory}-${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  }}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors"
                >
                  📥 Download Filtered JSON
                </button>
              </div>
              
              <div className="max-h-[600px] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                  {filteredAssets.map((asset) => (
                    <div 
                      key={asset.assetId}
                      className="bg-gray-900/50 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-sm">{asset.metadata.name}</h3>
                        <span className={`text-xs px-2 py-1 rounded ${categoryColors[asset.category]} text-white`}>
                          {asset.category}
                        </span>
                      </div>
                      
                      {asset.metadata.image && (
                        <div className="mb-3 rounded overflow-hidden bg-gray-800 h-48 flex items-center justify-center">
                          <img 
                            src={asset.metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')} 
                            alt={asset.metadata.name}
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      
                      <div className="space-y-1 text-xs">
                        {asset.metadata.rarity && (
                          <p className="text-gray-400">
                            <span className="text-gray-500">Rarity:</span> {asset.metadata.rarity}
                          </p>
                        )}
                        {asset.metadata.edition && (
                          <p className="text-gray-400">
                            <span className="text-gray-500">Edition:</span> {asset.metadata.edition}
                          </p>
                        )}
                        {asset.metadata.collection && (
                          <p className="text-gray-400">
                            <span className="text-gray-500">Collection:</span> {asset.metadata.collection}
                          </p>
                        )}
                      </div>
                      
                      <details className="mt-3">
                        <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                          View Metadata
                        </summary>
                        <pre className="text-xs mt-2 p-2 bg-gray-950 rounded overflow-x-auto">
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
      </div>
    </div>
  );
}
