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

// GET - Buscar endereços salvos do usuário
export async function GET(request: NextRequest) {
  try {
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
    const userDocRef = db.collection("player").doc(userUid);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDocSnap.data()!;
    const savedAddresses = userData.cardanoAddresses || [];

    return NextResponse.json({
      success: true,
      addresses: savedAddresses
    }, { status: 200 });

  } catch (error) {
    console.error("Error fetching user addresses:", error);
    return NextResponse.json({ 
      error: 'Failed to fetch addresses',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST - Adicionar novo endereço
export async function POST(request: NextRequest) {
  try {
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
    const body = await request.json();
    const { address: rawAddress, label } = body;

    if (!rawAddress) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    // Converter endereço se necessário (hex -> bech32)
    let address: string;
    try {
      if (rawAddress.startsWith('addr1')) {
        address = rawAddress;
      } else {
        // Assumir que é hexadecimal e converter
        address = await convertHexToBech32(rawAddress);
      }
    } catch (error) {
      console.error('Error processing address:', error);
      return NextResponse.json({ error: 'Invalid address format' }, { status: 400 });
    }

    const userDocRef = db.collection("player").doc(userUid);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDocSnap.data()!;
    const savedAddresses = userData.cardanoAddresses || [];

    // Verificar se endereço já existe
    const addressExists = savedAddresses.some((addr: { address: string }) => addr.address === address);
    if (addressExists) {
      return NextResponse.json({ error: 'Address already saved' }, { status: 400 });
    }

    // Adicionar novo endereço
    const newAddress = {
      address,
      label: label || `Wallet ${savedAddresses.length + 1}`,
      addedAt: admin.firestore.Timestamp.now(),
      lastSyncedAt: null
    };

    await userDocRef.update({
      cardanoAddresses: admin.firestore.FieldValue.arrayUnion(newAddress)
    });

    return NextResponse.json({
      success: true,
      message: 'Address added successfully',
      address: newAddress
    }, { status: 200 });

  } catch (error) {
    console.error("Error adding address:", error);
    return NextResponse.json({ 
      error: 'Failed to add address',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// DELETE - Remover endereço
export async function DELETE(request: NextRequest) {
  try {
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
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    const userDocRef = db.collection("player").doc(userUid);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDocSnap.data()!;
    const savedAddresses = userData.cardanoAddresses || [];

    // Encontrar e remover o endereço
    const addressToRemove = savedAddresses.find((addr: { address: string }) => addr.address === address);
    
    if (!addressToRemove) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 });
    }

    await userDocRef.update({
      cardanoAddresses: admin.firestore.FieldValue.arrayRemove(addressToRemove)
    });

    return NextResponse.json({
      success: true,
      message: 'Address removed successfully'
    }, { status: 200 });

  } catch (error) {
    console.error("Error removing address:", error);
    return NextResponse.json({ 
      error: 'Failed to remove address',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
