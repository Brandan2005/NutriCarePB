import React, { useEffect, useMemo, useState } from "react";
import { View, ScrollView, Image, useWindowDimensions, Platform } from "react-native";
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
import { AppIcon } from "../../../shared/components/AppIcon";
import { Pressable } from "react-native";
import { auth, rtdb } from "../../../shared/services/firebase";
import {
  Appointment,
  bookAppointment,
  listenAppointmentsByPatient,
  listenBookedSlotsForNutri,
} from "../../../shared/services/appointments";
import { listenNutritionists, Nutritionist, getSlotsForNutriOnDay } from "../../../shared/services/nutritionists";
import { sendAppointmentEmail } from "../../../shared/services/email";

type WeightItem = { id: string; value: number; date: string };

type MealExperience = {
  general: number;
  saciedad: number;
  energia: number;
  digestion: number;
  ansiedad: number;
  cumplimiento: number;
};

type MealItem = {
  id: string;
  date: string;
  mealType: string;
  text: string;
  experience: MealExperience;
};

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

function getDowKey(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  const n = d.getDay(); // 0..6
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  return keys[n];
}

function StarRow({
  label,
  value,
  onChange,
  size = 20,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontWeight: "800", marginBottom: 8 }}>{label}</Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => {
            const active = n <= value;

            return (
              <Pressable
                key={n}
                onPress={() => onChange(n)}
                hitSlop={10}
                style={{
                  width: size + 12,
                  height: size + 12,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppIcon
                  name={active ? "star" : "star-outline"}
                  size={size}
                  color={active ? "#F59E0B" : "#D1D5DB"}
                />
              </Pressable>
            );
          })}
        </View>

        <Text style={{ color: "#64748B", fontWeight: "800" }}>
          {value}/5
        </Text>
      </View>
    </View>
  );
}


