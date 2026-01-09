import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const SCOPES = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

function getWebClientIdOrThrow(): string {
  const id = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!id) {
    throw new Error(
      "Falta EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Ponelo en .env y reiniciá con: npx expo start -c"
    );
  }
  return String(id);
}

export function getGoogleRedirectUri(): string {
  // Web: http://localhost:xxxx/oauthredirect
  // Android/iOS: miappnative://oauthredirect
  return AuthSession.makeRedirectUri({
    scheme: "miappnative",
    path: "oauthredirect",
  });
}

/**
 * Hook: abre login de Google y devuelve accessToken si OK.
 * No uses session/isReady (eso era otro enfoque).
 */
export function useGoogleCalendarAuth() {
  const webClientId = getWebClientIdOrThrow();
  const discovery = AuthSession.useAutoDiscovery("https://accounts.google.com");
  const redirectUri = getGoogleRedirectUri();

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: webClientId,
      scopes: SCOPES,
      redirectUri,
      // Para Calendar en Web, el Token directo suele ser lo más fácil
      responseType: AuthSession.ResponseType.Token,
      extraParams: { prompt: "consent" },
    },
    discovery
  );

  const accessToken =
    response?.type === "success" && (response as any)?.params?.access_token
      ? String((response as any).params.access_token)
      : null;

  return {
    request,
    response,
    accessToken,
    promptAsync, // se llama así: await promptAsync()
    redirectUri,
  };
}

export async function googleCreateEvent(
  accessToken: string,
  event: { title: string; startISO: string; endISO: string; description?: string }
) {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.title,
        description: event.description || "",
        start: { dateTime: event.startISO },
        end: { dateTime: event.endISO },
      }),
    }
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt);
  }

  return res.json();
}
