import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AuthSession from "expo-auth-session";
import { GoogleAuthProvider, signInWithCredential, signInWithPopup } from "firebase/auth";
import { auth } from "./firebase";

WebBrowser.maybeCompleteAuthSession();

type AnyAuth = any;

export function useGoogleSignIn() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  // ✅ NATIVO: Expo Auth Session (solo sirve bien cuando tengas android/ios client ids también)
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId,
    scopes: ["profile", "email"],
    responseType: AuthSession.ResponseType.IdToken, // intenta forzar id_token en nativo
  });

  /**
   * ✅ LOGIN GOOGLE "UNIFICADO"
   * - Web: Firebase signInWithPopup (la forma correcta en Netlify/Expo Web)
   * - Native: Expo promptAsync + signInWithCredential
   */
  async function signInWithGoogle() {
    // ✅ WEB: esto evita totalmente el problema "missing idToken"
    if (Platform.OS === "web") {
      const provider = new GoogleAuthProvider();
      provider.addScope("profile");
      provider.addScope("email");

      // Opcional: fuerza selector de cuenta
      provider.setCustomParameters({ prompt: "select_account" });

      return await signInWithPopup(auth, provider);
    }

    // ✅ Native (Android/iOS): Expo Auth Session
    if (!webClientId) {
      throw new Error("Falta EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (para auth).");
    }

    const res = await promptAsync();
    if (res.type !== "success") return null;

    const authObj: AnyAuth = res.authentication ?? {};
    const idToken: string | undefined = authObj.idToken ?? authObj.id_token;
    const accessToken: string | undefined = authObj.accessToken ?? authObj.access_token;

    if (!idToken) {
      throw new Error(
        "Google Sign-In (Native): missing idToken. Para móvil necesitás configurar client IDs (android/ios) correctamente."
      );
    }

    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    return await signInWithCredential(auth, credential);
  }

  // (Opcional) Debug / compat con tu pantalla actual
  async function signInFromResponse() {
    // Si querés mantener tu efecto basado en `response`, lo dejamos funcionando
    if (!response || response.type !== "success") return null;

    const authObj: AnyAuth = response.authentication ?? {};
    const idToken: string | undefined = authObj.idToken ?? authObj.id_token;
    const accessToken: string | undefined = authObj.accessToken ?? authObj.access_token;

    if (!idToken) {
      throw new Error("Google Sign-In: missing idToken (response). En WEB usá signInWithPopup.");
    }

    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    return await signInWithCredential(auth, credential);
  }

  return {
    // ✅ Usá esto desde el botón
    signInWithGoogle,

    // Mantengo por compatibilidad si lo estabas usando
    request,
    response,
    promptAsync: () => promptAsync(),
    signInFromResponse,

    isConfigured: !!webClientId,
  };
}
