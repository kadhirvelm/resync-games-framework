import { ProductNowProvider } from "@/components/productNow/ProductNowProvider";
import { Theme } from "@/lib/radix/Theme";
import "@radix-ui/themes/styles.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import clsx from "clsx";
import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import styles from "./layout.module.scss";

export const metadata: Metadata = {
  title: "Resync Game Framework",
};

const display = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const font = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["200", "300", "400", "500", "600", "700"],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={clsx(styles.body, font.className, display.variable)}>
        <Theme className={styles.entryPoint}>
          <ProductNowProvider>{children}</ProductNowProvider>
          <Analytics />
          <SpeedInsights />
        </Theme>
      </body>
    </html>
  );
}
