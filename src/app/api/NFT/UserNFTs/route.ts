import { admin, db } from "@/libs/firebaseAdmin";
import { NextRequest, NextResponse } from 'next/server';

// Mapeamento de policy IDs para nomes de coleções no Firestore
const COLLECTION_MAPPING: Record<string, string> = {
  '8f80ebfaf62a8c33ae2adf047572604c74db8bc1daba2b43f9a65635': 'CW',
  'b7761c472eef3b6e0505441efaf940892bb59c01be96070b0a0a89b3': 'CWI',
  'b9c188390e53e10833f17650ccf1b2704b2f67dccfae7352be3c9533': 'CWA'
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
    const allNFTs: Array<{ policyId: string; collectionName: string; assets: unknown[] }> = [];

    // Determinar quais endereços processar
    const addressesToProcess = address ? [address] : Object.keys(nftsByAddress);

    for (const addr of addressesToProcess) {
      const addressNFTs = nftsByAddress[addr] || {};
      
      // Buscar todas as coleções NFT (campos que terminam com 'NFTs' ou 'nfts')
      const nftFields = Object.keys(addressNFTs).filter(key => 
        key.toLowerCase().endsWith('nfts')
      );
      
      for (const nftField of nftFields) {
        const userNFTIds = addressNFTs[nftField] || [];
        if (userNFTIds.length === 0) continue;

        // Extrair nome da coleção do campo (remove 'NFTs' ou 'nfts' do final, preserva case)
        const extractedName = nftField.replace(/NFTs$/i, '');
        
        // Tentar obter policy ID e nome correto do mapeamento
        const policyId = Object.keys(COLLECTION_MAPPING).find(
          key => COLLECTION_MAPPING[key].toLowerCase() === extractedName.toLowerCase()
        ) || 'unknown';
        
        // Para coleções padrão, usar nome do mapeamento (CW, CWI, CWA)
        // Para customizadas, capitalizar primeira letra (Collection_702cbdb0)
        let collectionName: string;
        if (policyId !== 'unknown') {
          collectionName = COLLECTION_MAPPING[policyId];
        } else {
          // Capitalizar primeira letra para coleções customizadas
          collectionName = extractedName.charAt(0).toUpperCase() + extractedName.slice(1);
        }

        // Buscar dados completos de cada NFT
        const nftPromises = userNFTIds.map(async (nftId: string) => {
          try {
            const nftDoc = await db.collection(collectionName).doc(nftId).get();
            if (nftDoc.exists) {
              const nftData = nftDoc.data()!;
              
              // Usar policyId dos dados da NFT se disponível, senão usar o resolvido
              const actualPolicyId = nftData.policyId || policyId;
              
              return {
                id: nftId,
                assetId: nftData.assetId,
                assetName: nftData.assetName,
                policyId: actualPolicyId,
                metadata: nftData.metadata || {},
                ownedSince: nftData.ownedSince,
                collectionName,
                address: addr
              };
            }
            return null;
          } catch (error) {
            console.error(`Error fetching NFT ${nftId} from ${collectionName}:`, error);
            return null;
          }
        });

        const nfts = await Promise.all(nftPromises);
        const validNFTs = nfts.filter(nft => nft !== null);
        
        if (validNFTs.length > 0) {
          // Agrupar por policyId REAL (dos metadados), não pelo resolvido
          // Isso separa corretamente coleções customizadas diferentes
          for (const nft of validNFTs) {
            const nftPolicyId = nft.policyId;
            const existingEntry = allNFTs.find(entry => entry.policyId === nftPolicyId);
            
            if (existingEntry) {
              existingEntry.assets.push(nft);
            } else {
              allNFTs.push({
                policyId: nftPolicyId,
                collectionName,
                assets: [nft]
              });
            }
          }
        }
      }
    }

    const totalNFTs = allNFTs.reduce((sum, collection) => sum + collection.assets.length, 0);

    console.log(`✅ Loaded ${totalNFTs} NFTs from ${allNFTs.length} collections for user ${userUid}`);

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
