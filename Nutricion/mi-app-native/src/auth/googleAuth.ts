import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { makeRedirectUri } from "expo-auth-session";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { auth } from "../shared/services/firebase";

WebBrowser.maybeCompleteAuthSession();

/**
 * Necesitás tu Web Client ID de Google (OAuth).
 * Lo sacás de Firebase Console → Authentication → Google → Web SDK configuration
 * o Google Cloud Console → Credentials.
 */
export function useGoogleSignIn() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, // web
    // (después sumamos androidClientId e iosClientId)
    redirectUri: makeRedirectUri({
      scheme: "miappnative", // después lo configuramos
    }),
  });

  const signIn = async () => {
    const res = await promptAsync();
    return res;
  };

  const handleResponse = async () => {
    if (response?.type !== "success") return;

    const { id_token } = response.params as any;
    if (!id_token) throw new Error("Google no devolvió id_token");

    const credential = GoogleAuthProvider.credential(id_token);
    await signInWithCredential(auth, credential);
  };

  return { request, response, signIn, handleResponse };
}
