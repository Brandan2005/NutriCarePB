import React, { useEffect, useMemo, useState } from "react";
import { View, ScrollView, Image, Dimensions, Pressable } from "react-native";
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
  SegmentedButtons,
} from "react-native-paper";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import { onValue, ref, push, set, update, remove } from "firebase/database";
import { Calendar } from "react-native-calendars";
import { LineChart } from "react-native-gifted-charts";

import { auth, rtdb } from "../../../shared/services/firebase";
import { sendAppointmentEmail } from "../../../shared/services/emailjs";
import {
  Appointment,
  bookAppointmentAtomic,
  cancelAppointment,
  getBookedSlotsForDay,
  listenAppointmentsByPatient,
} from "../../../shared/services/appointments";
import { getNutritionists, generateSlotsForNutri, Nutritionist } from "../../../shared/services/nutritionists";

type WeightItem = { id: string; value: number; date: string };

type MealExperience = {
  general: number;
  saciedad: number;
  energia: number;
  digestion: number;
  antojos: number;
  plan: number;
};

type MealItem = {
  id: string;
  date: string;
  mealType: string;
  text: string;
  exp: MealExperience;
};

const { width } = Dimensions.get("window");
const isWide = width >= 900;

function formatDateLabel(iso: string) {
  if (!iso || !iso.includes("-")) return iso;
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isMorning(time: string) {
  const [hh] = time.split(":").map(Number);
  return hh < 12;
}

function StarRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ fontWeight: "900" }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <IconButton
            key={n}
            icon={n <= value ? "star" : "star-outline"}
            iconColor={n <= value ? "#F59E0B" : "#D1D5DB"}
            size={22}
            onPress={() => onChange(n)}
            style={{ margin: 0 }}
          />
        ))}
      </View>
    </View>
  );
}

