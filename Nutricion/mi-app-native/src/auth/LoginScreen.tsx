import React, { useEffect, useMemo, useState } from "react";
import { View, Image, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import {
  Button,
  Card,
  Text,
  TextInput,
  Divider,
  HelperText,
  ActivityIndicator,
} from "react-native-paper";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../shared/services/firebase";
import { useGoogleSignIn } from "../shared/services/googleAuth";
import { router } from "expo-router";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function friendlyAuthError(message: string) {
  const msg = (message || "").toLowerCase();

  if (msg.includes("invalid-credential") || msg.includes("wrong-password"))
    return "Email o contraseña incorrectos.";
  if (msg.includes("user-not-found")) return "No existe una cuenta con ese email.";
  if (msg.includes("too-many-requests"))
    return "Demasiados intentos. Probá de nuevo en unos minutos.";
  if (msg.includes("network")) return "Problema de conexión. Revisá internet e intentá nuevamente.";

  // Google / AuthSession
  if (msg.includes("redirect_uri_mismatch"))
    return "Error de configuración de Google (redirect_uri_mismatch). Revisá los Redirect URIs autorizados.";
  if (msg.includes("cancel") || msg.includes("dismiss"))
    return "Cancelaste el inicio de sesión. Podés intentarlo de nuevo.";

  return "No se pudo iniciar sesión. Intentá nuevamente.";
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

  // ✅ Debug útil (sin romper mobile)
  useEffect(() => {
    console.log("REDIRECT URI =>", redirectUri);
    if (Platform.OS === "web") {
      // @ts-ignore
      console.log("ORIGIN =>", window?.location?.origin);
    }
  }, [redirectUri]);

  // ✅ Cuando vuelve Google, terminamos el login en Firebase
  useEffect(() => {
    (async () => {
      try {
        const cred = await signInFromResponse();
        if (cred) {
          // sesión activa en Firebase ✅
        }
      } catch (e: any) {
        setError(friendlyAuthError(e?.message || ""));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

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
      setError(friendlyAuthError(e?.message || ""));
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
      await promptAsync();
    } catch (e: any) {
      setError(friendlyAuthError(e?.message || ""));
    } finally {
      setBusyGoogle(false);
    }
  }

  const disabledAll = busy || busyGoogle;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#F6F7FB" }}
    >
      <View style={{ flex: 1, justifyContent: "center", padding: 18, maxWidth: 520, width: "100%", alignSelf: "center" }}>
        {/* HEADER / BRAND */}
        <View style={{ alignItems: "center", marginBottom: 18 }}>
          <Pressable
            onPress={() => router.replace("/(public)")}
            style={{ alignItems: "center" }}
            accessibilityRole="button"
          >
            <Image
              source={require("../../assets/images/icon.png")}
              style={{ width: 62, height: 62, borderRadius: 18 }}
            />
            <Text variant="headlineMedium" style={{ marginTop: 10, fontWeight: "800" }}>
              NutriCare
            </Text>
            <Text style={{ opacity: 0.7, marginTop: 4, textAlign: "center", lineHeight: 20 }}>
              Iniciá sesión para ver tu progreso, comidas y turnos.
            </Text>
            <Text style={{ opacity: 0.55, marginTop: 6, fontSize: 12 }}>
              (Tocá el logo para volver al Home)
            </Text>
          </Pressable>
        </View>

        <Card style={{ borderRadius: 22, overflow: "hidden" }}>
          <Card.Content>
            {/* Google */}
            <Button
              mode="contained"
              onPress={onLoginGoogle}
              loading={busyGoogle}
              disabled={disabledAll}
              style={{ borderRadius: 14, paddingVertical: 6 }}
              contentStyle={{ paddingVertical: 6 }}
            >
              Continuar con Google
            </Button>

            <Divider style={{ marginVertical: 14 }} />

            {/* Email */}
            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              error={!emailOk}
              style={{ marginBottom: 6 }}
              left={<TextInput.Icon icon="email-outline" />}
            />
            {!emailOk && <HelperText type="error">Email inválido</HelperText>}

            {/* Password */}
            <TextInput
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              error={!passOk}
              style={{ marginBottom: 6 }}
              left={<TextInput.Icon icon="lock-outline" />}
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off" : "eye"}
                  onPress={() => setShowPassword((s) => !s)}
                />
              }
            />
            {!passOk && <HelperText type="error">Mínimo 6 caracteres</HelperText>}

            {!!error && (
              <View
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: "#FEF2F2",
                  borderWidth: 1,
                  borderColor: "#FECACA",
                }}
              >
                <Text style={{ color: "#991B1B", lineHeight: 20 }}>{error}</Text>
              </View>
            )}

            <Button
              mode="contained"
              onPress={onLoginEmail}
              loading={busy}
              disabled={disabledAll}
              style={{ borderRadius: 14, marginTop: 12, paddingVertical: 6 }}
              contentStyle={{ paddingVertical: 6 }}
            >
              Iniciar sesión
            </Button>

            <Button
              onPress={onGoRegister}
              disabled={disabledAll}
              style={{ marginTop: 6 }}
            >
              Crear cuenta
            </Button>

            {/* Mini status */}
            {(busy || busyGoogle) && (
              <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator />
                <Text style={{ opacity: 0.7 }}>Procesando...</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        <Text style={{ textAlign: "center", opacity: 0.55, marginTop: 14, fontSize: 12, lineHeight: 18 }}>
          Al continuar aceptás nuestros términos y política de privacidad.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
