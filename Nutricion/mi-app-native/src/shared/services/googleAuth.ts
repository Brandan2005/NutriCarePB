import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { makeRedirectUri } from "expo-auth-session";
import { GoogleAuthProvider, signInWithCredential, getAdditionalUserInfo } from "firebase/auth";
import { auth } from "./firebase";

WebBrowser.maybeCompleteAuthSession();

type GoogleSignInResult = {
  isNewUser: boolean;
};

export function useGoogleSignIn() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

  // IMPORTANTÍSIMO:
  // En Netlify, vos autorizaste: https://<tu-dominio>/oauthredirect
  // Expo usa este path por defecto. Lo dejamos explícito para que coincida.
  const redirectUri = makeRedirectUri({ path: "oauthredirect" });

  // ✅ ESTE HOOK DEVUELVE UN ARRAY (request, response, promptAsync)
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId,
    redirectUri,
    scopes: ["profile", "email"],
  });

  async function signInFromResponse(): Promise<GoogleSignInResult | null> {
    if (response?.type !== "success") return null;

    // En expo-auth-session el token suele venir en response.params
    const params = (response as any)?.params ?? {};
    const idToken: string | undefined = params.id_token;
    const accessToken: string | undefined = params.access_token;

    if (!idToken) throw new Error("Google Sign-In: missing id_token");

    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    const userCred = await signInWithCredential(auth, credential);

    const info = getAdditionalUserInfo(userCred);
    return { isNewUser: !!info?.isNewUser };
  }

  return {
    request,
    response,
    redirectUri,
    isConfigured: !!webClientId,
    // ✅ sin useProxy (en SDK 54 ya no va)
    promptAsync: () => promptAsync(),
    signInFromResponse,
  };
}

