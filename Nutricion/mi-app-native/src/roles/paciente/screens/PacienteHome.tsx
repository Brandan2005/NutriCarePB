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
import { LineChart } from "react-native-gifted-charts";

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

function formatDateLabel(iso: string) {
  if (!iso || !iso.includes("-")) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isValidTimeHHmm(v: string) {
  if (!/^\d{2}:\d{2}$/.test(v)) return false;
  const [hh, mm] = v.split(":").map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

function StarRating({
  value,
  onChange,
  size = 22,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <IconButton
          key={n}
          icon={n <= value ? "star" : "star-outline"}
          iconColor={n <= value ? "#F59E0B" : "#D1D5DB"}
          size={size}
          onPress={onChange ? () => onChange(n) : undefined}
          style={{ margin: 0 }}
        />
      ))}
    </View>
  );
}

export default function PacienteHome({ email }: { email: string }) {
  const user = auth.currentUser;

  const [snack, setSnack] = useState<{ open: boolean; msg: string }>({ open: false, msg: "" });
  const toast = (msg: string) => setSnack({ open: true, msg });
  const closeToast = () => setSnack({ open: false, msg: "" });

  // Perfil
  const [name, setName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [obraSocial, setObraSocial] = useState<string>("");
  const [photoURL, setPhotoURL] = useState<string>("");

  // Pesos
  const [weights, setWeights] = useState<WeightItem[]>([]);
  const [openWeightModal, setOpenWeightModal] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [newWeightDate, setNewWeightDate] = useState(todayISO());

  // Comidas
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [openMealModal, setOpenMealModal] = useState(false);
  const [mealDate, setMealDate] = useState(todayISO());
  const [mealType, setMealType] = useState("Desayuno");
  const [mealText, setMealText] = useState("");
  const [mealRating, setMealRating] = useState(4);
  const [editingMeal, setEditingMeal] = useState<MealItem | null>(null);

  // Turnos
  const [nutris, setNutris] = useState<NutriItem[]>([]);
  const [selectedNutri, setSelectedNutri] = useState<NutriItem | null>(null);

  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [time, setTime] = useState("15:00");

  const [openCreateAppt, setOpenCreateAppt] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);

  const [myAppointments, setMyAppointments] = useState<AppointmentPatientItem[]>([]);

  // ===== THEME PRO =====
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
      pill: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.violetRing,
        backgroundColor: theme.violetSoft,
      } as any,
      subtleDivider: { backgroundColor: theme.border2 } as any,
      hero: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.violetRing,
        backgroundColor: theme.violetSoft,
      } as any,

      // BOTONES (violeta + texto blanco)
      btnPrimary: { borderRadius: 14 } as any,
      btnPrimaryColor: theme.violet,
      btnPrimaryText: "#FFFFFF",

      btnOutline: { borderRadius: 14, borderColor: theme.violet } as any,
      btnOutlineText: theme.violet,
    }),
    [theme]
  );

  // Calendar marks
  const markedDates = useMemo(() => {
    const marks: any = {};
    marks[selectedDay] = { selected: true, selectedColor: theme.violet };
    return marks;
  }, [selectedDay, theme.violet]);

  // ===== Cargar datos existentes =====
  useEffect(() => {
    if (!user) return;

    const userRef = ref(rtdb, `users/${user.uid}`);
    const weightsRef = ref(rtdb, `weights/${user.uid}`);
    const mealsRef = ref(rtdb, `meals/${user.uid}`);

    const unsubUser = onValue(userRef, (snap) => {
      const data = snap.val() || {};
      setName(data?.name || data?.email?.split("@")?.[0] || "Paciente");
      setPhone(data?.phone || "");
      setObraSocial(data?.obraSocial || "");
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

  // ===== Nutricionistas: role === "nutricionista" (minúscula) =====
  useEffect(() => {
    const q = query(ref(rtdb, "users"), orderByChild("role"), equalTo("nutricionista"));
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
      setSelectedNutri((prev) => prev ?? list[0] ?? null);
    });

    return () => unsub();
  }, []);

  // ===== Mis turnos (index por paciente) =====
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

      list.sort((a, b) => {
        const ka = `${a.date} ${a.time}`;
        const kb = `${b.date} ${b.time}`;
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });

      setMyAppointments(list);
    });

    return () => unsub();
  }, [user]);

  // ===== Gráfico =====
  const chartData = useMemo(() => {
    return weights
      .filter((w) => w.date && !Number.isNaN(w.value) && w.value > 0)
      .map((w) => ({
        value: w.value,
        label: w.date ? w.date.slice(5).split("-").reverse().join("/") : "",
      }));
  }, [weights]);

  const chartMax = useMemo(() => {
    if (chartData.length === 0) return 0;
    const max = Math.max(...chartData.map((d) => d.value));
    return max + 2;
  }, [chartData]);

  // ===== Acciones existentes =====
  async function saveProfile() {
    if (!user) return;
    await update(ref(rtdb, `users/${user.uid}`), {
      name: name.trim(),
      phone: phone.trim(),
      obraSocial: obraSocial.trim(),
    });
    toast("Datos guardados ✅");
  }

  async function addWeight() {
    if (!user) return;
    const value = Number(String(newWeight).replace(",", "."));
    if (!value || value <= 0) {
      toast("Ingresá un peso válido.");
      return;
    }

    const listRef = ref(rtdb, `weights/${user.uid}`);
    const newRef = push(listRef);
    await set(newRef, { value, date: newWeightDate });

    setOpenWeightModal(false);
    setNewWeight("");
    setNewWeightDate(todayISO());
    toast("Peso registrado ✅");
  }

  async function addMeal() {
    if (!user) return;
    if (!mealText.trim()) {
      toast("Escribí qué comiste.");
      return;
    }

    const listRef = ref(rtdb, `meals/${user.uid}`);
    const newRef = push(listRef);
    await set(newRef, {
      date: mealDate,
      mealType,
      text: mealText.trim(),
      rating: mealRating,
    });

    setOpenMealModal(false);
    setMealText("");
    setMealRating(4);
    setMealType("Desayuno");
    setMealDate(todayISO());
    toast("Comida guardada ✅");
  }

  async function saveMealEdit() {
    if (!user || !editingMeal) return;
    await update(ref(rtdb, `meals/${user.uid}/${editingMeal.id}`), {
      date: editingMeal.date,
      mealType: editingMeal.mealType,
      text: editingMeal.text,
      rating: editingMeal.rating,
    });
    setEditingMeal(null);
    toast("Comida actualizada ✅");
  }

  async function deleteMeal(id: string) {
    if (!user) return;
    await remove(ref(rtdb, `meals/${user.uid}/${id}`));
    toast("Comida eliminada 🗑️");
  }

  // ===== TURNOS: crear con anti-choque por slots =====
  async function createAppointment() {
    if (!user) return;
    if (!selectedNutri) {
      toast("Elegí un nutricionista.");
      return;
    }
    if (!isValidTimeHHmm(time)) {
      toast("Hora inválida. Usá HH:MM (ej 15:30).");
      return;
    }

    setBusyCreate(true);
    try {
      const nutriUid = selectedNutri.uid;
      const date = selectedDay;
      const hhmm = time;

      const apptRef = push(ref(rtdb, "appointments"));
      const apptId = apptRef.key!;
      const slotRef = ref(rtdb, `slots/${nutriUid}/${date}/${hhmm}`);

      const tx = await runTransaction(slotRef, (current) => {
        if (current === null) return apptId;
        return; // aborta si ya hay algo
      });

      if (!tx.committed) {
        toast("Ese horario ya está ocupado. Elegí otra hora.");
        return;
      }

      const patientName = name || email?.split("@")?.[0] || "Paciente";
      const nutriName = selectedNutri.name || "Nutricionista";
      const createdAt = Date.now();

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
    } catch (e) {
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
      updates[`slots/${nutriUid}/${date}/${hhmm}`] = null; // libera slot

      await update(ref(rtdb), updates);
      toast("Turno cancelado 🗑️");
    } catch (e) {
      console.log(e);
      toast("No se pudo cancelar.");
    }
  }

  function statusPill(status: AppointmentPatientItem["status"]) {
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

  if (!user) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Cargando usuario...</Text>
      </View>
    );
  }

  return (
    <PaperProvider>
      <View style={{ flex: 1, backgroundColor: theme.pageBg }}>
        {/* HEADER (NEGRO) */}
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
            <Text style={{ color: "#4C1D95", fontSize: 18, fontWeight: "900" }}>
              Hola, {name || "Paciente"} 👋
            </Text>
            <Text style={{ color: "#5B21B6", marginTop: 6, lineHeight: 20 }}>
              Tu panel para registrar comidas, progreso y gestionar turnos.
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
                Pesos: {weights.length ? `${weights[weights.length - 1].value} kg` : "—"}
              </Chip>
            </View>
          </View>

          {/* GRID 1: PERFIL + ACCIONES */}
          <View style={{ marginTop: 12, flexDirection: isWide ? "row" : "column", gap: 12 }}>
            {/* PERFIL */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Datos del perfil</Text>
                <Text style={{ color: theme.muted, marginTop: 6 }}>Mantené tu info actualizada.</Text>
                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                <TextInput
                  label="Nombre"
                  value={name}
                  onChangeText={setName}
                  mode="outlined"
                  style={{ marginBottom: 10, backgroundColor: "#FFF" }}
                  outlineColor={theme.border}
                  activeOutlineColor={theme.violet}
                  textColor={theme.text}
                />
                <TextInput
                  label="Teléfono"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  mode="outlined"
                  style={{ marginBottom: 10, backgroundColor: "#FFF" }}
                  outlineColor={theme.border}
                  activeOutlineColor={theme.violet}
                  textColor={theme.text}
                />
                <TextInput
                  label="Obra social"
                  value={obraSocial}
                  onChangeText={setObraSocial}
                  mode="outlined"
                  style={{ marginBottom: 10, backgroundColor: "#FFF" }}
                  outlineColor={theme.border}
                  activeOutlineColor={theme.violet}
                  textColor={theme.text}
                />

                <Button
                  mode="contained"
                  style={styles.btnPrimary}
                  buttonColor={styles.btnPrimaryColor}
                  textColor={styles.btnPrimaryText}
                  onPress={saveProfile}
                >
                  Guardar datos
                </Button>
              </Card.Content>
            </Card>

            {/* ACCIONES */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Acciones rápidas</Text>
                <Text style={{ color: theme.muted, marginTop: 6, lineHeight: 22 }}>
                  Registrá tu progreso y mantené consistencia.
                </Text>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <Button
                    mode="contained"
                    style={styles.btnPrimary}
                    buttonColor={styles.btnPrimaryColor}
                    textColor={styles.btnPrimaryText}
                    onPress={() => setOpenWeightModal(true)}
                  >
                    Medir peso
                  </Button>

                  <Button
                    mode="outlined"
                    style={styles.btnOutline}
                    textColor={styles.btnOutlineText}
                    onPress={() => setOpenMealModal(true)}
                  >
                    Agregar comida
                  </Button>
                </View>

                <View
                  style={{
                    marginTop: 14,
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border2,
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  <Text style={{ color: theme.muted, lineHeight: 20 }}>
                    Tip: Cargá comidas y peso seguido para ver tu progreso más claro 📈
                  </Text>
                </View>
              </Card.Content>
            </Card>
          </View>

          {/* PROGRESO DE PESO (GRÁFICO) */}
          <View style={{ marginTop: 12 }}>
            <Card style={styles.sectionCard}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Progreso de peso</Text>
                <Text style={{ color: theme.muted, marginTop: 6 }}>Visualizá tu evolución por fecha.</Text>

                <View style={{ marginTop: 12 }}>
                  {chartData.length >= 2 ? (
                    <View
                      style={{
                        backgroundColor: "#FFFFFF",
                        borderRadius: 18,
                        paddingVertical: 10,
                        paddingHorizontal: 8,
                        borderWidth: 1,
                        borderColor: theme.border2,
                      }}
                    >
                      <LineChart
                        data={chartData}
                        spacing={44}
                        initialSpacing={10}
                        thickness={3}
                        curved
                        hideDataPoints={false}
                        dataPointsHeight={8}
                        dataPointsWidth={8}
                        yAxisTextStyle={{ color: theme.muted }}
                        xAxisLabelTextStyle={{ color: theme.muted, fontSize: 12 }}
                        yAxisLabelSuffix="kg"
                        noOfSections={4}
                        maxValue={chartMax}
                        rulesType="solid"
                        showVerticalLines={false}
                        height={220}
                      />
                    </View>
                  ) : (
                    <View
                      style={{
                        padding: 16,
                        backgroundColor: "#FFFFFF",
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: theme.border2,
                      }}
                    >
                      <Text style={{ color: theme.muted }}>Cargá al menos 2 registros de peso para ver el gráfico.</Text>
                    </View>
                  )}
                </View>
              </Card.Content>
            </Card>
          </View>

          {/* COMIDAS */}
          <View style={{ marginTop: 12 }}>
            <Card style={styles.sectionCard}>
              <Card.Content>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Comidas</Text>
                    <Text style={{ color: theme.muted, marginTop: 4 }}>Historial por fecha con experiencia ⭐</Text>
                  </View>

                  <Button
                    mode="contained"
                    style={styles.btnPrimary}
                    buttonColor={styles.btnPrimaryColor}
                    textColor={styles.btnPrimaryText}
                    onPress={() => setOpenMealModal(true)}
                  >
                    Agregar
                  </Button>
                </View>

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                {meals.length === 0 ? (
                  <Text style={{ color: theme.muted }}>Todavía no cargaste comidas. Tocá “Agregar”.</Text>
                ) : (
                  <View style={{ gap: 10 }}>
                    {meals.map((m) => (
                      <Card key={m.id} style={styles.innerCard}>
                        <Card.Content>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <Text style={{ fontWeight: "900", color: theme.text }}>
                                  {formatDateLabel(m.date)} · {m.mealType}
                                </Text>
                                <View
                                  style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                    borderRadius: 999,
                                    backgroundColor: theme.violetSoft,
                                    borderWidth: 1,
                                    borderColor: theme.violetRing,
                                  }}
                                >
                                  <Text style={{ color: "#4C1D95", fontSize: 12, fontWeight: "800" }}>⭐ {m.rating}/5</Text>
                                </View>
                              </View>

                              <Text style={{ marginTop: 8, color: theme.muted, lineHeight: 20 }}>{m.text}</Text>

                              <View style={{ marginTop: 8 }}>
                                <StarRating value={m.rating} />
                              </View>
                            </View>

                            <View style={{ flexDirection: "row" }}>
                              <IconButton icon="pencil" iconColor={theme.violet} onPress={() => setEditingMeal({ ...m })} />
                              <IconButton icon="trash-can-outline" iconColor={theme.danger} onPress={() => deleteMeal(m.id)} />
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

          {/* TURNOS (CALENDARIO + PEDIR + LISTA) */}
          <View style={{ marginTop: 12 }}>
            <Card style={styles.sectionCard}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Turnos</Text>
                <Text style={{ color: theme.muted, marginTop: 6 }}>
                  Elegí nutricionista + fecha + hora. Si el horario ya está ocupado, te avisa.
                </Text>

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                {/* NUTRIS */}
                {nutris.length === 0 ? (
                  <Text style={{ color: theme.muted }}>
                    No hay nutricionistas cargados (role="nutricionista").
                  </Text>
                ) : (
                  <View style={{ gap: 10 }}>
                    <Text style={{ fontWeight: "900", color: theme.text }}>Nutricionista</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {nutris.map((n) => {
                        const active = selectedNutri?.uid === n.uid;
                        return (
                          <Button
                            key={n.uid}
                            mode={active ? "contained" : "outlined"}
                            onPress={() => setSelectedNutri(n)}
                            style={{ borderRadius: 999, borderColor: theme.violet }}
                            buttonColor={active ? theme.violet : undefined}
                            textColor={active ? "#FFFFFF" : theme.violet}
                          >
                            {n.name}
                          </Button>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* CALENDARIO */}
                <View style={{ marginTop: 12 }}>
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

                {/* HORA + BOTÓN */}
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
                  style={[styles.btnPrimary, { marginTop: 12 }]}
                  buttonColor={styles.btnPrimaryColor}
                  textColor={styles.btnPrimaryText}
                  onPress={() => setOpenCreateAppt(true)}
                  disabled={!selectedNutri}
                >
                  Solicitar turno
                </Button>

                {/* MIS TURNOS */}
                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: "900" }}>Mis turnos</Text>

                {myAppointments.length === 0 ? (
                  <Text style={{ color: theme.muted, marginTop: 8 }}>Todavía no pediste turnos.</Text>
                ) : (
                  <View style={{ gap: 10, marginTop: 10 }}>
                    {myAppointments.map((a) => (
                      <Card key={a.id} style={styles.innerCard}>
                        <Card.Content>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ fontWeight: "900", color: theme.text }}>
                                {a.nutriName} · {formatDateLabel(a.date)} {a.time}
                              </Text>
                              {statusPill(a.status)}
                            </View>

                            <IconButton
                              icon="close-circle-outline"
                              iconColor={theme.danger}
                              onPress={() => cancelMyAppointment(a)}
                              disabled={a.status === "cancelado" || a.status === "asistio" || a.status === "no_asistio"}
                            />
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

        {/* MODAL PESO */}
        <Portal>
          <Modal
            visible={openWeightModal}
            onDismiss={() => setOpenWeightModal(false)}
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
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Registrar peso</Text>
            <Text style={{ color: theme.muted, marginTop: 6 }}>Guardalo y se verá en tu gráfico.</Text>

            <TextInput
              label="Peso (kg)"
              value={newWeight}
              onChangeText={setNewWeight}
              keyboardType="numeric"
              style={{ marginTop: 12, backgroundColor: "#FFFFFF" }}
              outlineColor={theme.border}
              activeOutlineColor={theme.violet}
              textColor={theme.text}
              mode="outlined"
            />

            <TextInput
              label="Fecha (YYYY-MM-DD)"
              value={newWeightDate}
              onChangeText={setNewWeightDate}
              style={{ marginTop: 10, backgroundColor: "#FFFFFF" }}
              outlineColor={theme.border}
              activeOutlineColor={theme.violet}
              textColor={theme.text}
              mode="outlined"
            />

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <Button onPress={() => setOpenWeightModal(false)} textColor={theme.text}>
                Cancelar
              </Button>
              <Button
                mode="contained"
                onPress={addWeight}
                style={{ borderRadius: 12 }}
                buttonColor={theme.violet}
                textColor="#FFFFFF"
              >
                Guardar
              </Button>
            </View>
          </Modal>
        </Portal>

        {/* MODAL COMIDA */}
        <Portal>
          <Modal
            visible={openMealModal}
            onDismiss={() => setOpenMealModal(false)}
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
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Agregar comida</Text>
            <Text style={{ color: theme.muted, marginTop: 6 }}>Fecha, tipo de comida y experiencia.</Text>

            <TextInput
              label="Fecha (YYYY-MM-DD)"
              value={mealDate}
              onChangeText={setMealDate}
              style={{ marginTop: 12, backgroundColor: "#FFFFFF" }}
              outlineColor={theme.border}
              activeOutlineColor={theme.violet}
              textColor={theme.text}
              mode="outlined"
            />

            <TextInput
              label="Tipo (Desayuno/Almuerzo/Merienda/Cena)"
              value={mealType}
              onChangeText={setMealType}
              style={{ marginTop: 10, backgroundColor: "#FFFFFF" }}
              outlineColor={theme.border}
              activeOutlineColor={theme.violet}
              textColor={theme.text}
              mode="outlined"
            />

            <TextInput
              label="¿Qué comiste?"
              value={mealText}
              onChangeText={setMealText}
              multiline
              style={{ marginTop: 10, backgroundColor: "#FFFFFF" }}
              outlineColor={theme.border}
              activeOutlineColor={theme.violet}
              textColor={theme.text}
              mode="outlined"
            />

            <View style={{ marginTop: 10 }}>
              <Text style={{ fontWeight: "900", color: theme.text }}>Experiencia</Text>
              <StarRating value={mealRating} onChange={setMealRating} />
            </View>

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <Button onPress={() => setOpenMealModal(false)} textColor={theme.text}>
                Cancelar
              </Button>
              <Button
                mode="contained"
                onPress={addMeal}
                style={{ borderRadius: 12 }}
                buttonColor={theme.violet}
                textColor="#FFFFFF"
              >
                Guardar
              </Button>
            </View>
          </Modal>
        </Portal>

        {/* MODAL EDITAR COMIDA */}
        <Portal>
          <Modal
            visible={!!editingMeal}
            onDismiss={() => setEditingMeal(null)}
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
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Editar comida</Text>

            <TextInput
              label="Fecha (YYYY-MM-DD)"
              value={editingMeal?.date || ""}
              onChangeText={(t) => setEditingMeal((p) => (p ? { ...p, date: t } : p))}
              style={{ marginTop: 12, backgroundColor: "#FFFFFF" }}
              outlineColor={theme.border}
              activeOutlineColor={theme.violet}
              textColor={theme.text}
              mode="outlined"
            />

            <TextInput
              label="Tipo"
              value={editingMeal?.mealType || ""}
              onChangeText={(t) => setEditingMeal((p) => (p ? { ...p, mealType: t } : p))}
              style={{ marginTop: 10, backgroundColor: "#FFFFFF" }}
              outlineColor={theme.border}
              activeOutlineColor={theme.violet}
              textColor={theme.text}
              mode="outlined"
            />

            <TextInput
              label="Texto"
              value={editingMeal?.text || ""}
              onChangeText={(t) => setEditingMeal((p) => (p ? { ...p, text: t } : p))}
              multiline
              style={{ marginTop: 10, backgroundColor: "#FFFFFF" }}
              outlineColor={theme.border}
              activeOutlineColor={theme.violet}
              textColor={theme.text}
              mode="outlined"
            />

            <View style={{ marginTop: 10 }}>
              <Text style={{ fontWeight: "900", color: theme.text }}>Experiencia</Text>
              <StarRating
                value={editingMeal?.rating || 0}
                onChange={(v) => setEditingMeal((p) => (p ? { ...p, rating: v } : p))}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <Button onPress={() => setEditingMeal(null)} textColor={theme.text}>
                Cancelar
              </Button>
              <Button
                mode="contained"
                onPress={saveMealEdit}
                style={{ borderRadius: 12 }}
                buttonColor={theme.violet}
                textColor="#FFFFFF"
              >
                Guardar cambios
              </Button>
            </View>
          </Modal>
        </Portal>

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
              Nutricionista: <Text style={{ fontWeight: "900", color: theme.text }}>{selectedNutri?.name || "-"}</Text>
              {"\n"}Fecha: <Text style={{ fontWeight: "900", color: theme.text }}>{formatDateLabel(selectedDay)}</Text>
              {"\n"}Hora: <Text style={{ fontWeight: "900", color: theme.text }}>{time}</Text>
            </Text>

            <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end" }}>
              <Button onPress={() => setOpenCreateAppt(false)} textColor={theme.text}>
                Volver
              </Button>
              <Button
                mode="contained"
                onPress={createAppointment}
                loading={busyCreate}
                style={{ borderRadius: 12 }}
                buttonColor={theme.violet}
                textColor="#FFFFFF"
              >
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
