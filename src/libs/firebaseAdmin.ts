import admin from 'firebase-admin';
import path from 'path';

if (!admin.apps.length) {
  try {
    // Tenta usar variáveis de ambiente primeiro
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        databaseURL: "https://blockchainwars-1e5ac.firebaseio.com",
        storageBucket: "blockchainwars-1e5ac.appspot.com"
      });
    } else {
      // Se não houver variáveis de ambiente, usa o arquivo de credenciais
      const serviceAccountPath = path.join(process.cwd(), 'blockchainwars-1e5ac-firebase-adminsdk-ok7u0-63430cc571.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        databaseURL: "https://blockchainwars-1e5ac.firebaseio.com",
        storageBucket: "blockchainwars-1e5ac.appspot.com"
      });
    }
    console.log('Firebase Admin inicializado com sucesso');
  } catch (error) {
    console.error('Erro ao inicializar Firebase Admin:', error);
  }
}

const db = admin.firestore();

// Função para verificar token de autenticação
export async function verifyIdToken(token: string) {
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    return null;
  }
}

export { db, admin };
export const firestore = db;
