import { NextRequest, NextResponse } from 'next/server';
import { admin, db } from '@/libs/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uid, email, displayName, photoURL } = body;
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Token de autorização não fornecido' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    let decodedToken;

    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
      console.error('Token inválido:', error);
      return NextResponse.json({ error: 'Token inválido' }, { status: 403 });
    }

    // Verificar se o UID do token corresponde ao UID enviado
    if (decodedToken.uid !== uid) {
      return NextResponse.json({ error: 'UID não autorizado' }, { status: 403 });
    }

    // Verificar se o usuário já existe na coleção player
    const playerRef = db.collection('player').doc(uid);
    const playerDoc = await playerRef.get();

    if (!playerDoc.exists) {
      // Criar novo Player na coleção player
      await playerRef.set({
        uid,
        email,
        displayName: displayName || email?.split('@')[0] || 'Player',
        photoURL: photoURL || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        activeCards: [],
        
       
       
       
      });

      console.log(`Novo Player criado: ${uid}`);
      return NextResponse.json({ 
        success: true, 
        message: 'Player criado com sucesso',
        isNewPlayer: true 
      }, { status: 201 });
    } else {
      // Atualizar último login
      await playerRef.update({
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        email,
        displayName: displayName || playerDoc.data()?.displayName,
        photoURL: photoURL || playerDoc.data()?.photoURL
      });

      console.log(`Player existente logado: ${uid}`);
      return NextResponse.json({ 
        success: true, 
        message: 'Login atualizado',
        isNewPlayer: false 
      }, { status: 200 });
    }
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ 
      error: 'Erro interno do servidor', 
      details: errorMessage 
    }, { status: 500 });
  }
} 