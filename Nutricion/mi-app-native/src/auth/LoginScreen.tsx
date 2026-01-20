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
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../shared/services/firebase";
import { useGoogleSignIn } from "../shared/services/googleAuth";
import { router } from "expo-router";
import { AppIcon } from "../shared/components/AppIcon";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function friendlyAuthError(message: string) {
  const msg = (message || "").toLowerCase();

  if (msg.includes("auth/unauthorized-domain") || msg.includes("unauthorized-domain")) {
    return "Dominio no autorizado en Firebase. Agregá tu dominio de Netlify en Authentication → Settings → Authorized domains.";
  }
  if (msg.includes("redirect_uri_mismatch")) {
    return "Redirect URI mismatch. Revisá tus URIs autorizadas en Google Cloud.";
  }
  if (msg.includes("popup_closed_by_user") || msg.includes("cancelled") || msg.includes("closed")) {
    return "Cancelaste el inicio con Google.";
  }
  if (msg.includes("invalid-credential") || msg.includes("wrong-password"))
    return "Email o contraseña incorrectos.";
  if (msg.includes("user-not-found"))
    return "No existe una cuenta con ese email.";
  if (msg.includes("too-many-requests"))
    return "Demasiados intentos. Probá de nuevo en unos minutos.";
  if (msg.includes("network"))
    return "Problema de conexión. Revisá internet e intentá nuevamente.";

  return "No se pudo iniciar sesión. Revisá la consola para ver el error real.";
}

export default function LoginScreen({
  onGoRegister,
}: {
  onGoRegister: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [busyGoogle, setBusyGoogle] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const emailOk = useMemo(
    () => (email.length === 0 ? true : isValidEmail(email)),
    [email]
  );
  const passOk = useMemo(
    () => (password.length === 0 ? true : password.length >= 6),
    [password]
  );

  const { signInWithGoogle, isConfigured } = useGoogleSignIn();

  async function onLoginEmail() {
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
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (e: any) {
      console.log("❌ EMAIL LOGIN ERROR =>", e);
      setError(friendlyAuthError(String(e?.message || e)));
    } finally {
      setBusy(false);
    }
  }

  async function onLoginGoogle() {
    setError("");

    if (!isConfigured && Platform.OS !== "web") {
      setError(
        "Falta EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en .env. Reiniciá con: npx expo start -c"
      );
      return;
    }

    setBusyGoogle(true);
    try {
      const cred = await signInWithGoogle();
      console.log("✅ Google Login OK =>", cred?.user?.uid);
    } catch (e: any) {
      console.log("❌ GOOGLE LOGIN ERROR =>", e);
      setError(friendlyAuthError(String(e?.message || e)));
    } finally {
      setBusyGoogle(false);
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
          alignSelf: "center",
          width: "100%",
        }}
      >
        {/* LOGO */}
        <View style={{ alignItems: "center", marginBottom: 18 }}>
          <Pressable onPress={() => router.push("/(public)")}>
            <Image
              source={require("../../assets/images/icon.png")}
              style={{ width: 62, height: 62, borderRadius: 18 }}
            />
          </Pressable>

          <Text variant="headlineMedium" style={{ marginTop: 10, fontWeight: "800" }}>
            NutriCare
          </Text>
          <Text style={{ opacity: 0.7, marginTop: 4, textAlign: "center" }}>
            Iniciá sesión para ver tu progreso, comidas y turnos.
          </Text>
        </View>

        <Card style={{ borderRadius: 22 }}>
          <Card.Content>
            <Button
              mode="contained"
              onPress={onLoginGoogle}
              loading={busyGoogle}
              disabled={busyGoogle || busy}
              style={{ borderRadius: 14 }}
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
              mode="outlined"
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
                  onPress={() => setShowPassword((s) => !s)}
                  icon={() => (
                    <AppIcon
                      name={showPassword ? "eye-off" : "eye"}
                      size={20}
                      color="#64748B"
                    />
                  )}
                />
              }
              style={{ marginBottom: 6 }}
              mode="outlined"
            />
            {!passOk && <HelperText type="error">Mínimo 6 caracteres</HelperText>}

            {!!error && (
              <Text style={{ color: "#B91C1C", marginTop: 6, lineHeight: 20 }}>
                {error}
              </Text>
            )}

            <Button
              mode="contained"
              onPress={onLoginEmail}
              loading={busy}
              disabled={busy || busyGoogle}
              style={{ borderRadius: 14, marginTop: 12 }}
            >
              Iniciar sesión
            </Button>

            <Button onPress={onGoRegister} style={{ marginTop: 6 }}>
              Crear cuenta
            </Button>

            <Button onPress={() => router.push("/(public)")} style={{ marginTop: 2 }}>
              Volver al Home
            </Button>
          </Card.Content>
        </Card>

        <Text
          style={{
            textAlign: "center",
            opacity: 0.55,
            marginTop: 14,
            fontSize: 12,
          }}
        >
          Al continuar aceptás nuestros términos y política de privacidad.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

