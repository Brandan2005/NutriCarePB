import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  Image,
  Pressable,
  Dimensions,
  Platform,
} from "react-native";
import {
  Text,
  Card,
  Button,
  TextInput,
  Avatar,
  Chip,
  Divider,
  IconButton,
  SegmentedButtons,
} from "react-native-paper";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import { auth, rtdb } from "../../../shared/services/firebase";
import { ref, onValue, update, remove, push, set } from "firebase/database";
import { LineChart } from "react-native-gifted-charts";

type ApptStatus = "pendiente" | "asistio" | "no_asistio";

type Appointment = {
  id: string;
  patientUid: string;
  startISO: string;
  endISO: string;
  status: ApptStatus;
};

type PatientProfile = {
  uid: string;
  name?: string;
  email?: string;
  phone?: string;
  obraSocial?: string;
  role?: "paciente" | "nutricionista";
};

type WeightItem = { id: string; value: number; date: string };
type MealItem = {
  id: string;
  date: string; // "YYYY-MM-DD"
  mealType: string;
  text: string;
  rating: number; // 1..5
};

const { width } = Dimensions.get("window");
const isWide = width >= 980;

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    const dd = d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const hh = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return `${dd} ${hh}`;
  } catch {
    return iso;
  }
}

function Stars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, Math.round(value || 0)));
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={{ color: i < v ? "#F59E0B" : "#D1D5DB" }}>
          ★
        </Text>
      ))}
    </View>
  );
}

