import { Stack } from "expo-router";
import "../global.css";

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerTitle: "Registro de Campo",
        headerStyle: { backgroundColor: "#173e2d" },
        headerTintColor: "#ffffff",
        headerTitleStyle: { fontWeight: "700" },
      }}
    />
  );
}
