import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  Image,
  Dimensions,
  Platform,
  Pressable,
} from "react-native";
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
import { signOut } from "firebase/auth";
import { onValue, ref, push, set, update, remove } from "firebase/database";
import { Calendar } from "react-native-calendars";
import { LineChart } from "react-native-gifted-charts";
import { router } from "expo-router";
import emailjs from "@emailjs/browser";

import { auth, rtdb } from "../../../shared/services/firebase";
import { bookAppointment, getBookedSlotsForNutri } from "../../../shared/services/appointments";

type WeightItem = { id: string; value: number; date: string };

type MealRatings = {
  overall: number; // ⭐ general
  satiety: number; // ¿qué tanto te llenó?
  energy: number; // energía después
  digestion: number; // digestión
  cravings: number; // ansiedad/antojos
  adherence: number; // qué tan fácil seguir el plan
};

type MealItem = {
  id: string;
  date: string;
  mealType: string;
  text: string;
  ratings: MealRatings;
};

type Nutri = {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  // availability opcional: si no está, usamos default 10-14
  availability?: {
    days?: Record<
      string,
      {
        start?: string; // "10:00"
        end?: string;   // "14:00"
        breaks?: { start: string; end: string }[];
      }
    >;
  };
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

function dayKeyFromISO(dateYYYYMMDD: string) {
  // JS: 0=Sun ... 6=Sat
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return keys[dt.getDay()];
}

function parseHHmm(s: string) {
  const [h, m] = s.split(":").map(Number);
  return { h, m };
}

function minutesOf(s: string) {
  const { h, m } = parseHHmm(s);
  return h * 60 + m;
}

function toHHmm(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function buildSlots(start: string, end: string, stepMin: number) {
  const a = minutesOf(start);
  const b = minutesOf(end);
  const out: string[] = [];
  for (let t = a; t + stepMin <= b; t += stepMin) {
    out.push(toHHmm(t));
  }
  return out;
}

function inBreak(time: string, breaks?: { start: string; end: string }[]) {
  if (!breaks?.length) return false;
  const t = minutesOf(time);
  return breaks.some((br) => {
    const a = minutesOf(br.start);
    const b = minutesOf(br.end);
    return t >= a && t < b;
  });
}

function StarRating({
  value,
  onChange,
  size = 22,
  color = "#F59E0B",
  muted = "#D1D5DB",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  color?: string;
  muted?: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <IconButton
          key={n}
          icon={n <= value ? "star" : "star-outline"}
          iconColor={n <= value ? color : muted}
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

  // snack
  const [snack, setSnack] = useState<{ open: boolean; msg: string }>({ open: false, msg: "" });
  const toast = (msg: string) => setSnack({ open: true, msg });

  // Perfil
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [obraSocial, setObraSocial] = useState("");
  const [photoURL, setPhotoURL] = useState("");

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

  const [mealRatings, setMealRatings] = useState<MealRatings>({
    overall: 4,
    satiety: 4,
    energy: 4,
    digestion: 4,
    cravings: 4,
    adherence: 4,
  });

  // Edit comida
  const [editingMeal, setEditingMeal] = useState<MealItem | null>(null);

  // Turnos
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [nutris, setNutris] = useState<Nutri[]>([]);
  const [selectedNutriUid, setSelectedNutriUid] = useState<string>("");
  const selectedNutri = useMemo(
    () => nutris.find((n) => n.uid === selectedNutriUid) || null,
    [nutris, selectedNutriUid]
  );

  const [timeFilter, setTimeFilter] = useState<"all" | "morning" | "afternoon">("all");

  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [myBookedToday, setMyBookedToday] = useState<Set<string>>(new Set()); // `${nutriUid}|${time}`
  const [creating, setCreating] = useState(false);

  // ===== Theme =====
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

  // MarkedDates para Calendar (no rompe)
  const markedDates = useMemo(() => {
    const marks: any = {};
    marks[selectedDay] = { selected: true, selectedColor: theme.violet };
    return marks;
  }, [selectedDay, theme.violet]);

  // ===== Cargar perfil + weights + meals + nutris + mis turnos del día =====
  useEffect(() => {
    if (!user) return;

    const userRef = ref(rtdb, `users/${user.uid}`);
    const weightsRef = ref(rtdb, `weights/${user.uid}`);
    const mealsRef = ref(rtdb, `meals/${user.uid}`);
    const usersRef = ref(rtdb, `users`);
    const myApptsRef = ref(rtdb, `appointmentsByPatient/${user.uid}`);

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
      const list: MealItem[] = Object.keys(val).map((id) => {
        const raw = val[id] || {};
        const legacyRating = Number(raw?.rating ?? 0); // por si tenías el viejo formato
        const ratings: MealRatings = {
          overall: Number(raw?.ratings?.overall ?? legacyRating ?? 0),
          satiety: Number(raw?.ratings?.satiety ?? 0),
          energy: Number(raw?.ratings?.energy ?? 0),
          digestion: Number(raw?.ratings?.digestion ?? 0),
          cravings: Number(raw?.ratings?.cravings ?? 0),
          adherence: Number(raw?.ratings?.adherence ?? 0),
        };
        return {
          id,
          date: String(raw?.date ?? ""),
          mealType: String(raw?.mealType ?? ""),
          text: String(raw?.text ?? ""),
          ratings,
        };
      });
      list.sort((a, b) => (a.date > b.date ? -1 : 1)); // desc
      setMeals(list);
    });

    // Nutricionistas (role == "nutricionista")
    const unsubUsers = onValue(usersRef, (snap) => {
      const all = snap.val() || {};
      const list: Nutri[] = Object.keys(all)
        .map((uid) => ({ uid, ...(all[uid] || {}) }))
        .filter((u: any) => u?.role === "nutricionista")
        .map((u: any) => ({
          uid: u.uid,
          name: u.name || u.email?.split("@")?.[0] || "Nutricionista",
          email: u.email || "",
          photoURL: u.photoURL || "",
          availability: u.availability || undefined,
        }));

      setNutris(list);

      // autoselect
      if (!selectedNutriUid && list.length) setSelectedNutriUid(list[0].uid);
    });

    // Mis turnos del día seleccionado (para bloquear duplicado)
    const unsubMyAppts = onValue(myApptsRef, (snap) => {
      const val = snap.val() || {};
      const setLocal = new Set<string>();
      Object.keys(val).forEach((id) => {
        const a = val[id];
        if (!a) return;
        // guardo todo, filtramos por día al reservar
        const key = `${a.nutriUid}|${a.date}|${a.time}|${a.status}`;
        // no lo uso como key final, solo para calcular luego (abajo)
      });
      // acá no hacemos nada todavía, porque depende de selectedDay
    });

    return () => {
      unsubUser();
      unsubWeights();
      unsubMeals();
      unsubUsers();
      unsubMyAppts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Mis turnos del día (reactivo a selectedDay) + evitar duplicado
  useEffect(() => {
    if (!user) return;
    const myApptsRef = ref(rtdb, `appointmentsByPatient/${user.uid}`);
    const unsub = onValue(myApptsRef, (snap) => {
      const val = snap.val() || {};
      const setToday = new Set<string>();
      Object.keys(val).forEach((id) => {
        const a = val[id];
        if (!a) return;
        if (a.date !== selectedDay) return;
        if (a.status === "cancelado") return;
        setToday.add(`${a.nutriUid}|${a.time}`);
      });
      setMyBookedToday(setToday);
    });
    return () => unsub();
  }, [user, selectedDay]);

  // Slots ocupados del nutri seleccionado + día seleccionado
  useEffect(() => {
    (async () => {
      if (!selectedNutriUid) return;
      const setBooked = await getBookedSlotsForNutri(selectedNutriUid, selectedDay);
      setBookedSlots(setBooked);
    })().catch(() => {});
  }, [selectedNutriUid, selectedDay]);

  // ===== Chart data =====
  const chartData = useMemo(() => {
    return weights
      .filter((w) => w.date && !Number.isNaN(w.value) && w.value > 0)
      .map((w) => ({ value: w.value, label: formatDateLabel(w.date) }));
  }, [weights]);

  const chartMax = useMemo(() => {
    if (!chartData.length) return 0;
    return Math.max(...chartData.map((d) => d.value)) + 2;
  }, [chartData]);

  // ===== Helpers =====
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
      ratings: mealRatings,
    });

    setOpenMealModal(false);
    setMealText("");
    setMealType("Desayuno");
    setMealDate(todayISO());
    setMealRatings({
      overall: 4,
      satiety: 4,
      energy: 4,
      digestion: 4,
      cravings: 4,
      adherence: 4,
    });

    toast("Comida guardada ✅");
  }

  async function saveMealEdit() {
    if (!user || !editingMeal) return;
    await update(ref(rtdb, `meals/${user.uid}/${editingMeal.id}`), {
      date: editingMeal.date,
      mealType: editingMeal.mealType,
      text: editingMeal.text,
      ratings: editingMeal.ratings,
    });
    setEditingMeal(null);
    toast("Comida actualizada ✅");
  }

  async function deleteMeal(id: string) {
    if (!user) return;
    await remove(ref(rtdb, `meals/${user.uid}/${id}`));
    toast("Comida eliminada 🗑️");
  }

  function sendAppointmentEmail(params: {
    to_email: string;
    patient_name: string;
    nutritionist_name: string;
    date: string;
    time: string;
  }) {
    const serviceId = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID;
    const templateId = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID;
    const publicKey = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY;

    if (!serviceId || !templateId || !publicKey) return;

    // EmailJS es para web. En mobile no lo enviamos (pero no rompe nada).
    if (Platform.OS !== "web") return;

    emailjs
      .send(
        serviceId,
        templateId,
        {
          to_email: params.to_email,
          patient_name: params.patient_name,
          nutritionist_name: params.nutritionist_name,
          date: params.date,
          time: params.time,
        },
        { publicKey }
      )
      .catch(() => {});
  }

  // availability por día: si no hay -> default 10:00–14:00 sin breaks
  const dayAvailability = useMemo(() => {
    const dayKey = dayKeyFromISO(selectedDay);
    const av = selectedNutri?.availability?.days?.[dayKey];
    const start = av?.start || "10:00";
    const end = av?.end || "14:00";
    const breaks = av?.breaks || [];
    return { start, end, breaks };
  }, [selectedDay, selectedNutri]);

  const allSlots = useMemo(() => {
    const base = buildSlots(dayAvailability.start, dayAvailability.end, 30);
    return base.filter((t) => !inBreak(t, dayAvailability.breaks));
  }, [dayAvailability]);

  const filteredSlots = useMemo(() => {
    const slots = allSlots;
    if (timeFilter === "all") return slots;
    return slots.filter((t) => {
      const hh = Number(t.split(":")[0]);
      if (timeFilter === "morning") return hh < 12;
      return hh >= 12;
    });
  }, [allSlots, timeFilter]);

  async function bookSlot(time: string) {
    if (!user) return;
    if (!selectedNutri) {
      toast('No hay nutricionistas cargados (role="nutricionista").');
      return;
    }

    // evitar que el mismo paciente reserve dos veces el mismo slot con ese nutri ese día
    const myKey = `${selectedNutri.uid}|${time}`;
    if (myBookedToday.has(myKey)) {
      toast("Ya solicitaste ese horario con este nutricionista hoy. Elegí otro.");
      return;
    }

    // ocupado por alguien más
    if (bookedSlots.has(time)) {
      toast("Ese horario ya está reservado. Elegí otro.");
      return;
    }

    setCreating(true);
    try {
      const appt = await bookAppointment({
        patientUid: user.uid,
        patientName: name || "Paciente",
        patientEmail: user.email || email,

        nutriUid: selectedNutri.uid,
        nutriName: selectedNutri.name,
        nutriEmail: selectedNutri.email || "",

        date: selectedDay,
        time,
        durationMin: 30,
      });

      // UI optimistic
      setBookedSlots((prev) => new Set([...Array.from(prev), time]));
      setMyBookedToday((prev) => new Set([...Array.from(prev), myKey]));

      // email
      sendAppointmentEmail({
        to_email: appt.patientEmail,
        patient_name: appt.patientName,
        nutritionist_name: appt.nutriName,
        date: appt.date,
        time: appt.time,
      });

      toast(`Turno solicitado ✅ ${selectedNutri.name} · ${selectedDay} ${time}`);
    } catch (e: any) {
      if (e?.code === "SLOT_TAKEN") {
        toast("Ese horario se reservó recién. Elegí otro.");
        // re-sync
        const setBooked = await getBookedSlotsForNutri(selectedNutri.uid, selectedDay);
        setBookedSlots(setBooked);
      } else {
        console.error(e);
        toast("No se pudo solicitar el turno. Intentá de nuevo.");
      }
    } finally {
      setCreating(false);
    }
  }

  // ===== UI =====
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
          <Pressable
            onPress={() => router.replace("/(public)")}
            style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <Image
              source={require("../../../../assets/images/icon.png")}
              style={{ width: 34, height: 34, borderRadius: 12 }}
            />
            <View>
              <Text variant="titleMedium" style={{ color: theme.headerText, fontWeight: "800" }}>
                NutriCare
              </Text>
              <Text style={{ color: theme.headerMuted, marginTop: -2, fontSize: 12 }}>
                Panel Paciente
              </Text>
            </View>
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {photoURL ? (
              <Avatar.Image size={36} source={{ uri: photoURL }} />
            ) : (
              <Avatar.Text size={36} label={(name || "P")[0]?.toUpperCase()} />
            )}

            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontWeight: "800", color: theme.headerText, lineHeight: 18 }}>
                {name || "Paciente"}
              </Text>
              <Text style={{ color: theme.headerMuted, fontSize: 11 }}>{user?.email || email}</Text>
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
              Registrá comidas, progreso y turnos con tu nutricionista.
            </Text>

            <View style={{ marginTop: 12, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Chip style={styles.pill} textStyle={{ color: "#4C1D95", fontWeight: "700" }}>
                Peso: {weights.length ? `${weights[weights.length - 1].value} kg` : "—"}
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
                Turnos: 30min
              </Chip>
            </View>
          </View>

          {/* GRID TOP */}
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
                  style={{ marginBottom: 10, backgroundColor: "#FFFFFF" }}
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
                  style={{ marginBottom: 10, backgroundColor: "#FFFFFF" }}
                  outlineColor={theme.border}
                  activeOutlineColor={theme.violet}
                  textColor={theme.text}
                />
                <TextInput
                  label="Obra social"
                  value={obraSocial}
                  onChangeText={setObraSocial}
                  mode="outlined"
                  style={{ marginBottom: 10, backgroundColor: "#FFFFFF" }}
                  outlineColor={theme.border}
                  activeOutlineColor={theme.violet}
                  textColor={theme.text}
                />

                <Button mode="contained" style={styles.primaryBtn} textColor="#FFFFFF" onPress={saveProfile}>
                  Guardar datos
                </Button>
              </Card.Content>
            </Card>

            {/* ACCIONES */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Acciones rápidas</Text>
                <Text style={{ color: theme.muted, marginTop: 6, lineHeight: 22 }}>
                  Cargá peso y comidas para ver tu progreso en el gráfico.
                </Text>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <Button
                    mode="contained"
                    style={styles.primaryBtn}
                    textColor="#FFFFFF"
                    onPress={() => setOpenWeightModal(true)}
                  >
                    Medir peso
                  </Button>

                  <Button
                    mode="outlined"
                    style={styles.secondaryBtn}
                    textColor={theme.violet}
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
                    Tip: cuanto más constante seas, más claro se ve tu avance 📈
                  </Text>
                </View>
              </Card.Content>
            </Card>
          </View>

          {/* GRAFICO */}
          <View style={{ marginTop: 12 }}>
            <Card style={styles.sectionCard}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Progreso de peso</Text>
                <Text style={{ color: theme.muted, marginTop: 6 }}>Evolución por fecha.</Text>

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
                      <Text style={{ color: theme.muted }}>
                        Cargá al menos 2 registros de peso para ver el gráfico.
                      </Text>
                    </View>
                  )}
                </View>
              </Card.Content>
            </Card>
          </View>

          {/* COMIDAS (SCROLL INTERNO) */}
          <View style={{ marginTop: 12 }}>
            <Card style={styles.sectionCard}>
              <Card.Content>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Comidas</Text>
                    <Text style={{ color: theme.muted, marginTop: 4 }}>
                      Historial por fecha + encuesta con estrellas
                    </Text>
                  </View>

                  <Button
                    mode="contained"
                    style={styles.primaryBtn}
                    textColor="#FFFFFF"
                    onPress={() => setOpenMealModal(true)}
                  >
                    Agregar
                  </Button>
                </View>

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                {meals.length === 0 ? (
                  <Text style={{ color: theme.muted }}>Todavía no cargaste comidas. Tocá “Agregar”.</Text>
                ) : (
                  <View
                    style={{
                      maxHeight: 420, // ✅ limita el alto para que no tape calendario
                    }}
                  >
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                      <View style={{ gap: 10, paddingBottom: 6 }}>
                        {meals.map((m) => (
                          <Card key={m.id} style={{ ...styles.innerCard }}>
                            <Card.Content>
                              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <View style={{ flex: 1, paddingRight: 8 }}>
                                  <Text style={{ fontWeight: "900", color: theme.text }}>
                                    {formatDateLabel(m.date)} · {m.mealType}
                                  </Text>

                                  <Text style={{ marginTop: 8, color: theme.muted, lineHeight: 20 }}>
                                    {m.text}
                                  </Text>

                                  <View style={{ marginTop: 10 }}>
                                    <Text style={{ color: theme.text, fontWeight: "900" }}>
                                      ⭐ Experiencia general
                                    </Text>
                                    <StarRating value={m.ratings.overall} />
                                  </View>

                                  <View style={{ marginTop: 10 }}>
                                    <Text style={{ color: theme.text, fontWeight: "900" }}>1) ¿Qué tanto te llenó?</Text>
                                    <StarRating value={m.ratings.satiety} />
                                  </View>

                                  <View style={{ marginTop: 10 }}>
                                    <Text style={{ color: theme.text, fontWeight: "900" }}>2) Energía después</Text>
                                    <StarRating value={m.ratings.energy} />
                                  </View>

                                  <View style={{ marginTop: 10 }}>
                                    <Text style={{ color: theme.text, fontWeight: "900" }}>3) Digestión</Text>
                                    <StarRating value={m.ratings.digestion} />
                                  </View>

                                  <View style={{ marginTop: 10 }}>
                                    <Text style={{ color: theme.text, fontWeight: "900" }}>4) Antojos/ansiedad</Text>
                                    <StarRating value={m.ratings.cravings} />
                                  </View>

                                  <View style={{ marginTop: 10 }}>
                                    <Text style={{ color: theme.text, fontWeight: "900" }}>5) Adherencia al plan</Text>
                                    <StarRating value={m.ratings.adherence} />
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
                    </ScrollView>
                  </View>
                )}
              </Card.Content>
            </Card>
          </View>

          {/* TURNOS */}
          <View style={{ marginTop: 12 }}>
            <Card style={styles.sectionCard}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Turnos</Text>
                <Text style={{ color: theme.muted, marginTop: 6, lineHeight: 20 }}>
                  Elegí nutricionista, día y horario (cada 30 min). Si está ocupado, no te deja reservar.
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

                <View style={{ marginTop: 12, gap: 10 }}>
                  <Text style={{ color: theme.text, fontWeight: "900" }}>Nutricionista</Text>

                  {nutris.length === 0 ? (
                    <View
                      style={{
                        padding: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.border2,
                        backgroundColor: "#FFFFFF",
                      }}
                    >
                      <Text style={{ color: theme.text, fontWeight: "900" }}>
                        No hay nutricionistas cargados (role="nutricionista").
                      </Text>
                      <Text style={{ color: theme.muted, marginTop: 6 }}>
                        Cargalos en la DB en users/{`{uid}`} con role = "nutricionista".
                      </Text>
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        {nutris.map((n) => {
                          const selected = n.uid === selectedNutriUid;
                          return (
                            <Pressable key={n.uid} onPress={() => setSelectedNutriUid(n.uid)}>
                              <View
                                style={{
                                  padding: 12,
                                  borderRadius: 16,
                                  borderWidth: 1,
                                  borderColor: selected ? theme.violet : theme.border2,
                                  backgroundColor: selected ? theme.violetSoft : "#FFFFFF",
                                  minWidth: 220,
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 10,
                                }}
                              >
                                {n.photoURL ? (
                                  <Avatar.Image size={40} source={{ uri: n.photoURL }} />
                                ) : (
                                  <Avatar.Text size={40} label={(n.name || "N")[0].toUpperCase()} />
                                )}
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontWeight: "900", color: theme.text }}>{n.name}</Text>
                                  <Text style={{ color: theme.muted, fontSize: 12 }}>{n.email}</Text>
                                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                                    {dayAvailability.start}–{dayAvailability.end} · 30 min
                                  </Text>
                                </View>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  )}

                  <Text style={{ color: theme.text, fontWeight: "900", marginTop: 8 }}>
                    Horarios disponibles — {selectedDay}
                  </Text>

                  <SegmentedButtons
                    value={timeFilter}
                    onValueChange={(v) => setTimeFilter(v as any)}
                    buttons={[
                      { value: "all", label: "Todo" },
                      { value: "morning", label: "Mañana" },
                      { value: "afternoon", label: "Tarde" },
                    ]}
                  />

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                    {filteredSlots.map((t) => {
                      const ocupado = bookedSlots.has(t);
                      const yo = selectedNutri ? myBookedToday.has(`${selectedNutri.uid}|${t}`) : false;

                      const disabled = ocupado || yo || creating || !selectedNutri;

                      return (
                        <View key={t} style={{ minWidth: 120 }}>
                          <Button
                            mode={disabled ? "outlined" : "contained"}
                            style={{
                              borderRadius: 14,
                              backgroundColor: disabled ? "#FFFFFF" : theme.violet,
                              borderColor: disabled ? theme.border2 : theme.violet,
                            }}
                            textColor={disabled ? theme.text : "#FFFFFF"}
                            onPress={() => bookSlot(t)}
                            disabled={disabled}
                          >
                            {t}
                          </Button>

                          {(ocupado || yo) && (
                            <Text style={{ marginTop: 4, fontSize: 11, color: theme.muted }}>
                              {yo ? "Ya lo pediste" : "Ocupado (ya reservado)"}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
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
              margin: 18,
              padding: 18,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: theme.border2,
              ...theme.shadow,
              maxHeight: "85%",
            }}
          >
            <ScrollView>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Agregar comida</Text>
              <Text style={{ color: theme.muted, marginTop: 6 }}>Fecha, tipo y encuesta con estrellas.</Text>

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

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>⭐ Experiencia general</Text>
                <StarRating value={mealRatings.overall} onChange={(v) => setMealRatings((p) => ({ ...p, overall: v }))} />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>1) ¿Qué tanto te llenó?</Text>
                <StarRating value={mealRatings.satiety} onChange={(v) => setMealRatings((p) => ({ ...p, satiety: v }))} />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>2) Energía después</Text>
                <StarRating value={mealRatings.energy} onChange={(v) => setMealRatings((p) => ({ ...p, energy: v }))} />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>3) Digestión</Text>
                <StarRating value={mealRatings.digestion} onChange={(v) => setMealRatings((p) => ({ ...p, digestion: v }))} />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>4) Antojos/ansiedad</Text>
                <StarRating value={mealRatings.cravings} onChange={(v) => setMealRatings((p) => ({ ...p, cravings: v }))} />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>5) Adherencia al plan</Text>
                <StarRating value={mealRatings.adherence} onChange={(v) => setMealRatings((p) => ({ ...p, adherence: v }))} />
              </View>

              <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                <Button onPress={() => setOpenMealModal(false)} textColor={theme.text}>
                  Cancelar
                </Button>
                <Button mode="contained" onPress={addMeal} style={{ borderRadius: 12, backgroundColor: theme.violet }} textColor="#FFFFFF">
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
              margin: 18,
              padding: 18,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: theme.border2,
              ...theme.shadow,
              maxHeight: "85%",
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

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>⭐ Experiencia general</Text>
                <StarRating
                  value={editingMeal?.ratings?.overall || 0}
                  onChange={(v) => setEditingMeal((p) => (p ? { ...p, ratings: { ...p.ratings, overall: v } } : p))}
                />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>1) ¿Qué tanto te llenó?</Text>
                <StarRating
                  value={editingMeal?.ratings?.satiety || 0}
                  onChange={(v) => setEditingMeal((p) => (p ? { ...p, ratings: { ...p.ratings, satiety: v } } : p))}
                />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>2) Energía después</Text>
                <StarRating
                  value={editingMeal?.ratings?.energy || 0}
                  onChange={(v) => setEditingMeal((p) => (p ? { ...p, ratings: { ...p.ratings, energy: v } } : p))}
                />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>3) Digestión</Text>
                <StarRating
                  value={editingMeal?.ratings?.digestion || 0}
                  onChange={(v) => setEditingMeal((p) => (p ? { ...p, ratings: { ...p.ratings, digestion: v } } : p))}
                />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>4) Antojos/ansiedad</Text>
                <StarRating
                  value={editingMeal?.ratings?.cravings || 0}
                  onChange={(v) => setEditingMeal((p) => (p ? { ...p, ratings: { ...p.ratings, cravings: v } } : p))}
                />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>5) Adherencia al plan</Text>
                <StarRating
                  value={editingMeal?.ratings?.adherence || 0}
                  onChange={(v) => setEditingMeal((p) => (p ? { ...p, ratings: { ...p.ratings, adherence: v } } : p))}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
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
