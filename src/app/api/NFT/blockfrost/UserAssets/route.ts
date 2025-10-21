import axios from 'axios';
import { admin, db } from "@/libs/firebaseAdmin";
import { NextRequest, NextResponse } from 'next/server';

let CSL: typeof import('@emurgo/cardano-serialization-lib-browser') | null = null;

async function initializeCSL() {
  if (CSL) return CSL;
  try {
    const cslModule = await import('@emurgo/cardano-serialization-lib-browser');
    CSL = cslModule;
    return CSL;
  } catch (error) {
    console.error('Failed to load Cardano Serialization Lib:', error);
    throw new Error('Could not initialize Cardano library');
  }
}

async function convertHexToBech32(hexAddress: string): Promise<string> {
  try {
    const CSL = await initializeCSL();
    if (!CSL) throw new Error('Cardano library not initialized');
    const addressBytes = Buffer.from(hexAddress, 'hex');
    const address = CSL.Address.from_bytes(addressBytes);
    return address.to_bech32();
  } catch (error) {
    console.error('Error converting hex to bech32:', error);
    throw new Error('Invalid address format');
  }
}

// Mapeamento de policy IDs para nomes de coleções no Firestore
const COLLECTION_MAPPING: Record<string, string> = {
  '8f80ebfaf62a8c33ae2adf047572604c74db8bc1daba2b43f9a65635': 'CW',
  'b7761c472eef3b6e0505441efaf940892bb59c01be96070b0a0a89b3': 'CWI',
  'b9c188390e53e10833f17650ccf1b2704b2f67dccfae7352be3c9533': 'CWA'
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawAddress = searchParams.get('address');
    const policyId = searchParams.get('policyId');
    const forceSync = searchParams.get('sync') === 'true'; // Parâmetro para forçar sincronização
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

    if (!policyId) {
      return NextResponse.json({ error: 'policyId is required' }, { status: 400 });
    }

    // Obter nome da coleção (usar mapeamento ou gerar dinamicamente)
    const collectionName = COLLECTION_MAPPING[policyId] || `Collection_${policyId.substring(0, 8)}`;

    const userDocRef = db.collection("player").doc(userUid);

    // Se não forçar sync, tentar buscar do cache primeiro
    if (!forceSync || !rawAddress) {
      const userDocSnap = await userDocRef.get();
      
      if (userDocSnap.exists) {
        const userData = userDocSnap.data()!;
        const nftField = `${collectionName.toLowerCase()}NFTs`;
        const userNFTIds = userData[nftField] || [];

        if (userNFTIds.length > 0) {
          // Buscar dados completos dos NFTs do cache
          const nftPromises = userNFTIds.map(async (nftId: string) => {
            try {
              const nftDoc = await db.collection(collectionName).doc(nftId).get();
              if (nftDoc.exists) {
                const nftData = nftDoc.data()!;
                return {
                  assetId: nftData.assetId,
                  assetName: nftData.assetName,
                  policyId: nftData.policyId || policyId,
                  metadata: nftData.metadata || {}
                };
              }
              return null;
            } catch (error) {
              console.error(`Error fetching NFT ${nftId}:`, error);
              return null;
            }
          });

          const cachedAssets = (await Promise.all(nftPromises)).filter(nft => nft !== null);

          return NextResponse.json({
            success: true,
            policyId,
            collectionName,
            totalFound: cachedAssets.length,
            totalProcessed: cachedAssets.length,
            assets: cachedAssets,
            source: 'cache'
          }, { status: 200 });
        }
      }

      // Se não tem address e não tem cache, retornar vazio
      if (!rawAddress) {
        return NextResponse.json({
          success: true,
          policyId,
          collectionName,
          assets: [],
          source: 'cache',
          message: "No cached NFTs found. Provide address and sync=true to fetch from blockchain."
        }, { status: 200 });
      }
    }

    // Se chegou aqui, precisa sincronizar com Blockfrost
    if (!rawAddress) {
      return NextResponse.json({ error: 'Address is required for sync' }, { status: 400 });
    }

    // Converter endereço se necessário
    let address: string;
    try {
      if (rawAddress.startsWith('addr1')) {
        address = rawAddress;
      } else {
        address = await convertHexToBech32(rawAddress);
      }
    } catch (error) {
      console.error('Error processing address:', error);
      return NextResponse.json({ error: 'Invalid address format' }, { status: 400 });
    }

    const projectId = process.env.BLOCKFROST_PROJECT_ID;
    if (!projectId) {
      console.error('Blockfrost project ID is not configured');
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    // Buscar assets do endereço no Blockfrost
    const response = await axios.get(
      `https://cardano-mainnet.blockfrost.io/api/v0/addresses/${address}`,
      { headers: { project_id: projectId } }
    );

    // Filtrar apenas os assets da policy ID especificada
    const assets = response.data.amount.filter(
      (asset: { unit: string; quantity: string }) => asset.unit.startsWith(policyId)
    );

    if (!assets.length) {
      return NextResponse.json({ 
        success: true,
        policyId,
        assets: [],
        message: "No NFTs found from this collection in the wallet.",
        source: 'blockchain'
      }, { status: 200 });
    }

    const processedAssets: Array<{ assetId: string; assetName: string; policyId: string; metadata: Record<string, unknown> }> = [];

    // Processar cada asset encontrado
    for (const asset of assets) {
      try {
        // Buscar metadata do asset
        const assetMetadata = await axios.get(
          `https://cardano-mainnet.blockfrost.io/api/v0/assets/${asset.unit}`,
          { headers: { project_id: projectId } }
        );

        const metadata = assetMetadata.data.onchain_metadata || {};

        // Extrair ID único do asset
        const uniquePartHex = asset.unit.replace(policyId, '');
        const uniquePartStr = Buffer.from(uniquePartHex, 'hex').toString('utf-8');
        
        // Normalizar ID baseado na coleção
        let normalizedId = uniquePartStr;
        if (collectionName === 'CW') {
          normalizedId = uniquePartStr.replace("CardanoWarrior", "CW");
        }

        const nftDocRef = db.collection(collectionName).doc(normalizedId);

        // Executar transação para atualizar ownership
        await db.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
          const nftDocSnap = await transaction.get(nftDocRef);
          const userDocSnap = await transaction.get(userDocRef);

          // Se o NFT não existe no Firestore, criar documento
          if (!nftDocSnap.exists) {
            transaction.set(nftDocRef, {
              assetId: asset.unit,
              assetName: uniquePartStr,
              policyId,
              metadata,
              ownerId: userUid,
              ownedSince: admin.firestore.FieldValue.serverTimestamp(),
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          } else {
            // NFT existe, verificar ownership
            const nftData = nftDocSnap.data()!;
            const currentOwnerId = nftData.ownerId || null;

            // Se o owner mudou, atualizar
            if (currentOwnerId !== userUid) {
              // Remover do antigo dono
              if (currentOwnerId) {
                const previousOwnerDocRef = db.collection("player").doc(currentOwnerId);
                const previousOwnerDocSnap = await transaction.get(previousOwnerDocRef);

                if (previousOwnerDocSnap.exists) {
                  const previousOwnerData = previousOwnerDocSnap.data()!;
                  const nftField = `${collectionName.toLowerCase()}NFTs`;
                  const previousNFTs = previousOwnerData[nftField] || [];
                  
                  transaction.update(previousOwnerDocRef, {
                    [nftField]: previousNFTs.filter((id: string) => id !== normalizedId)
                  });
                }
              }

              // Atualizar NFT com novo owner
              transaction.update(nftDocRef, {
                ownerId: userUid,
                previousOwnerId: currentOwnerId,
                ownedSince: admin.firestore.FieldValue.serverTimestamp(),
                metadata // Atualizar metadata também
              });
            }
          }

          // Adicionar NFT ao array do usuário com associação ao endereço
          const userData = userDocSnap.data() || {};
          const nftsByAddress = userData.nftsByAddress || {};
          
          if (!nftsByAddress[address]) {
            nftsByAddress[address] = {};
          }
          
          const nftField = `${collectionName.toLowerCase()}NFTs`;
          if (!nftsByAddress[address][nftField]) {
            nftsByAddress[address][nftField] = [];
          }

          if (!nftsByAddress[address][nftField].includes(normalizedId)) {
            nftsByAddress[address][nftField].push(normalizedId);
            
            transaction.update(userDocRef, {
              nftsByAddress: nftsByAddress
            });
          }
        });

        processedAssets.push({
          assetId: asset.unit,
          assetName: uniquePartStr,
          policyId,
          metadata
        });

      } catch (error) {
        console.error(`Error processing asset ${asset.unit}:`, error);
        // Continuar processando outros assets mesmo se um falhar
      }
    }

    // Remover NFTs que o usuário não possui mais
    const currentNFTIds = processedAssets.map(asset => {
      const uniquePartHex = asset.assetId.replace(policyId, '');
      const uniquePartStr = Buffer.from(uniquePartHex, 'hex').toString('utf-8');
      let normalizedId = uniquePartStr;
      if (collectionName === 'CW') {
        normalizedId = uniquePartStr.replace("CardanoWarrior", "CW");
      }
      return normalizedId;
    });

    const userDocSnap = await userDocRef.get();
    if (userDocSnap.exists) {
      const userData = userDocSnap.data()!;
      const nftField = `${collectionName.toLowerCase()}NFTs`;
      const storedNFTIds = userData[nftField] || [];

      // NFTs que estão no banco mas não na carteira (foram transferidos/vendidos)
      const removedNFTIds = storedNFTIds.filter((id: string) => !currentNFTIds.includes(id));

      if (removedNFTIds.length > 0) {
        // Remover do array do usuário
        await userDocRef.update({
          [nftField]: currentNFTIds
        });

        // Atualizar ownership dos NFTs removidos
        for (const nftId of removedNFTIds) {
          const nftDocRef = db.collection(collectionName).doc(nftId);
          await nftDocRef.update({
            ownerId: null,
            previousOwnerId: userUid,
            transferredAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }

        console.log(`Removed ${removedNFTIds.length} NFTs no longer owned by user ${userUid}`);
      }
    }

    console.log(`Processed ${processedAssets.length} NFTs for user ${userUid} from policy ${policyId}`);

    return NextResponse.json({ 
      success: true,
      policyId,
      collectionName,
      totalFound: assets.length,
      totalProcessed: processedAssets.length,
      assets: processedAssets,
      source: 'blockchain'
    }, { status: 200 });

  } catch (error) {
    console.error("Error processing user NFTs:", error);
    return NextResponse.json({ 
      error: 'Failed to process user NFTs',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
