import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { auth } from "./firebase";

// Cierra la sesión web correctamente al volver del navegador
WebBrowser.maybeCompleteAuthSession();

type AnyAuth = any;

export function useGoogleSignIn() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  // IMPORTANTÍSIMO: en SDKs recientes, useAuthRequest devuelve un array
  // request, response, promptAsync
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId,
    scopes: ["profile", "email"],
  });

  async function signInFromResponse() {
    if (!response) return null;
    if (response.type !== "success") return null;

    const authObj: AnyAuth = response.authentication ?? {};

    // Expo puede devolver camelCase o snake_case según plataforma/version
    const idToken: string | undefined = authObj.idToken ?? authObj.id_token;
    const accessToken: string | undefined = authObj.accessToken ?? authObj.access_token;

    if (!idToken) {
      throw new Error(
        "Google Sign-In: missing idToken. Revisá configuración de OAuth/redirect y que el flujo devuelva idToken."
      );
    }

    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    return await signInWithCredential(auth, credential);
  }

  return {
    request,
    response,
    promptAsync: () => promptAsync(), // NO useProxy (ya no existe)
    signInFromResponse,
    isConfigured: !!webClientId,
  };
}
