import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { ref, get, set, onValue, off } from "firebase/database";
import { auth, rtdb } from "../services/firebase";

export type UserRole = "paciente" | "nutricionista";

export function useRole() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let userRefPath: string | null = null;

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (!u) {
        setRole(null);
        setLoading(false);
        // cortar listener si existía
        if (userRefPath) off(ref(rtdb, userRefPath));
        return;
      }

      setLoading(true);

      userRefPath = `users/${u.uid}`;
      const userRef = ref(rtdb, userRefPath);

      // Si no existe perfil, lo creamos como paciente
      const snap = await get(userRef);
      if (!snap.exists()) {
        await set(userRef, {
          email: u.email || "",
          role: "paciente",
          createdAt: Date.now(),
        });
      }

      // Escucha cambios del rol en vivo
      onValue(userRef, (s) => {
        const data = s.val();
        setRole((data?.role as UserRole) || "paciente");
        setLoading(false);
      });
    });

    return () => {
      unsub();
      if (userRefPath) off(ref(rtdb, userRefPath));
    };
  }, []);

  return { user, role, loading };
}

