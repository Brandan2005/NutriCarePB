import { ref, push, update, remove, get, runTransaction, onValue, off } from "firebase/database";
import { rtdb } from "./firebase";

export type AppointmentStatus = "requested" | "cancelled" | "attended" | "no_show";

export type Appointment = {
  id: string;

  patientUid: string;
  patientName: string;
  patientEmail: string;

  nutritionistUid: string;
  nutritionistName: string;

  date: string; // YYYY-MM-DD
  time: string; // HH:mm

  startAt: number; // ms
  endAt: number;   // ms

  createdAt: number; // ms
  status: AppointmentStatus;
};

export function toTimestamp(dateYYYYMMDD: string, timeHHmm: string) {
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const [hh, mm] = timeHHmm.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

export function buildSlotKey(date: string, time: string) {
  // global slot id
  return `${date}_${time}`;
}

/**
 * Reserva ATÓMICA GLOBAL:
 * 1) lock global: slots/{date_time} = { apptId, nutritionistUid, patientUid }
 *    -> si existe, está ocupado (por cualquier nutri)
 * 2) crea appointment y duplica índices:
 *    appointments/
 *    appointmentsByPatient/{patientUid}/
 *    appointmentsByNutri/{nutritionistUid}/
 */
export async function bookAppointmentAtomic(input: Omit<Appointment, "id" | "startAt" | "endAt" | "createdAt" | "status"> & {
  durationMin?: number;
}) {
  const durationMin = input.durationMin ?? 30;

  const startAt = toTimestamp(input.date, input.time);
  const endAt = startAt + durationMin * 60 * 1000;

  const apptId = push(ref(rtdb, "appointments")).key!;
  const slotKey = buildSlotKey(input.date, input.time);
  const slotRef = ref(rtdb, `slots/${slotKey}`);

  // 1) Transaction global lock
  const tx = await runTransaction(slotRef, (current) => {
    if (current) return; // ocupado
    return {
      apptId,
      nutritionistUid: input.nutritionistUid,
      patientUid: input.patientUid,
      createdAt: Date.now(),
    };
  });

  if (!tx.committed) {
    const err: any = new Error("Ese horario ya fue reservado. Elegí otro.");
    err.code = "SLOT_TAKEN";
    throw err;
  }

  const appt: Appointment = {
    id: apptId,
    patientUid: input.patientUid,
    patientName: input.patientName,
    patientEmail: input.patientEmail,
    nutritionistUid: input.nutritionistUid,
    nutritionistName: input.nutritionistName,
    date: input.date,
    time: input.time,
    startAt,
    endAt,
    createdAt: Date.now(),
    status: "requested",
  };

  const updates: Record<string, any> = {};
  updates[`appointments/${apptId}`] = appt;
  updates[`appointmentsByPatient/${input.patientUid}/${apptId}`] = appt;
  updates[`appointmentsByNutri/${input.nutritionistUid}/${apptId}`] = appt;

  await update(ref(rtdb), updates);

  return appt;
}

export async function cancelAppointment(appt: Appointment) {
  const slotKey = buildSlotKey(appt.date, appt.time);

  const updates: Record<string, any> = {};
  updates[`appointments/${appt.id}/status`] = "cancelled";
  updates[`appointmentsByPatient/${appt.patientUid}/${appt.id}/status`] = "cancelled";
  updates[`appointmentsByNutri/${appt.nutritionistUid}/${appt.id}/status`] = "cancelled";

  await update(ref(rtdb), updates);
  await remove(ref(rtdb, `slots/${slotKey}`));
}

export async function getBookedSlotsForDay(date: string) {
  // retorna Set("HH:mm") ocupados globalmente para esa fecha
  const snap = await get(ref(rtdb, "slots"));
  const val = snap.val() || {};
  const set = new Set<string>();
  for (const key of Object.keys(val)) {
    if (key.startsWith(`${date}_`)) {
      const time = key.split("_")[1];
      if (time) set.add(time);
    }
  }
  return set;
}

export function listenAppointmentsByPatient(
  patientUid: string,
  cb: (appts: Appointment[]) => void
) {
  const pRef = ref(rtdb, `appointmentsByPatient/${patientUid}`);
  const handler = (snap: any) => {
    const val = snap.val() || {};
    const list: Appointment[] = Object.keys(val).map((id) => val[id]);
    list.sort((a, b) => (a.startAt || 0) - (b.startAt || 0));
    cb(list);
  };
  onValue(pRef, handler);
  return () => off(pRef, "value", handler);
}

export function listenAppointmentsByNutri(
  nutriUid: string,
  cb: (appts: Appointment[]) => void
) {
  const nRef = ref(rtdb, `appointmentsByNutri/${nutriUid}`);
  const handler = (snap: any) => {
    const val = snap.val() || {};
    const list: Appointment[] = Object.keys(val).map((id) => val[id]);
    list.sort((a, b) => (a.startAt || 0) - (b.startAt || 0));
    cb(list);
  };
  onValue(nRef, handler);
  return () => off(nRef, "value", handler);
}
