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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address: rawAddress } = body;
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

    if (!rawAddress || !userUid) {
      console.error('Address or userUid missing');
      return NextResponse.json({ error: 'Address and userUid are required' }, { status: 400 });
    }

    const userDocRef = db.collection("player").doc(userUid);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDocSnap.data()!;
    const claimTimestamps = userData.cwClaimTimestamps || [];
    const now = admin.firestore.Timestamp.now();
    const oneHourAgo = new admin.firestore.Timestamp(now.seconds - 3600, now.nanoseconds);
    const recentClaims = claimTimestamps.filter((timestamp: FirebaseFirestore.Timestamp) => timestamp.toMillis() > oneHourAgo.toMillis());

    if (recentClaims.length >= 5) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
    }

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

    const policyId = "8f80ebfaf62a8c33ae2adf047572604c74db8bc1daba2b43f9a65635";
    const projectId = process.env.BLOCKFROST_PROJECT_ID;

    if (!projectId) {
      console.error('Blockfrost project ID is not configured');
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    const response = await axios.get(
      `https://cardano-mainnet.blockfrost.io/api/v0/addresses/${address}`,
      { headers: { project_id: projectId } }
    );

    const assets = response.data.amount.filter((asset: { unit: string; quantity: string }) => asset.unit.startsWith(policyId));

    if (!assets.length) {
      return NextResponse.json({ message: "No NFTs found in the wallet." }, { status: 200 });
    }

    const newTimestamps = [...recentClaims, now];
    await userDocRef.update({ cwClaimTimestamps: newTimestamps });

    for (const asset of assets) {
      const uniquePartHex = asset.unit.replace(policyId, '');
      const uniquePartStr = Buffer.from(uniquePartHex, 'hex').toString('utf-8');
      const normalizedId = uniquePartStr.replace("CardanoWarrior", "CW");

      const nftDocRef = db.collection("CW").doc(normalizedId);
      const nftDocSnap = await nftDocRef.get();

      if (!nftDocSnap.exists) {
        console.error(`NFT ${normalizedId} not found in Firestore.`);
        continue;
      }

      const nftData = nftDocSnap.data();
      const currentOwner = nftData?.owner || null;

      if (currentOwner === userUid) {
        console.log(`NFT ${normalizedId} already belongs to user ${userUid}. Skipping claim process.`);
        continue;
      }

      await db.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
        // --- LEITURAS PRIMEIRO ---
        const nftDocSnap = await transaction.get(nftDocRef);
        const currentUserDocSnap = await transaction.get(userDocRef); // Mova a leitura para o início

        if (!nftDocSnap.exists) {
          throw new Error(`NFT ${normalizedId} não existe dentro da transação.`);
        }

        const nftData = nftDocSnap.data()!;
        const ownerInsideTransaction = nftData.owner || null;
        
        const currentUserData = currentUserDocSnap.data() || {};
        const activeCards = currentUserData.activeCards || [];

        if (ownerInsideTransaction && ownerInsideTransaction !== userUid) {
          const previousOwnerDocRef = db.collection("player").doc(ownerInsideTransaction);
          const previousOwnerDocSnap = await transaction.get(previousOwnerDocRef);

          if (previousOwnerDocSnap.exists) {
            transaction.update(previousOwnerDocRef, {
              cards: admin.firestore.FieldValue.arrayRemove(normalizedId),
              activeCards: admin.firestore.FieldValue.arrayRemove(normalizedId)
            });

            console.log(`NFT ${normalizedId} removed from the previous owner's arrays (${ownerInsideTransaction}).`);
          }
        }

        transaction.update(nftDocRef, {
          owner: userUid,
          pastOwner: ownerInsideTransaction,
          ownedSince: admin.firestore.FieldValue.serverTimestamp(),
        });

        const updateData: { [key: string]: any } = {
            cards: admin.firestore.FieldValue.arrayUnion(normalizedId)
        };

        if (activeCards.length < 30) {
            updateData['activeCards'] = admin.firestore.FieldValue.arrayUnion(normalizedId);
        }

        transaction.update(userDocRef, updateData);
      });
    }

    console.log(`Player ${userUid} updated successfully.`);
    return NextResponse.json({ message: "NFTs claimed successfully!" }, { status: 200 });
  } catch (error) {
    console.error("Error processing NFTs:", error);
    return NextResponse.json({ error: 'Failed to process NFTs' }, { status: 500 });
  }
}