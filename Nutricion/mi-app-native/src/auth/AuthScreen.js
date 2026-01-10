import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { Text } from "react-native-paper";
import LoginScreen from "./LoginScreen";
import RegisterScreen from "./RegisterScreen";
import { auth } from "../shared/services/firebase";

export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // "login" | "register"

  const email = useMemo(() => auth.currentUser?.email ?? "", []);

  return (
    <View style={{ flex: 1 }}>
      {mode === "login" ? (
        <LoginScreen onGoRegister={() => setMode("register")} />
      ) : (
        <RegisterScreen
          onGoLogin={() => setMode("login")}
          prefEmail={email}
        />
      )}

      <Text
        style={{
          position: "absolute",
          bottom: 10,
          width: "100%",
          textAlign: "center",
          opacity: 0.45,
          fontSize: 12,
        }}
      >
        NutriCare · Acceso seguro
      </Text>
    </View>
  );
}