export default function PacienteHome({ email }: { email: string }) {
  const user = auth.currentUser;

  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const isNarrow = width < 520;

  const [snack, setSnack] = useState<{ open: boolean; msg: string }>({ open: false, msg: "" });
  const toast = (msg: string) => setSnack({ open: true, msg });

  // ===== Theme =====
  const theme = useMemo(
    () => ({
      violet: "#6D28D9",
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
        borderRadius: 22,
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
      primaryBtn: {
        borderRadius: 14,
        backgroundColor: theme.violet,
      } as any,
      primaryBtnText: { color: "#FFFFFF", fontWeight: "800" } as any,
      pill: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.violetRing,
        backgroundColor: theme.violetSoft,
      } as any,
      input: {
        backgroundColor: "#FFFFFF",
      } as any,
    }),
    [theme]
  );

  // ===== Profile =====
  const [name, setName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [obraSocial, setObraSocial] = useState<string>("");
  const [photoURL, setPhotoURL] = useState<string>("");

  // ===== Weights =====
  const [weights, setWeights] = useState<WeightItem[]>([]);
  const [openWeightModal, setOpenWeightModal] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [newWeightDate, setNewWeightDate] = useState(todayISO());

  // ===== Meals =====
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [openMealModal, setOpenMealModal] = useState(false);
  const [mealDate, setMealDate] = useState(todayISO());
  const [mealType, setMealType] = useState("Desayuno");
  const [mealText, setMealText] = useState("");

  const emptyExp: MealExperience = useMemo(
    () => ({
      general: 4,
      saciedad: 4,
      energia: 4,
      digestion: 4,
      ansiedad: 4,
      cumplimiento: 4,
    }),
    []
  );
  const [mealExp, setMealExp] = useState<MealExperience>(emptyExp);

  const [editingMeal, setEditingMeal] = useState<MealItem | null>(null);

  // ===== Turnos =====
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [nutritionists, setNutritionists] = useState<Nutritionist[]>([]);
  const [selectedNutri, setSelectedNutri] = useState<Nutritionist | null>(null);

  const [timeFilter, setTimeFilter] = useState<"todos" | "maniana" | "tarde">("todos");

  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [creating, setCreating] = useState(false);

  // Mis turnos
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);

  // ===== Data load =====
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
      list.sort((a, b) => {
  if (a.date === b.date) return 0;
  return a.date > b.date ? -1 : 1; // más nuevo arriba
});
      setWeights(list);
    });

    const unsubMeals = onValue(mealsRef, (snap) => {
  const val = snap.val() || {};

  const list: MealItem[] = Object.keys(val).map((id) => {
    const row = val[id] || {};

    const general = Number(row?.experience?.general ?? row?.rating ?? 4);
    const saciedad = Number(row?.experience?.saciedad ?? row?.q1 ?? 4);
    const energia = Number(row?.experience?.energia ?? row?.q2 ?? 4);
    const digestion = Number(row?.experience?.digestion ?? row?.q3 ?? 4);
    const ansiedad = Number(row?.experience?.ansiedad ?? row?.q4 ?? 4);
    const cumplimiento = Number(row?.experience?.cumplimiento ?? row?.q5 ?? 4);

    return {
      id,
      date: String(row?.date ?? ""),
      mealType: String(row?.mealType ?? ""),
      text: String(row?.text ?? ""),
      experience: { general, saciedad, energia, digestion, ansiedad, cumplimiento },
    };
  });

  // ✅ más nuevo arriba (estable)
  list.sort((a, b) => {
    if (a.date === b.date) return 0;
    return a.date > b.date ? -1 : 1;
  });

  setMeals(list);
});


    return () => {
      unsubUser();
      unsubWeights();
      unsubMeals();
    };
  }, [user]);

  // Nutritionists realtime
  useEffect(() => {
    const unsub = listenNutritionists((list) => {
      setNutritionists(list);
      setSelectedNutri((prev) => prev ?? (list[0] || null));
    });
    return () => unsub();
  }, []);

  // Mis turnos realtime
  useEffect(() => {
    if (!user) return;
    const unsub = listenAppointmentsByPatient(user.uid, setMyAppointments);
    return () => unsub();
  }, [user]);

  // Slots ocupados realtime (por día)
  useEffect(() => {
    if (!selectedNutri) return;
    const unsub = listenBookedSlotsForNutri(selectedNutri.uid, selectedDay, setBookedSlots);
    return () => unsub();
  }, [selectedNutri, selectedDay]);

  // Slots disponibles (recalcula SIEMPRE que cambia fecha/nutri/filtro)
  useEffect(() => {
    if (!selectedNutri) {
      setAvailableSlots([]);
      setSelectedTime("");
      return;
    }

    const dow = getDowKey(selectedDay);
    const all = getSlotsForNutriOnDay(selectedNutri, dow);

    // filtro mañana/tarde: tarde si hh >= 13
    const filtered =
      timeFilter === "todos"
        ? all
        : all.filter((t) => {
            const hh = Number(t.split(":")[0]);
            return timeFilter === "maniana" ? hh < 13 : hh >= 13;
          });

    setAvailableSlots(filtered);
    setSelectedTime("");
  }, [selectedNutri, selectedDay, timeFilter]);

  const markedDates = useMemo(() => {
    const marks: any = {};
    marks[selectedDay] = { selected: true, selectedColor: theme.violet };
    return marks;
  }, [selectedDay, theme.violet]);

  const chartData = useMemo(() => {
    return weights
      .filter((w) => w.date && !Number.isNaN(w.value) && w.value > 0)
      .map((w) => ({ value: w.value, label: formatDateLabel(w.date) }));
  }, [weights]);

  const chartMax = useMemo(() => {
    if (chartData.length === 0) return 0;
    const max = Math.max(...chartData.map((d) => d.value));
    return max + 2;
  }, [chartData]);

  const nextAppt = useMemo(() => {
    const now = Date.now();
    const upcoming = myAppointments
      .filter((a) => a.status !== "cancelado" && (a.startAt ?? 0) >= now)
      .sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0));
    return upcoming[0] || null;
  }, [myAppointments]);

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

  const createdAt = Date.now();

  // Normalizamos por las dudas (evita strings raros)
  const exp: MealExperience = {
    general: Number(mealExp.general ?? 0),
    saciedad: Number(mealExp.saciedad ?? 0),
    energia: Number(mealExp.energia ?? 0),
    digestion: Number(mealExp.digestion ?? 0),
    ansiedad: Number(mealExp.ansiedad ?? 0),
    cumplimiento: Number(mealExp.cumplimiento ?? 0),
  };

  const listRef = ref(rtdb, `meals/${user.uid}`);
  const newRef = push(listRef);

  await set(newRef, {
    date: mealDate,
    mealType,
    text: mealText.trim(),

    // ✅ COMO TU FOTO CORRECTA (campos planos)
    createdAt,
    ratingGeneral: exp.general,
    q1: exp.saciedad,
    q2: exp.energia,
    q3: exp.digestion,
    q4: exp.ansiedad,
    q5: exp.cumplimiento,

    // ✅ opcional: si querés mantenerlo por compatibilidad, dejalo
    // (si no lo querés, borrá estas 2 líneas)
    experience: exp,
  });

  setOpenMealModal(false);
  setMealText("");
  setMealType("Desayuno");
  setMealDate(todayISO());
  setMealExp(emptyExp);

  toast("Comida guardada ✅");
}

