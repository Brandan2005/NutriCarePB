import React from "react";
import { View, Image, ScrollView, Dimensions } from "react-native";
import { Text, Button, Card, Chip, Divider } from "react-native-paper";
import { Link } from "expo-router";

const { width } = Dimensions.get("window");
const isWide = width >= 900;

export default function PublicHome() {
  return (
    <View style={{ flex: 1, backgroundColor: "#F6F7FB" }}>
      {/* HEADER */}
      <View
        style={{
          height: 72,
          paddingHorizontal: 18,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderColor: "#E7EAF0",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={{ width: 34, height: 34, borderRadius: 10 }}
          />
          <View>
            <Text variant="titleMedium">NutriCare</Text>
            <Text style={{ opacity: 0.6, marginTop: -2, fontSize: 12 }}>
              Seguimiento nutricional inteligente
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Chip compact style={{ backgroundColor: "#EEF6F3" }} textStyle={{ color: "#0F766E" }}>
            Alfa
          </Chip>

          <Link href="/(auth)" asChild>
            <Button mode="contained" style={{ borderRadius: 12 }}>
              Iniciar sesión
            </Button>
          </Link>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 44 }}>
        {/* HERO */}
        <View style={{ backgroundColor: "#FFFFFF" }}>
          <View
            style={{
              paddingHorizontal: 18,
              paddingTop: 18,
              paddingBottom: 14,
              maxWidth: 1100,
              width: "100%",
              alignSelf: "center",
            }}
          >
            <View
              style={{
                flexDirection: isWide ? "row" : "column",
                gap: 16,
                alignItems: isWide ? "center" : "flex-start",
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  <Chip compact style={{ backgroundColor: "#EEF2FF" }} textStyle={{ color: "#3730A3" }}>
                    Paciente + Nutricionista
                  </Chip>
                  <Chip compact style={{ backgroundColor: "#F0FDF4" }} textStyle={{ color: "#166534" }}>
                    Progreso en tiempo real
                  </Chip>
                  <Chip compact style={{ backgroundColor: "#FFF7ED" }} textStyle={{ color: "#9A3412" }}>
                    Web + Android
                  </Chip>
                </View>

                <Text variant="displaySmall" style={{ marginTop: 12, lineHeight: 46 }}>
                  Tu nutricionista te acompaña
                  {"\n"}también fuera del consultorio.
                </Text>

                <Text style={{ opacity: 0.75, marginTop: 10, lineHeight: 22, fontSize: 15 }}>
                  NutriCare conecta tu día a día con tu plan: registrás comidas, peso y sensaciones,
                  y el profesional ve tu avance para ajustar a tiempo, sin esperar a la próxima consulta.
                </Text>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                  <Link href="/(auth)" asChild>
                    <Button mode="contained" style={{ borderRadius: 12 }}>
                      Empezar ahora
                    </Button>
                  </Link>

                  <Button mode="outlined" style={{ borderRadius: 12 }} onPress={() => {}}>
                    Ver cómo funciona
                  </Button>
                </View>

                <Text style={{ opacity: 0.55, marginTop: 10, fontSize: 12 }}>
                  Sin complicaciones. Diseñado para ser claro, profesional y fácil de usar.
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Card style={{ borderRadius: 22, overflow: "hidden" }}>
                  <Image
                    source={require("../../assets/images/hero.jpg")}
                    style={{
                      width: "100%",
                      height: isWide ? 320 : 220,
                    }}
                    resizeMode="cover"
                  />
                </Card>
              </View>
            </View>
          </View>
        </View>

        {/* BENEFICIOS */}
        <View
          style={{
            paddingHorizontal: 18,
            paddingTop: 18,
            maxWidth: 1100,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <Text variant="headlineSmall">Lo que hace diferente a NutriCare</Text>
          <Text style={{ opacity: 0.75, marginTop: 6, lineHeight: 22 }}>
            Menos “me acuerdo” y más datos claros: progreso, hábitos y seguimiento.
          </Text>

          <View style={{ flexDirection: isWide ? "row" : "column", gap: 12, marginTop: 14 }}>
            <Card style={{ flex: 1, borderRadius: 18 }}>
              <Card.Content>
                <Text variant="titleMedium">📈 Progreso visible</Text>
                <Text style={{ opacity: 0.75, marginTop: 6, lineHeight: 22 }}>
                  Peso con gráfico, historial y tendencias para entender qué funciona.
                </Text>
              </Card.Content>
            </Card>

            <Card style={{ flex: 1, borderRadius: 18 }}>
              <Card.Content>
                <Text variant="titleMedium">🍽️ Registro simple</Text>
                <Text style={{ opacity: 0.75, marginTop: 6, lineHeight: 22 }}>
                  Comidas por fecha, notas y experiencia con estrellas. Editás lo que cargaste.
                </Text>
              </Card.Content>
            </Card>

            <Card style={{ flex: 1, borderRadius: 18 }}>
              <Card.Content>
                <Text variant="titleMedium">📅 Turnos organizados</Text>
                <Text style={{ opacity: 0.75, marginTop: 6, lineHeight: 22 }}>
                  Calendario de turnos y recordatorios para mantener constancia.
                </Text>
              </Card.Content>
            </Card>
          </View>
        </View>

        {/* EQUIPO + IMAGEN CUADRADA */}
        <View
          style={{
            paddingHorizontal: 18,
            paddingTop: 18,
            maxWidth: 1100,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <Card style={{ borderRadius: 22 }}>
            <Card.Content>
              <View style={{ flexDirection: isWide ? "row" : "column", gap: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="headlineSmall">Un equipo de nutricionistas que te acompaña</Text>
                  <Text style={{ opacity: 0.75, marginTop: 8, lineHeight: 22 }}>
                    En NutriCare creemos que el seguimiento diario cambia todo: te ayuda a sostener
                    hábitos, corregir a tiempo y sentirte acompañado en el proceso.
                  </Text>

                  <View style={{ marginTop: 12, gap: 8 }}>
                    <Text style={{ opacity: 0.78 }}>✅ Datos claros para el profesional</Text>
                    <Text style={{ opacity: 0.78 }}>✅ Menos ansiedad, más dirección</Text>
                    <Text style={{ opacity: 0.78 }}>✅ Decisiones basadas en tu progreso real</Text>
                  </View>
                </View>

                <Image
                  source={require("../../assets/images/doctors.jpg")}
                  style={{
                    width: isWide ? 320 : "100%",
                    height: 240,
                    borderRadius: 18,
                  }}
                  resizeMode="cover"
                />
              </View>
            </Card.Content>
          </Card>
        </View>

        {/* SOBRE NOSOTROS (TU HISTORIA) */}
        <View
          style={{
            paddingHorizontal: 18,
            paddingTop: 18,
            maxWidth: 1100,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <Card style={{ borderRadius: 22 }}>
            <Card.Content>
              <Text variant="headlineSmall">Sobre nosotros</Text>
              <Text style={{ marginTop: 10, opacity: 0.75, lineHeight: 22 }}>
                Soy Priscila, la programadora detrás de esta plataforma. Esta idea nació porque,
                como paciente, siempre sentí que mi nutricionista solo podía ver mi progreso
                cuando yo estaba presente.
              </Text>

              <Text style={{ marginTop: 10, opacity: 0.75, lineHeight: 22 }}>
                Quise dar el cambio: que el profesional pueda ver cómo voy llevando la dieta,
                detectar problemas antes y acompañar con ajustes simples. NutriCare busca hacer
                el seguimiento más humano… usando tecnología.
              </Text>

              <Divider style={{ marginVertical: 14 }} />

              <Text style={{ opacity: 0.7, lineHeight: 22 }}>
                Nuestro objetivo: ayudarte a sostener constancia con una herramienta clara, moderna
                y profesional.
              </Text>
            </Card.Content>
          </Card>
        </View>

        {/* APP ANDROID */}
        <View
          style={{
            paddingHorizontal: 18,
            paddingTop: 18,
            maxWidth: 1100,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <Card style={{ borderRadius: 22 }}>
            <Card.Content>
              <Text variant="headlineSmall">Disponible también como App</Text>
              <Text style={{ marginTop: 8, opacity: 0.75, lineHeight: 22 }}>
                Diseñada para que registres tu progreso desde el celular y tu nutricionista lo vea al instante.
              </Text>

              <View
                style={{
                  marginTop: 16,
                  flexDirection: isWide ? "row" : "column",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <Image
                  source={require("../../assets/images/android.png")}
                  style={{ width: 220, height: 220 }}
                  resizeMode="contain"
                />

                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium">NutriCare para Android</Text>
                  <Text style={{ marginTop: 8, opacity: 0.75, lineHeight: 22 }}>
                    Próximamente disponible en Google Play. Mientras tanto, ya podés usar la versión web
                    con la misma experiencia profesional.
                  </Text>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <Button mode="contained" disabled style={{ borderRadius: 12 }}>
                      Próximamente
                    </Button>

                    <Link href="/(auth)" asChild>
                      <Button mode="outlined" style={{ borderRadius: 12 }}>
                        Probar la web
                      </Button>
                    </Link>
                  </View>
                </View>
              </View>
            </Card.Content>
          </Card>
        </View>

        {/* FOOTER */}
        <View style={{ marginTop: 26, paddingVertical: 18, paddingHorizontal: 18 }}>
          <Text style={{ textAlign: "center", opacity: 0.55 }}>
            © {new Date().getFullYear()} NutriCare · Plataforma de seguimiento nutricional
          </Text>
          <Text style={{ textAlign: "center", opacity: 0.45, marginTop: 6, fontSize: 12 }}>
            Hecho con foco en privacidad y usabilidad. Versión demo para presentación.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

