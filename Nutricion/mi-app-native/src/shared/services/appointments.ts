import { onValue, ref, push, runTransaction, update, remove } from "firebase/database";
import { rtdb } from "./firebase";

export type AppointmentStatus = "pendiente" | "cancelado" | "asistio" | "no_asistio";

export type Appointment = {
  id: string;

  patientUid: string;
  patientName: string;
  patientEmail: string;

  nutriUid: string;
  nutriName: string;
  nutriEmail: string;

  date: string;      // YYYY-MM-DD
  time: string;      // HH:mm
  startAt: number;   // ms
  endAt: number;     // ms

  status: AppointmentStatus;
  createdAt: number;

  reminderSent?: boolean;
};

function toTimestamp(dateYYYYMMDD: string, timeHHmm: string) {
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const [hh, mm] = timeHHmm.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return dt.getTime();
}

/**
 * Reserva turno ATÓMICO usando slots/{nutriUid}/{date}/{time} = apptId
 */
export async function bookAppointment(input: {
  patientUid: string;
  patientName: string;
  patientEmail: string;

  nutriUid: string;
  nutriName: string;
  nutriEmail: string;

  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  durationMin?: number; // default 30
}) {
  const durationMin = input.durationMin ?? 30;

  const startAt = toTimestamp(input.date, input.time);
  const endAt = startAt + durationMin * 60 * 1000;

  const apptId = push(ref(rtdb, "appointments")).key!;
  const slotRef = ref(rtdb, `slots/${input.nutriUid}/${input.date}/${input.time}`);

  // si ya existe => ocupado
  const tx = await runTransaction(slotRef, (current) => {
    if (current) return; // ocupado
    return apptId;       // reservar
  });

  if (!tx.committed) {
    const err = new Error("Ese horario ya fue reservado. Elegí otro.");
    (err as any).code = "SLOT_TAKEN";
    throw err;
  }

  const appt: Appointment = {
    id: apptId,

    patientUid: input.patientUid,
    patientName: input.patientName,
    patientEmail: input.patientEmail,

    nutriUid: input.nutriUid,
    nutriName: input.nutriName,
    nutriEmail: input.nutriEmail,

    date: input.date,
    time: input.time,
    startAt,
    endAt,

    status: "pendiente",
    createdAt: Date.now(),
    reminderSent: false,
  };

  const updates: Record<string, any> = {};
  updates[`appointments/${apptId}`] = appt;
  updates[`appointmentsByNutri/${input.nutriUid}/${apptId}`] = appt;
  updates[`appointmentsByPatient/${input.patientUid}/${apptId}`] = appt;

  await update(ref(rtdb), updates);

  return appt;
}

export async function cancelAppointment(appt: Appointment) {
  const updates: Record<string, any> = {};
  updates[`appointments/${appt.id}/status`] = "cancelado";
  updates[`appointmentsByNutri/${appt.nutriUid}/${appt.id}/status`] = "cancelado";
  updates[`appointmentsByPatient/${appt.patientUid}/${appt.id}/status`] = "cancelado";

  await update(ref(rtdb), updates);
  await remove(ref(rtdb, `slots/${appt.nutriUid}/${appt.date}/${appt.time}`));
}

/**
 * Escucha turnos del paciente
 */
export function listenAppointmentsByPatient(patientUid: string, cb: (list: Appointment[]) => void) {
  const pRef = ref(rtdb, `appointmentsByPatient/${patientUid}`);
  return onValue(pRef, (snap) => {
    const val = snap.val() || {};
    const list: Appointment[] = Object.keys(val).map((id) => ({
      ...val[id],
      id,
      startAt: Number(val[id]?.startAt ?? 0),
      endAt: Number(val[id]?.endAt ?? 0),
      createdAt: Number(val[id]?.createdAt ?? 0),
    }));
    list.sort((a, b) => (b.startAt ?? 0) - (a.startAt ?? 0));
    cb(list);
  });
}

/**
 * Escucha turnos del nutri (esto te evita el error de "is not a function")
 */
export function listenAppointmentsByNutri(nutriUid: string, cb: (list: Appointment[]) => void) {
  const nRef = ref(rtdb, `appointmentsByNutri/${nutriUid}`);
  return onValue(nRef, (snap) => {
    const val = snap.val() || {};
    const list: Appointment[] = Object.keys(val).map((id) => ({
      ...val[id],
      id,
      startAt: Number(val[id]?.startAt ?? 0),
      endAt: Number(val[id]?.endAt ?? 0),
      createdAt: Number(val[id]?.createdAt ?? 0),
    }));
    list.sort((a, b) => (b.startAt ?? 0) - (a.startAt ?? 0));
    cb(list);
  });
}

/**
 * Escucha slots ocupados para un nutri y una fecha
 * Devuelve Set con HH:mm ocupados
 */
export function listenBookedSlotsForNutri(
  nutriUid: string,
  dateYYYYMMDD: string,
  cb: (set: Set<string>) => void
) {
  const sRef = ref(rtdb, `slots/${nutriUid}/${dateYYYYMMDD}`);
  return onValue(sRef, (snap) => {
    const val = snap.val() || {};
    const set = new Set<string>(Object.keys(val));
    cb(set);
  });
}
