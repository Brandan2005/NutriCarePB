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
import { onValue, ref, update } from "firebase/database";
import { LineChart } from "react-native-gifted-charts";

import { auth, rtdb } from "../../../shared/services/firebase";
import {
  Appointment,
  AppointmentStatus,
  cancelAppointment,
  listenAppointmentsByNutri,
} from "../../../shared/services/appointments";
import { AppIcon } from "../../../shared/components/AppIcon";

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

// ✅ NutriHome lee formato plano (ratingGeneral + q1..q5)
// y también es compatible si viene experience (fallback)
type MealItem = {
  id: string;
  date: string;
  mealType: string;
  text: string;

  ratingGeneral?: number;

  q1?: number; // saciedad
  q2?: number; // energia
  q3?: number; // digestion
  q4?: number; // ansiedad
  q5?: number; // cumplimiento

  createdAt?: number;
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
  if (s === "asistio") return { bg: "#ECFDF5", text: "#065F46", border: "#A7F3D0" };
  if (s === "no_asistio") return { bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" };
  if (s === "cancelado") return { bg: "#F3F4F6", text: "#374151", border: "#E5E7EB" };
  return { bg: "#EEF2FF", text: "#3730A3", border: "#C7D2FE" };
}

function toNum(v: any, fallback: number | undefined = 0): number | undefined {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n;
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

  // Patient detail data (solo lectura)
  const [pWeights, setPWeights] = useState<WeightItem[]>([]);
  const [pMeals, setPMeals] = useState<MealItem[]>([]);

  // ====== LOAD BASE DATA ======
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

    // 3) Patients list
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

  // ====== LOAD SELECTED PATIENT DATA (solo ver) ======
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
      list.sort((a, b) => (a.date < b.date ? -1 : 1)); // viejo -> nuevo para gráfico
      setPWeights(list);
    });

    // ✅ Meals: compatible con ambos formatos
    const unsubM = onValue(mRef, (snap) => {
      const val = snap.val() || {};
      const list: MealItem[] = Object.keys(val).map((id) => {
        const it = val[id] || {};
        const exp = it.experience || {};

        // Si viene plano (desde NutriHome viejo / migración)
        // ratingGeneral: number
        // q1..q5: number
        // Si viene nested (desde PacienteHome viejo): experience.general, experience.saciedad...
        const ratingGeneral =
          typeof it.ratingGeneral === "number"
            ? it.ratingGeneral
            : typeof it.rating === "number"
            ? it.rating
            : toNum(exp.general, 0);

        const q1 = typeof it.q1 === "number" ? it.q1 : toNum(exp.saciedad, undefined);
        const q2 = typeof it.q2 === "number" ? it.q2 : toNum(exp.energia, undefined);
        const q3 = typeof it.q3 === "number" ? it.q3 : toNum(exp.digestion, undefined);
        const q4 = typeof it.q4 === "number" ? it.q4 : toNum(exp.ansiedad, undefined);
        const q5 = typeof it.q5 === "number" ? it.q5 : toNum(exp.cumplimiento, undefined);

        return {
          id,
          date: String(it.date ?? ""),
          mealType: String(it.mealType ?? ""),
          text: String(it.text ?? ""),
          ratingGeneral: typeof ratingGeneral === "number" ? ratingGeneral : 0,
          q1,
          q2,
          q3,
          q4,
          q5,
          createdAt: typeof it.createdAt === "number" ? it.createdAt : undefined,
        };
      });

      // ✅ ordenar más nuevas arriba (si hay createdAt lo usamos, si no por date)
      list.sort((a, b) => {
        const aa = a.createdAt ?? 0;
        const bb = b.createdAt ?? 0;
        if (aa && bb) return bb - aa;
        if (a.date === b.date) return 0;
        return a.date > b.date ? -1 : 1;
      });

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

  // ✅ Reemplazo de setAppointmentStatus (que en tu proyecto NO existe):
  async function setStatus(appt: Appointment, status: AppointmentStatus) {
    try {
      const updates: Record<string, any> = {};
      updates[`appointments/${appt.id}/status`] = status;
      updates[`appointmentsByNutri/${appt.nutriUid}/${appt.id}/status`] = status;
      updates[`appointmentsByPatient/${appt.patientUid}/${appt.id}/status`] = status;

      await update(ref(rtdb), updates);
      toast(`Turno: ${statusLabel(status)} ✅`);
    } catch (e: any) {
      toast(e?.message ? String(e.message) : "Error actualizando turno.");
    }
  }

  async function onCancel(appt: Appointment) {
    try {
      await cancelAppointment(appt);
      toast("Turno cancelado 🗑️");
    } catch (e: any) {
      toast(e?.message ? String(e.message) : "Error cancelando turno.");
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
                                  Paciente:{" "}
                                  <Text style={{ fontWeight: "800" }}>{a.patientName}</Text> ({a.patientEmail})
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

                              {/* Acciones: Asistió / Ausente / Cancelar (borrar) */}
                              <View style={{ alignItems: "flex-end" }}>
                                <IconButton
                                  icon={() => <AppIcon name={"check-circle" as any} size={22} color="#059669" />}
                                  onPress={() => setStatus(a, "asistio")}
                                />
                                <IconButton
                                  icon={() => <AppIcon name={"close-circle" as any} size={22} color="#DC2626" />}
                                  onPress={() => setStatus(a, "no_asistio")}
                                />
                                <IconButton
                                  icon={() => <AppIcon name="trash" size={22} color={theme.danger} />}
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
                        Mostrando 12 de {apptsFiltered.length}.
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
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
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

        {/* MODAL PERFIL PACIENTE (SOLO VER) */}
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
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Perfil del paciente</Text>
                    <Text style={{ color: theme.muted, marginTop: 2 }}>
                      {selectedPatient.name} · {selectedPatient.email}
                    </Text>
                  </View>

                  {/* cruz estética */}
                  <IconButton icon="close" onPress={() => setSelectedPatient(null)} />
                </View>

                <Divider style={{ marginVertical: 12, ...styles.subtleDivider }} />

                {/* Peso chart */}
                <View style={{ marginTop: 2 }}>
                  <Card style={styles.sectionCard}>
                    <Card.Content>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Progreso de peso</Text>
                      <Text style={{ color: theme.muted, marginTop: 4 }}>Visualización rápida (kg por fecha).</Text>

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
                          <Text style={{ color: theme.muted, marginTop: 8 }}>Cargá al menos 2 pesos para ver el gráfico.</Text>
                        )}
                      </View>
                    </Card.Content>
                  </Card>
                </View>

                {/* Meals preview (10 más recientes, de arriba a abajo) */}
                <View style={{ marginTop: 14 }}>
                  <Card style={styles.sectionCard}>
                    <Card.Content>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900" }}>Comidas recientes</Text>
                          <Text style={{ color: theme.muted, marginTop: 4 }}>
                            Últimas cargas del paciente (10 más recientes).
                          </Text>
                        </View>

                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: theme.border2,
                            backgroundColor: "#FFFFFF",
                          }}
                        >
                          <Text style={{ color: theme.muted, fontWeight: "800", fontSize: 12 }}>
                            {pMeals.length} registros
                          </Text>
                        </View>
                      </View>

                      <Divider style={{ marginVertical: 12, ...styles.subtleDivider }} />

                      {pMeals.length === 0 ? (
                        <View
                          style={{
                            padding: 14,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: theme.border2,
                            backgroundColor: "#FFFFFF",
                          }}
                        >
                          <Text style={{ color: theme.muted }}>El paciente todavía no registró comidas.</Text>
                        </View>
                      ) : (
                        <View style={{ gap: 10 }}>
                          {pMeals.slice(0, 10).map((m) => {
                            const showExp = [m.q1, m.q2, m.q3, m.q4, m.q5].some((x) => typeof x === "number");

                            return (
                              <Card key={m.id} style={styles.innerCard}>
                                <Card.Content>
                                  {/* HEADER */}
                                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontWeight: "900", color: theme.text }}>
                                        {formatDateLabel(m.date)} · {m.mealType}
                                      </Text>
                                    </View>

                                    {/* Badge */}
                                    <View
                                      style={{
                                        paddingHorizontal: 10,
                                        paddingVertical: 6,
                                        borderRadius: 999,
                                        backgroundColor: theme.violetSoft,
                                        borderWidth: 1,
                                        borderColor: theme.violetRing,
                                      }}
                                    >
                                      <Text style={{ color: "#4C1D95", fontWeight: "900", fontSize: 12 }}>
                                        {m.mealType}
                                      </Text>
                                    </View>
                                  </View>

                                  {/* Texto comida */}
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
                                    <Text style={{ color: theme.muted, lineHeight: 20 }}>{m.text}</Text>
                                  </View>

                                  {/* General */}
                                  <View
                                    style={{
                                      marginTop: 12,
                                      flexDirection: "row",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                    }}
                                  >
                                    <Text style={{ fontWeight: "900", color: theme.text }}>General</Text>

                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                      <View style={{ flexDirection: "row", gap: 2 }}>
                                        {[1, 2, 3, 4, 5].map((n) => (
                                          <AppIcon
                                            key={n}
                                            name={n <= Number(m.ratingGeneral ?? 0) ? "star" : "star-outline"}
                                            size={16}
                                            color={n <= Number(m.ratingGeneral ?? 0) ? "#F59E0B" : "#D1D5DB"}
                                          />
                                        ))}
                                      </View>
                                      <Text style={{ color: theme.muted, fontWeight: "800" }}>
                                        {Number(m.ratingGeneral ?? 0)}/5
                                      </Text>
                                    </View>
                                  </View>

                                  {/* Experiencia detallada */}
                                  {showExp ? (
                                    <View style={{ marginTop: 12 }}>
                                      <Text style={{ fontWeight: "900", color: theme.text, marginBottom: 6 }}>
                                        Experiencia reportada
                                      </Text>

                                      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                                        {typeof m.q1 === "number" && (
                                          <Chip
                                            style={{ backgroundColor: "#EEF2FF", borderWidth: 1, borderColor: "#C7D2FE" }}
                                            textStyle={{ color: "#3730A3", fontWeight: "800" }}
                                          >
                                            Saciedad: {m.q1}/5
                                          </Chip>
                                        )}
                                        {typeof m.q2 === "number" && (
                                          <Chip
                                            style={{ backgroundColor: "#EEF2FF", borderWidth: 1, borderColor: "#C7D2FE" }}
                                            textStyle={{ color: "#3730A3", fontWeight: "800" }}
                                          >
                                            Energía: {m.q2}/5
                                          </Chip>
                                        )}
                                        {typeof m.q3 === "number" && (
                                          <Chip
                                            style={{ backgroundColor: "#EEF2FF", borderWidth: 1, borderColor: "#C7D2FE" }}
                                            textStyle={{ color: "#3730A3", fontWeight: "800" }}
                                          >
                                            Digestión: {m.q3}/5
                                          </Chip>
                                        )}
                                        {typeof m.q4 === "number" && (
                                          <Chip
                                            style={{ backgroundColor: "#EEF2FF", borderWidth: 1, borderColor: "#C7D2FE" }}
                                            textStyle={{ color: "#3730A3", fontWeight: "800" }}
                                          >
                                            Ansiedad / Antojos: {m.q4}/5
                                          </Chip>
                                        )}
                                        {typeof m.q5 === "number" && (
                                          <Chip
                                            style={{ backgroundColor: "#EEF2FF", borderWidth: 1, borderColor: "#C7D2FE" }}
                                            textStyle={{ color: "#3730A3", fontWeight: "800" }}
                                          >
                                            Cumplimiento del plan: {m.q5}/5
                                          </Chip>
                                        )}
                                      </View>
                                    </View>
                                  ) : (
                                    <View style={{ marginTop: 12 }}>
                                      <Text style={{ color: theme.muted }}>
                                        (Esta comida no tiene respuestas de experiencia guardadas.)
                                      </Text>
                                    </View>
                                  )}
                                </Card.Content>
                              </Card>
                            );
                          })}

                          {pMeals.length > 10 && (
                            <Text style={{ color: theme.muted }}>Mostrando 10 de {pMeals.length}.</Text>
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

        <Snackbar visible={snack.open} onDismiss={() => setSnack({ open: false, msg: "" })} duration={2500}>
          {snack.msg}
        </Snackbar>
      </View>
    </PaperProvider>
  );
}
