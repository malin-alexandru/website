import "./globals.css";

export const metadata = {
  title: "Malin Alexandru",
  description:
    "Malin Alexandru construieste experiente digitale elegante si solutii software personalizate, transformand idei curajoase in produse memorabile."
};

export default function RootLayout({ children }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
