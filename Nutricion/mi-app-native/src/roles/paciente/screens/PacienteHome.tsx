import React, { useEffect, useMemo, useState } from "react";
import { View, ScrollView, Image, Dimensions } from "react-native";
import {
  Button,
  Card,
  Text,
  TextInput,
  Divider,
  Avatar,
  IconButton,
  Modal,
  Portal,
  Provider as PaperProvider,
  Chip,
  Snackbar,
} from "react-native-paper";
import { signOut } from "firebase/auth";
import {
  onValue,
  ref,
  push,
  set,
  update,
  remove,
  get,
  query,
  orderByChild,
  equalTo,
  runTransaction,
} from "firebase/database";
import { Calendar } from "react-native-calendars";

import { auth, rtdb } from "../../../shared/services/firebase";

type WeightItem = { id: string; value: number; date: string };
type MealItem = { id: string; date: string; mealType: string; text: string; rating: number };

type NutriItem = { uid: string; name: string; email?: string; photoURL?: string };

type AppointmentPatientItem = {
  id: string;
  nutriUid: string;
  nutriName: string;
  date: string;
  time: string;
  status: "pendiente" | "asistio" | "no_asistio" | "cancelado";
};

const { width } = Dimensions.get("window");
const isWide = width >= 900;

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(iso: string) {
  if (!iso || !iso.includes("-")) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function isValidTimeHHmm(v: string) {
  // "09:30"
  if (!/^\d{2}:\d{2}$/.test(v)) return false;
  const [hh, mm] = v.split(":").map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

export default function PacienteHome({ email }: { email: string }) {
  const user = auth.currentUser;

  const [snack, setSnack] = useState<{ open: boolean; msg: string }>({ open: false, msg: "" });
  const toast = (msg: string) => setSnack({ open: true, msg });
  const closeToast = () => setSnack({ open: false, msg: "" });

  // perfil
  const [name, setName] = useState("");
  const [photoURL, setPhotoURL] = useState("");

  // datos existentes (si querés mantener)
  const [weights, setWeights] = useState<WeightItem[]>([]);
  const [meals, setMeals] = useState<MealItem[]>([]);

  // turnos
  const [nutris, setNutris] = useState<NutriItem[]>([]);
  const [selectedNutri, setSelectedNutri] = useState<NutriItem | null>(null);

  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [time, setTime] = useState("15:00");

  const [openCreateAppt, setOpenCreateAppt] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);

  const [myAppointments, setMyAppointments] = useState<AppointmentPatientItem[]>([]);

  // ====== THEME (pro white + violet, header black) ======
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
      secondaryBtn: { borderRadius: 14, borderColor: theme.violet } as any,
      subtleDivider: { backgroundColor: theme.border2 } as any,
      pill: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.violetRing,
        backgroundColor: theme.violetSoft,
      } as any,
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

  // marked dates (solo selección)
  const markedDates = useMemo(() => {
    return {
      [selectedDay]: { selected: true, selectedColor: theme.violet },
    } as any;
  }, [selectedDay, theme.violet]);

  // ====== Cargar perfil + datos (lo tuyo) ======
  useEffect(() => {
    if (!user) return;

    const userRef = ref(rtdb, `users/${user.uid}`);
    const weightsRef = ref(rtdb, `weights/${user.uid}`);
    const mealsRef = ref(rtdb, `meals/${user.uid}`);

    const unsubUser = onValue(userRef, (snap) => {
      const data = snap.val() || {};
      setName(data?.name || data?.email?.split("@")?.[0] || "Paciente");
      setPhotoURL(data?.photoURL || "");
    });

    const unsubWeights = onValue(weightsRef, (snap) => {
      const val = snap.val() || {};
      const list: WeightItem[] = Object.keys(val).map((id) => ({
        id,
        value: Number(val[id]?.value ?? 0),
        date: String(val[id]?.date ?? ""),
      }));
      list.sort((a, b) => (a.date < b.date ? -1 : 1));
      setWeights(list);
    });

    const unsubMeals = onValue(mealsRef, (snap) => {
      const val = snap.val() || {};
      const list: MealItem[] = Object.keys(val).map((id) => ({
        id,
        date: String(val[id]?.date ?? ""),
        mealType: String(val[id]?.mealType ?? ""),
        text: String(val[id]?.text ?? ""),
        rating: Number(val[id]?.rating ?? 0),
      }));
      list.sort((a, b) => (a.date > b.date ? -1 : 1));
      setMeals(list);
    });

    return () => {
      unsubUser();
      unsubWeights();
      unsubMeals();
    };
  }, [user]);

  // ====== Listar nutricionistas (role == Nutricionista) ======
  useEffect(() => {
    const q = query(ref(rtdb, "users"), orderByChild("role"), equalTo("Nutricionista"));
    const unsub = onValue(q, (snap) => {
      const val = snap.val() || {};
      const list: NutriItem[] = Object.keys(val).map((uid) => ({
        uid,
        name: val[uid]?.name || val[uid]?.email?.split("@")?.[0] || "Nutricionista",
        email: val[uid]?.email || "",
        photoURL: val[uid]?.photoURL || "",
      }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setNutris(list);

      // si no hay seleccionado, elegí el primero
      setSelectedNutri((prev) => {
        if (prev) return prev;
        return list[0] || null;
      });
    });

    return () => unsub();
  }, []);

  // ====== Mis turnos (index por paciente) ======
  useEffect(() => {
    if (!user) return;

    const idxRef = ref(rtdb, `appointmentsByPatient/${user.uid}`);
    const unsub = onValue(idxRef, (snap) => {
      const val = snap.val() || {};
      const list: AppointmentPatientItem[] = Object.keys(val).map((id) => ({
        id,
        nutriUid: String(val[id]?.nutriUid || ""),
        nutriName: String(val[id]?.nutriName || "Nutricionista"),
        date: String(val[id]?.date || ""),
        time: String(val[id]?.time || ""),
        status: (val[id]?.status || "pendiente") as any,
      }));

      // ordenar por fecha+hora
      list.sort((a, b) => {
        const ka = `${a.date} ${a.time}`;
        const kb = `${b.date} ${b.time}`;
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });

      setMyAppointments(list);
    });

    return () => unsub();
  }, [user]);

  function statusChip(status: AppointmentPatientItem["status"]) {
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
        }}
      >
        <Text style={{ color: map.fg, fontSize: 12, fontWeight: "800" }}>{map.label}</Text>
      </View>
    );
  }

  // ====== Crear turno con bloqueo anti-choque ======
  async function createAppointment() {
    if (!user) return;
    if (!selectedNutri) {
      toast("Elegí un nutricionista.");
      return;
    }
    if (!isValidTimeHHmm(time)) {
      toast("Hora inválida. Usá formato HH:MM (ej 15:30).");
      return;
    }

    setBusyCreate(true);
    try {
      const nutriUid = selectedNutri.uid;
      const date = selectedDay;
      const hhmm = time;

      // Generamos id desde appointments (push)
      const apptRef = push(ref(rtdb, "appointments"));
      const apptId = apptRef.key!;
      const slotRef = ref(rtdb, `slots/${nutriUid}/${date}/${hhmm}`);

      // 1) Transaction: si slot vacío => guardo apptId, si ya existe => rechazo
      const tx = await runTransaction(slotRef, (current) => {
        if (current === null) return apptId;
        return; // aborta
      });

      if (!tx.committed) {
        toast("Ese horario ya está ocupado. Elegí otra hora.");
        return;
      }

      const patientName = name || email?.split("@")?.[0] || "Paciente";
      const nutriName = selectedNutri.name || "Nutricionista";
      const createdAt = Date.now();

      // 2) Multi-update: appointments + índices
      const updates: any = {};
      updates[`appointments/${apptId}`] = {
        patientUid: user.uid,
        patientName,
        nutriUid,
        nutriName,
        date,
        time: hhmm,
        status: "pendiente",
        createdAt,
      };
      updates[`appointmentsByPatient/${user.uid}/${apptId}`] = {
        nutriUid,
        nutriName,
        date,
        time: hhmm,
        status: "pendiente",
      };
      updates[`appointmentsByNutri/${nutriUid}/${apptId}`] = {
        patientUid: user.uid,
        patientName,
        date,
        time: hhmm,
        status: "pendiente",
      };

      await update(ref(rtdb), updates);

      setOpenCreateAppt(false);
      toast("Turno solicitado ✅");
    } catch (e: any) {
      console.log(e);
      toast("No se pudo crear el turno. Probá de nuevo.");
    } finally {
      setBusyCreate(false);
    }
  }

  async function cancelMyAppointment(item: AppointmentPatientItem) {
    if (!user) return;

    try {
      const apptId = item.id;

      // leo el turno principal para saber nutriUid/date/time (por si el index quedó mal)
      const snap = await get(ref(rtdb, `appointments/${apptId}`));
      const appt = snap.val();

      if (!appt) {
        toast("No se encontró el turno.");
        return;
      }

      const nutriUid = appt.nutriUid;
      const date = appt.date;
      const hhmm = appt.time;

      const updates: any = {};
      updates[`appointments/${apptId}/status`] = "cancelado";
      updates[`appointmentsByPatient/${user.uid}/${apptId}/status`] = "cancelado";
      updates[`appointmentsByNutri/${nutriUid}/${apptId}/status`] = "cancelado";
      // libero slot
      updates[`slots/${nutriUid}/${date}/${hhmm}`] = null;

      await update(ref(rtdb), updates);
      toast("Turno cancelado 🗑️");
    } catch (e) {
      console.log(e);
      toast("No se pudo cancelar.");
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
              <Text style={{ color: theme.headerMuted, marginTop: -2, fontSize: 12 }}>Panel Paciente</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {photoURL ? <Avatar.Image size={36} source={{ uri: photoURL }} /> : <Avatar.Text size={36} label={(name || "P")[0]?.toUpperCase()} />}
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontWeight: "800", color: theme.headerText, lineHeight: 18 }}>{name || "Paciente"}</Text>
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
            <Text style={{ color: "#4C1D95", fontSize: 18, fontWeight: "900" }}>Hola, {name || "Paciente"} 👋</Text>
            <Text style={{ color: "#5B21B6", marginTop: 6, lineHeight: 20 }}>
              Pedí turnos, registrá tus comidas y mirá tu progreso.
            </Text>

            <View style={{ marginTop: 12, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Chip style={styles.pill} textStyle={{ color: "#4C1D95", fontWeight: "700" }}>
                Turnos: {myAppointments.length}
              </Chip>
              <Chip
                style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.border2, backgroundColor: "#FFFFFF" }}
                textStyle={{ color: theme.text, fontWeight: "700" }}
              >
                Comidas: {meals.length}
              </Chip>
              <Chip
                style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.border2, backgroundColor: "#FFFFFF" }}
                textStyle={{ color: theme.text, fontWeight: "700" }}
              >
                Pesos: {weights.length}
              </Chip>
            </View>
          </View>

          {/* GRID */}
          <View style={{ marginTop: 12, flexDirection: isWide ? "row" : "column", gap: 12 }}>
            {/* PEDIR TURNO */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Pedir turno</Text>
                <Text style={{ color: theme.muted, marginTop: 6 }}>
                  Elegí nutricionista, fecha y hora. Si el nutri ya está ocupado, te avisa.
                </Text>

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                {/* Selector nutricionistas */}
                {nutris.length === 0 ? (
                  <Text style={{ color: theme.muted }}>No hay nutricionistas cargados (role="Nutricionista").</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontWeight: "900", color: theme.text }}>Nutricionista</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {nutris.map((n) => {
                        const active = selectedNutri?.uid === n.uid;
                        return (
                          <Button
                            key={n.uid}
                            mode={active ? "contained" : "outlined"}
                            onPress={() => setSelectedNutri(n)}
                            style={{ borderRadius: 999, backgroundColor: active ? theme.violet : undefined, borderColor: theme.violet }}
                            textColor={active ? "#FFF" : theme.violet}
                          >
                            {n.name}
                          </Button>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontWeight: "900", color: theme.text }}>Fecha</Text>
                  <View style={{ marginTop: 8 }}>
                    <Calendar
                      onDayPress={(day) => setSelectedDay(day.dateString)}
                      markedDates={markedDates}
                      theme={{
                        todayTextColor: theme.violet,
                        arrowColor: theme.violet,
                        selectedDayBackgroundColor: theme.violet,
                        selectedDayTextColor: "#FFFFFF",
                        monthTextColor: theme.text,
                        dayTextColor: theme.text,
                        textDisabledColor: "#9CA3AF",
                      }}
                      style={{
                        borderRadius: 18,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: theme.border2,
                        backgroundColor: "#FFFFFF",
                      }}
                    />
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontWeight: "900", color: theme.text }}>Hora (HH:MM)</Text>
                  <TextInput
                    value={time}
                    onChangeText={setTime}
                    mode="outlined"
                    outlineColor={theme.border}
                    activeOutlineColor={theme.violet}
                    textColor={theme.text}
                    style={{ marginTop: 8, backgroundColor: "#FFF" }}
                    placeholder="15:30"
                  />
                  <Text style={{ color: theme.muted, marginTop: 6, fontSize: 12 }}>
                    Seleccionado: {formatDateLabel(selectedDay)} a las {time}
                  </Text>
                </View>

                <Button
                  mode="contained"
                  style={[styles.primaryBtn, { marginTop: 12 }]}
                  onPress={() => setOpenCreateAppt(true)}
                  disabled={!selectedNutri}
                >
                  Solicitar turno
                </Button>
              </Card.Content>
            </Card>

            {/* MIS TURNOS */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Mis turnos</Text>
                <Text style={{ color: theme.muted, marginTop: 6 }}>Acá ves tus solicitudes y estado.</Text>

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                {myAppointments.length === 0 ? (
                  <Text style={{ color: theme.muted }}>Todavía no pediste turnos.</Text>
                ) : (
                  <View style={{ gap: 10 }}>
                    {myAppointments.map((a) => (
                      <Card key={a.id} style={styles.innerCard}>
                        <Card.Content>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ fontWeight: "900", color: theme.text }}>
                                {a.nutriName} · {formatDateLabel(a.date)} {a.time}
                              </Text>
                              <View style={{ marginTop: 8, alignSelf: "flex-start" }}>{statusChip(a.status)}</View>
                            </View>

                            <View style={{ flexDirection: "row" }}>
                              <IconButton
                                icon="close-circle-outline"
                                iconColor={theme.danger}
                                onPress={() => cancelMyAppointment(a)}
                                disabled={a.status === "cancelado" || a.status === "asistio" || a.status === "no_asistio"}
                              />
                            </View>
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

        {/* MODAL CONFIRMAR TURNO */}
        <Portal>
          <Modal
            visible={openCreateAppt}
            onDismiss={() => setOpenCreateAppt(false)}
            contentContainerStyle={{
              backgroundColor: "#FFFFFF",
              margin: 18,
              padding: 18,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: theme.border2,
              ...theme.shadow,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Confirmar turno</Text>
            <Text style={{ color: theme.muted, marginTop: 8, lineHeight: 20 }}>
              Nutricionista: <Text style={{ fontWeight: "900" }}>{selectedNutri?.name || "-"}</Text>
              {"\n"}Fecha: <Text style={{ fontWeight: "900" }}>{formatDateLabel(selectedDay)}</Text>
              {"\n"}Hora: <Text style={{ fontWeight: "900" }}>{time}</Text>
            </Text>

            <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end" }}>
              <Button onPress={() => setOpenCreateAppt(false)} textColor={theme.text}>
                Volver
              </Button>
              <Button mode="contained" onPress={createAppointment} loading={busyCreate} style={styles.primaryBtn}>
                Confirmar
              </Button>
            </View>
          </Modal>
        </Portal>

        <Snackbar visible={snack.open} onDismiss={closeToast} duration={2500}>
          {snack.msg}
        </Snackbar>
      </View>
    </PaperProvider>
  );
}