async function saveMealEdit() {
  if (!user || !editingMeal) return;

  const exp: MealExperience = {
    general: Number(editingMeal.experience?.general ?? 0),
    saciedad: Number(editingMeal.experience?.saciedad ?? 0),
    energia: Number(editingMeal.experience?.energia ?? 0),
    digestion: Number(editingMeal.experience?.digestion ?? 0),
    ansiedad: Number(editingMeal.experience?.ansiedad ?? 0),
    cumplimiento: Number(editingMeal.experience?.cumplimiento ?? 0),
  };

  await update(ref(rtdb, `meals/${user.uid}/${editingMeal.id}`), {
    date: editingMeal.date,
    mealType: editingMeal.mealType,
    text: editingMeal.text,

    // ✅ mantener consistente con la DB “correcta”
    ratingGeneral: exp.general,
    q1: exp.saciedad,
    q2: exp.energia,
    q3: exp.digestion,
    q4: exp.ansiedad,
    q5: exp.cumplimiento,

    // ✅ opcional: mantener experience también
    experience: exp,
  });

  setEditingMeal(null);
  toast("Comida actualizada ✅");
}


  async function deleteMeal(id: string) {
    if (!user) return;
    await remove(ref(rtdb, `meals/${user.uid}/${id}`));
    toast("Comida eliminada 🗑️");
  }

  async function requestAppointment() {
    if (!user) return;
    if (!selectedNutri) return toast("Elegí un nutricionista.");
    if (!selectedTime) return toast("Elegí un horario.");

    if (bookedSlots.has(selectedTime)) return toast("Ese horario ya está ocupado.");

    setCreating(true);
    try {
      const appt = await bookAppointment({
        patientUid: user.uid,
        patientName: name || "Paciente",
        patientEmail: user.email || email,

        nutriUid: selectedNutri.uid,
        nutriName: selectedNutri.name,
        nutriEmail: selectedNutri.email,

        date: selectedDay,
        time: selectedTime,
        durationMin: 30,
      });

      toast("Turno solicitado ✅");

      // mail al paciente (al email registrado)
      try {
        await sendAppointmentEmail({
          to_email: appt.patientEmail,
          patient_name: appt.patientName,
          nutritionist_name: appt.nutriName,
          date: appt.date,
          time: appt.time,
        });
      } catch (e) {
        console.warn("EmailJS error:", e);
      }

      setSelectedTime("");
    } catch (e: any) {
      toast(e?.message ? String(e.message) : "No se pudo solicitar el turno.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <PaperProvider>
      <View style={{ flex: 1, backgroundColor: theme.pageBg }}>
        {/* HEADER */}
        <View
          style={{
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: 10,
            backgroundColor: theme.headerBg,
            borderBottomWidth: 1,
            borderColor: theme.headerBorder,
          }}
        >
          <View
            style={{
              flexDirection: isNarrow ? "column" : "row",
              alignItems: isNarrow ? "flex-start" : "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            {/* izquierda */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <IconButton
                icon={() => (
                  <Image
                    source={require("../../../../assets/images/icon.png")}
                    style={{ width: 34, height: 34, borderRadius: 12 }}
                  />
                )}
                onPress={() => router.push("/")}
                style={{ margin: 0 }}
              />

              <View>
                <Text variant="titleMedium" style={{ color: theme.headerText, fontWeight: "900" }}>
                  NutriCare
                </Text>
                <Text style={{ color: theme.headerMuted, fontSize: 12, marginTop: -2 }}>
                  Panel Paciente
                </Text>
              </View>
            </View>

            {/* derecha */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {photoURL ? (
                <Avatar.Image size={36} source={{ uri: photoURL }} />
              ) : (
                <Avatar.Text size={36} label={(name || "P")[0]?.toUpperCase()} />
              )}

              <View style={{ maxWidth: 240 }}>
                <Text style={{ color: theme.headerText, fontWeight: "900" }}>{name || "Paciente"}</Text>
                <Text style={{ color: theme.headerMuted, fontSize: 11 }}>{user?.email || email}</Text>
              </View>

              <Button mode="text" textColor="#FCA5A5" onPress={() => signOut(auth)}>
                Cerrar sesión
              </Button>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
          {/* HERO */}
          <Card style={[styles.sectionCard, { backgroundColor: theme.violetSoft, borderColor: theme.violetRing }]}>
            <Card.Content>
              <Text style={{ color: "#4C1D95", fontSize: 18, fontWeight: "900" }}>
                Hola, {name || "Paciente"} 👋
              </Text>
              <Text style={{ color: "#5B21B6", marginTop: 6, lineHeight: 20 }}>
                Tu panel personal para registrar comidas, progreso y turnos.
              </Text>

              {nextAppt ? (
                <View
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.violetRing,
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  <Text style={{ fontWeight: "900", color: theme.text }}>Próximo turno:</Text>
                  <Text style={{ color: theme.muted, marginTop: 4 }}>
                    Con <Text style={{ fontWeight: "900", color: theme.text }}>{nextAppt.nutriName}</Text>{" "}
                    el <Text style={{ fontWeight: "900", color: theme.text }}>{nextAppt.date}</Text>{" "}
                    a las <Text style={{ fontWeight: "900", color: theme.text }}>{nextAppt.time}</Text>
                  </Text>
                </View>
              ) : (
                <View style={{ marginTop: 12 }}>
                  <Chip style={styles.pill} textStyle={{ color: "#4C1D95", fontWeight: "800" }}>
                    Sin turnos próximos
                  </Chip>
                </View>
              )}
            </Card.Content>
          </Card>

          {/* GRID */}
          <View style={{ marginTop: 12, flexDirection: isWide ? "row" : "column", gap: 12 }}>
            {/* LEFT */}
            <View style={{ flex: 1, gap: 12 }}>
              {/* PERFIL */}
              <Card style={styles.sectionCard}>
                <Card.Content>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Datos del perfil</Text>
                  <Text style={{ color: theme.muted, marginTop: 6 }}>
                    Mantené tus datos actualizados para tu seguimiento.
                  </Text>

                  <Divider style={{ marginVertical: 14, backgroundColor: theme.border2 }} />

                  <TextInput
                    label="Nombre"
                    value={name}
                    onChangeText={setName}
                    mode="outlined"
                    style={[{ marginBottom: 10 }, styles.input]}
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
                    style={[{ marginBottom: 10 }, styles.input]}
                    outlineColor={theme.border}
                    activeOutlineColor={theme.violet}
                    textColor={theme.text}
                  />
                  <TextInput
                    label="Obra social"
                    value={obraSocial}
                    onChangeText={setObraSocial}
                    mode="outlined"
                    style={[{ marginBottom: 10 }, styles.input]}
                    outlineColor={theme.border}
                    activeOutlineColor={theme.violet}
                    textColor={theme.text}
                  />

                  <Button mode="contained" style={styles.primaryBtn} labelStyle={styles.primaryBtnText} onPress={saveProfile}>
                    Guardar datos
                  </Button>
                </Card.Content>
              </Card>

              {/* PESO */}
              <Card style={styles.sectionCard}>
                <Card.Content>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <View>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Progreso de peso</Text>
                      <Text style={{ color: theme.muted, marginTop: 6 }}>Visualizá tu evolución por fecha.</Text>
                    </View>

                    <Button mode="contained" style={styles.primaryBtn} labelStyle={styles.primaryBtnText} onPress={() => setOpenWeightModal(true)}>
                      Medir peso
                    </Button>
                  </View>

                  <View style={{ marginTop: 12 }}>
                    {chartData.length >= 2 ? (
                      <View style={{ backgroundColor: "#FFFFFF", borderRadius: 18, paddingVertical: 10, paddingHorizontal: 8, borderWidth: 1, borderColor: theme.border2 }}>
                        <LineChart
                          data={chartData}
                          spacing={44}
                          initialSpacing={10}
                          thickness={3}
                          curved
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
                      <View style={{ padding: 16, backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: theme.border2 }}>
                        <Text style={{ color: theme.muted }}>Cargá al menos 2 registros de peso para ver el gráfico.</Text>
                      </View>
                    )}
                  </View>
                </Card.Content>
              </Card>

                            {/* COMIDAS */}
              <Card style={styles.sectionCard}>
                <Card.Content>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <View>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>
                        Comidas
                      </Text>
                      <Text style={{ color: theme.muted, marginTop: 4 }}>
                        Historial por fecha + experiencia ⭐
                      </Text>
                    </View>

                    <Button
                      mode="contained"
                      style={styles.primaryBtn}
                      labelStyle={styles.primaryBtnText}
                      onPress={() => setOpenMealModal(true)}
                    >
                      Agregar
                    </Button>
                  </View>

                  <Divider style={{ marginVertical: 14, backgroundColor: theme.border2 }} />

                  <View style={{ maxHeight: isWide ? 420 : 320 }}>
                    <ScrollView>
                      {meals.length === 0 ? (
                        <Text style={{ color: theme.muted }}>
                          Todavía no cargaste comidas. Tocá “Agregar”.
                        </Text>
                      ) : (
                        <View style={{ gap: 10, paddingBottom: 4 }}>
                          {meals.map((m) => (
                            <Card key={m.id} style={styles.innerCard}>
                              <Card.Content>
                                <View
                                  style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    gap: 12,
                                  }}
                                >
                                  {/* INFO */}
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontWeight: "900", color: theme.text }}>
                                      {formatDateLabel(m.date)} · {m.mealType}
                                    </Text>

                                    <Text
                                      style={{
                                        marginTop: 8,
                                        color: theme.muted,
                                        lineHeight: 20,
                                      }}
                                    >
                                      {m.text}
                                    </Text>

                                    {/* EXPERIENCIA */}
                                    <View
                                      style={{
                                        marginTop: 10,
                                        padding: 12,
                                        borderRadius: 16,
                                        borderWidth: 1,
                                        borderColor: theme.border2,
                                        backgroundColor: "#FFFFFF",
                                      }}
                                    >
                                      <Text
                                        style={{
                                          fontWeight: "900",
                                          color: theme.text,
                                          marginBottom: 8,
                                        }}
                                      >
                                        Experiencia
                                      </Text>

                                      {([
                                        ["General", m.experience.general],
                                        ["Saciedad", m.experience.saciedad],
                                        ["Energía", m.experience.energia],
                                        ["Digestión", m.experience.digestion],
                                        ["Ansiedad / Antojos", m.experience.ansiedad],
                                        ["Cumplimiento del plan", m.experience.cumplimiento],
                                      ] as const).map(([label, val]) => (
                                        <View
                                          key={label}
                                          style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 8,
                                            marginTop: 6,
                                          }}
                                        >
                                          {/* estrellas */}
                                          <View style={{ flexDirection: "row", gap: 2 }}>
                                            {[1, 2, 3, 4, 5].map((n) => (
                                              <AppIcon
                                                key={n}
                                                name={n <= val ? "star" : "star-outline"}
                                                size={14}
                                                color={n <= val ? "#F59E0B" : "#D1D5DB"}
                                              />
                                            ))}
                                          </View>

                                          <Text style={{ color: theme.muted }}>
                                            {label}:{" "}
                                            <Text
                                              style={{
                                                fontWeight: "900",
                                                color: theme.text,
                                              }}
                                            >
                                              {val}/5
                                            </Text>
                                          </Text>
                                        </View>
                                      ))}
                                    </View>
                                  </View>

                                  {/* ACCIONES */}
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      gap: 12,
                                      alignItems: "center",
                                      paddingTop: 4,
                                    }}
                                  >
                                    <Button
                                      mode="text"
                                      compact
                                      onPress={() => setEditingMeal({ ...m })}
                                      style={{ minWidth: 36, paddingHorizontal: 0 }}
                                      contentStyle={{
                                        width: 36,
                                        height: 36,
                                        justifyContent: "center",
                                        alignItems: "center",
                                      }}
                                    >
                                      <AppIcon
                                        name="pencil"
                                        size={20}
                                        color={theme.violet}
                                      />
                                    </Button>

                                    <Button
                                      mode="text"
                                      compact
                                      onPress={() => deleteMeal(m.id)}
                                      style={{ minWidth: 36, paddingHorizontal: 0 }}
                                      contentStyle={{
                                        width: 36,
                                        height: 36,
                                        justifyContent: "center",
                                        alignItems: "center",
                                      }}
                                    >
                                      <AppIcon
                                        name="trash"
                                        size={20}
                                        color={theme.danger}
                                      />
                                    </Button>
                                  </View>
                                </View>
                              </Card.Content>
                            </Card>
                          ))}
                        </View>
                      )}
                    </ScrollView>
                  </View>
                </Card.Content>
              </Card>


            </View>

            {/* RIGHT */}
            <View style={{ flex: 1, gap: 12 }}>
              {/* TURNOS */}
              <Card style={styles.sectionCard}>
                <Card.Content>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Turnos</Text>
                  <Text style={{ color: theme.muted, marginTop: 6 }}>
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

                  <Divider style={{ marginVertical: 14, backgroundColor: theme.border2 }} />

                  {/* NUTRICIONISTAS */}
                  <Text style={{ fontWeight: "900", color: theme.text }}>Nutricionista</Text>

                  <View style={{ marginTop: 10, gap: 8 }}>
                    {nutritionists.length === 0 ? (
                      <Text style={{ color: theme.muted }}>No hay nutricionistas cargados (role="nutricionista").</Text>
                    ) : (
                      nutritionists.map((n) => {
                        const active = selectedNutri?.uid === n.uid;
                        return (
                          <Card
                            key={n.uid}
                            style={{
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor: active ? theme.violet : theme.border2,
                              backgroundColor: active ? theme.violetSoft : "#FFFFFF",
                            }}
                          >
                            <Card.Content>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                {n.photoURL ? (
                                  <Avatar.Image size={42} source={{ uri: n.photoURL }} />
                                ) : (
                                  <Avatar.Text size={42} label={(n.name || "N")[0]?.toUpperCase()} />
                                )}

                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontWeight: "900", color: theme.text }}>{n.name}</Text>
                                  <Text style={{ color: theme.muted, fontSize: 12 }}>{n.email}</Text>
                                </View>

                                <Button
                                  mode={active ? "contained" : "outlined"}
                                  style={{
                                    borderRadius: 14,
                                    backgroundColor: active ? theme.violet : undefined,
                                    borderColor: theme.violet,
                                  }}
                                  labelStyle={{ color: active ? "#FFFFFF" : theme.violet, fontWeight: "800" }}
                                  onPress={() => setSelectedNutri(n)}
                                >
                                  {active ? "Elegido" : "Elegir"}
                                </Button>
                              </View>
                            </Card.Content>
                          </Card>
                        );
                      })
                    )}
                  </View>

                  <Divider style={{ marginVertical: 14, backgroundColor: theme.border2 }} />

                  {/* FILTRO HORAS */}
                  <Text style={{ fontWeight: "900", color: theme.text }}>Filtrar horarios</Text>
                  <View style={{ marginTop: 10 }}>
                    <SegmentedButtons
                      value={timeFilter}
                      onValueChange={(v) => setTimeFilter(v as any)}
                      buttons={[
                        { value: "todos", label: "Todos" },
                        { value: "maniana", label: "Mañana" },
                        { value: "tarde", label: "Tarde" },
                      ]}
                    />
                  </View>

                  {/* HORARIOS */}
                  <View style={{ marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.border2, backgroundColor: "#FFFFFF" }}>
                    <Text style={{ color: theme.muted }}>
                      Seleccionado: <Text style={{ fontWeight: "900", color: theme.text }}>{selectedDay}</Text>
                    </Text>

                    {!selectedNutri ? (
                      <Text style={{ color: theme.muted, marginTop: 8 }}>Elegí un nutricionista para ver horarios.</Text>
                    ) : availableSlots.length === 0 ? (
                      <Text style={{ color: theme.muted, marginTop: 8 }}>
                        No hay horarios configurados para este día (revisá availability del nutricionista).
                      </Text>
                    ) : (
                      <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {availableSlots.map((t) => {
                          const ocupado = bookedSlots.has(t);
                          const selected = selectedTime === t;
                          return (
                            <Chip
                              key={t}
                              disabled={ocupado}
                              style={{
                                borderRadius: 999,
                                backgroundColor: ocupado ? "#F1F5F9" : selected ? theme.violet : theme.violetSoft,
                                borderWidth: 1,
                                borderColor: ocupado ? theme.border2 : theme.violetRing,
                              }}
                              textStyle={{
                                color: ocupado ? "#94A3B8" : selected ? "#FFFFFF" : "#4C1D95",
                                fontWeight: "900",
                              }}
                              onPress={() => setSelectedTime(t)}
                            >
                              {t} {ocupado ? "· Ocupado" : ""}
                            </Chip>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* BOTÓN SOLICITAR */}
                  <View style={{ marginTop: 12 }}>
                    <Button
                      mode="contained"
                      style={styles.primaryBtn}
                      labelStyle={styles.primaryBtnText}
                      onPress={requestAppointment}
                      loading={creating}
                      disabled={!selectedNutri || !selectedTime || creating}
                    >
                      Solicitar turno
                    </Button>

                    <Text style={{ color: theme.muted, marginTop: 10, lineHeight: 20 }}>
                      Tip: si un horario está “ocupado”, es porque alguien ya lo reservó para ese día y hora.
                    </Text>
                  </View>
                </Card.Content>
              </Card>

              {/* MIS TURNOS */}
              <Card style={styles.sectionCard}>
                <Card.Content>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Mis turnos</Text>
                  <Text style={{ color: theme.muted, marginTop: 6 }}>Tus turnos solicitados y próximos.</Text>

                  <Divider style={{ marginVertical: 14, backgroundColor: theme.border2 }} />

                  {myAppointments.length === 0 ? (
                    <Text style={{ color: theme.muted }}>Todavía no tenés turnos.</Text>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {myAppointments
                        .filter((a) => a.status !== "cancelado")
                        .slice(0, 8)
                        .map((a) => (
                          <View key={a.id} style={{ padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.border2, backgroundColor: "#FFFFFF" }}>
                            <Text style={{ fontWeight: "900", color: theme.text }}>
                              {a.date} · {a.time}
                            </Text>
                            <Text style={{ color: theme.muted, marginTop: 4 }}>
                              Con <Text style={{ fontWeight: "900", color: theme.text }}>{a.nutriName}</Text>
                            </Text>
                            <Text style={{ color: theme.muted, marginTop: 4 }}>
                              Estado: <Text style={{ fontWeight: "900", color: theme.text }}>{a.status}</Text>
                            </Text>
                          </View>
                        ))}
                    </View>
                  )}
                </Card.Content>
              </Card>
            </View>
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
              maxHeight: Platform.OS === "web" ? 520 : 580,
            }}
          >
            <ScrollView>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Registrar peso</Text>
              <Text style={{ color: theme.muted, marginTop: 6 }}>Guardalo y se verá en tu gráfico.</Text>

              <TextInput
                label="Peso (kg)"
                value={newWeight}
                onChangeText={setNewWeight}
                keyboardType="numeric"
                style={[{ marginTop: 12 }, styles.input]}
                outlineColor={theme.border}
                activeOutlineColor={theme.violet}
                textColor={theme.text}
                mode="outlined"
              />

              <TextInput
                label="Fecha (YYYY-MM-DD)"
                value={newWeightDate}
                onChangeText={setNewWeightDate}
                style={[{ marginTop: 10 }, styles.input]}
                outlineColor={theme.border}
                activeOutlineColor={theme.violet}
                textColor={theme.text}
                mode="outlined"
              />

              <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
                <Button onPress={() => setOpenWeightModal(false)} textColor={theme.text}>Cancelar</Button>
                <Button mode="contained" style={styles.primaryBtn} labelStyle={styles.primaryBtnText} onPress={addWeight}>
                  Guardar
                </Button>
              </View>
            </ScrollView>
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
                maxHeight: Platform.OS === "web" ? 560 : 640,
              }}
            >
              <ScrollView>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>
                  Agregar comida
                </Text>
                <Text style={{ color: theme.muted, marginTop: 6 }}>
                  Fecha, tipo de comida y experiencia.
                </Text>

                <TextInput
                  label="Fecha (YYYY-MM-DD)"
                  value={mealDate}
                  onChangeText={setMealDate}
                  style={[{ marginTop: 12 }, styles.input]}
                  outlineColor={theme.border}
                  activeOutlineColor={theme.violet}
                  textColor={theme.text}
                  mode="outlined"
                />

                <TextInput
                  label="Tipo (Desayuno/Almuerzo/Merienda/Cena)"
                  value={mealType}
                  onChangeText={setMealType}
                  style={[{ marginTop: 10 }, styles.input]}
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
                  style={[{ marginTop: 10 }, styles.input]}
                  outlineColor={theme.border}
                  activeOutlineColor={theme.violet}
                  textColor={theme.text}
                  mode="outlined"
                />

                <View
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border2,
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  <Text style={{ fontWeight: "900", color: theme.text }}>
                    Experiencia (⭐)
                  </Text>

                  <StarRow
                    label="General"
                    value={mealExp.general}
                    onChange={(v) => setMealExp((p) => ({ ...p, general: v }))}
                  />
                  <StarRow
                    label="Saciedad"
                    value={mealExp.saciedad}
                    onChange={(v) => setMealExp((p) => ({ ...p, saciedad: v }))}
                  />
                  <StarRow
                    label="Energía"
                    value={mealExp.energia}
                    onChange={(v) => setMealExp((p) => ({ ...p, energia: v }))}
                  />
                  <StarRow
                    label="Digestión"
                    value={mealExp.digestion}
                    onChange={(v) => setMealExp((p) => ({ ...p, digestion: v }))}
                  />
                  <StarRow
                    label="Ansiedad / Antojos"
                    value={mealExp.ansiedad}
                    onChange={(v) => setMealExp((p) => ({ ...p, ansiedad: v }))}
                  />
                  <StarRow
                    label="Cumplimiento del plan"
                    value={mealExp.cumplimiento}
                    onChange={(v) => setMealExp((p) => ({ ...p, cumplimiento: v }))}
                  />
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    justifyContent: "flex-end",
                    marginTop: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <Button onPress={() => setOpenMealModal(false)} textColor={theme.text}>
                    Cancelar
                  </Button>
                  <Button
                    mode="contained"
                    style={styles.primaryBtn}
                    labelStyle={styles.primaryBtnText}
                    onPress={addMeal}
                  >
                    Guardar
                  </Button>
                </View>
              </ScrollView>
            </Modal>
        </Portal>


       {/* MODAL EDITAR COMIDA */}
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
                maxHeight: Platform.OS === "web" ? 560 : 640,
              }}
            >
              <ScrollView>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>
                  Editar comida
                </Text>

                <TextInput
                  label="Fecha (YYYY-MM-DD)"
                  value={editingMeal?.date || ""}
                  onChangeText={(t) =>
                    setEditingMeal((p) => (p ? { ...p, date: t } : p))
                  }
                  style={[{ marginTop: 12 }, styles.input]}
                  outlineColor={theme.border}
                  activeOutlineColor={theme.violet}
                  textColor={theme.text}
                  mode="outlined"
                />

                <TextInput
                  label="Tipo"
                  value={editingMeal?.mealType || ""}
                  onChangeText={(t) =>
                    setEditingMeal((p) => (p ? { ...p, mealType: t } : p))
                  }
                  style={[{ marginTop: 10 }, styles.input]}
                  outlineColor={theme.border}
                  activeOutlineColor={theme.violet}
                  textColor={theme.text}
                  mode="outlined"
                />

                <TextInput
                  label="Texto"
                  value={editingMeal?.text || ""}
                  onChangeText={(t) =>
                    setEditingMeal((p) => (p ? { ...p, text: t } : p))
                  }
                  multiline
                  style={[{ marginTop: 10 }, styles.input]}
                  outlineColor={theme.border}
                  activeOutlineColor={theme.violet}
                  textColor={theme.text}
                  mode="outlined"
                />

                <View
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border2,
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  <Text style={{ fontWeight: "900", color: theme.text }}>
                    Experiencia (⭐)
                  </Text>

                  <StarRow
                    label="General"
                    value={editingMeal?.experience?.general || 0}
                    onChange={(v) =>
                      setEditingMeal((p) =>
                        p
                          ? { ...p, experience: { ...p.experience, general: v } }
                          : p
                      )
                    }
                  />
                  <StarRow
                    label="Saciedad"
                    value={editingMeal?.experience?.saciedad || 0}
                    onChange={(v) =>
                      setEditingMeal((p) =>
                        p
                          ? { ...p, experience: { ...p.experience, saciedad: v } }
                          : p
                      )
                    }
                  />
                  <StarRow
                    label="Energía"
                    value={editingMeal?.experience?.energia || 0}
                    onChange={(v) =>
                      setEditingMeal((p) =>
                        p
                          ? { ...p, experience: { ...p.experience, energia: v } }
                          : p
                      )
                    }
                  />
                  <StarRow
                    label="Digestión"
                    value={editingMeal?.experience?.digestion || 0}
                    onChange={(v) =>
                      setEditingMeal((p) =>
                        p
                          ? { ...p, experience: { ...p.experience, digestion: v } }
                          : p
                      )
                    }
                  />
                  <StarRow
                    label="Ansiedad / Antojos"
                    value={editingMeal?.experience?.ansiedad || 0}
                    onChange={(v) =>
                      setEditingMeal((p) =>
                        p
                          ? { ...p, experience: { ...p.experience, ansiedad: v } }
                          : p
                      )
                    }
                  />
                  <StarRow
                    label="Cumplimiento del plan"
                    value={editingMeal?.experience?.cumplimiento || 0}
                    onChange={(v) =>
                      setEditingMeal((p) =>
                        p
                          ? { ...p, experience: { ...p.experience, cumplimiento: v } }
                          : p
                      )
                    }
                  />
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    justifyContent: "flex-end",
                    marginTop: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <Button onPress={() => setEditingMeal(null)} textColor={theme.text}>
                    Cancelar
                  </Button>
                  <Button
                    mode="contained"
                    style={styles.primaryBtn}
                    labelStyle={styles.primaryBtnText}
                    onPress={saveMealEdit}
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
