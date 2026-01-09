import React, { useEffect, useMemo, useState } from "react";
import { View, Image, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { Button, Card, Text, TextInput, Divider, HelperText } from "react-native-paper";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { router } from "expo-router";

import { auth } from "../shared/services/firebase";
import { useGoogleSignIn } from "../shared/services/googleAuth";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function friendlyAuthError(codeOrMessage: string) {
  const msg = (codeOrMessage || "").toLowerCase();

  if (msg.includes("email-already-in-use")) return "Ese email ya está en uso. Probá iniciar sesión.";
  if (msg.includes("invalid-email")) return "El email no es válido.";
  if (msg.includes("weak-password")) return "La contraseña es muy débil (mínimo 6 caracteres).";

  if (msg.includes("invalid-credential") || msg.includes("wrong-password")) {
    return "Contraseña incorrecta.";
  }

  if (msg.includes("too-many-requests")) return "Demasiados intentos. Probá de nuevo en unos minutos.";
  if (msg.includes("network")) return "Problema de conexión. Revisá internet e intentá nuevamente.";

  return "No se pudo continuar. Intentá nuevamente.";
}

export default function LoginScreen({ onGoRegister }: { onGoRegister: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [busyGoogle, setBusyGoogle] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const emailOk = useMemo(() => (email.length === 0 ? true : isValidEmail(email)), [email]);
  const passOk = useMemo(() => (password.length === 0 ? true : password.length >= 6), [password]);

  const { promptAsync, signInFromResponse, response, redirectUri, isConfigured } = useGoogleSignIn();

  // Debug útil solo en web
  useEffect(() => {
    if (Platform.OS === "web") {
      console.log("REDIRECT URI =>", redirectUri);
      // @ts-ignore
      console.log("ORIGIN =>", typeof window !== "undefined" ? window.location.origin : "");
    }
  }, [redirectUri]);

  useEffect(() => {
    (async () => {
      try {
        const cred = await signInFromResponse();
        if (cred) {
          // sesión Firebase activa
        }
      } catch (e: any) {
        setError(friendlyAuthError(e?.code || e?.message || ""));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  async function onLoginEmailSmart() {
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
      // 1) intento login normal
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (e: any) {
      const code = String(e?.code || "").toLowerCase();

      // 2) si no existe => lo registramos automáticamente
      if (code.includes("user-not-found")) {
        try {
          await createUserWithEmailAndPassword(auth, cleanEmail, password);
          // listo: quedó logueado automáticamente
          return;
        } catch (e2: any) {
          setError(friendlyAuthError(e2?.code || e2?.message || ""));
          return;
        }
      }

      // otros errores (wrong-password, invalid-credential, etc.)
      setError(friendlyAuthError(e?.code || e?.message || ""));
    } finally {
      setBusy(false);
    }
  }

  async function onLoginGoogle() {
    setError("");
    if (!isConfigured) {
      setError("Falta configurar EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en .env (reiniciá con -c).");
      return;
    }

    setBusyGoogle(true);
    try {
      await promptAsync(); // sin useProxy (ya no existe en SDK actual)
    } catch (e: any) {
      setError(friendlyAuthError(e?.code || e?.message || ""));
    } finally {
      setBusyGoogle(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#F6F7FB" }}
    >
      <View style={{ flex: 1, justifyContent: "center", padding: 18, maxWidth: 520, width: "100%", alignSelf: "center" }}>
        {/* HEADER / BRAND */}
        <Pressable
          onPress={() => router.replace("/(public)")}
          style={{ alignItems: "center", marginBottom: 18 }}
        >
          <Image
            source={require("../../assets/images/icon.png")}
            style={{ width: 64, height: 64, borderRadius: 18 }}
          />
          <Text variant="headlineMedium" style={{ marginTop: 10 }}>
            NutriCare
          </Text>
          <Text style={{ opacity: 0.7, marginTop: 4, textAlign: "center" }}>
            Accedé para ver tu progreso, comidas y turnos.
          </Text>
          <Text style={{ opacity: 0.55, marginTop: 6, fontSize: 12, textAlign: "center" }}>
            Tocá el logo para volver al Home.
          </Text>
        </Pressable>

        <Card style={{ borderRadius: 22 }}>
          <Card.Content>
            <Button
              mode="contained"
              onPress={onLoginGoogle}
              loading={busyGoogle}
              disabled={busyGoogle || busy}
              style={{ borderRadius: 14, paddingVertical: 6 }}
            >
              Entrar con Google
            </Button>

            <Divider style={{ marginVertical: 14 }} />

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
              secureTextEntry={!showPassword}
              error={!passOk}
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off" : "eye"}
                  onPress={() => setShowPassword((s) => !s)}
                />
              }
              style={{ marginBottom: 6 }}
            />
            {!passOk && <HelperText type="error">Mínimo 6 caracteres</HelperText>}

            {!!error && (
              <Text style={{ color: "#B91C1C", marginTop: 6, lineHeight: 20 }}>
                {error}
              </Text>
            )}

            <Button
              mode="contained"
              onPress={onLoginEmailSmart}
              loading={busy}
              disabled={busy || busyGoogle}
              style={{ borderRadius: 14, marginTop: 12, paddingVertical: 6 }}
            >
              Iniciar sesión (o crear cuenta)
            </Button>

            {/* Si igual querés mantener registro manual */}
            <Button onPress={onGoRegister} style={{ marginTop: 6 }}>
              Crear cuenta manualmente
            </Button>
          </Card.Content>
        </Card>

        <Text style={{ textAlign: "center", opacity: 0.55, marginTop: 14, fontSize: 12 }}>
          Al continuar aceptás nuestros términos y política de privacidad.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
