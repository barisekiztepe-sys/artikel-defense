import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore, collection, query, orderBy, limit, onSnapshot, setDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';

// Note: In a real app, these would come from firebase-applet-config.json
// For this environment, we use placeholders if the config tool failed, 
// but usually the tool provides a real config file.
const firebaseConfig = {
  apiKey: "AIzaSyDummyKey",
  authDomain: "artikel-defense.firebaseapp.com",
  projectId: "artikel-defense",
  storageBucket: "artikel-defense.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, collection, query, orderBy, limit, onSnapshot, setDoc, doc, serverTimestamp, getDoc };
