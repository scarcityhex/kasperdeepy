import { initializeApp } from "firebase/app";
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from "firebase/database";
import { getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, sendEmailVerification, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCd7pue1F1K63igP6ZOk35sb58s24u9Fho",
  authDomain: "kasperdeepy.firebaseapp.com",
  projectId: "kasperdeepy",
  storageBucket: "kasperdeepy.firebasestorage.app",
  messagingSenderId: "419116821935",
  appId: "1:419116821935:web:f9073a028f84e8d9ae535a"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

const storage = getStorage(app);

const auth = getAuth(app);

const dbRT = getDatabase(app);

export { auth, db, storage, GoogleAuthProvider, app, signInWithPopup, signOut, createUserWithEmailAndPassword, sendEmailVerification, dbRT };
