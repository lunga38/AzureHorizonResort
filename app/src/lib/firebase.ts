import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
  throw new Error(
    "Firebase is not configured. Create an app/.env file with VITE_FIREBASE_API_KEY, " +
    "VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL, " +
    "VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID, " +
    "and VITE_FIREBASE_MEASUREMENT_ID."
  );
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Exported services for use in your components and services
export const auth = getAuth(app);

// 🚨 THE FIX: Explicitly force Firestore to run strictly in memory. 
// This prevents cross-tab cache corruption and stops the INTERNAL ASSERTION crashes!
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});

export const rtdb = getDatabase(app);
export const storage = getStorage(app);

export default app;