import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { auth } from "./firebase";

WebBrowser.maybeCompleteAuthSession();

export function useGoogleSignIn() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId,
    scopes: ["profile", "email"],
  });

  async function signInFromResponse() {
    if (response?.type !== "success") return null;

    const { id_token, access_token } = response.authentication ?? {};
    if (!id_token) throw new Error("Google Sign-In: missing id_token");

    const credential = GoogleAuthProvider.credential(id_token, access_token);
    return await signInWithCredential(auth, credential);
  }

  return {
    request,
    response,
    promptAsync: () => promptAsync(), // sin useProxy
    signInFromResponse,
    isConfigured: !!webClientId,
  };
}
