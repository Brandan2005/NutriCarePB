import { ref, onValue, off } from "firebase/database";
import { rtdb } from "./firebase";

export type AvailabilityDay = {
  start: string; // "10:00"
  end: string;   // "14:00"
  breaks?: { start: string; end: string }[];
};

export type Nutritionist = {
  uid: string;
  name: string;
  email: string;
  role: "nutricionista";
  photoURL?: string;
  availability?: {
    days?: Record<string, AvailabilityDay | string>;
  };
};

function parseDayString(s: string): AvailabilityDay | null {
  // ejemplo string (si lo cargaste así):
  // "start:10:00, end:14:00, breaks:[{start:12:00,end:12:30}]"
  try {
    const start = (s.match(/start\s*:\s*([0-2]\d:\d\d)/i) || [])[1];
    const end = (s.match(/end\s*:\s*([0-2]\d:\d\d)/i) || [])[1];
    if (!start || !end) return null;

    const breaks: { start: string; end: string }[] = [];
    const breakMatches = s.match(/\{[^}]*start\s*:\s*[0-2]\d:\d\d[^}]*end\s*:\s*[0-2]\d:\d\d[^}]*\}/gi) || [];
    for (const b of breakMatches) {
      const bs = (b.match(/start\s*:\s*([0-2]\d:\d\d)/i) || [])[1];
      const be = (b.match(/end\s*:\s*([0-2]\d:\d\d)/i) || [])[1];
      if (bs && be) breaks.push({ start: bs, end: be });
    }

    return { start, end, breaks };
  } catch {
    return null;
  }
}

function normalizeDay(day: AvailabilityDay | string | undefined): AvailabilityDay | null {
  if (!day) return null;
  if (typeof day === "string") return parseDayString(day);
  if (day?.start && day?.end) return day;
  return null;
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHmm(min: number) {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Genera slots cada 30 minutos dentro de start-end, excluyendo breaks.
 */
export function buildSlotsFromAvailability(day: AvailabilityDay, stepMin = 30) {
  const startM = toMin(day.start);
  const endM = toMin(day.end);
  const breaks = (day.breaks || []).map((b) => ({ s: toMin(b.start), e: toMin(b.end) }));

  const slots: string[] = [];
  for (let t = startM; t + stepMin <= endM; t += stepMin) {
    const tEnd = t + stepMin;
    const inBreak = breaks.some((b) => t < b.e && tEnd > b.s);
    if (!inBreak) slots.push(toHHmm(t));
  }
  return slots;
}

export function listenNutritionists(cb: (items: Nutritionist[]) => void) {
  const r = ref(rtdb, "users");
  const handler = (snap: any) => {
    const val = snap.val() || {};
    const list: Nutritionist[] = Object.keys(val)
      .map((uid) => ({ uid, ...val[uid] }))
      .filter((u: any) => String(u.role || "").toLowerCase() === "nutricionista")
      .map((u: any) => ({
        uid: u.uid,
        name: u.name || "Nutricionista",
        email: u.email || "",
        role: "nutricionista",
        photoURL: u.photoURL || "",
        availability: u.availability || {},
      }));

    cb(list);
  };

  onValue(r, handler);
  return () => off(r, "value", handler);
}

/**
 * Devuelve slots para un día de semana (mon/tue/...) si hay disponibilidad
 */
export function getSlotsForNutriOnDay(n: Nutritionist, dowKey: string) {
  const dayRaw = n.availability?.days?.[dowKey];
  const day = normalizeDay(dayRaw);
  if (!day) return [];
  return buildSlotsFromAvailability(day, 30);
}
