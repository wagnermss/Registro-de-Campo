import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "Registro de Campo",
  description: "Painel de registros de campo",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
