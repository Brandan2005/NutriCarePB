// src/shared/services/nutritionists.ts
import { onValue, ref } from "firebase/database";
import { rtdb } from "./firebase";

export type BreakRange = { start: string; end: string };

export type AvailabilityDay = {
  start?: string; // "09:00"
  end?: string;   // "18:00"
  slotMin?: number; // default 30
  breaks?: BreakRange[] | Record<string, BreakRange> | null;
};

export type Availability = {
  sun?: AvailabilityDay;
  mon?: AvailabilityDay;
  tue?: AvailabilityDay;
  wed?: AvailabilityDay;
  thu?: AvailabilityDay;
  fri?: AvailabilityDay;
  sat?: AvailabilityDay;
};

export type Nutritionist = {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  role?: string;
  availability?: Availability;
};

// -------- helpers --------
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function minToHHmm(min: number) {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function toMin(hhmm?: string): number | null {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function normalizeBreaks(
  br?: AvailabilityDay["breaks"]
): BreakRange[] {
  if (!br) return [];
  if (Array.isArray(br)) return br.filter(Boolean) as BreakRange[];
  // RTDB a veces guarda arrays como objeto {key:{...}}
  if (typeof br === "object") return Object.values(br).filter(Boolean) as BreakRange[];
  return [];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export function generateSlotsForNutri(cfg?: AvailabilityDay): string[] {
  if (!cfg) return [];

  const startMin = toMin(cfg.start);
  const endMin = toMin(cfg.end);
  if (startMin === null || endMin === null) return [];
  if (endMin <= startMin) return [];

  const slotMin = Number(cfg.slotMin ?? 30);
  const breaks = normalizeBreaks(cfg.breaks)
    .map((b) => ({
      s: toMin(b?.start) ?? null,
      e: toMin(b?.end) ?? null,
    }))
    .filter((b) => b.s !== null && b.e !== null && (b.e as number) > (b.s as number))
    .map((b) => ({ s: b.s as number, e: b.e as number }));

  const slots: string[] = [];

  for (let t = startMin; t + slotMin <= endMin; t += slotMin) {
    const tEnd = t + slotMin;

    // si cae dentro de un break, lo salteo
    const inBreak = breaks.some((br) => overlaps(t, tEnd, br.s, br.e));
    if (inBreak) continue;

    slots.push(minToHHmm(t));
  }

  return slots;
}

export function getSlotsForNutriOnDay(
  nutri: Nutritionist,
  dowKey: keyof Availability
): string[] {
  const cfg = nutri?.availability?.[dowKey];
  return generateSlotsForNutri(cfg);
}

/**
 * Lee nutricionistas desde RTDB.
 * Estructura esperada:
 * users/{uid} = { role:"nutricionista", name, email, photoURL, availability:{ mon:{...}, ... } }
 */
export function listenNutritionists(
  cb: (list: Nutritionist[]) => void
) {
  const usersRef = ref(rtdb, "users");

  const unsub = onValue(usersRef, (snap) => {
    const val = snap.val() || {};

    const list: Nutritionist[] = Object.keys(val)
      .map((uid) => {
        const u = val[uid] || {};
        if (u.role !== "nutricionista") return null;

        const n: Nutritionist = {
          uid,
          name: String(u.name ?? "Nutricionista"),
          email: String(u.email ?? ""),
          photoURL: u.photoURL ? String(u.photoURL) : "",
          role: String(u.role ?? ""),
          availability: (u.availability ?? undefined) as Availability | undefined,
        };
        return n;
      })
      .filter(Boolean) as Nutritionist[];

    // orden lindo
    list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    cb(list);
  });

  return () => unsub();
}
