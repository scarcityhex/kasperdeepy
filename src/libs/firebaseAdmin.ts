import admin from 'firebase-admin';
import path from 'path';

if (!admin.apps.length) {
  try {
    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        storageBucket: 'kasperdeepy.firebasestorage.app',
      });
    } else {
      const serviceAccountPath = path.join(
        process.cwd(),
        'kasperdeepy-firebase-adminsdk-fbsvc-d01255125e.json'
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        storageBucket: 'kasperdeepy.firebasestorage.app',
      });
    }
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
  }
}

const db = admin.firestore();

export async function verifyIdToken(token: string) {
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
}

export { db, admin };
export const firestore = db;
