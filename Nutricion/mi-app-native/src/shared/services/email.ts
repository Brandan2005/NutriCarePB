import emailjs from "emailjs-com";

const SERVICE_ID = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID!;
const TEMPLATE_ID = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID!;
const PUBLIC_KEY = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY!;

type AppointmentEmailParams = {
  to_email: string;
  patient_name: string;
  nutritionist_name: string;
  date: string;
  time: string;
};

export async function sendAppointmentEmail(params: AppointmentEmailParams) {
  try {
    await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        to_email: params.to_email,
        patient_name: params.patient_name,
        nutritionist_name: params.nutritionist_name,
        date: params.date,
        time: params.time,
      },
      PUBLIC_KEY
    );
  } catch (error) {
    console.error("EMAIL ERROR", error);
  }
}
