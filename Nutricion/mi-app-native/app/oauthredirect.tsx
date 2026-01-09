import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import * as WebBrowser from "expo-web-browser";

export default function OAuthRedirect() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
