import { ref, get } from "firebase/database";
import { rtdb } from "./firebase";

export type NutriDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type NutriAvailabilityDay = {
  start: string; // "10:00"
  end: string;   // "14:00"
  breaks?: { start: string; end: string }[]; // opcional
};

export type Nutritionist = {
  uid: string;
  name: string;
  email: string;
  role: "nutricionista";
  availability?: {
    days?: Partial<Record<NutriDayKey, NutriAvailabilityDay>>;
  };
};

export async function getNutritionists(): Promise<Nutritionist[]> {
  // usa users/{uid} con role="nutricionista"
  const snap = await get(ref(rtdb, "users"));
  const val = snap.val() || {};
  const list: Nutritionist[] = [];

  for (const uid of Object.keys(val)) {
    const u = val[uid];
    if (String(u?.role || "").toLowerCase() === "nutricionista") {
      list.push({
        uid,
        name: u?.name || u?.email?.split("@")?.[0] || "Nutricionista",
        email: u?.email || "",
        role: "nutricionista",
        availability: u?.availability || undefined,
      });
    }
  }

  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

export function dayKeyFromISO(dateYYYYMMDD: string): NutriDayKey {
  const d = new Date(dateYYYYMMDD + "T00:00:00");
  const day = d.getDay(); // 0 dom ... 6 sab
  const map: Record<number, NutriDayKey> = {
    0: "sun",
    1: "mon",
    2: "tue",
    3: "wed",
    4: "thu",
    5: "fri",
    6: "sat",
  };
  return map[day];
}

function timeToMinutes(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}
function minutesToTime(m: number) {
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function generateSlotsForNutri(nutri: Nutritionist, dateYYYYMMDD: string) {
  const dayKey = dayKeyFromISO(dateYYYYMMDD);
  const day = nutri.availability?.days?.[dayKey];
  if (!day?.start || !day?.end) return [];

  const startMin = timeToMinutes(day.start);
  const endMin = timeToMinutes(day.end);

  const breaks = (day.breaks || []).map((b) => ({
    s: timeToMinutes(b.start),
    e: timeToMinutes(b.end),
  }));

  const slots: string[] = [];
  for (let m = startMin; m + 30 <= endMin; m += 30) {
    const s = m;
    const e = m + 30;

    const inBreak = breaks.some((b) => !(e <= b.s || s >= b.e));
    if (!inBreak) slots.push(minutesToTime(m));
  }

  return slots;
}
