import { admin, db } from "@/libs/firebaseAdmin";
import { NextRequest, NextResponse } from 'next/server';

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

    // Buscar coleções customizadas do usuário
    const userDocRef = db.collection("player").doc(userUid);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      return NextResponse.json({ collections: [] }, { status: 200 });
    }

    const userData = userDocSnap.data()!;
    const customCollections = userData.customCollections || [];

    return NextResponse.json({ collections: customCollections }, { status: 200 });

  } catch (error) {
    console.error('Error fetching custom collections:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
    const { collections } = body;

    if (!Array.isArray(collections)) {
      return NextResponse.json({ error: 'Collections must be an array' }, { status: 400 });
    }

    // Salvar coleções customizadas no Firestore
    const userDocRef = db.collection("player").doc(userUid);
    
    await userDocRef.set({
      customCollections: collections,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return NextResponse.json({ 
      success: true,
      message: 'Custom collections saved successfully'
    }, { status: 200 });

  } catch (error) {
    console.error('Error saving custom collections:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
