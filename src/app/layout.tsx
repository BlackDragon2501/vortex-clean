import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vórtex Clean - Limpia metadatos, sin límites",
  description: "Vórtex Clean, de Vortex Company: elimina EXIF, GPS y XMP de tus fotos JPEG, PNG y WebP por lotes, con reporte de lo detectado y descarga en ZIP. Tu privacidad no sale de tu navegador. Gratis, sin anuncios y 100% local.",
  keywords: ["Vórtex Clean", "eliminar EXIF", "eliminar GPS fotos", "limpiar metadatos", "privacidad fotos", "EXIF online", "sin anuncios"],
  authors: [{ name: "Vortex Company" }],
  icons: {
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#161616"/><circle cx="24" cy="24" r="17" fill="none" stroke="#a3e635" stroke-width="3.5"/><path d="M24 10a14 14 0 1 1-9.9 4.1" fill="none" stroke="#bef264" stroke-width="3.5" stroke-linecap="round"/><path d="M24 17a7 7 0 1 0 7 7" fill="none" stroke="#bef264" stroke-width="3.5" stroke-linecap="round"/><circle cx="24" cy="24" r="3" fill="#bef264"/></svg>`
      ),
  },
  openGraph: {
    title: "Vórtex Clean - Limpia metadatos, sin límites",
    description: "Vórtex Clean, de Vortex Company: elimina EXIF, GPS y XMP de tus fotos JPEG, PNG y WebP por lotes, con reporte de lo detectado y descarga en ZIP. Tu privacidad no sale de tu navegador. Gratis, sin anuncios y 100% local.",
    siteName: "Vórtex Clean - Limpia metadatos, sin límites",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f0f10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body className="antialiased bg-[#0f0f10] text-[#ececf1]">{children}</body>
    </html>
  );
}
