import React, { useMemo, useState } from "react";
import {
  View,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import {
  Button,
  Card,
  Text,
  TextInput,
  Divider,
  HelperText,
} from "react-native-paper";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { ref, set } from "firebase/database";
import { router } from "expo-router";

import { auth, rtdb } from "../shared/services/firebase";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function niceError(e: any) {
  const code = String(e?.code || "").toLowerCase();
  if (code.includes("auth/email-already-in-use"))
    return "Ese email ya está registrado. Probá iniciar sesión.";
  if (code.includes("auth/invalid-email")) return "El email no es válido.";
  if (code.includes("auth/weak-password"))
    return "Contraseña débil (mínimo 6 caracteres).";
  return "No se pudo crear la cuenta. Intentá nuevamente.";
}

export default function RegisterScreen({
  onGoLogin,
  emailPrefill = "",
}: {
  onGoLogin: () => void;
  emailPrefill?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(emailPrefill);
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const emailOk = useMemo(
    () => (email.length === 0 ? true : isValidEmail(email)),
    [email]
  );
  const passOk = useMemo(
    () => (password.length === 0 ? true : password.length >= 6),
    [password]
  );

  async function onRegister() {
    setError("");

    const cleanEmail = email.trim();
    if (!name.trim()) {
      setError("Ingresá tu nombre.");
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      setError("Ingresá un email válido.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);

      // ✅ default PACIENTE
      await set(ref(rtdb, `users/${cred.user.uid}`), {
        uid: cred.user.uid,
        email: cleanEmail,
        name: name.trim(),
        role: "paciente",
        createdAt: new Date().toISOString(),
      });

      // Firebase deja sesión iniciada automáticamente
    } catch (e: any) {
      setError(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#F6F7FB" }}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 18,
          maxWidth: 520,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Pressable
          onPress={() => router.replace("/(public)")}
          style={{ alignItems: "center", marginBottom: 18 }}
        >
          <Image
            source={require("../../assets/images/icon.png")}
            style={{ width: 64, height: 64, borderRadius: 18 }}
          />
          <Text variant="headlineMedium" style={{ marginTop: 10 }}>
            Crear cuenta
          </Text>
          <Text style={{ opacity: 0.7, marginTop: 4, textAlign: "center" }}>
            Registro por mail (rol Paciente por defecto).
          </Text>
        </Pressable>

        <Card style={{ borderRadius: 22 }}>
          <Card.Content>
            <TextInput
              label="Nombre"
              value={name}
              onChangeText={setName}
              style={{ marginBottom: 10 }}
            />

            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              error={!emailOk}
              style={{ marginBottom: 8 }}
            />
            {!emailOk && <HelperText type="error">Email inválido</HelperText>}

            <TextInput
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={!passOk}
              style={{ marginBottom: 6 }}
            />
            {!passOk && <HelperText type="error">Mínimo 6 caracteres</HelperText>}

            {!!error && (
              <Text style={{ color: "#B91C1C", marginTop: 6 }}>{error}</Text>
            )}

            <Button
              mode="contained"
              onPress={onRegister}
              loading={busy}
              disabled={busy}
              style={{ borderRadius: 14, marginTop: 12, paddingVertical: 6 }}
            >
              Registrarme
            </Button>

            <Divider style={{ marginVertical: 12 }} />

            <Button onPress={onGoLogin}>Volver a iniciar sesión</Button>
          </Card.Content>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}
