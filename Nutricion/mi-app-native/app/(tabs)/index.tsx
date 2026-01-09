import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { useRole } from "../../src/shared/hooks/useRole";

export default function Index() {
  const { user, role, loading } = useRole();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/(auth)");
      return;
    }

    if (role === "nutricionista") {
      router.replace("/(tabs)/nutricionista");
      return;
    }

    router.replace("/(tabs)/paciente");
  }, [user, role, loading]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
