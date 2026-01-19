import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import "react-native-reanimated";

import * as Font from "expo-font";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  useEffect(() => {
    // ✅ Esto arregla los iconos "cuadrados" en Firebase Hosting / Web
    if (Platform.OS === "web") {
      Font.loadAsync(MaterialCommunityIcons.font).catch(() => {});
    }
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
