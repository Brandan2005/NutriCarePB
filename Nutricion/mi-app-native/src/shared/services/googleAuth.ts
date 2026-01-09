import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AuthSession from "expo-auth-session";
import { GoogleAuthProvider, signInWithCredential, UserCredential } from "firebase/auth";
import { auth } from "./firebase";

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

export function useGoogleSignIn() {
  // Redirect URI real (en web es lo que se debe autorizar en Google Cloud)
  const redirectUri = AuthSession.makeRedirectUri();

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: WEB_CLIENT_ID,
    redirectUri,
    responseType: "id_token",
    scopes: ["profile", "email"],
  });

  async function signInFromResponse(): Promise<UserCredential | null> {
    if (!response) return null;
    if (response.type !== "success") return null;

    const idToken = (response.params as any)?.id_token as string | undefined;
    if (!idToken) return null;

    const credential = GoogleAuthProvider.credential(idToken);
    return await signInWithCredential(auth, credential);
  }

  return {
    request,
    response,
    promptAsync,
    signInFromResponse,
    redirectUri,
    isConfigured: !!WEB_CLIENT_ID,
  };
}

