import { ref, get } from "firebase/database";
import { rtdb } from "./firebase";

export type AvailabilityDay = {
  start: string; // "10:00"
  end: string;   // "14:00"
  breaks?: Array<{ start: string; end: string }>;
};

export type Availability = {
  timezone?: string;
  days?: Partial<Record<"mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun", AvailabilityDay>>;
};

export type NutriUser = {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  role: "nutricionista";
  availability?: Availability;
};

export async function fetchNutritionists(): Promise<NutriUser[]> {
  const snap = await get(ref(rtdb, "users"));
  const val = snap.val() || {};

  const list: NutriUser[] = Object.keys(val)
    .map((uid) => ({ uid, ...val[uid] }))
    .filter((u) => (u?.role || "").toLowerCase() === "nutricionista")
    .map((u) => ({
      uid: u.uid,
      name: u.name || u.email?.split("@")?.[0] || "Nutricionista",
      email: u.email || "",
      photoURL: u.photoURL || "",
      role: "nutricionista",
      availability: u.availability || {},
    }));

  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}