export default function NutriHome({ email }: { email?: string }) {
  const user = auth.currentUser;

  // UI state
  const [tab, setTab] = useState<"turnos" | "pacientes">("turnos");
  const [loading, setLoading] = useState(true);

  // Data
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [search, setSearch] = useState("");

  // Selected patient
  const [selected, setSelected] = useState<PatientProfile | null>(null);
  const [selectedWeights, setSelectedWeights] = useState<WeightItem[]>([]);
  const [selectedMeals, setSelectedMeals] = useState<MealItem[]>([]);

  // Add weight form
  const [newWeight, setNewWeight] = useState("");
  const [newWeightDate, setNewWeightDate] = useState(() => {
    const d = new Date();
    // YYYY-MM-DD
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [savingWeight, setSavingWeight] = useState(false);

  // ---------- Load turnos (appointments/{nutriUid}) ----------
  useEffect(() => {
    if (!user?.uid) return;

    const apptRef = ref(rtdb, `appointments/${user.uid}`);
    const unsub = onValue(apptRef, (snap) => {
      const val = snap.val() || {};
      const list: Appointment[] = Object.keys(val).map((id) => ({
        id,
        ...val[id],
      }));
      list.sort((a, b) => (a.startISO > b.startISO ? 1 : -1));
      setAppointments(list);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  // ---------- Load patients list (profiles/* where role=="paciente") ----------
  useEffect(() => {
    const profRef = ref(rtdb, "profiles");
    const unsub = onValue(profRef, (snap) => {
      const val = snap.val() || {};
      const list: PatientProfile[] = Object.keys(val)
        .map((uid) => ({ uid, ...val[uid] }))
        .filter((p) => p.role === "paciente");
      list.sort((a, b) => (String(a.name || "") > String(b.name || "") ? 1 : -1));
      setPatients(list);
    });

    return () => unsub();
  }, []);

  // ---------- When select patient: subscribe to weights + meals ----------
  useEffect(() => {
    if (!selected?.uid) return;

    const wRef = ref(rtdb, `weights/${selected.uid}`);
    const mRef = ref(rtdb, `meals/${selected.uid}`);

    const unsubW = onValue(wRef, (snap) => {
      const val = snap.val() || {};
      const list: WeightItem[] = Object.keys(val).map((id) => ({
        id,
        ...val[id],
      }));
      list.sort((a, b) => (a.date > b.date ? 1 : -1));
      setSelectedWeights(list);
    });

    const unsubM = onValue(mRef, (snap) => {
      const val = snap.val() || {};
      const list: MealItem[] = Object.keys(val).map((id) => ({
        id,
        ...val[id],
      }));
      list.sort((a, b) => (a.date > b.date ? -1 : 1)); // más nuevo primero
      setSelectedMeals(list);
    });

    return () => {
      unsubW();
      unsubM();
    };
  }, [selected?.uid]);

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const mail = (p.email || "").toLowerCase();
      const phone = (p.phone || "").toLowerCase();
      return name.includes(q) || mail.includes(q) || phone.includes(q);
    });
  }, [patients, search]);

  const todayAppointments = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayKey = `${yyyy}-${mm}-${dd}`;
    return appointments.filter((a) => (a.startISO || "").startsWith(todayKey));
  }, [appointments]);

  const weightChartData = useMemo(() => {
    // gifted-charts expects [{value, label}]
    return selectedWeights.map((w) => ({
      value: Number(w.value),
      label: w.date.slice(5), // "MM-DD"
    }));
  }, [selectedWeights]);

  async function onLogout() {
    await signOut(auth);
    router.replace("/(public)");
  }

  async function setApptStatus(id: string, status: ApptStatus) {
    if (!user?.uid) return;
    await update(ref(rtdb, `appointments/${user.uid}/${id}`), { status });
  }

  async function deleteAppt(id: string) {
    if (!user?.uid) return;
    await remove(ref(rtdb, `appointments/${user.uid}/${id}`));
  }

  async function addWeightToPatient() {
    if (!selected?.uid) return;

    const val = Number(String(newWeight).replace(",", "."));
    if (!Number.isFinite(val) || val <= 0) return;

    setSavingWeight(true);
    try {
      const itemRef = push(ref(rtdb, `weights/${selected.uid}`));
      await set(itemRef, {
        value: val,
        date: newWeightDate,
      });
      setNewWeight("");
    } finally {
      setSavingWeight(false);
    }
  }

  const headerEmail = email || user?.email || "";
  const headerName = headerEmail ? headerEmail.split("@")[0] : "Nutricionista";
  const avatarLabel = (headerName?.[0] || "N").toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: "#F6F7FB" }}>
      {/* HEADER */}
      <View
        style={{
          height: 72,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderColor: "#E7EAF0",
        }}
      >
        <Pressable
          onPress={() => router.replace("/(public)")}
          style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <Image
            source={require("../../../../assets/images/icon.png")}
            style={{ width: 36, height: 36, borderRadius: 10 }}
          />
          <View>
            <Text variant="titleMedium">NutriCare</Text>
            <Text style={{ fontSize: 12, opacity: 0.6, marginTop: -2 }}>
              Panel Nutricionista
            </Text>
          </View>
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Chip icon="calendar" style={{ backgroundColor: "#EEF2FF" }}>
            Hoy: {todayAppointments.length} turno(s)
          </Chip>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Avatar.Text size={34} label={avatarLabel} />
            <View>
              <Text style={{ fontWeight: "700" }}>{headerName}</Text>
              <Text style={{ fontSize: 12, opacity: 0.6 }}>{headerEmail}</Text>
            </View>
          </View>

          <Button
            mode="text"
            textColor="#DC2626"
            onPress={onLogout}
          >
            Cerrar sesión
          </Button>
        </View>
      </View>

      {/* CONTENT */}
      <ScrollView
        contentContainerStyle={{
          padding: 18,
          paddingBottom: 40,
          maxWidth: 1200,
          width: "100%",
          alignSelf: "center",
        }}
      >
        {/* Top controls */}
        <View
          style={{
            flexDirection: isWide ? "row" : "column",
            gap: 12,
            alignItems: isWide ? "center" : "stretch",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="headlineSmall">Dashboard</Text>
            <Text style={{ opacity: 0.7, marginTop: 4 }}>
              Gestioná turnos y pacientes con seguimiento completo.
            </Text>
          </View>

          <SegmentedButtons
            value={tab}
            onValueChange={(v) => setTab(v as any)}
            buttons={[
              { value: "turnos", label: "Turnos", icon: "calendar-month" },
              { value: "pacientes", label: "Pacientes", icon: "account-search" },
            ]}
          />
        </View>

        {/* TURNOS */}
        {tab === "turnos" && (
          <View style={{ marginTop: 14 }}>
            <Card style={{ borderRadius: 22 }}>
              <Card.Content>
                <View
                  style={{
                    flexDirection: isWide ? "row" : "column",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: isWide ? "center" : "flex-start",
                  }}
                >
                  <View>
                    <Text variant="titleLarge">Turnos</Text>
                    <Text style={{ opacity: 0.7, marginTop: 6 }}>
                      Confirmá asistencia o eliminá turnos. (Demo RTDB)
                    </Text>
                  </View>

                  <Chip icon="information" style={{ backgroundColor: "#ECFDF5" }}>
                    {appointments.length} total
                  </Chip>
                </View>

                <Divider style={{ marginVertical: 14 }} />

                {loading ? (
                  <Text>Cargando...</Text>
                ) : appointments.length === 0 ? (
                  <View style={{ padding: 16, backgroundColor: "#F3F4F6", borderRadius: 16 }}>
                    <Text style={{ opacity: 0.75 }}>
                      Todavía no tenés turnos cargados. (En la demo, podés crearlos después).
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {appointments.map((a) => (
                      <View
                        key={a.id}
                        style={{
                          padding: 12,
                          borderRadius: 16,
                          backgroundColor: "#F9FAFB",
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          flexDirection: isWide ? "row" : "column",
                          gap: 12,
                          alignItems: isWide ? "center" : "flex-start",
                          justifyContent: "space-between",
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: "800" }}>
                            {formatDateTime(a.startISO)} → {formatDateTime(a.endISO)}
                          </Text>
                          <Text style={{ opacity: 0.7, marginTop: 2 }}>
                            Paciente UID: {a.patientUid}
                          </Text>
                        </View>

                        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                          <Chip
                            style={{
                              backgroundColor:
                                a.status === "asistio"
                                  ? "#ECFDF5"
                                  : a.status === "no_asistio"
                                  ? "#FEF2F2"
                                  : "#EEF2FF",
                            }}
                          >
                            {a.status}
                          </Chip>

                          <Button
                            mode="outlined"
                            onPress={() => setApptStatus(a.id, "asistio")}
                          >
                            Asistió
                          </Button>
                          <Button
                            mode="outlined"
                            onPress={() => setApptStatus(a.id, "no_asistio")}
                          >
                            No asistió
                          </Button>

                          <IconButton
                            icon="delete"
                            iconColor="#DC2626"
                            onPress={() => deleteAppt(a.id)}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </Card.Content>
            </Card>
          </View>
        )}

        {/* PACIENTES */}
        {tab === "pacientes" && (
          <View style={{ marginTop: 14, flexDirection: isWide ? "row" : "column", gap: 14 }}>
            {/* LEFT: list */}
            <View style={{ flex: 1 }}>
              <Card style={{ borderRadius: 22 }}>
                <Card.Content>
                  <Text variant="titleLarge">Pacientes</Text>
                  <Text style={{ opacity: 0.7, marginTop: 6 }}>
                    Buscá y abrí el perfil para ver progreso y comidas.
                  </Text>

                  <TextInput
                    mode="outlined"
                    label="Buscar por nombre, mail o teléfono"
                    value={search}
                    onChangeText={setSearch}
                    style={{ marginTop: 12 }}
                  />

                  <Divider style={{ marginVertical: 14 }} />

                  {filteredPatients.length === 0 ? (
                    <View style={{ padding: 16, backgroundColor: "#F3F4F6", borderRadius: 16 }}>
                      <Text style={{ opacity: 0.75 }}>
                        No se encontraron pacientes con esa búsqueda.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {filteredPatients.map((p) => {
                        const label = (p.name?.[0] || p.email?.[0] || "P").toUpperCase();
                        const active = selected?.uid === p.uid;

                        return (
                          <Pressable key={p.uid} onPress={() => setSelected(p)}>
                            <View
                              style={{
                                padding: 12,
                                borderRadius: 16,
                                borderWidth: 1,
                                borderColor: active ? "#6366F1" : "#E5E7EB",
                                backgroundColor: active ? "#EEF2FF" : "#FFFFFF",
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <Avatar.Text size={38} label={label} />
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontWeight: "800" }}>
                                  {p.name || "Paciente sin nombre"}
                                </Text>
                                <Text style={{ opacity: 0.7 }}>
                                  {p.email || "sin email"} · {p.phone || "sin teléfono"}
                                </Text>
                              </View>
                              <IconButton icon="chevron-right" />
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </Card.Content>
              </Card>
            </View>

            {/* RIGHT: profile */}
            <View style={{ flex: 1 }}>
              <Card style={{ borderRadius: 22 }}>
                <Card.Content>
                  <Text variant="titleLarge">Perfil</Text>
                  <Text style={{ opacity: 0.7, marginTop: 6 }}>
                    Seleccioná un paciente para ver su información.
                  </Text>

                  {!selected ? (
                    <View style={{ marginTop: 14, padding: 16, backgroundColor: "#F3F4F6", borderRadius: 16 }}>
                      <Text style={{ opacity: 0.75 }}>
                        Elegí un paciente de la lista para abrir su perfil.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ marginTop: 12, gap: 12 }}>
                      {/* Card: data */}
                      <View
                        style={{
                          padding: 14,
                          borderRadius: 18,
                          backgroundColor: "#111827",
                        }}
                      >
                        <Text style={{ color: "#F9FAFB", fontSize: 18, fontWeight: "900" }}>
                          {selected.name || "Paciente"}
                        </Text>
                        <Text style={{ color: "#E5E7EB", opacity: 0.85, marginTop: 4 }}>
                          {selected.email || "sin email"}
                        </Text>

                        <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          <Chip style={{ backgroundColor: "#EEF2FF" }}>Tel: {selected.phone || "—"}</Chip>
                          <Chip style={{ backgroundColor: "#ECFDF5" }}>OS: {selected.obraSocial || "—"}</Chip>
                          <Chip style={{ backgroundColor: "#FEF3C7" }}>UID: {selected.uid.slice(0, 8)}…</Chip>
                        </View>
                      </View>

                      {/* Add weight */}
                      <Card style={{ borderRadius: 18 }}>
                        <Card.Content>
                          <Text style={{ fontWeight: "900", fontSize: 16 }}>
                            Agregar peso al paciente
                          </Text>
                          <Text style={{ opacity: 0.7, marginTop: 4 }}>
                            Esto se guarda en su perfil (weights/{`{uid}`}/...).
                          </Text>

                          <View
                            style={{
                              flexDirection: isWide ? "row" : "column",
                              gap: 10,
                              marginTop: 12,
                            }}
                          >
                            <TextInput
                              mode="outlined"
                              label="Peso (kg)"
                              value={newWeight}
                              onChangeText={setNewWeight}
                              keyboardType="decimal-pad"
                              style={{ flex: 1 }}
                            />
                            <TextInput
                              mode="outlined"
                              label="Fecha (YYYY-MM-DD)"
                              value={newWeightDate}
                              onChangeText={setNewWeightDate}
                              style={{ flex: 1 }}
                            />
                            <Button
                              mode="contained"
                              onPress={addWeightToPatient}
                              loading={savingWeight}
                              disabled={savingWeight}
                              style={{ alignSelf: isWide ? "center" : "stretch" }}
                            >
                              Guardar
                            </Button>
                          </View>
                        </Card.Content>
                      </Card>

                      {/* Weight chart */}
                      <Card style={{ borderRadius: 18 }}>
                        <Card.Content>
                          <Text style={{ fontWeight: "900", fontSize: 16 }}>
                            Progreso de peso
                          </Text>
                          <Text style={{ opacity: 0.7, marginTop: 4 }}>
                            Evolución por fecha.
                          </Text>

                          <View style={{ marginTop: 12 }}>
                            {weightChartData.length >= 2 ? (
                              <View
                                style={{
                                  backgroundColor: "#FFFFFF",
                                  borderRadius: 16,
                                  paddingVertical: 10,
                                  paddingHorizontal: 6,
                                }}
                              >
                                <LineChart
                                  data={weightChartData}
                                  spacing={46}
                                  initialSpacing={10}
                                  thickness={3}
                                  curved
                                  hideRules={false}
                                  rulesType="solid"
                                  height={240}
                                  yAxisLabelSuffix="kg"
                                  yAxisTextStyle={{ opacity: 0.7 }}
                                  xAxisLabelTextStyle={{ opacity: 0.7, fontSize: 12 }}
                                  noOfSections={4}
                                  maxValue={Math.max(...weightChartData.map((d) => d.value)) + 2}
                                />
                              </View>
                            ) : (
                              <View style={{ padding: 16, backgroundColor: "#F3F4F6", borderRadius: 16 }}>
                                <Text style={{ opacity: 0.75 }}>
                                  Cargá al menos 2 registros de peso para ver el gráfico.
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* weights list */}
                          <View style={{ marginTop: 12, gap: 8 }}>
                            {selectedWeights.slice(-6).map((w) => (
                              <View
                                key={w.id}
                                style={{
                                  flexDirection: "row",
                                  justifyContent: "space-between",
                                  padding: 10,
                                  backgroundColor: "#F9FAFB",
                                  borderWidth: 1,
                                  borderColor: "#E5E7EB",
                                  borderRadius: 14,
                                }}
                              >
                                <Text style={{ fontWeight: "700" }}>{w.date}</Text>
                                <Text style={{ opacity: 0.8 }}>{w.value} kg</Text>
                              </View>
                            ))}
                          </View>
                        </Card.Content>
                      </Card>

                      {/* Meals */}
                      <Card style={{ borderRadius: 18 }}>
                        <Card.Content>
                          <Text style={{ fontWeight: "900", fontSize: 16 }}>
                            Comidas y experiencia
                          </Text>
                          <Text style={{ opacity: 0.7, marginTop: 4 }}>
                            Listado por fecha (meals/{`{uid}`}/...).
                          </Text>

                          <Divider style={{ marginVertical: 12 }} />

                          {selectedMeals.length === 0 ? (
                            <View style={{ padding: 16, backgroundColor: "#F3F4F6", borderRadius: 16 }}>
                              <Text style={{ opacity: 0.75 }}>
                                Este paciente todavía no cargó comidas.
                              </Text>
                            </View>
                          ) : (
                            <View style={{ gap: 10 }}>
                              {selectedMeals.slice(0, 10).map((m) => (
                                <View
                                  key={m.id}
                                  style={{
                                    padding: 12,
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: "#E5E7EB",
                                    backgroundColor: "#FFFFFF",
                                  }}
                                >
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      gap: 8,
                                    }}
                                  >
                                    <Text style={{ fontWeight: "900" }}>
                                      {m.date} · {m.mealType}
                                    </Text>
                                    <Stars value={m.rating} />
                                  </View>

                                  <Text style={{ opacity: 0.8, marginTop: 8, lineHeight: 20 }}>
                                    {m.text}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </Card.Content>
                      </Card>
                    </View>
                  )}
                </Card.Content>
              </Card>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
