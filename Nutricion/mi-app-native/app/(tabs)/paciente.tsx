import React from "react";
import { Redirect } from "expo-router";
import { useRole } from "../../src/shared/hooks/useRole";
import PacienteHome from "../../src/roles/paciente/screens/PacienteHome";

export default function PacienteRoute() {
  const { user, role, loading } = useRole();

  if (loading) return null;
  if (!user) return <Redirect href="/(auth)" />;

  if (role === "nutricionista") return <Redirect href="/(tabs)/nutricionista" />;

  return <PacienteHome email={user.email || ""} />;
}

