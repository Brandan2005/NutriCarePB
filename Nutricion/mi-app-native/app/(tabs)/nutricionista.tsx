import React from "react";
import { Redirect } from "expo-router";
import { useRole } from "../../src/shared/hooks/useRole";
import NutriHome from "../../src/roles/nutricionista/screens/NutriHome";

export default function NutricionistaRoute() {
  const { user, role, loading } = useRole();

  if (loading) return null;
  if (!user) return <Redirect href="/(auth)" />;

  if (role !== "nutricionista") return <Redirect href="/(tabs)/paciente" />;

  return <NutriHome email={user.email || ""} />;
}


