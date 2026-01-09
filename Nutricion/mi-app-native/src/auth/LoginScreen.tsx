import React, { useEffect, useMemo, useState } from "react";
import { View, Image, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { Button, Card, Text, TextInput, Divider, HelperText } from "react-native-paper";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
} from "firebase/auth";
import { router } from "expo-router";

import { auth } from "../shared/services/firebase";
import { useGoogleSignIn } from "../shared/services/googleAuth";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function niceError(e: any) {
  const code = String(e?.code || "").toLowerCase();
  const msg = String(e?.message || "").toLowerCase();

  if (code.includes("auth/invalid-email") || msg.includes("invalid-email")) return "El email no es válido.";
  if (code.includes("auth/too-many-requests") || msg.includes("too-many-requests"))
    return "Demasiados intentos. Probá de nuevo en unos minutos.";
  if (code.includes("auth/network-request-failed") || msg.includes("network"))
    return "Problema de conexión. Revisá internet e intentá nuevamente.";

  if (code.includes("auth/wrong-password") || msg.includes("wrong-password")) return "Contraseña incorrecta.";
  if (code.includes("auth/invalid-credential") || msg.includes("invalid-credential"))
    return "Credenciales inválidas.";

  return "No se pudo continuar. Intentá nuevamente.";
}

export default function LoginScreen({ onGoRegister }: { onGoRegister: (emailPrefill?: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [busyGoogle, setBusyGoogle] = useState(false);
  const [busyReset, setBusyReset] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const emailOk = useMemo(() => (email.length === 0 ? true : isValidEmail(email)), [email]);
  const passOk = useMemo(() => (password.length === 0 ? true : password.length >= 6), [password]);

  const { promptAsync, signInFromResponse, response, isConfigured } = useGoogleSignIn();

  // Cuando vuelve Google -> crea sesión en Firebase
  useEffect(() => {
    (async () => {
      try {
        const cred = await signInFromResponse();
        if (cred) {
          setInfo("Listo ✅ Entraste con Google.");
          setError("");
        }
      } catch (e: any) {
        setError(niceError(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  async function onLoginEmail() {
    setError("");
    setInfo("");

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
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      setInfo("Bien ✅ Sesión iniciada.");
      return;
    } catch (e: any) {
      const code = String(e?.code || "").toLowerCase();

      // ✅ Si no existe -> mandarlo a registrarse (NO auto-crear)
      if (code.includes("auth/user-not-found")) {
        setError("No existe una cuenta con ese email. Creala en “Crear cuenta”.");
        onGoRegister(cleanEmail);
        return;
      }

      // Si existe pero pass incorrecta, avisar y sugerir reset / google
      if (code.includes("auth/wrong-password") || code.includes("auth/invalid-credential")) {
        try {
          const methods = await fetchSignInMethodsForEmail(auth, cleanEmail);
          if (methods.includes("google.com")) {
            setError("Ese email está vinculado a Google. Entrá con “Google” (no lleva contraseña).");
            return;
          }
        } catch {
          // ignorar
        }
        setError("Contraseña incorrecta. Probá “Olvidé mi contraseña”.");
        return;
      }

      setError(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLoginGoogle() {
    setError("");
    setInfo("");

    if (!isConfigured) {
      setError("Falta EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en .env (reiniciar con -c y redeploy).");
      return;
    }

    setBusyGoogle(true);
    try {
      await promptAsync(); // sin useProxy
    } catch (e: any) {
      setError(niceError(e));
    } finally {
      setBusyGoogle(false);
    }
  }

  async function onForgotPassword() {
    setError("");
    setInfo("");

    const cleanEmail = email.trim();
    if (!isValidEmail(cleanEmail)) {
      setError("Escribí tu email arriba para enviarte el link de recuperación.");
      return;
    }

    setBusyReset(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setInfo("Te envié un email para restablecer la contraseña ✅ Revisá bandeja y spam.");
    } catch (e: any) {
      setError(niceError(e));
    } finally {
      setBusyReset(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#F6F7FB" }}
    >
      <View style={{ flex: 1, justifyContent: "center", padding: 18, maxWidth: 520, width: "100%", alignSelf: "center" }}>
        {/* Logo clickable al Home público */}
        <Pressable onPress={() => router.replace("/(public)")} style={{ alignItems: "center", marginBottom: 18 }}>
          <Image source={require("../../assets/images/icon.png")} style={{ width: 64, height: 64, borderRadius: 18 }} />
          <Text variant="headlineMedium" style={{ marginTop: 10 }}>NutriCare</Text>
          <Text style={{ opacity: 0.7, marginTop: 4, textAlign: "center" }}>
            Accedé para ver tu progreso, comidas y turnos.
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
                <TextInput.Icon icon={showPassword ? "eye-off" : "eye"} onPress={() => setShowPassword((s) => !s)} />
              }
              style={{ marginBottom: 6 }}
            />
            {!passOk && <HelperText type="error">Mínimo 6 caracteres</HelperText>}

            {!!error && <Text style={{ color: "#B91C1C", marginTop: 6, lineHeight: 20 }}>{error}</Text>}
            {!!info && <Text style={{ color: "#0F766E", marginTop: 6, lineHeight: 20 }}>{info}</Text>}

            <Button
              mode="contained"
              onPress={onLoginEmail}
              loading={busy}
              disabled={busy || busyGoogle}
              style={{ borderRadius: 14, marginTop: 12, paddingVertical: 6 }}
            >
              Iniciar sesión
            </Button>

            <Button
              mode="text"
              onPress={onForgotPassword}
              loading={busyReset}
              disabled={busy || busyGoogle || busyReset}
              style={{ marginTop: 6 }}
            >
              Olvidé mi contraseña
            </Button>

            <Button onPress={() => onGoRegister(email.trim())} style={{ marginTop: 6 }}>
              Crear cuenta
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
