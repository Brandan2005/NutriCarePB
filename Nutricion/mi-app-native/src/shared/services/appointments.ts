import { ref, push, runTransaction, update, remove, onValue } from "firebase/database";
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

  date: string; // YYYY-MM-DD
  time: string; // HH:mm (cada 30min)
  startAt: number; // timestamp ms
  endAt: number; // timestamp ms

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

function apptKey(appt: Appointment) {
  // ordenable por fecha/hora
  return `${appt.date}T${appt.time}`;
}

/**
 * Reserva turno ATÓMICO:
 * - bloquea slots/{nutriUid}/{date}/{time} con transaction
 * - si está libre, crea appointment y duplica índices
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

  // 1) Transaction: si ya existe, está ocupado
  const tx = await runTransaction(slotRef, (current) => {
    if (current) return; // ocupado
    return apptId; // reservar
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

/** Nutri: marca estado (asistió / no asistió / pendiente) */
export async function setAppointmentStatus(appt: Appointment, status: AppointmentStatus) {
  const updates: Record<string, any> = {};
  updates[`appointments/${appt.id}/status`] = status;
  updates[`appointmentsByNutri/${appt.nutriUid}/${appt.id}/status`] = status;
  updates[`appointmentsByPatient/${appt.patientUid}/${appt.id}/status`] = status;
  await update(ref(rtdb), updates);
}

/** Cancela + libera slot */
export async function cancelAppointment(appt: Appointment) {
  await setAppointmentStatus(appt, "cancelado");
  await remove(ref(rtdb, `slots/${appt.nutriUid}/${appt.date}/${appt.time}`));
}

/** Listener simple para turnos del nutri */
export function listenAppointmentsByNutri(
  nutriUid: string,
  cb: (list: Appointment[]) => void
) {
  const apptRef = ref(rtdb, `appointmentsByNutri/${nutriUid}`);
  return onValue(apptRef, (snap) => {
    const val = snap.val() || {};
    const list: Appointment[] = Object.keys(val).map((id) => ({
      id,
      ...val[id],
    }));
    list.sort((a, b) => (apptKey(a) < apptKey(b) ? -1 : 1));
    cb(list);
  });
}
