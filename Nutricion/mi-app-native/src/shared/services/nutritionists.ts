import { onValue, ref } from "firebase/database";
import { rtdb } from "./firebase";

export type NutriDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type NutriAvailabilityDay = {
  enabled?: boolean;              // default true
  start?: string;                 // "09:00"
  end?: string;                   // "18:00"
  slotMinutes?: number;           // default 30
  breaks?: Array<{ start: string; end: string }>; // opcional
};

export type Nutritionist = {
  uid: string;
  role?: string;
  name: string;
  email: string;
  photoURL?: string;

  // availability puede venir bien o “sucia”. La normalizamos.
  availability?: Partial<Record<NutriDayKey, NutriAvailabilityDay>>;

  // Campos opcionales
  createdAt?: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return h * 60 + m;
}

function fromMin(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/**
 * Normaliza breaks para que SIEMPRE sea array.
 * A veces en RTDB se guardan como objeto:
 * breaks: { a:{start,end}, b:{start,end} }
 */
function normalizeBreaks(raw: any): Array<{ start: string; end: string }> {
  if (Array.isArray(raw)) {
    return raw
      .filter(Boolean)
      .map((b) => ({ start: String(b.start || ""), end: String(b.end || "") }))
      .filter((b) => b.start.includes(":") && b.end.includes(":"));
  }

  if (raw && typeof raw === "object") {
    return Object.values(raw)
      .filter(Boolean)
      .map((b: any) => ({ start: String(b.start || ""), end: String(b.end || "") }))
      .filter((b) => b.start.includes(":") && b.end.includes(":"));
  }

  return [];
}

function normalizeDay(raw: any): NutriAvailabilityDay {
  const enabled = raw?.enabled ?? true;
  const start = String(raw?.start ?? "09:00");
  const end = String(raw?.end ?? "18:00");
  const slotMinutes = Number(raw?.slotMinutes ?? 30) || 30;
  const breaks = normalizeBreaks(raw?.breaks);

  return { enabled, start, end, slotMinutes, breaks };
}

function isInBreak(t: string, breaks: Array<{ start: string; end: string }>) {
  const m = toMin(t);
  for (const b of breaks) {
    const bs = toMin(b.start);
    const be = toMin(b.end);
    if (m >= bs && m < be) return true;
  }
  return false;
}

/**
 * Genera slots para un nutri y un día (mon/tue...).
 * - respeta enabled
 * - respeta breaks
 * - respeta slotMinutes
 */
export function getSlotsForNutriOnDay(nutri: Nutritionist, day: NutriDayKey): string[] {
  const rawDay = nutri?.availability?.[day];
  const cfg = normalizeDay(rawDay);

  if (!cfg.enabled) return [];

  const startStr = cfg.start ?? "09:00";
  const endStr = cfg.end ?? "18:00";

  const startMin = toMin(startStr);
  const endMin = toMin(endStr);


  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return [];

  const step = cfg.slotMinutes ?? 30;
  const out: string[] = [];

  for (let m = startMin; m + step <= endMin; m += step) {
    const t = fromMin(m);
    if (!isInBreak(t, cfg.breaks || [])) out.push(t);
  }
  return out;
}

/**
 * Lista nutricionistas: users donde role === "nutricionista"
 */
export function listenNutritionists(cb: (list: Nutritionist[]) => void) {
  const usersRef = ref(rtdb, "users");
  return onValue(usersRef, (snap) => {
    const val = snap.val() || {};
    const list: Nutritionist[] = Object.keys(val)
      .map((uid) => ({
        uid,
        role: val[uid]?.role,
        name: String(val[uid]?.name || "Nutricionista"),
        email: String(val[uid]?.email || ""),
        photoURL: val[uid]?.photoURL ? String(val[uid]?.photoURL) : undefined,
        availability: val[uid]?.availability || undefined,
        createdAt: val[uid]?.createdAt ? Number(val[uid]?.createdAt) : undefined,
      }))
      .filter((u) => (u.role || "").toLowerCase() === "nutricionista");

    // orden
    list.sort((a, b) => a.name.localeCompare(b.name));
    cb(list);
  });
}
