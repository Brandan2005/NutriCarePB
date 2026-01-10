import React, { useEffect, useMemo, useState } from "react";
import { View, ScrollView, Image, Dimensions } from "react-native";
import { Button, Card, Text, Divider, Avatar, IconButton, Snackbar, Provider as PaperProvider } from "react-native-paper";
import { signOut } from "firebase/auth";
import { onValue, ref, update, get } from "firebase/database";
import { auth, rtdb } from "../../../shared/services/firebase";

type AppointmentNutriItem = {
  id: string;
  patientUid: string;
  patientName: string;
  date: string;
  time: string;
  status: "pendiente" | "asistio" | "no_asistio" | "cancelado";
};

const { width } = Dimensions.get("window");
const isWide = width >= 900;

function formatDateLabel(iso: string) {
  if (!iso || !iso.includes("-")) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function NutriHome({ email }: { email: string }) {
  const user = auth.currentUser;

  const [snack, setSnack] = useState<{ open: boolean; msg: string }>({ open: false, msg: "" });
  const toast = (msg: string) => setSnack({ open: true, msg });
  const closeToast = () => setSnack({ open: false, msg: "" });

  const [name, setName] = useState("");
  const [photoURL, setPhotoURL] = useState("");

  const [appointments, setAppointments] = useState<AppointmentNutriItem[]>([]);

  const theme = useMemo(
    () => ({
      violet: "#6D28D9",
      violet2: "#8B5CF6",
      violetSoft: "#F3E8FF",
      violetRing: "#DDD6FE",

      pageBg: "#F8FAFC",
      surface: "#FFFFFF",
      border: "#E5E7EB",
      border2: "#EEF2F7",

      text: "#0F172A",
      muted: "#64748B",

      headerBg: "#000000",
      headerBorder: "#111827",
      headerText: "#F9FAFB",
      headerMuted: "#CBD5E1",

      danger: "#EF4444",
      ok: "#16A34A",
      warn: "#F59E0B",

      shadow: {
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      } as any,
    }),
    []
  );

  const styles = useMemo(
    () => ({
      sectionCard: {
        borderRadius: 24,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border2,
        ...theme.shadow,
      } as any,
      innerCard: {
        borderRadius: 18,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
      } as any,
      primaryBtn: { borderRadius: 14, backgroundColor: theme.violet } as any,
      subtleDivider: { backgroundColor: theme.border2 } as any,
      hero: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.violetRing,
        backgroundColor: theme.violetSoft,
      } as any,
    }),
    [theme]
  );

  useEffect(() => {
    if (!user) return;

    const userRef = ref(rtdb, `users/${user.uid}`);
    const unsubUser = onValue(userRef, (snap) => {
      const data = snap.val() || {};
      setName(data?.name || data?.email?.split("@")?.[0] || "Nutricionista");
      setPhotoURL(data?.photoURL || "");
    });

    return () => unsubUser();
  }, [user]);

  // turnos del nutricionista
  useEffect(() => {
    if (!user) return;

    const idxRef = ref(rtdb, `appointmentsByNutri/${user.uid}`);
    const unsub = onValue(idxRef, (snap) => {
      const val = snap.val() || {};
      const list: AppointmentNutriItem[] = Object.keys(val).map((id) => ({
        id,
        patientUid: String(val[id]?.patientUid || ""),
        patientName: String(val[id]?.patientName || "Paciente"),
        date: String(val[id]?.date || ""),
        time: String(val[id]?.time || ""),
        status: (val[id]?.status || "pendiente") as any,
      }));

      list.sort((a, b) => {
        const ka = `${a.date} ${a.time}`;
        const kb = `${b.date} ${b.time}`;
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });

      setAppointments(list);
    });

    return () => unsub();
  }, [user]);

  function statusBadge(status: AppointmentNutriItem["status"]) {
    const map = {
      pendiente: { label: "Pendiente", bg: theme.violetSoft, fg: "#4C1D95", bd: theme.violetRing },
      asistio: { label: "Asistió", bg: "#DCFCE7", fg: "#166534", bd: "#BBF7D0" },
      no_asistio: { label: "No asistió", bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" },
      cancelado: { label: "Cancelado", bg: "#FEE2E2", fg: "#991B1B", bd: "#FECACA" },
    }[status];

    return (
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: map.bg,
          borderWidth: 1,
          borderColor: map.bd,
          alignSelf: "flex-start",
          marginTop: 8,
        }}
      >
        <Text style={{ color: map.fg, fontSize: 12, fontWeight: "800" }}>{map.label}</Text>
      </View>
    );
  }

  async function setStatus(apptId: string, status: AppointmentNutriItem["status"]) {
    if (!user) return;

    try {
      // leo turno principal para saber patientUid/date/time (y liberar slot si cancelo)
      const snap = await get(ref(rtdb, `appointments/${apptId}`));
      const appt = snap.val();
      if (!appt) {
        toast("No se encontró el turno.");
        return;
      }

      const patientUid = appt.patientUid;
      const nutriUid = appt.nutriUid;
      const date = appt.date;
      const time = appt.time;

      const updates: any = {};
      updates[`appointments/${apptId}/status`] = status;
      updates[`appointmentsByNutri/${nutriUid}/${apptId}/status`] = status;
      updates[`appointmentsByPatient/${patientUid}/${apptId}/status`] = status;

      // si cancela, libero slot
      if (status === "cancelado") {
        updates[`slots/${nutriUid}/${date}/${time}`] = null;
      }

      await update(ref(rtdb), updates);
      toast("Estado actualizado ✅");
    } catch (e) {
      console.log(e);
      toast("No se pudo actualizar el estado.");
    }
  }

  return (
    <PaperProvider>
      <View style={{ flex: 1, backgroundColor: theme.pageBg }}>
        {/* HEADER */}
        <View
          style={{
            height: 74,
            paddingHorizontal: 18,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: theme.headerBg,
            borderBottomWidth: 1,
            borderColor: theme.headerBorder,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Image source={require("../../../../assets/images/icon.png")} style={{ width: 34, height: 34, borderRadius: 12 }} />
            <View>
              <Text variant="titleMedium" style={{ color: theme.headerText, fontWeight: "800" }}>
                NutriCare
              </Text>
              <Text style={{ color: theme.headerMuted, marginTop: -2, fontSize: 12 }}>Panel Nutricionista</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {photoURL ? <Avatar.Image size={36} source={{ uri: photoURL }} /> : <Avatar.Text size={36} label={(name || "N")[0]?.toUpperCase()} />}
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontWeight: "800", color: theme.headerText, lineHeight: 18 }}>{name || "Nutricionista"}</Text>
              <Text style={{ color: theme.headerMuted, fontSize: 11 }}>{email}</Text>
            </View>
            <Button mode="text" textColor="#FCA5A5" onPress={() => signOut(auth)}>
              Cerrar sesión
            </Button>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
          {/* HERO */}
          <View style={styles.hero}>
            <Text style={{ color: "#4C1D95", fontSize: 18, fontWeight: "900" }}>
              Turnos asignados 📅
            </Text>
            <Text style={{ color: "#5B21B6", marginTop: 6, lineHeight: 20 }}>
              Podés marcar asistencia, inasistencia o cancelar.
            </Text>
          </View>

          <View style={{ marginTop: 12, flexDirection: isWide ? "row" : "column", gap: 12 }}>
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Agenda</Text>
                <Text style={{ color: theme.muted, marginTop: 6 }}>
                  Total: {appointments.length}
                </Text>

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                {appointments.length === 0 ? (
                  <Text style={{ color: theme.muted }}>Todavía no tenés turnos.</Text>
                ) : (
                  <View style={{ gap: 10 }}>
                    {appointments.map((a) => (
                      <Card key={a.id} style={styles.innerCard}>
                        <Card.Content>
                          <Text style={{ fontWeight: "900", color: theme.text }}>
                            {formatDateLabel(a.date)} {a.time} · {a.patientName}
                          </Text>

                          {statusBadge(a.status)}

                          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                            <Button
                              mode="outlined"
                              onPress={() => setStatus(a.id, "asistio")}
                              disabled={a.status === "cancelado"}
                              textColor={theme.ok}
                              style={{ borderRadius: 14, borderColor: "#86EFAC" }}
                            >
                              Asistió
                            </Button>

                            <Button
                              mode="outlined"
                              onPress={() => setStatus(a.id, "no_asistio")}
                              disabled={a.status === "cancelado"}
                              textColor={theme.warn}
                              style={{ borderRadius: 14, borderColor: "#FDE68A" }}
                            >
                              No asistió
                            </Button>

                            <Button
                              mode="contained"
                              onPress={() => setStatus(a.id, "cancelado")}
                              disabled={a.status === "cancelado"}
                              style={{ borderRadius: 14, backgroundColor: theme.danger }}
                            >
                              Cancelar
                            </Button>
                          </View>
                        </Card.Content>
                      </Card>
                    ))}
                  </View>
                )}
              </Card.Content>
            </Card>
          </View>
        </ScrollView>

        <Snackbar visible={snack.open} onDismiss={closeToast} duration={2500}>
          {snack.msg}
        </Snackbar>
      </View>
    </PaperProvider>
  );
}
