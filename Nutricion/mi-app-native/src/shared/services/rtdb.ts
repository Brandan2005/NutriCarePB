import { rtdb } from "./firebase";
import {
  ref,
  push,
  set,
  update,
  remove,
  get,
  query,
  orderByChild,
  equalTo,
} from "firebase/database";

// ---------- WEIGHTS ----------
export async function addWeight(uid: string, value: number, dateISO: string) {
  const listRef = ref(rtdb, `weights/${uid}`);
  const newRef = push(listRef);
  await set(newRef, { value, date: dateISO });
  return newRef.key; // id
}

export async function updateWeight(uid: string, id: string, patch: Partial<{ value: number; date: string }>) {
  const itemRef = ref(rtdb, `weights/${uid}/${id}`);
  await update(itemRef, patch);
}

export async function deleteWeight(uid: string, id: string) {
  await remove(ref(rtdb, `weights/${uid}/${id}`));
}

// ---------- MEALS ----------
export async function addMeal(
  uid: string,
  data: { date: string; mealType: string; text: string; rating: number }
) {
  const listRef = ref(rtdb, `meals/${uid}`);
  const newRef = push(listRef);
  await set(newRef, data);
  return newRef.key;
}

export async function updateMeal(uid: string, id: string, patch: Partial<{ date: string; mealType: string; text: string; rating: number }>) {
  await update(ref(rtdb, `meals/${uid}/${id}`), patch);
}

export async function deleteMeal(uid: string, id: string) {
  await remove(ref(rtdb, `meals/${uid}/${id}`));
}

// ---------- APPOINTMENTS (por nutricionista) ----------
export async function addAppointment(
  nutriUid: string,
  data: { patientUid: string; startISO: string; endISO: string; status: "pendiente" | "asistio" | "no_asistio" }
) {
  const listRef = ref(rtdb, `appointments/${nutriUid}`);
  const newRef = push(listRef);
  await set(newRef, data);
  return newRef.key;
}

export async function updateAppointment(
  nutriUid: string,
  id: string,
  patch: Partial<{ patientUid: string; startISO: string; endISO: string; status: "pendiente" | "asistio" | "no_asistio" }>
) {
  await update(ref(rtdb, `appointments/${nutriUid}/${id}`), patch);
}

export async function deleteAppointment(nutriUid: string, id: string) {
  await remove(ref(rtdb, `appointments/${nutriUid}/${id}`));
}
