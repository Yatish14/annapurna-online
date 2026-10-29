import type { Metadata, Viewport } from "next";
import ToastProvider from "@/components/Toaster";
import "./toast.css";

export const metadata: Metadata = {
  title: "Annapurna Online Services",
  description:
    "Annapurna Online Services & Annapurna Tours & Travels — Aadhaar, PAN, certificates, bill payments, AEPS cash withdrawal, flight, train and bus tickets. All your needs in one place.",
};

export const viewport: Viewport = {
  themeColor: "#0a1838",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,600&family=Manrope:wght@400;500;600;700&family=Noto+Serif+Telugu:wght@500;700&family=Noto+Sans+Telugu:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Toasts work on every page: the dashboard, sign in, and the customer pages */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
