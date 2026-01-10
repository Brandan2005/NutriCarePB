import React, { useEffect, useMemo, useState } from "react";
import { View, Image, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { Button, Card, Text, TextInput, Divider, HelperText } from "react-native-paper";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../shared/services/firebase";
import { useGoogleSignIn } from "../shared/services/googleAuth";
import { router } from "expo-router";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function friendlyAuthError(message: string) {
  const msg = (message || "").toLowerCase();
  if (msg.includes("invalid-credential") || msg.includes("wrong-password")) return "Email o contraseña incorrectos.";
  if (msg.includes("user-not-found")) return "No existe una cuenta con ese email.";
  if (msg.includes("too-many-requests")) return "Demasiados intentos. Probá de nuevo en unos minutos.";
  if (msg.includes("network")) return "Problema de conexión. Revisá internet e intentá nuevamente.";
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

  // Si vuelve la respuesta de Google, intentamos loguear con Firebase
  useEffect(() => {
    (async () => {
      try {
        const res = await signInFromResponse();
        if (!res) return;

        // ✅ Si se creó usuario nuevo con Google, lo mando a “registrarse”
        // (vos pediste: “si no existe -> registrarse”)
        if (res.isNewUser) {
          onGoRegister();
          return;
        }

        // Si ya existía, entra directo y listo (session queda activa)
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
      setError("Falta configurar EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en .env y reiniciar con: npx expo start -c");
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#F6F7FB" }}
    >
      <View style={{ flex: 1, justifyContent: "center", padding: 18, maxWidth: 520, alignSelf: "center", width: "100%" }}>
        {/* HEADER */}
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <Pressable
            onPress={() => router.replace("/(public)")}
            style={{ alignItems: "center" }}
          >
            <Image
              source={require("../../assets/images/icon.png")}
              style={{ width: 64, height: 64, borderRadius: 18 }}
            />
          </Pressable>

          <Text variant="headlineMedium" style={{ marginTop: 10 }}>
            NutriCare
          </Text>
          <Text style={{ opacity: 0.7, marginTop: 4, textAlign: "center" }}>
            Iniciá sesión para ver tu progreso, comidas y turnos.
          </Text>

          {/* Debug útil */}
          {Platform.OS === "web" && (
            <Text style={{ opacity: 0.45, marginTop: 6, fontSize: 12 }}>
              Redirect: {redirectUri}
            </Text>
          )}
        </View>

        {/* CARD */}
        <Card style={{ borderRadius: 22 }}>
          <Card.Content>
            <Button
              mode="contained"
              onPress={onLoginGoogle}
              loading={busyGoogle}
              disabled={busyGoogle || busy}
              style={{ borderRadius: 14 }}
              contentStyle={{ paddingVertical: 6 }}
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
              onPress={onLoginEmail}
              loading={busy}
              disabled={busy || busyGoogle}
              style={{ borderRadius: 14, marginTop: 12 }}
              contentStyle={{ paddingVertical: 6 }}
            >
              Iniciar sesión
            </Button>

            <Button onPress={onGoRegister} style={{ marginTop: 6 }}>
              Crear cuenta
            </Button>
          </Card.Content>
        </Card>

        <Text style={{ textAlign: "center", opacity: 0.55, marginTop: 14, fontSize: 12 }}>
          Al continuar, aceptás nuestros términos y política de privacidad.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
