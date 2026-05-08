import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "X Account Cleaner",
  description: "Scan and safely delete your X posts",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}

