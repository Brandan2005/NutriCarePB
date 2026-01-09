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
import { onValue, ref, push, set, update, remove } from "firebase/database";
import { Calendar } from "react-native-calendars";
import { LineChart } from "react-native-gifted-charts";

import { auth, rtdb } from "../../../shared/services/firebase";
import { useGoogleCalendarAuth, googleCreateEvent } from "../../../shared/services/googleCalendar";

type WeightItem = { id: string; value: number; date: string };
type MealItem = { id: string; date: string; mealType: string; text: string; rating: number };

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

  const { accessToken, promptAsync } = useGoogleCalendarAuth();
  const [calendarLinked, setCalendarLinked] = useState(false);

  const [snack, setSnack] = useState<{ open: boolean; msg: string }>({ open: false, msg: "" });
  const toast = (msg: string) => setSnack({ open: true, msg });

  const [name, setName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [obraSocial, setObraSocial] = useState<string>("");
  const [photoURL, setPhotoURL] = useState<string>("");

  const [weights, setWeights] = useState<WeightItem[]>([]);
  const [openWeightModal, setOpenWeightModal] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [newWeightDate, setNewWeightDate] = useState(todayISO());

  const [meals, setMeals] = useState<MealItem[]>([]);
  const [openMealModal, setOpenMealModal] = useState(false);
  const [mealDate, setMealDate] = useState(todayISO());
  const [mealType, setMealType] = useState("Desayuno");
  const [mealText, setMealText] = useState("");
  const [mealRating, setMealRating] = useState(4);

  const [editingMeal, setEditingMeal] = useState<MealItem | null>(null);

  const [selectedDay, setSelectedDay] = useState(todayISO());

  // ====== THEME (PRO white + violet, header black) ======
  const theme = useMemo(
    () => ({
      // brand
      violet: "#6D28D9", // deep violet
      violet2: "#8B5CF6", // accent
      violetSoft: "#F3E8FF", // surface tint
      violetRing: "#DDD6FE",

      // neutrals
      pageBg: "#F8FAFC", // subtle off-white
      surface: "#FFFFFF",
      border: "#E5E7EB",
      border2: "#EEF2F7",

      text: "#0F172A",
      muted: "#64748B",

      // header
      headerBg: "#000000",
      headerBorder: "#111827",
      headerText: "#F9FAFB",
      headerMuted: "#CBD5E1",

      danger: "#EF4444",

      // elevation
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

  const markedDates = useMemo(() => {
    const marks: any = {};
    marks[selectedDay] = { selected: true, selectedColor: theme.violet };

    marks["2025-04-21"] = { marked: true, dotColor: theme.violet2 };
    marks["2025-04-28"] = { marked: true, dotColor: theme.violet2 };

    return marks;
  }, [selectedDay, theme.violet, theme.violet2]);

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

  useEffect(() => {
    if (accessToken) setCalendarLinked(true);
  }, [accessToken]);

  const chartData = useMemo(() => {
    return weights
      .filter((w) => w.date && !Number.isNaN(w.value) && w.value > 0)
      .map((w) => ({
        value: w.value,
        label: formatDateLabel(w.date),
      }));
  }, [weights]);

  const chartMax = useMemo(() => {
    if (chartData.length === 0) return 0;
    const max = Math.max(...chartData.map((d) => d.value));
    return max + 2;
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

  async function connectGoogleCalendar() {
    try {
      await promptAsync();
    } catch {
      toast("No se pudo conectar Google Calendar.");
    }
  }

  async function createCalendarEventDemo() {
    try {
      if (!accessToken) {
        toast("Primero conectá Google Calendar.");
        return;
      }

      const startISO = new Date().toISOString();
      const endISO = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      await googleCreateEvent(accessToken, {
        title: "Turno NutriCare (demo)",
        startISO,
        endISO,
        description: `Evento creado desde NutriCare para ${email}`,
      });

      toast("Evento creado en tu Google Calendar ✅");
    } catch (e: any) {
      toast(e?.message ? String(e.message).slice(0, 120) : "Error creando evento (Google Calendar).");
    }
  }

  // Reusable styles (makes it look consistent + pro)
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
      input: {
        backgroundColor: "#FFFFFF",
      } as any,
      inputOutline: theme.border,
      inputActive: theme.violet,
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

  return (
    <PaperProvider>
      <View style={{ flex: 1, backgroundColor: theme.pageBg }}>
        {/* HEADER (NEGRO PREMIUM) */}
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
          </View>

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
              <Text style={{ color: theme.headerMuted, fontSize: 11 }}>{email}</Text>
            </View>

            <Button mode="text" textColor="#FCA5A5" onPress={() => signOut(auth)}>
              Cerrar sesión
            </Button>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
          {/* HERO / BIENVENIDA */}
          <View style={styles.hero}>
            <Text style={{ color: "#4C1D95", fontSize: 18, fontWeight: "900" }}>
              Hola, {name || "Paciente"} 👋
            </Text>
            <Text style={{ color: "#5B21B6", marginTop: 6, lineHeight: 20 }}>
              Tu panel personal para registrar comidas, progreso y turnos.
            </Text>

            <View style={{ marginTop: 12, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Chip style={styles.pill} textStyle={{ color: "#4C1D95", fontWeight: "700" }}>
                Peso: {weights.length ? `${weights[weights.length - 1].value} kg` : "—"}
              </Chip>
              <Chip
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.border2,
                  backgroundColor: "#FFFFFF",
                }}
                textStyle={{ color: theme.text, fontWeight: "700" }}
              >
                Comidas: {meals.length}
              </Chip>
              <Chip
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.border2,
                  backgroundColor: "#FFFFFF",
                }}
                textStyle={{ color: theme.text, fontWeight: "700" }}
              >
                Turnos:
              </Chip>
            </View>
          </View>

          {/* GRID */}
          <View style={{ marginTop: 12, flexDirection: isWide ? "row" : "column", gap: 12 }}>
            {/* DATOS */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>
                  Datos del perfil
                </Text>
                <Text style={{ color: theme.muted, marginTop: 6 }}>
                  Mantené tus datos actualizados para tu seguimiento.
                </Text>

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                <TextInput
                  label="Nombre"
                  value={name}
                  onChangeText={setName}
                  style={[{ marginBottom: 10 }, styles.input]}
                  outlineColor={styles.inputOutline}
                  activeOutlineColor={styles.inputActive}
                  textColor={theme.text}
                  mode="outlined"
                />
                <TextInput
                  label="Teléfono"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  style={[{ marginBottom: 10 }, styles.input]}
                  outlineColor={styles.inputOutline}
                  activeOutlineColor={styles.inputActive}
                  textColor={theme.text}
                  mode="outlined"
                />
                <TextInput
                  label="Obra social"
                  value={obraSocial}
                  onChangeText={setObraSocial}
                  style={[{ marginBottom: 10 }, styles.input]}
                  outlineColor={styles.inputOutline}
                  activeOutlineColor={styles.inputActive}
                  textColor={theme.text}
                  mode="outlined"
                />

                <Button mode="contained" style={styles.primaryBtn} onPress={saveProfile}>
                  Guardar datos
                </Button>
              </Card.Content>
            </Card>

            {/* ACCIONES */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>
                  Acciones rápidas
                </Text>
                <Text style={{ color: theme.muted, marginTop: 6, lineHeight: 22 }}>
                  Registrá tu progreso y mantené consistencia.
                </Text>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <Button mode="contained" style={styles.primaryBtn} onPress={() => setOpenWeightModal(true)}>
                    Medir peso
                  </Button>

                  <Button mode="outlined" style={styles.secondaryBtn} onPress={() => setOpenMealModal(true)} textColor={theme.violet}>
                    Agregar comida
                  </Button>

                  <Button
                    mode={calendarLinked ? "contained" : "outlined"}
                    style={{
                      borderRadius: 14,
                      backgroundColor: calendarLinked ? theme.violet : undefined,
                      borderColor: theme.violet,
                    }}
                    onPress={connectGoogleCalendar}
                    textColor={calendarLinked ? "#FFFFFF" : theme.violet}
                  >
                    {calendarLinked ? "Google Calendar conectado" : "Conectar Google Calendar"}
                  </Button>

                  <Button
                    mode="contained"
                    style={styles.primaryBtn}
                    onPress={createCalendarEventDemo}
                    disabled={!accessToken}
                  >
                    Crear turno (demo)
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

          {/* GRÁFICO */}
          <View style={{ marginTop: 12 }}>
            <Card style={styles.sectionCard}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>
                  Progreso de peso
                </Text>
                <Text style={{ color: theme.muted, marginTop: 6 }}>
                  Visualizá tu evolución por fecha.
                </Text>

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

          {/* COMIDAS */}
          <View style={{ marginTop: 12 }}>
            <Card style={styles.sectionCard}>
              <Card.Content>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>
                      Comidas
                    </Text>
                    <Text style={{ color: theme.muted, marginTop: 4 }}>
                      Historial por fecha con experiencia ⭐
                    </Text>
                  </View>

                  <Button mode="contained" style={styles.primaryBtn} onPress={() => setOpenMealModal(true)}>
                    Agregar
                  </Button>
                </View>

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                {meals.length === 0 ? (
                  <Text style={{ color: theme.muted }}>Todavía no cargaste comidas. Tocá “Agregar”.</Text>
                ) : (
                  <View style={{ gap: 10 }}>
                    {meals.map((m) => (
                      <Card key={m.id} style={{ ...styles.innerCard }}>
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
                                  <Text style={{ color: "#4C1D95", fontSize: 12, fontWeight: "800" }}>
                                    ⭐ {m.rating}/5
                                  </Text>
                                </View>
                              </View>

                              <Text style={{ marginTop: 8, color: theme.muted, lineHeight: 20 }}>
                                {m.text}
                              </Text>

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

          {/* CALENDARIO */}
          <View style={{ marginTop: 12 }}>
            <Card style={styles.sectionCard}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>
                  Turnos
                </Text>
                <Text style={{ color: theme.muted, marginTop: 6 }}>
                  Calendario (alfa). La creación real de turnos la vamos a hacer con Google Calendar.
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

                <View
                  style={{
                    marginTop: 12,
                    padding: 14,
                    backgroundColor: theme.violetSoft,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: theme.violetRing,
                  }}
                >
                  <Text style={{ fontWeight: "900", color: "#4C1D95" }}>
                    Seleccionado: {selectedDay}
                  </Text>
                  <Text style={{ color: "#5B21B6", marginTop: 6 }}>
                    (Alfa) No hay turnos cargados para este día.
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
              <Button mode="contained" onPress={addWeight} style={{ borderRadius: 12, backgroundColor: theme.violet }}>
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
              <Button mode="contained" onPress={addMeal} style={{ borderRadius: 12, backgroundColor: theme.violet }}>
                Guardar
              </Button>
            </View>
          </Modal>
        </Portal>

        {/* MODAL EDITAR */}
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
              <Button mode="contained" onPress={saveMealEdit} style={{ borderRadius: 12, backgroundColor: theme.violet }}>
                Guardar cambios
              </Button>
            </View>
          </Modal>
        </Portal>

        <Snackbar visible={snack.open} onDismiss={() => setSnack({ open: false, msg: "" })} duration={2500}>
          {snack.msg}
        </Snackbar>
      </View>
    </PaperProvider>
  );
}

