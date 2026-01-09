// src/shared/services/googleAuth.ts
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AuthSession from "expo-auth-session";
import { Platform } from "react-native";

import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { auth } from "./firebase";

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

function getRedirectUri() {
  return AuthSession.makeRedirectUri({
    path: "oauthredirect",
  });
}

export function useGoogleSignIn() {
  const redirectUri = getRedirectUri();
  const isConfigured = !!WEB_CLIENT_ID;

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: WEB_CLIENT_ID || "MISSING",
    redirectUri,
    scopes: ["profile", "email"],
    responseType: "id_token",
  });

  async function signInFromResponse() {
    if (response?.type !== "success") return null;

    const idToken = (response.params as any)?.id_token;
    if (!idToken) return null;

    const credential = GoogleAuthProvider.credential(idToken);
    return await signInWithCredential(auth, credential);
  }

  return {
    request,
    response,
    redirectUri,
    isConfigured,
    // ✅ en SDK 54 / expo-auth-session 7 NO existe useProxy
    promptAsync: () => promptAsync(),
    signInFromResponse,
    platform: Platform.OS,
  };
}

