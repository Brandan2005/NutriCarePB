const { onValueCreated } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");
const functions = require("firebase-functions");

const gmailEmail = functions.config().gmail.email;
const gmailPassword = functions.config().gmail.password;

// Transporter (Gmail)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: gmailEmail,
    pass: gmailPassword,
  },
});

// 🔔 Se dispara cuando se crea un turno
exports.sendAppointmentEmail = onValueCreated(
  "/appointments/{appointmentId}",
  async (event) => {
    const appointment = event.data.val();

    if (!appointment) return;

    const {
      patientName,
      patientEmail,
      nutritionistName,
      date,
      time,
    } = appointment;

    const mailOptions = {
      from: `"NutriCare" <${gmailEmail}>`,
      to: patientEmail,
      subject: "Confirmación de turno – NutriCare",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color:#111">
          <h2 style="color:#6D28D9">Hola ${patientName} 👋</h2>

          <p>
            Te confirmamos que tu turno fue reservado correctamente en <b>NutriCare</b>.
          </p>

          <div style="background:#F3E8FF; padding:16px; border-radius:12px; margin:16px 0">
            <p><b>👩‍⚕️ Profesional:</b> ${nutritionistName}</p>
            <p><b>📅 Fecha:</b> ${date}</p>
            <p><b>⏰ Hora:</b> ${time}</p>
          </div>

          <p>
            Si necesitás cancelar o modificar el turno, podés hacerlo desde la plataforma.
          </p>

          <p style="margin-top:24px">
            Gracias por confiar en nosotros 💜<br/>
            <b>Equipo NutriCare</b>
          </p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      logger.info("📧 Email enviado correctamente");
    } catch (error) {
      logger.error("❌ Error enviando email", error);
    }
  }
);
