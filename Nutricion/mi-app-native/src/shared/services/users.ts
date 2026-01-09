import { rtdb } from "./firebase";
import { ref, get, set } from "firebase/database";

export type UserRole = "paciente" | "nutricionista";

export async function ensureUserProfile(uid: string, email: string) {
  const userRef = ref(rtdb, `users/${uid}`);
  const snap = await get(userRef);

  if (!snap.exists()) {
    await set(userRef, {
      email,
      role: "paciente",
      createdAt: Date.now(),
    });
  }
}

export async function getUserRole(uid: string): Promise<UserRole | null> {
  const userRef = ref(rtdb, `users/${uid}`);
  const snap = await get(userRef);
  if (!snap.exists()) return null;
  return (snap.val()?.role as UserRole) || null;
}
