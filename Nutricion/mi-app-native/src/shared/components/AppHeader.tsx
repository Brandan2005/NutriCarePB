import React from "react";
import { View, Image } from "react-native";
import { Button, Text } from "react-native-paper";
import { router } from "expo-router";

export default function AppHeader({
  user,
  name,
  photoURL,
}: {
  user: any;
  name?: string;
  photoURL?: string;
}) {
  return (
    <View style={{ height: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      {/* Logo (siempre vuelve al home) */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Image source={require("../../../assets/images/icon.png")} style={{ width: 32, height: 32, borderRadius: 8 }} />
        <Text variant="titleMedium" onPress={() => router.push("/(public)")}>
          NutriCare
        </Text>
      </View>

      {/* Derecha */}
      {!user ? (
        <Button mode="contained" onPress={() => router.push("/(auth)")}>
          Iniciar sesión
        </Button>
      ) : (
        <Button
          mode="text"
          onPress={() => router.push("/(tabs)")}
          icon={() =>
            photoURL ? (
              <Image source={{ uri: photoURL }} style={{ width: 28, height: 28, borderRadius: 999 }} />
            ) : null
          }
        >
          {name || "Mi perfil"}
        </Button>
      )}
    </View>
  );
}
