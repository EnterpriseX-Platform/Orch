import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const prompt = Prompt({
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Orch",
  description: "Orch Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${prompt.className} bg-[#F8FAFC] text-[#334155] antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
