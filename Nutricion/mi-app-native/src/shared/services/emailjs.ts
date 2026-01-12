type EmailAppointmentParams = {
  to_email: string;
  patient_name: string;
  nutritionist_name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
};

function mustEnv(name: string) {
  const v = (process.env as any)[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v as string;
}

/**
 * Env:
 * EXPO_PUBLIC_EMAILJS_SERVICE_ID
 * EXPO_PUBLIC_EMAILJS_TEMPLATE_ID
 * EXPO_PUBLIC_EMAILJS_PUBLIC_KEY
 *
 * IMPORTANTE (EmailJS):
 * - En tu template, el "To Email" debe ser: {{to_email}}
 * - Campos usados: {{patient_name}}, {{nutritionist_name}}, {{date}}, {{time}}
 */
export async function sendAppointmentEmail(params: EmailAppointmentParams) {
  const serviceId = mustEnv("EXPO_PUBLIC_EMAILJS_SERVICE_ID");
  const templateId = mustEnv("EXPO_PUBLIC_EMAILJS_TEMPLATE_ID");
  const publicKey = mustEnv("EXPO_PUBLIC_EMAILJS_PUBLIC_KEY");

  // EmailJS REST endpoint
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: params,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`EmailJS error: ${res.status} ${text}`);
  }
}
