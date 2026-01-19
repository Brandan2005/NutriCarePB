import React from "react";
import { View, StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

type IconName =
  | "star"
  | "star-outline"
  | "pencil"
  | "trash"
  | "eye"
  | "eye-off"
  | "lock"
  | "lock-open"
  | "email"
  | "account"
  | "calendar"
  | "clock";

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppIcon({ name, size = 22, color = "#111827", style }: Props) {
  const icon = ICONS[name];
  if (!icon) return <View style={[{ width: size, height: size }, style]} />;

  return (
    <View style={style}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d={icon} fill={color} />
      </Svg>
    </View>
  );
}

/**
 * Material-like paths (relleno) para NO depender de fuentes.
 * Todos son SVG inline.
 */
const ICONS: Record<IconName, string> = {
  // ⭐
  star:
    "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",

  // ⭐ outline (simulado con mismo fill pero podés dejarlo gris)
  // (para outline real habría que usar stroke, pero esto es suficiente visualmente)
  "star-outline":
    "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",

  // ✏️
  pencil:
    "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",

  // 🗑️
  trash:
    "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",

  // 👁️
  eye:
    "M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 12a5 5 0 110-10 5 5 0 010 10z",

  // 👁️‍🗨️ (ojo tachado)
  "eye-off":
    "M2.1 3.51L3.51 2.1 21.9 20.49l-1.41 1.41-2.47-2.47C16.5 20.1 14.4 21 12 21 5 21 2 14 2 14s1.1-2.57 3.5-4.8L2.1 3.51zM12 7c3.58 0 6.24 2.4 7.76 4.1-.5.58-1.2 1.28-2.1 1.95L14.9 10.3A3.5 3.5 0 0010.3 14.9l-1.77-1.77C8.06 12.46 7.5 11.8 7.24 11.5 8.76 9.4 10.5 7 12 7z",

  // 🔒
  lock:
    "M12 17a2 2 0 100-4 2 2 0 000 4zm6-7h-1V8a5 5 0 00-10 0v2H6c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2zM9 10V8a3 3 0 016 0v2H9z",

  // 🔓
  "lock-open":
    "M17 8V7a5 5 0 00-9.9-1H9a3 3 0 016 0v2H6c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2h-1zm-5 9a2 2 0 110-4 2 2 0 010 4z",

  // ✉️
  email:
    "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z",

  // 👤
  account:
    "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",

  // 📅
  calendar:
    "M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10z",

  // 🕒
  clock:
    "M12 2a10 10 0 1010 10A10.01 10.01 0 0012 2zm1 11h5v-2h-4V7h-2v6z",
};
