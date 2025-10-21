import { admin, db } from "@/libs/firebaseAdmin";
import { NextRequest, NextResponse } from 'next/server';

// Mapeamento de policy IDs para nomes de coleções no Firestore
const COLLECTION_MAPPING: Record<string, string> = {
  '8f80ebfaf62a8c33ae2adf047572604c74db8bc1daba2b43f9a65635': 'CW',
  'b7761c472eef3b6e0505441efaf940892bb59c01be96070b0a0a89b3': 'CWI',
  'b9c188390e53e10833f17650ccf1b2704b2f67dccfae7352be3c9533': 'CWA'
};

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization token missing' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userUid = decodedToken.uid;

    const body = await request.json();
    const { assetId, address } = body;

    if (!assetId || !address) {
      return NextResponse.json({ error: 'Asset ID and address are required' }, { status: 400 });
    }

    // Buscar documento do usuário
    const userDocRef = db.collection('player').doc(userUid);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDocSnap.data()!;
    const nftsByAddress = userData.nftsByAddress || {};
    const addressNFTs = nftsByAddress[address];

    if (!addressNFTs) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 });
    }

    // Encontrar qual campo contém esta NFT
    let nftFieldKey: string | null = null;
    let nftId: string | null = null;

    // Procurar em todos os campos que terminam com 'NFTs'
    const nftFields = Object.keys(addressNFTs).filter(key => 
      key.toLowerCase().endsWith('nfts')
    );

    for (const field of nftFields) {
      const nftIds = addressNFTs[field] || [];
      
      // Verificar se o assetId está na lista de IDs deste campo
      for (const id of nftIds) {
        // Precisamos buscar a NFT para verificar o assetId
        const extractedName = field.replace(/NFTs$/i, '');
        const policyIdKey = Object.keys(COLLECTION_MAPPING).find(
          key => COLLECTION_MAPPING[key].toLowerCase() === extractedName.toLowerCase()
        );
        
        let collectionName: string;
        if (policyIdKey) {
          collectionName = COLLECTION_MAPPING[policyIdKey];
        } else {
          collectionName = extractedName.charAt(0).toUpperCase() + extractedName.slice(1);
        }

        try {
          const nftDoc = await db.collection(collectionName).doc(id).get();
          if (nftDoc.exists) {
            const nftData = nftDoc.data();
            if (nftData?.assetId === assetId) {
              nftFieldKey = field;
              nftId = id;
              break;
            }
          }
        } catch (error) {
          console.error(`Error checking NFT ${id}:`, error);
        }
      }
      
      if (nftFieldKey && nftId) break;
    }

    if (!nftFieldKey || !nftId) {
      return NextResponse.json({ error: 'NFT not found in user collection' }, { status: 404 });
    }

    // Remover o ID da NFT do array
    const currentArray = addressNFTs[nftFieldKey] || [];
    const updatedArray = currentArray.filter((id: string) => id !== nftId);

    // Atualizar o documento do usuário
    await userDocRef.update({
      [`nftsByAddress.${address}.${nftFieldKey}`]: updatedArray,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Deleted NFT ${nftId} (assetId: ${assetId}) from user ${userUid}, address ${address}`);

    return NextResponse.json({
      success: true,
      message: 'NFT deleted successfully',
      nftId,
      assetId
    }, { status: 200 });

  } catch (error) {
    console.error("Error deleting NFT:", error);
    return NextResponse.json({ 
      error: 'Failed to delete NFT',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
