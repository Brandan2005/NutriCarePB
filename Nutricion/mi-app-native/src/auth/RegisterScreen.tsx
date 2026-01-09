import React, { useMemo, useState } from "react";
import { View, KeyboardAvoidingView, Platform } from "react-native";
import { Button, Card, Text, TextInput, HelperText } from "react-native-paper";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, rtdb } from "../shared/services/firebase";
import { ref, update } from "firebase/database";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function friendlyAuthError(message: string) {
  const msg = (message || "").toLowerCase();
  if (msg.includes("email-already-in-use")) return "Ese email ya está registrado.";
  if (msg.includes("weak-password")) return "Contraseña débil. Usá al menos 6 caracteres.";
  if (msg.includes("invalid-email")) return "Email inválido.";
  if (msg.includes("network")) return "Problema de conexión. Revisá internet.";
  return "No se pudo crear la cuenta. Intentá nuevamente.";
}

export default function RegisterScreen({ onGoLogin }: { onGoLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const emailOk = useMemo(() => (email.length === 0 ? true : isValidEmail(email)), [email]);
  const passOk = useMemo(() => (password.length === 0 ? true : password.length >= 6), [password]);

  async function onRegister() {
    setError("");
    const cleanEmail = email.trim();

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

      // ✅ Por defecto: paciente
      await update(ref(rtdb, `users/${cred.user.uid}`), {
        email: cleanEmail,
        role: "paciente",
        name: cleanEmail.split("@")[0],
        createdAt: new Date().toISOString(),
      });
    } catch (e: any) {
      setError(friendlyAuthError(e?.message || ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#F6F7FB" }}
    >
      <View style={{ flex: 1, justifyContent: "center", padding: 18 }}>
        <Text variant="headlineMedium" style={{ marginBottom: 6 }}>
          Crear cuenta
        </Text>
        <Text style={{ opacity: 0.7, marginBottom: 16 }}>Registrate con email y contraseña.</Text>

        <Card style={{ borderRadius: 22 }}>
          <Card.Content>
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
              <Text style={{ color: "#B91C1C", marginTop: 6, lineHeight: 20 }}>{error}</Text>
            )}

            <Button
              mode="contained"
              onPress={onRegister}
              loading={busy}
              disabled={busy}
              style={{ borderRadius: 14, marginTop: 12 }}
            >
              Crear cuenta
            </Button>

            <Button onPress={onGoLogin} style={{ marginTop: 6 }}>
              Volver a login
            </Button>
          </Card.Content>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}
