import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { RiskStatusProvider } from "@/contexts/RiskStatusContext";
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "TradeCore",
  description: "Professional Trading Journal & Risk Manager",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <RiskStatusProvider>
          <DashboardLayout>
            {children}
            <FloatingActionButton />
          </DashboardLayout>
        </RiskStatusProvider>
      </body>
    </html>
  );
}
