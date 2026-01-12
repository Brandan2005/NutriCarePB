import { ref, onValue, off } from "firebase/database";
import { rtdb } from "./firebase";

export type BreakItem = { start: string; end: string };

export type AvailabilityDay = {
  start: string; // "10:00"
  end: string;   // "14:00"
  breaks?: BreakItem[] | Record<string, BreakItem> | string | null;
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

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHmm(min: number) {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function isHHmm(s: any) {
  return typeof s === "string" && /^[0-2]\d:\d\d$/.test(s);
}

/**
 * Convierte breaks a array pase lo que pase:
 * - array -> array
 * - objeto -> Object.values(obj)
 * - string -> intenta parsear {start,end} o "start:.. end:.."
 * - null/undefined -> []
 */
function normalizeBreaks(breaks: any): BreakItem[] {
  if (!breaks) return [];

  // Array ✅
  if (Array.isArray(breaks)) {
    return breaks
      .map((b) => ({
        start: String(b?.start || ""),
        end: String(b?.end || ""),
      }))
      .filter((b) => isHHmm(b.start) && isHHmm(b.end));
  }

  // Object ✅  (Firebase muchas veces guarda arrays como objetos)
  if (typeof breaks === "object") {
    return Object.values(breaks as Record<string, any>)
      .map((b) => ({
        start: String((b as any)?.start || ""),
        end: String((b as any)?.end || ""),
      }))
      .filter((b) => isHHmm(b.start) && isHHmm(b.end));
  }

  // String ✅ (si lo guardaste como texto)
  if (typeof breaks === "string") {
    // soporta: "{start:12:00,end:12:30}" o "start:12:00, end:12:30"
    const items: BreakItem[] = [];

    // Busca múltiples { ... } dentro del string
    const blocks = breaks.match(/\{[^}]*\}/g);
    if (blocks?.length) {
      for (const blk of blocks) {
        const bs = (blk.match(/start\s*:\s*([0-2]\d:\d\d)/i) || [])[1];
        const be = (blk.match(/end\s*:\s*([0-2]\d:\d\d)/i) || [])[1];
        if (bs && be) items.push({ start: bs, end: be });
      }
      return items;
    }

    // Si es uno solo sin llaves
    const bs = (breaks.match(/start\s*:\s*([0-2]\d:\d\d)/i) || [])[1];
    const be = (breaks.match(/end\s*:\s*([0-2]\d:\d\d)/i) || [])[1];
    if (bs && be) return [{ start: bs, end: be }];

    return [];
  }

  return [];
}

function parseDayString(s: string): AvailabilityDay | null {
  try {
    const start = (s.match(/start\s*:\s*([0-2]\d:\d\d)/i) || [])[1];
    const end = (s.match(/end\s*:\s*([0-2]\d:\d\d)/i) || [])[1];
    if (!start || !end) return null;

    // breaks puede venir dentro del string
    let breaksPart = "";
    const m = s.match(/breaks\s*:\s*(\[.*\]|\{.*\}|.*)$/i);
    if (m?.[1]) breaksPart = m[1];

    const breaks = normalizeBreaks(breaksPart);
    return { start, end, breaks };
  } catch {
    return null;
  }
}

function normalizeDay(day: AvailabilityDay | string | undefined): AvailabilityDay | null {
  if (!day) return null;

  if (typeof day === "string") {
    return parseDayString(day);
  }

  if (typeof day === "object" && isHHmm((day as any).start) && isHHmm((day as any).end)) {
    return {
      start: String((day as any).start),
      end: String((day as any).end),
      breaks: normalizeBreaks((day as any).breaks),
    };
  }

  return null;
}

/**
 * Genera slots cada 30 minutos dentro de start-end, excluyendo breaks.
 */
export function buildSlotsFromAvailability(day: AvailabilityDay, stepMin = 30) {
  const startM = toMin(day.start);
  const endM = toMin(day.end);

  const breaksArr = normalizeBreaks(day.breaks).map((b) => ({
    s: toMin(b.start),
    e: toMin(b.end),
  }));

  const slots: string[] = [];
  for (let t = startM; t + stepMin <= endM; t += stepMin) {
    const tEnd = t + stepMin;

    const inBreak = breaksArr.some((b) => t < b.e && tEnd > b.s);
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
        role: "nutricionista" as const,
        photoURL: u.photoURL || "",
        availability: u.availability || {},
      }));

    cb(list);
  };

  onValue(r, handler);
  return () => off(r, "value", handler);
}

/**
 * Devuelve slots para un día de semana (mon/tue/...) si hay disponibilidad.
 * Si no hay availability bien cargada => []
 */
export function getSlotsForNutriOnDay(n: Nutritionist, dowKey: string) {
  const dayRaw = n.availability?.days?.[dowKey];
  const day = normalizeDay(dayRaw as any);
  if (!day) return [];
  return buildSlotsFromAvailability(day, 30);
}
