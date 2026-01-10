import React, { useEffect, useMemo, useState } from "react";
import { View, ScrollView, Image, Dimensions } from "react-native";
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  Modal,
  Portal,
  Snackbar,
  Text,
  TextInput,
  Provider as PaperProvider,
} from "react-native-paper";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import { onValue, push, ref, set, update } from "firebase/database";
import { LineChart } from "react-native-gifted-charts";

import { auth, rtdb } from "../../../shared/services/firebase";
import {
  Appointment,
  cancelAppointment,
  listenAppointmentsByNutri,
  setAppointmentStatus,
} from "../../../shared/services/appointments";

type UserRole = "paciente" | "nutricionista";

type UserDoc = {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  obraSocial?: string;
  photoURL?: string;
};

type WeightItem = { id: string; value: number; date: string };
type MealItem = {
  id: string;
  date: string;
  mealType: string;
  text: string;
  rating: number;
  // si después agregás preguntas extra, quedan guardadas acá:
  q1?: number; q2?: number; q3?: number; q4?: number; q5?: number;
};

const { width } = Dimensions.get("window");
const isWide = width >= 900;

function formatDateLabel(iso: string) {
  if (!iso || !iso.includes("-")) return iso;
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function statusLabel(s: Appointment["status"]) {
  if (s === "pendiente") return "Pendiente";
  if (s === "asistio") return "Asistió";
  if (s === "no_asistio") return "No asistió";
  return "Cancelado";
}

function statusColors(s: Appointment["status"]) {
  // devuelve { bg, text, border }
  if (s === "asistio") return { bg: "#ECFDF5", text: "#065F46", border: "#A7F3D0" };
  if (s === "no_asistio") return { bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" };
  if (s === "cancelado") return { bg: "#F3F4F6", text: "#374151", border: "#E5E7EB" };
  return { bg: "#EEF2FF", text: "#3730A3", border: "#C7D2FE" }; // pendiente
}

export default function NutriHome({ email }: { email: string }) {
  const user = auth.currentUser;

  const [snack, setSnack] = useState<{ open: boolean; msg: string }>({ open: false, msg: "" });
  const toast = (msg: string) => setSnack({ open: true, msg });

  // ====== THEME (PRO white + violet, header black) ======
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
      primaryBtn: { borderRadius: 14, backgroundColor: theme.violet } as any,
      secondaryBtn: { borderRadius: 14, borderColor: theme.violet } as any,
      subtleDivider: { backgroundColor: theme.border2 } as any,
      input: { backgroundColor: "#FFFFFF" } as any,
    }),
    [theme]
  );

  // ====== Nutri profile ======
  const [nutriName, setNutriName] = useState("");
  const [nutriPhoto, setNutriPhoto] = useState("");

  // ====== Appointments ======
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filter, setFilter] = useState<"hoy" | "proximos" | "todos">("proximos");

  // ====== Patients ======
  const [patients, setPatients] = useState<UserDoc[]>([]);
  const [query, setQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<UserDoc | null>(null);

  // Patient detail data
  const [pWeights, setPWeights] = useState<WeightItem[]>([]);
  const [pMeals, setPMeals] = useState<MealItem[]>([]);
  const [openAddWeight, setOpenAddWeight] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [newWeightDate, setNewWeightDate] = useState("");

  useEffect(() => {
    if (!user) return;

    // 1) Nutri doc
    const meRef = ref(rtdb, `users/${user.uid}`);
    const unsubMe = onValue(meRef, (snap) => {
      const data = snap.val() || {};
      setNutriName(data?.name || data?.email?.split("@")?.[0] || "Nutricionista");
      setNutriPhoto(data?.photoURL || "");
    });

    // 2) Appointments by nutri
    const unsubAppts = listenAppointmentsByNutri(user.uid, (list) => setAppointments(list));

    // 3) Patients list (simple: bajamos users y filtramos role === "paciente")
    const usersRef = ref(rtdb, "users");
    const unsubUsers = onValue(usersRef, (snap) => {
      const val = snap.val() || {};
      const list: UserDoc[] = Object.keys(val).map((uid) => ({
        uid,
        email: String(val[uid]?.email || ""),
        name: String(val[uid]?.name || val[uid]?.email?.split("@")?.[0] || "Paciente"),
        role: (val[uid]?.role || "paciente") as UserRole,
        phone: val[uid]?.phone || "",
        obraSocial: val[uid]?.obraSocial || "",
        photoURL: val[uid]?.photoURL || "",
      }));
      setPatients(list.filter((u) => u.role === "paciente"));
    });

    return () => {
      unsubMe();
      unsubAppts();
      unsubUsers();
    };
  }, [user]);

  // When open patient: load weights/meals for that patient
  useEffect(() => {
    if (!selectedPatient) return;

    setPWeights([]);
    setPMeals([]);

    const wRef = ref(rtdb, `weights/${selectedPatient.uid}`);
    const mRef = ref(rtdb, `meals/${selectedPatient.uid}`);

    const unsubW = onValue(wRef, (snap) => {
      const val = snap.val() || {};
      const list: WeightItem[] = Object.keys(val).map((id) => ({
        id,
        value: Number(val[id]?.value ?? 0),
        date: String(val[id]?.date ?? ""),
      }));
      list.sort((a, b) => (a.date < b.date ? -1 : 1));
      setPWeights(list);
    });

    const unsubM = onValue(mRef, (snap) => {
      const val = snap.val() || {};
      const list: MealItem[] = Object.keys(val).map((id) => ({
        id,
        date: String(val[id]?.date ?? ""),
        mealType: String(val[id]?.mealType ?? ""),
        text: String(val[id]?.text ?? ""),
        rating: Number(val[id]?.rating ?? 0),
        q1: val[id]?.q1 ?? undefined,
        q2: val[id]?.q2 ?? undefined,
        q3: val[id]?.q3 ?? undefined,
        q4: val[id]?.q4 ?? undefined,
        q5: val[id]?.q5 ?? undefined,
      }));
      list.sort((a, b) => (a.date > b.date ? -1 : 1));
      setPMeals(list);
    });

    return () => {
      unsubW();
      unsubM();
    };
  }, [selectedPatient]);

  const apptsFiltered = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;

    const list = [...appointments];

    if (filter === "hoy") {
      return list.filter((a) => a.date === today).sort((a, b) => (a.time < b.time ? -1 : 1));
    }
    if (filter === "proximos") {
      return list
        .filter((a) => a.date >= today && a.status !== "cancelado")
        .sort((a, b) => (`${a.date}T${a.time}` < `${b.date}T${b.time}` ? -1 : 1));
    }
    return list.sort((a, b) => (`${a.date}T${a.time}` < `${b.date}T${b.time}` ? -1 : 1));
  }, [appointments, filter]);

  const chartData = useMemo(() => {
    return pWeights
      .filter((w) => w.date && !Number.isNaN(w.value) && w.value > 0)
      .map((w) => ({
        value: w.value,
        label: formatDateLabel(w.date),
      }));
  }, [pWeights]);

  const chartMax = useMemo(() => {
    if (chartData.length === 0) return 0;
    const max = Math.max(...chartData.map((d) => d.value));
    return max + 2;
  }, [chartData]);

  const patientFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients.slice(0, 30);
    return patients
      .filter((p) => (p.name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [patients, query]);

  async function markAs(appt: Appointment, status: Appointment["status"]) {
    try {
      await setAppointmentStatus(appt, status);
      toast(`Turno: ${statusLabel(status)} ✅`);
    } catch (e: any) {
      toast(e?.message ? String(e.message) : "Error actualizando turno.");
    }
  }

  async function onCancel(appt: Appointment) {
    try {
      await cancelAppointment(appt);
      toast("Turno cancelado y horario liberado 🗑️");
    } catch (e: any) {
      toast(e?.message ? String(e.message) : "Error cancelando turno.");
    }
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function addWeightToPatient() {
    if (!selectedPatient) return;

    const value = Number(String(newWeight).replace(",", "."));
    if (!value || value <= 0) {
      toast("Ingresá un peso válido.");
      return;
    }

    const date = (newWeightDate || todayISO()).trim();
    if (!date || date.length !== 10) {
      toast("Fecha inválida. Usá YYYY-MM-DD.");
      return;
    }

    try {
      const listRef = ref(rtdb, `weights/${selectedPatient.uid}`);
      const newRef = push(listRef);
      await set(newRef, { value, date });

      setOpenAddWeight(false);
      setNewWeight("");
      setNewWeightDate("");
      toast("Peso agregado al paciente ✅");
    } catch (e: any) {
      toast(e?.message ? String(e.message) : "Error guardando peso.");
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
          {/* Icon + Brand (click -> public home) */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <IconButton
              icon={() => (
                <Image
                  source={require("../../../../assets/images/icon.png")}
                  style={{ width: 34, height: 34, borderRadius: 12 }}
                />
              )}
              onPress={() => router.push("/(public)")}
              style={{ margin: 0 }}
            />
            <View>
              <Text variant="titleMedium" style={{ color: theme.headerText, fontWeight: "800" }}>
                NutriCare
              </Text>
              <Text style={{ color: theme.headerMuted, marginTop: -2, fontSize: 12 }}>
                Panel Nutricionista
              </Text>
            </View>
          </View>

          {/* User */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {nutriPhoto ? (
              <Avatar.Image size={36} source={{ uri: nutriPhoto }} />
            ) : (
              <Avatar.Text size={36} label={(nutriName || "N")[0]?.toUpperCase()} />
            )}

            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontWeight: "800", color: theme.headerText, lineHeight: 18 }}>
                {nutriName || "Nutricionista"}
              </Text>
              <Text style={{ color: theme.headerMuted, fontSize: 11 }}>{email}</Text>
            </View>

            <Button mode="text" textColor="#FCA5A5" onPress={() => signOut(auth)}>
              Cerrar sesión
            </Button>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
          {/* TOP GRID */}
          <View style={{ flexDirection: isWide ? "row" : "column", gap: 12 }}>
            {/* TURNOS */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Turnos</Text>
                    <Text style={{ color: theme.muted, marginTop: 4 }}>
                      Confirmá asistencia, marcá ausencias o cancelá.
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <Button
                    mode={filter === "proximos" ? "contained" : "outlined"}
                    style={{
                      borderRadius: 999,
                      backgroundColor: filter === "proximos" ? theme.violet : undefined,
                      borderColor: theme.violet,
                    }}
                    textColor={filter === "proximos" ? "#FFFFFF" : theme.violet}
                    onPress={() => setFilter("proximos")}
                  >
                    Próximos
                  </Button>

                  <Button
                    mode={filter === "hoy" ? "contained" : "outlined"}
                    style={{
                      borderRadius: 999,
                      backgroundColor: filter === "hoy" ? theme.violet : undefined,
                      borderColor: theme.violet,
                    }}
                    textColor={filter === "hoy" ? "#FFFFFF" : theme.violet}
                    onPress={() => setFilter("hoy")}
                  >
                    Hoy
                  </Button>

                  <Button
                    mode={filter === "todos" ? "contained" : "outlined"}
                    style={{
                      borderRadius: 999,
                      backgroundColor: filter === "todos" ? theme.violet : undefined,
                      borderColor: theme.violet,
                    }}
                    textColor={filter === "todos" ? "#FFFFFF" : theme.violet}
                    onPress={() => setFilter("todos")}
                  >
                    Todos
                  </Button>
                </View>

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                {apptsFiltered.length === 0 ? (
                  <Text style={{ color: theme.muted }}>No tenés turnos en este filtro.</Text>
                ) : (
                  <View style={{ gap: 10 }}>
                    {apptsFiltered.slice(0, 12).map((a) => {
                      const st = statusColors(a.status);
                      return (
                        <Card key={a.id} style={{ ...styles.innerCard }}>
                          <Card.Content>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontWeight: "900", color: theme.text }}>
                                  {a.date} · {a.time}
                                </Text>

                                <Text style={{ color: theme.muted, marginTop: 4 }}>
                                  Paciente: <Text style={{ fontWeight: "800" }}>{a.patientName}</Text> ({a.patientEmail})
                                </Text>

                                <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                                  <View
                                    style={{
                                      paddingHorizontal: 10,
                                      paddingVertical: 6,
                                      borderRadius: 999,
                                      backgroundColor: st.bg,
                                      borderWidth: 1,
                                      borderColor: st.border,
                                    }}
                                  >
                                    <Text style={{ color: st.text, fontWeight: "800" }}>{statusLabel(a.status)}</Text>
                                  </View>

                                  <Button
                                    mode="contained"
                                    style={{ borderRadius: 12, backgroundColor: theme.violet }}
                                    textColor="#FFFFFF"
                                    onPress={() =>
                                      setSelectedPatient({
                                        uid: a.patientUid,
                                        name: a.patientName,
                                        email: a.patientEmail,
                                        role: "paciente",
                                      })
                                    }
                                  >
                                    Ver paciente
                                  </Button>
                                </View>
                              </View>

                              <View style={{ alignItems: "flex-end" }}>
                                <IconButton
                                  icon="check-circle"
                                  iconColor="#059669"
                                  onPress={() => markAs(a, "asistio")}
                                />
                                <IconButton
                                  icon="close-circle"
                                  iconColor="#DC2626"
                                  onPress={() => markAs(a, "no_asistio")}
                                />
                                <IconButton
                                  icon="trash-can-outline"
                                  iconColor={theme.danger}
                                  onPress={() => onCancel(a)}
                                />
                              </View>
                            </View>
                          </Card.Content>
                        </Card>
                      );
                    })}

                    {apptsFiltered.length > 12 && (
                      <Text style={{ color: theme.muted, marginTop: 6 }}>
                        Mostrando 12 de {apptsFiltered.length}. (Después hacemos paginado si querés.)
                      </Text>
                    )}
                  </View>
                )}
              </Card.Content>
            </Card>

            {/* PACIENTES */}
            <Card style={{ flex: 1, ...styles.sectionCard }}>
              <Card.Content>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Pacientes</Text>
                <Text style={{ color: theme.muted, marginTop: 4 }}>
                  Buscá por nombre o email y mirá su progreso.
                </Text>

                <TextInput
                  label="Buscar paciente"
                  value={query}
                  onChangeText={setQuery}
                  mode="outlined"
                  style={[{ marginTop: 12 }, styles.input]}
                  outlineColor={theme.border}
                  activeOutlineColor={theme.violet}
                  textColor={theme.text}
                />

                <Divider style={{ marginVertical: 14, ...styles.subtleDivider }} />

                {patientFiltered.length === 0 ? (
                  <Text style={{ color: theme.muted }}>No hay pacientes que coincidan.</Text>
                ) : (
                  <View style={{ gap: 10 }}>
                    {patientFiltered.map((p) => (
                      <Card key={p.uid} style={styles.innerCard}>
                        <Card.Content>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                              {p.photoURL ? (
                                <Avatar.Image size={40} source={{ uri: p.photoURL }} />
                              ) : (
                                <Avatar.Text size={40} label={(p.name || "P")[0]?.toUpperCase()} />
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontWeight: "900", color: theme.text }} numberOfLines={1}>
                                  {p.name}
                                </Text>
                                <Text style={{ color: theme.muted }} numberOfLines={1}>
                                  {p.email}
                                </Text>
                              </View>
                            </View>

                            <Button
                              mode="contained"
                              style={styles.primaryBtn}
                              textColor="#FFFFFF"
                              onPress={() => setSelectedPatient(p)}
                            >
                              Ver
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

        {/* MODAL PERFIL PACIENTE */}
        <Portal>
          <Modal
            visible={!!selectedPatient}
            onDismiss={() => setSelectedPatient(null)}
            contentContainerStyle={{
              backgroundColor: "#FFFFFF",
              margin: 16,
              padding: 16,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: theme.border2,
              ...theme.shadow,
              maxHeight: "90%",
            }}
          >
            {selectedPatient && (
              <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>
                      Perfil del paciente
                    </Text>
                    <Text style={{ color: theme.muted, marginTop: 2 }}>
                      {selectedPatient.name} · {selectedPatient.email}
                    </Text>
                  </View>

                  <IconButton icon="close" onPress={() => setSelectedPatient(null)} />
                </View>

                <Divider style={{ marginVertical: 12, ...styles.subtleDivider }} />

                {/* Acciones */}
                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  <Button
                    mode="contained"
                    style={styles.primaryBtn}
                    textColor="#FFFFFF"
                    onPress={() => setOpenAddWeight(true)}
                  >
                    Agregar peso
                  </Button>

                  <Button
                    mode="outlined"
                    style={styles.secondaryBtn}
                    textColor={theme.violet}
                    onPress={() => toast("Si querés, después agregamos editar datos del paciente.")}
                  >
                    Editar datos (opcional)
                  </Button>
                </View>

                {/* Peso chart */}
                <View style={{ marginTop: 14 }}>
                  <Card style={styles.sectionCard}>
                    <Card.Content>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>
                        Progreso de peso
                      </Text>
                      <Text style={{ color: theme.muted, marginTop: 4 }}>
                        Visualización rápida (kg por fecha).
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
                          <Text style={{ color: theme.muted, marginTop: 8 }}>
                            Cargá al menos 2 pesos para ver el gráfico.
                          </Text>
                        )}
                      </View>
                    </Card.Content>
                  </Card>
                </View>

                {/* Meals preview */}
                <View style={{ marginTop: 14 }}>
                  <Card style={styles.sectionCard}>
                    <Card.Content>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>
                        Comidas recientes
                      </Text>
                      <Text style={{ color: theme.muted, marginTop: 4 }}>
                        Últimas cargas del paciente.
                      </Text>

                      <Divider style={{ marginVertical: 12, ...styles.subtleDivider }} />

                      {pMeals.length === 0 ? (
                        <Text style={{ color: theme.muted }}>No hay comidas registradas.</Text>
                      ) : (
                        <View style={{ gap: 10 }}>
                          {pMeals.slice(0, 6).map((m) => (
                            <Card key={m.id} style={styles.innerCard}>
                              <Card.Content>
                                <Text style={{ fontWeight: "900", color: theme.text }}>
                                  {formatDateLabel(m.date)} · {m.mealType} · ⭐ {m.rating}/5
                                </Text>
                                <Text style={{ color: theme.muted, marginTop: 6, lineHeight: 20 }}>
                                  {m.text}
                                </Text>

                                {/* si existen preguntas extra, se muestran */}
                                {(m.q1 || m.q2 || m.q3 || m.q4 || m.q5) ? (
                                  <View style={{ marginTop: 10, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                                    {typeof m.q1 === "number" && <Chip>Q1: {m.q1}/5</Chip>}
                                    {typeof m.q2 === "number" && <Chip>Q2: {m.q2}/5</Chip>}
                                    {typeof m.q3 === "number" && <Chip>Q3: {m.q3}/5</Chip>}
                                    {typeof m.q4 === "number" && <Chip>Q4: {m.q4}/5</Chip>}
                                    {typeof m.q5 === "number" && <Chip>Q5: {m.q5}/5</Chip>}
                                  </View>
                                ) : null}
                              </Card.Content>
                            </Card>
                          ))}

                          {pMeals.length > 6 && (
                            <Text style={{ color: theme.muted }}>
                              Mostrando 6 de {pMeals.length}.
                            </Text>
                          )}
                        </View>
                      )}
                    </Card.Content>
                  </Card>
                </View>
              </ScrollView>
            )}
          </Modal>
        </Portal>

        {/* MODAL AGREGAR PESO A PACIENTE */}
        <Portal>
          <Modal
            visible={openAddWeight}
            onDismiss={() => setOpenAddWeight(false)}
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
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Agregar peso</Text>
            <Text style={{ color: theme.muted, marginTop: 6 }}>
              Esto se guarda en el perfil del paciente y le aparece en su gráfico.
            </Text>

            <TextInput
              label="Peso (kg)"
              value={newWeight}
              onChangeText={setNewWeight}
              keyboardType="numeric"
              mode="outlined"
              style={[{ marginTop: 12 }, styles.input]}
              outlineColor={theme.border}
              activeOutlineColor={theme.violet}
              textColor={theme.text}
            />

            <TextInput
              label="Fecha (YYYY-MM-DD)"
              value={newWeightDate}
              onChangeText={setNewWeightDate}
              mode="outlined"
              style={[{ marginTop: 10 }, styles.input]}
              outlineColor={theme.border}
              activeOutlineColor={theme.violet}
              textColor={theme.text}
            />

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <Button onPress={() => setOpenAddWeight(false)} textColor={theme.text}>
                Cancelar
              </Button>
              <Button mode="contained" style={styles.primaryBtn} textColor="#FFFFFF" onPress={addWeightToPatient}>
                Guardar
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
