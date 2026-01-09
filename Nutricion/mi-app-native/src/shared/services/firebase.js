import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDHHm7vvdEWrPxh-P5VvWKAOb8ihltE5yg",
  authDomain: "nutricion-app-d0953.firebaseapp.com",
  projectId: "nutricion-app-d0953",
  storageBucket: "nutricion-app-d0953.firebasestorage.app",
  messagingSenderId: "233182502398",
  appId: "1:233182502398:web:7e7899c4d74f67f502b4af"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);
