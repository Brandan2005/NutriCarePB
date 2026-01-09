import React, { useState } from "react";
import LoginScreen from "./LoginScreen";
import RegisterScreen from "./RegisterScreen";

export default function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [emailPrefill, setEmailPrefill] = useState("");

  if (mode === "register") {
    return (
      <RegisterScreen
        emailPrefill={emailPrefill}
        onGoLogin={() => {
          setMode("login");
        }}
      />
    );
  }

  return (
    <LoginScreen
      onGoRegister={(email) => {
        setEmailPrefill(email || "");
        setMode("register");
      }}
    />
  );
}
