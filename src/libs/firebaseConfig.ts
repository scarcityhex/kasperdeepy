import { initializeApp } from "firebase/app";
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from "firebase/database";
import { getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, sendEmailVerification, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBA1nsd2Gf33DYY9Rr6nFTK8filLJlwVfU",
  authDomain: "blockchainwars-1e5ac.firebaseapp.com",
  projectId: "blockchainwars-1e5ac",
  storageBucket: "blockchainwars-1e5ac.appspot.com",
  messagingSenderId: "790129274205",
  appId: "1:790129274205:web:3a35557454e6c940050cb4",
  databaseURL: "https://blockchainwars-1e5ac-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

const storage = getStorage(app);

const auth = getAuth(app);

const dbRT = getDatabase(app);

export { auth, db, storage, GoogleAuthProvider, app, signInWithPopup, signOut, createUserWithEmailAndPassword, sendEmailVerification, dbRT };
