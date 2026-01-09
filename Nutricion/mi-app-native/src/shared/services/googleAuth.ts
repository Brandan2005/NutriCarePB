import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AuthSession from "expo-auth-session";
import { Platform } from "react-native";

import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { auth } from "./firebase";

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

if (!WEB_CLIENT_ID) {
  console.warn(
    "Falta EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Ponelo en .env y reiniciá con: npx expo start -c"
  );
}

// Expo Router usa /oauthredirect (lo tenés en tus rutas exportadas)
export function getRedirectUri() {
  return AuthSession.makeRedirectUri({
    path: "oauthredirect",
  });
}

export function useGoogleLogin() {
  const redirectUri = getRedirectUri();

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: WEB_CLIENT_ID!, // web
    redirectUri,
    scopes: ["profile", "email"],
    responseType: "id_token",
  });

  // Para depurar
  // console.log("REDIRECT URI =>", redirectUri);

  async function handleResponse() {
    if (response?.type !== "success") return false;

    const idToken = response.params?.id_token;
    if (!idToken) {
      console.log("No llegó id_token:", response);
      return false;
    }

    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
    return true;
  }

  return {
    request,
    response,
    promptAsync: () => promptAsync({ useProxy: false }),
    handleResponse,
    redirectUri,
    isReady: !!request,
    platform: Platform.OS,
  };
}
