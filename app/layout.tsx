import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NotificationBootstrap } from "@/components/NotificationBootstrap";

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
    statusBarStyle: "black-translucent",
    title: "my-diet",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const darkBootstrap = `
try {
  var m = window.matchMedia('(prefers-color-scheme: dark)');
  if (m.matches) document.documentElement.classList.add('dark');
  m.addEventListener('change', function(e){
    document.documentElement.classList.toggle('dark', e.matches);
  });
} catch(e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: darkBootstrap }} />
      </head>
      <body>
        <div className="absolute inset-0 mx-auto flex max-w-md flex-col bg-surface">
          {children}
        </div>
        <NotificationBootstrap />
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/sw.js').catch(() => {}); }); }`,
          }}
        />
      </body>
    </html>
  );
}
