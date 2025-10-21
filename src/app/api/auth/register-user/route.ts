import { NextRequest, NextResponse } from 'next/server';
import { admin, db } from '@/libs/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uid, email, displayName, photoURL } = body;
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization token not provided' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    let decodedToken;

    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
      console.error('Invalid token:', error);
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    if (decodedToken.uid !== uid) {
      return NextResponse.json({ error: 'Unauthorized UID' }, { status: 403 });
    }

    const playerRef = db.collection('player').doc(uid);
    const playerDoc = await playerRef.get();

    if (!playerDoc.exists) {
      await playerRef.set({
        uid,
        email,
        displayName: displayName || email?.split('@')[0] || 'Player',
        photoURL: photoURL || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        
       
       
       
      });

      console.log(`New player created: ${uid}`);
      return NextResponse.json({ 
        success: true, 
        message: 'Player created successfully',
        isNewPlayer: true 
      }, { status: 201 });
    } else {
      await playerRef.update({
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        email,
        displayName: displayName || playerDoc.data()?.displayName,
        photoURL: photoURL || playerDoc.data()?.photoURL
      });

      console.log(`Existing player logged in: ${uid}`);
      return NextResponse.json({ 
        success: true, 
        message: 'Login updated',
        isNewPlayer: false 
      }, { status: 200 });
    }
  } catch (error) {
    console.error('Error registering user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: errorMessage 
    }, { status: 500 });
  }
} 