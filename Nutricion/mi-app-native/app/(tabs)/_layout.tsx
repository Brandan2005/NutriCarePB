import React, { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { PaperProvider } from "react-native-paper";

import { auth } from "../../src/shared/services/firebase";
import { theme } from "../../src/shared/theme/theme";
import AuthScreen from "../../src/auth/AuthScreen";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
    });
    return () => unsub();
  }, []);

  if (checking) return null;

  return (
    <PaperProvider theme={theme}>
      {!user ? (
        <AuthScreen />
      ) : (
        <Tabs
          screenOptions={{
            headerShown: false,

            // ✅ OCULTA COMPLETAMENTE LA BARRA DE ABAJO
            tabBarStyle: { display: "none" },

            // (opcional) igual dejamos el tint por si después volvés a mostrarla
            tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
          }}
        >
          {/* Estas pantallas siguen existiendo como rutas, pero sin barra visible */}
          <Tabs.Screen name="index" options={{ title: "Inicio" }} />
          <Tabs.Screen name="explore" options={{ title: "Turnos" }} />

          {/* Si tenés paciente/nutricionista dentro de (tabs), también van acá */}
          <Tabs.Screen name="paciente" options={{ href: null }} />
          <Tabs.Screen name="nutricionista" options={{ href: null }} />
        </Tabs>
      )}
    </PaperProvider>
  );
}

