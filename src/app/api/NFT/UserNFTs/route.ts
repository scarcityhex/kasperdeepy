import { admin, db } from "@/libs/firebaseAdmin";
import { NextRequest, NextResponse } from 'next/server';

// Mapeamento de policy IDs para nomes de coleções no Firestore
const COLLECTION_MAPPING: Record<string, string> = {
  '8f80ebfaf62a8c33ae2adf047572604c74db8bc1daba2b43f9a65635': 'CW',
  'b7761c472eef3b6e0505441efaf940892bb59c01be96070b0a0a89b3': 'CWA_Collection2',
  'b9c188390e53e10833f17650ccf1b2704b2f67dccfae7352be3c9533': 'CWA_Collection3'
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address'); // Endereço específico (opcional)
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization token missing' }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
      console.error("Invalid token:", error);
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    const userUid = decodedToken.uid;

    // Buscar documento do usuário
    const userDocRef = db.collection("player").doc(userUid);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDocSnap.data()!;
    const nftsByAddress = userData.nftsByAddress || {};
    const allNFTs: any[] = [];

    // Determinar quais endereços processar
    const addressesToProcess = address ? [address] : Object.keys(nftsByAddress);

    for (const addr of addressesToProcess) {
      const addressNFTs = nftsByAddress[addr] || {};
      
      // Buscar todas as coleções NFT (campos que terminam com 'NFTs')
      const nftFields = Object.keys(addressNFTs).filter(key => key.endsWith('NFTs') || key.endsWith('nfts'));
      
      for (const nftField of nftFields) {
        const userNFTIds = addressNFTs[nftField] || [];
        if (userNFTIds.length === 0) continue;

        // Extrair nome da coleção do campo (remove 'NFTs' ou 'nfts' do final)
        const collectionName = nftField.replace(/NFTs?$/i, '');
        
        // Tentar obter policy ID do mapeamento reverso, ou usar o nome da coleção
        const policyId = Object.keys(COLLECTION_MAPPING).find(
          key => COLLECTION_MAPPING[key].toLowerCase() === collectionName.toLowerCase()
        ) || 'unknown';

        // Buscar dados completos de cada NFT
        const nftPromises = userNFTIds.map(async (nftId: string) => {
          try {
            const nftDoc = await db.collection(collectionName).doc(nftId).get();
            if (nftDoc.exists) {
              const nftData = nftDoc.data()!;
              return {
                id: nftId,
                assetId: nftData.assetId,
                assetName: nftData.assetName,
                policyId: nftData.policyId || policyId,
                metadata: nftData.metadata || {},
                ownedSince: nftData.ownedSince,
                collectionName,
                address: addr
              };
            }
            return null;
          } catch (error) {
            console.error(`Error fetching NFT ${nftId}:`, error);
            return null;
          }
        });

        const nfts = await Promise.all(nftPromises);
        const validNFTs = nfts.filter(nft => nft !== null);
        
        if (validNFTs.length > 0) {
          // Verificar se já existe entrada para esta policy
          const existingEntry = allNFTs.find(entry => entry.policyId === policyId);
          if (existingEntry) {
            existingEntry.assets.push(...validNFTs);
          } else {
            allNFTs.push({
              policyId,
              collectionName,
              assets: validNFTs
            });
          }
        }
      }
    }

    const totalNFTs = allNFTs.reduce((sum, collection) => sum + collection.assets.length, 0);

    return NextResponse.json({
      success: true,
      totalNFTs,
      collections: allNFTs,
      addressesProcessed: addressesToProcess
    }, { status: 200 });

  } catch (error) {
    console.error("Error fetching user NFTs from database:", error);
    return NextResponse.json({ 
      error: 'Failed to fetch user NFTs',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
