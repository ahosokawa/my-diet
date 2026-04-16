import type { Metadata, Viewport } from "next";
import "./globals.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "my-diet",
  description: "Simple macro tracking and meal planning",
  manifest: `${BASE}/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${BASE}/favicon.ico`, sizes: "any" }],
    apple: [{ url: `${BASE}/apple-touch-icon.png` }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "my-diet",
  },
};

export const viewport: Viewport = {
  themeColor: "#26a55e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-md">{children}</div>
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/sw.js').catch(() => {}); }); }`,
          }}
        />
      </body>
    </html>
  );
}
