import emailjs from "@emailjs/browser";

export async function sendAppointmentEmail(params: {
  to_email: string;
  patient_name: string;
  nutritionist_name: string;
  date: string;
  time: string;
}) {
  const SERVICE_ID = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE_ID = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID;
  const PUBLIC_KEY = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY;

  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    console.warn("EmailJS no configurado (faltan envs). No se envía mail.");
    return;
  }

  // En template: To Email = {{to_email}}
  await emailjs.send(SERVICE_ID, TEMPLATE_ID, params, { publicKey: PUBLIC_KEY });
}
