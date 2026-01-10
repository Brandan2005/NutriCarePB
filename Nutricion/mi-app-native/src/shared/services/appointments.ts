import { ref, push, runTransaction, update, remove, get } from "firebase/database";
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
  time: string; // HH:mm
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

/** Devuelve Set de horarios ocupados ("HH:mm") para un nutri en una fecha */
export async function getBookedSlotsForNutri(nutriUid: string, date: string) {
  const snap = await get(ref(rtdb, `slots/${nutriUid}/${date}`));
  const val = snap.val() || {};
  return new Set<string>(Object.keys(val));
}

/**
 * Reserva turno ATÓMICO:
 * 1) bloquea slots/nutri/date/time con transaction (si existe -> ocupado)
 * 2) crea appointment y duplica índices
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
    if (current) return; // ya ocupado
    return apptId; // reservar
  });

  if (!tx.committed) {
    const err = new Error("Ese horario ya fue reservado. Elegí otro.");
    (err as any).code = "SLOT_TAKEN";
    throw err;
  }

  // 2) Crear appointment
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