export default function PacienteHome({ email }: { email: string }) {
  const user = auth.currentUser;

  const [snack, setSnack] = useState<{ open: boolean; msg: string }>({ open: false, msg: "" });
  const toast = (msg: string) => setSnack({ open: true, msg });

  // ====== THEME (white + violet, header black) ======
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
      primaryBtn: {
        borderRadius: 14,
        backgroundColor: theme.violet,
      } as any,
      secondaryBtn: {
        borderRadius: 14,
        borderColor: theme.violet,
      } as any,
      subtleDivider: {
        backgroundColor: theme.border2,
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

  // ====== Profile ======
  const [name, setName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [obraSocial, setObraSocial] = useState<string>("");
  const [photoURL, setPhotoURL] = useState<string>("");

  // ====== Weights ======
  const [weights, setWeights] = useState<WeightItem[]>([]);
  const [openWeightModal, setOpenWeightModal] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [newWeightDate, setNewWeightDate] = useState(todayISO());

  // ====== Meals ======
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [openMealModal, setOpenMealModal] = useState(false);
  const [mealDate, setMealDate] = useState(todayISO());
  const [mealType, setMealType] = useState("Desayuno");
  const [mealText, setMealText] = useState("");

  const [expGeneral, setExpGeneral] = useState(4);
  const [expSaciedad, setExpSaciedad] = useState(4);
  const [expEnergia, setExpEnergia] = useState(4);
  const [expDigestion, setExpDigestion] = useState(4);
  const [expAntojos, setExpAntojos] = useState(4);
  const [expPlan, setExpPlan] = useState(4);

  const [editingMeal, setEditingMeal] = useState<MealItem | null>(null);

  // ====== Calendar & Appointments ======
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [nutris, setNutris] = useState<Nutritionist[]>([]);
  const [selectedNutri, setSelectedNutri] = useState<Nutritionist | null>(null);

  const [filter, setFilter] = useState<"all" | "morning" | "afternoon">("all");
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [creatingAppointment, setCreatingAppointment] = useState(false);

  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);

  const markedDates = useMemo(() => {
    const marks: any = {};
    marks[selectedDay] = { selected: true, selectedColor: theme.violet };
    return marks;
  }, [selectedDay, theme.violet]);

  // ====== Load user + data ======
  useEffect(() => {
    if (!user) return;

    const userRef = ref(rtdb, `users/${user.uid}`);
    const weightsRef = ref(rtdb, `weights/${user.uid}`);
    const mealsRef = ref(rtdb, `meals/${user.uid}`);

    const unsubUser = onValue(userRef, (snap) => {
      const data = snap.val();
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
        exp: {
          general: Number(val[id]?.exp?.general ?? val[id]?.rating ?? 4),
          saciedad: Number(val[id]?.exp?.saciedad ?? 4),
          energia: Number(val[id]?.exp?.energia ?? 4),
          digestion: Number(val[id]?.exp?.digestion ?? 4),
          antojos: Number(val[id]?.exp?.antojos ?? 4),
          plan: Number(val[id]?.exp?.plan ?? 4),
        },
      }));
      list.sort((a, b) => (a.date > b.date ? -1 : 1));
      setMeals(list);
    });

    const unsubAppts = listenAppointmentsByPatient(user.uid, setMyAppointments);

    return () => {
      unsubUser();
      unsubWeights();
      unsubMeals();
      unsubAppts();
    };
  }, [user]);

  // ====== Load nutritionists ======
  useEffect(() => {
    (async () => {
      try {
        const list = await getNutritionists();
        setNutris(list);
        setSelectedNutri((prev) => prev ?? list[0] ?? null);
      } catch {
        // ignore
      }
    })();
  }, []);

  // ====== Refresh booked slots for selected day (global) ======
  useEffect(() => {
    (async () => {
      try {
        const set = await getBookedSlotsForDay(selectedDay);
        setBookedSlots(set);
      } catch {
        setBookedSlots(new Set());
      }
    })();
  }, [selectedDay]);

  const chartData = useMemo(() => {
    return weights
      .filter((w) => w.date && !Number.isNaN(w.value) && w.value > 0)
      .map((w) => ({ value: w.value, label: formatDateLabel(w.date) }));
  }, [weights]);

  const chartMax = useMemo(() => {
    if (chartData.length === 0) return 0;
    return Math.max(...chartData.map((d) => d.value)) + 2;
  }, [chartData]);

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
    if (!value || value <= 0) return toast("Ingresá un peso válido.");

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
    if (!mealText.trim()) return toast("Escribí qué comiste.");

    const listRef = ref(rtdb, `meals/${user.uid}`);
    const newRef = push(listRef);

    await set(newRef, {
      date: mealDate,
      mealType,
      text: mealText.trim(),
      exp: {
        general: expGeneral,
        saciedad: expSaciedad,
        energia: expEnergia,
        digestion: expDigestion,
        antojos: expAntojos,
        plan: expPlan,
      },
    });

    setOpenMealModal(false);
    setMealText("");
    setMealType("Desayuno");
    setMealDate(todayISO());

    setExpGeneral(4);
    setExpSaciedad(4);
    setExpEnergia(4);
    setExpDigestion(4);
    setExpAntojos(4);
    setExpPlan(4);

    toast("Comida guardada ✅");
  }

  async function saveMealEdit() {
    if (!user || !editingMeal) return;
    await update(ref(rtdb, `meals/${user.uid}/${editingMeal.id}`), {
      date: editingMeal.date,
      mealType: editingMeal.mealType,
      text: editingMeal.text,
      exp: editingMeal.exp,
    });
    setEditingMeal(null);
    toast("Comida actualizada ✅");
  }

  async function deleteMeal(id: string) {
    if (!user) return;
    await remove(ref(rtdb, `meals/${user.uid}/${id}`));
    toast("Comida eliminada 🗑️");
  }

  const availableSlots = useMemo(() => {
    if (!selectedNutri) return [];
    let list = generateSlotsForNutri(selectedNutri, selectedDay);

    if (filter === "morning") list = list.filter(isMorning);
    if (filter === "afternoon") list = list.filter((t) => !isMorning(t));

    return list;
  }, [selectedNutri, selectedDay, filter]);

  async function requestAppointment(time: string) {
    if (!user || !selectedNutri) return;

    setCreatingAppointment(true);
    try {
      const apptBase = {
        patientUid: user.uid,
        patientEmail: user.email || email,
        patientName: name || "Paciente",
        nutritionistUid: selectedNutri.uid,
        nutritionistName: selectedNutri.name,
        date: selectedDay,
        time,
      };

      const appt = await bookAppointmentAtomic(apptBase);

      // actualizar booked locally
      setBookedSlots((prev) => new Set([...Array.from(prev), time]));

      // enviar mail al paciente
      await sendAppointmentEmail({
        to_email: appt.patientEmail,
        patient_name: appt.patientName,
        nutritionist_name: appt.nutritionistName,
        date: appt.date,
        time: appt.time,
      });

      toast("Turno solicitado ✅ Te enviamos un mail con el detalle.");
    } catch (e: any) {
      const msg = String(e?.message || "No se pudo reservar.");
      toast(msg);
    } finally {
      setCreatingAppointment(false);
    }
  }

  async function onCancelAppt(appt: Appointment) {
    try {
      await cancelAppointment(appt);
      toast("Turno cancelado ✅");
    } catch {
      toast("No se pudo cancelar el turno.");
    }
  }

  const myUpcoming = useMemo(() => {
    const now = Date.now();
    return myAppointments
      .filter((a) => a.status === "requested" && (a.startAt || 0) >= now)
      .slice(0, 5);
  }, [myAppointments]);

  return (
    <PaperProvider>
      <View style={{ flex: 1, backgroundColor: theme.pageBg }}>
        {/* HEADER */}
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            flexDirection: isWide ? "row" : "column",
            alignItems: isWide ? "center" : "stretch",
            justifyContent: "space-between",
            backgroundColor: theme.headerBg,
            borderBottomWidth: 1,
            borderColor: theme.headerBorder,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable onPress={() => router.push("/")}>
              <Image
                source={require("../../../../assets/images/icon.png")}
                style={{ width: 36, height: 36, borderRadius: 12 }}
              />
            </Pressable>

            <View>
              <Text variant="titleMedium" style={{ color: theme.headerText, fontWeight: "900" }}>
                NutriCare
              </Text>
              <Text style={{ color: theme.headerMuted, marginTop: -2, fontSize: 12 }}>
                Panel Paciente
              </Text>
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: isWide ? "flex-end" : "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {photoURL ? (
                <Avatar.Image size={36} source={{ uri: photoURL }} />
              ) : (
                <Avatar.Text size={36} label={(name || "P")[0]?.toUpperCase()} />
              )}

              <View style={{ maxWidth: 220 }}>
                <Text style={{ fontWeight: "900", color: theme.headerText, lineHeight: 18 }} numberOfLines={1}>
                  {name || "Paciente"}
                </Text>
                <Text style={{ color: theme.headerMuted, fontSize: 11 }} numberOfLines={1}>
                  {user?.email || email}
                </Text>
              </View>
            </View>

            <Button mode="text" textColor="#FCA5A5" onPress={() => signOut(auth)}>
              Cerrar sesión
            </Button>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
          {/* HERO */}
          <View style={styles.hero}>
            <Text style={{ color: "#4C1D95", fontSize: 18, fontWeight: "900" }}>
              Hola, {name || "Paciente"} 👋
            </Text>
            <Text style={{ color: "#5B21B6", marginTop: 6, lineHeight: 20 }}>
              Tu panel personal para registrar comidas, progreso y turnos.
            </Text>

            <View style={{ marginTop: 12, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Chip style={styles.pill} textStyle={{ color: "#4C1D95", fontWeight: "900" }}>
                Peso: {weights.length ? `${weights[weights.length - 1].value} kg` : "—"}
              </Chip>
              <Chip
                style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.border2, backgroundColor: "#FFFFFF" }}
                textStyle={{ color: theme.text, fontWeight: "900" }}
              >
                Comidas: {meals.length}
              </Chip>
              <Chip
                style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.border2, backgroundColor: "#FFFFFF" }}
                textStyle={{ color: theme.text, fontWeight: "900" }}
              >
                Próximos turnos: {myUpcoming.length}
              </Chip>
            </View>
          </View>

          {/* TOP GRID */}
          <View style={{ marginTop: 12, flexDirection: isWide ? "row" : "column", gap: 12 }}>
            {/* PERFIL */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Datos del perfil</Text>
                <Text style={{ color: theme.muted, marginTop: 6 }}>
                  Mantené tus datos actualizados para tu seguimiento.
                </Text>

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

                <Button mode="contained" style={styles.primaryBtn} textColor="#FFFFFF" onPress={saveProfile}>
                  Guardar datos
                </Button>
              </Card.Content>
            </Card>

            {/* ACCIONES + MIS TURNOS */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Acciones rápidas</Text>
                <Text style={{ color: theme.muted, marginTop: 6, lineHeight: 22 }}>
                  Registrá tu progreso y mantené consistencia.
                </Text>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <Button mode="contained" style={styles.primaryBtn} textColor="#FFFFFF" onPress={() => setOpenWeightModal(true)}>
                    Medir peso
                  </Button>

                  <Button mode="outlined" style={styles.secondaryBtn} textColor={theme.violet} onPress={() => setOpenMealModal(true)}>
                    Agregar comida
                  </Button>
                </View>

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                <Text style={{ color: theme.text, fontSize: 15, fontWeight: "900" }}>Tus próximos turnos</Text>
                {myUpcoming.length === 0 ? (
                  <Text style={{ color: theme.muted, marginTop: 8 }}>No tenés turnos próximos.</Text>
                ) : (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    {myUpcoming.map((a) => (
                      <View
                        key={a.id}
                        style={{
                          padding: 12,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: theme.border2,
                          backgroundColor: "#FFF",
                        }}
                      >
                        <Text style={{ fontWeight: "900", color: theme.text }}>
                          {a.date} · {a.time}
                        </Text>
                        <Text style={{ color: theme.muted, marginTop: 2 }}>
                          Con: {a.nutritionistName}
                        </Text>
                        <Button
                          mode="text"
                          textColor={theme.danger}
                          onPress={() => onCancelAppt(a)}
                          style={{ alignSelf: "flex-start", marginTop: 6 }}
                        >
                          Cancelar
                        </Button>
                      </View>
                    ))}
                  </View>
                )}
              </Card.Content>
            </Card>
          </View>

          {/* CHART */}
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

          {/* COMIDAS + TURNOS */}
          <View style={{ marginTop: 12, flexDirection: isWide ? "row" : "column", gap: 12 }}>
            {/* COMIDAS (scroll propio) */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Comidas</Text>
                    <Text style={{ color: theme.muted, marginTop: 4 }}>Historial por fecha + experiencia ⭐</Text>
                  </View>

                  <Button mode="contained" style={styles.primaryBtn} textColor="#FFFFFF" onPress={() => setOpenMealModal(true)}>
                    Agregar
                  </Button>
                </View>

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                {meals.length === 0 ? (
                  <Text style={{ color: theme.muted }}>Todavía no cargaste comidas. Tocá “Agregar”.</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10 }}>
                    {meals.map((m) => (
                      <Card key={m.id} style={{ borderRadius: 18, backgroundColor: "#FFF", borderWidth: 1, borderColor: theme.border2 }}>
                        <Card.Content>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontWeight: "900", color: theme.text }}>
                                {formatDateLabel(m.date)} · {m.mealType}
                              </Text>

                              <Text style={{ marginTop: 8, color: theme.muted, lineHeight: 20 }}>
                                {m.text}
                              </Text>

                              <View style={{ marginTop: 10, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.border2, backgroundColor: "#FFF" }}>
                                <Text style={{ fontWeight: "900", color: theme.text }}>Experiencia</Text>

                                <View style={{ marginTop: 6 }}>
                                  <Text style={{ color: theme.muted, marginTop: 6 }}>General</Text>
                                  <Text style={{ fontWeight: "900" }}>
                                    ⭐ {m.exp.general}/5
                                  </Text>

                                  <Text style={{ color: theme.muted, marginTop: 6 }}>Saciedad</Text>
                                  <Text style={{ fontWeight: "900" }}>
                                    ⭐ {m.exp.saciedad}/5
                                  </Text>

                                  <Text style={{ color: theme.muted, marginTop: 6 }}>Energía</Text>
                                  <Text style={{ fontWeight: "900" }}>
                                    ⭐ {m.exp.energia}/5
                                  </Text>

                                  <Text style={{ color: theme.muted, marginTop: 6 }}>Digestión</Text>
                                  <Text style={{ fontWeight: "900" }}>
                                    ⭐ {m.exp.digestion}/5
                                  </Text>

                                  <Text style={{ color: theme.muted, marginTop: 6 }}>Ansiedad / Antojos</Text>
                                  <Text style={{ fontWeight: "900" }}>
                                    ⭐ {m.exp.antojos}/5
                                  </Text>

                                  <Text style={{ color: theme.muted, marginTop: 6 }}>Cumplimiento del plan</Text>
                                  <Text style={{ fontWeight: "900" }}>
                                    ⭐ {m.exp.plan}/5
                                  </Text>
                                </View>
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
                  </ScrollView>
                )}
              </Card.Content>
            </Card>

            {/* TURNOS */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Turnos</Text>
                <Text style={{ color: theme.muted, marginTop: 6, lineHeight: 20 }}>
                  Elegí un día y un horario. Los turnos ocupados no se pueden seleccionar.
                </Text>

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

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                <Text style={{ fontWeight: "900", color: theme.text }}>Nutricionista</Text>
                {nutris.length === 0 ? (
                  <Text style={{ color: theme.muted, marginTop: 8 }}>
                    No hay nutricionistas cargados (role="nutricionista").
                  </Text>
                ) : (
                  <View style={{ marginTop: 8, gap: 8 }}>
                    {nutris.map((n) => {
                      const active = selectedNutri?.uid === n.uid;
                      return (
                        <Button
                          key={n.uid}
                          mode={active ? "contained" : "outlined"}
                          style={{
                            borderRadius: 14,
                            backgroundColor: active ? theme.violet : undefined,
                            borderColor: theme.violet,
                          }}
                          textColor={active ? "#FFFFFF" : theme.violet}
                          onPress={() => setSelectedNutri(n)}
                        >
                          {n.name}
                        </Button>
                      );
                    })}
                  </View>
                )}

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                <Text style={{ fontWeight: "900", color: theme.text }}>Filtrar horarios</Text>
                <View style={{ marginTop: 10 }}>
                  <SegmentedButtons
                    value={filter}
                    onValueChange={(v) => setFilter(v as any)}
                    buttons={[
                      { value: "all", label: "Todos" },
                      { value: "morning", label: "Mañana" },
                      { value: "afternoon", label: "Tarde" },
                    ]}
                  />
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: theme.muted }}>
                    Seleccionado: <Text style={{ color: theme.text, fontWeight: "900" }}>{selectedDay}</Text>
                  </Text>

                  {!selectedNutri ? (
                    <Text style={{ color: theme.muted, marginTop: 10 }}>Elegí un nutricionista.</Text>
                  ) : availableSlots.length === 0 ? (
                    <Text style={{ color: theme.muted, marginTop: 10 }}>
                      No hay horarios configurados para este día (revisá availability).
                    </Text>
                  ) : (
                    <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                      {availableSlots.map((time) => {
                        const taken = bookedSlots.has(time);
                        return (
                          <Button
                            key={time}
                            mode={taken ? "outlined" : "contained"}
                            disabled={taken || creatingAppointment}
                            onPress={() => requestAppointment(time)}
                            style={{
                              borderRadius: 14,
                              backgroundColor: taken ? undefined : theme.violet,
                              borderColor: taken ? theme.border : theme.violet,
                            }}
                            textColor={taken ? theme.muted : "#FFFFFF"}
                          >
                            {time} {taken ? "· Ocupado" : ""}
                          </Button>
                        );
                      })}
                    </View>
                  )}
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
                    Tip: si un horario está ocupado, es porque alguien ya lo reservó para ese día y hora.
                  </Text>
                </View>
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
              margin: 14,
              padding: 16,
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
              mode="outlined"
              style={{ marginTop: 12, backgroundColor: "#FFFFFF" }}
              outlineColor={theme.border}
              activeOutlineColor={theme.violet}
              textColor={theme.text}
            />

            <TextInput
              label="Fecha (YYYY-MM-DD)"
              value={newWeightDate}
              onChangeText={setNewWeightDate}
              mode="outlined"
              style={{ marginTop: 10, backgroundColor: "#FFFFFF" }}
              outlineColor={theme.border}
              activeOutlineColor={theme.violet}
              textColor={theme.text}
            />

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <Button onPress={() => setOpenWeightModal(false)} textColor={theme.text}>
                Cancelar
              </Button>
              <Button mode="contained" onPress={addWeight} style={{ borderRadius: 12, backgroundColor: theme.violet }} textColor="#FFFFFF">
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
              margin: 14,
              padding: 16,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: theme.border2,
              ...theme.shadow,
            }}
          >
            <ScrollView>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Agregar comida</Text>
              <Text style={{ color: theme.muted, marginTop: 6 }}>Fecha, tipo y experiencia.</Text>

              <TextInput
                label="Fecha (YYYY-MM-DD)"
                value={mealDate}
                onChangeText={setMealDate}
                mode="outlined"
                style={{ marginTop: 12, backgroundColor: "#FFFFFF" }}
                outlineColor={theme.border}
                activeOutlineColor={theme.violet}
                textColor={theme.text}
              />

              <TextInput
                label="Tipo (Desayuno/Almuerzo/Merienda/Cena)"
                value={mealType}
                onChangeText={setMealType}
                mode="outlined"
                style={{ marginTop: 10, backgroundColor: "#FFFFFF" }}
                outlineColor={theme.border}
                activeOutlineColor={theme.violet}
                textColor={theme.text}
              />

              <TextInput
                label="¿Qué comiste?"
                value={mealText}
                onChangeText={setMealText}
                multiline
                mode="outlined"
                style={{ marginTop: 10, backgroundColor: "#FFFFFF" }}
                outlineColor={theme.border}
                activeOutlineColor={theme.violet}
                textColor={theme.text}
              />

              <View style={{ marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.border2 }}>
                <Text style={{ fontWeight: "900", color: theme.text }}>Experiencia</Text>
                <StarRow label="General" value={expGeneral} onChange={setExpGeneral} />
                <StarRow label="Saciedad" value={expSaciedad} onChange={setExpSaciedad} />
                <StarRow label="Energía" value={expEnergia} onChange={setExpEnergia} />
                <StarRow label="Digestión" value={expDigestion} onChange={setExpDigestion} />
                <StarRow label="Ansiedad / Antojos" value={expAntojos} onChange={setExpAntojos} />
                <StarRow label="Cumplimiento del plan" value={expPlan} onChange={setExpPlan} />
              </View>

              <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
                <Button onPress={() => setOpenMealModal(false)} textColor={theme.text}>
                  Cancelar
                </Button>
                <Button
                  mode="contained"
                  onPress={addMeal}
                  style={{ borderRadius: 12, backgroundColor: theme.violet }}
                  textColor="#FFFFFF"
                >
                  Guardar
                </Button>
              </View>
            </ScrollView>
          </Modal>
        </Portal>

        {/* MODAL EDIT */}
        <Portal>
          <Modal
            visible={!!editingMeal}
            onDismiss={() => setEditingMeal(null)}
            contentContainerStyle={{
              backgroundColor: "#FFFFFF",
              margin: 14,
              padding: 16,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: theme.border2,
              ...theme.shadow,
            }}
          >
            <ScrollView>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Editar comida</Text>

              <TextInput
                label="Fecha (YYYY-MM-DD)"
                value={editingMeal?.date || ""}
                onChangeText={(t) => setEditingMeal((p) => (p ? { ...p, date: t } : p))}
                mode="outlined"
                style={{ marginTop: 12, backgroundColor: "#FFFFFF" }}
                outlineColor={theme.border}
                activeOutlineColor={theme.violet}
                textColor={theme.text}
              />

              <TextInput
                label="Tipo"
                value={editingMeal?.mealType || ""}
                onChangeText={(t) => setEditingMeal((p) => (p ? { ...p, mealType: t } : p))}
                mode="outlined"
                style={{ marginTop: 10, backgroundColor: "#FFFFFF" }}
                outlineColor={theme.border}
                activeOutlineColor={theme.violet}
                textColor={theme.text}
              />

              <TextInput
                label="Texto"
                value={editingMeal?.text || ""}
                onChangeText={(t) => setEditingMeal((p) => (p ? { ...p, text: t } : p))}
                multiline
                mode="outlined"
                style={{ marginTop: 10, backgroundColor: "#FFFFFF" }}
                outlineColor={theme.border}
                activeOutlineColor={theme.violet}
                textColor={theme.text}
              />

              <View style={{ marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.border2 }}>
                <Text style={{ fontWeight: "900", color: theme.text }}>Experiencia</Text>

                <StarRow
                  label="General"
                  value={editingMeal?.exp?.general ?? 4}
                  onChange={(v) => setEditingMeal((p) => (p ? { ...p, exp: { ...p.exp, general: v } } : p))}
                />
                <StarRow
                  label="Saciedad"
                  value={editingMeal?.exp?.saciedad ?? 4}
                  onChange={(v) => setEditingMeal((p) => (p ? { ...p, exp: { ...p.exp, saciedad: v } } : p))}
                />
                <StarRow
                  label="Energía"
                  value={editingMeal?.exp?.energia ?? 4}
                  onChange={(v) => setEditingMeal((p) => (p ? { ...p, exp: { ...p.exp, energia: v } } : p))}
                />
                <StarRow
                  label="Digestión"
                  value={editingMeal?.exp?.digestion ?? 4}
                  onChange={(v) => setEditingMeal((p) => (p ? { ...p, exp: { ...p.exp, digestion: v } } : p))}
                />
                <StarRow
                  label="Ansiedad / Antojos"
                  value={editingMeal?.exp?.antojos ?? 4}
                  onChange={(v) => setEditingMeal((p) => (p ? { ...p, exp: { ...p.exp, antojos: v } } : p))}
                />
                <StarRow
                  label="Cumplimiento del plan"
                  value={editingMeal?.exp?.plan ?? 4}
                  onChange={(v) => setEditingMeal((p) => (p ? { ...p, exp: { ...p.exp, plan: v } } : p))}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
                <Button onPress={() => setEditingMeal(null)} textColor={theme.text}>
                  Cancelar
                </Button>
                <Button
                  mode="contained"
                  onPress={saveMealEdit}
                  style={{ borderRadius: 12, backgroundColor: theme.violet }}
                  textColor="#FFFFFF"
                >
                  Guardar cambios
                </Button>
              </View>
            </ScrollView>
          </Modal>
        </Portal>

        <Snackbar visible={snack.open} onDismiss={() => setSnack({ open: false, msg: "" })} duration={2500}>
          {snack.msg}
        </Snackbar>
      </View>
    </PaperProvider>
  );
}
