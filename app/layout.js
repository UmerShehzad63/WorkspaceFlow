import "./globals.css";

export const metadata = {
  title: "CouchMail | Gmail Automation & AI Briefings",
  description:
    "CouchMail brings AI-powered automation to Gmail, Calendar, and Drive. Get daily briefings, run AI commands, and manage everything from Telegram.",
  keywords:
    "CouchMail, Gmail automation, Google Calendar automation, Google Drive automation, AI commands, daily briefing, email automation",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
