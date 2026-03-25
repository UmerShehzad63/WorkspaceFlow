import "./globals.css";

export const metadata = {
  title: "CouchMail — AI-Powered Unified Workspace",
  description: "AI-powered daily briefings that synthesize your emails, docs, and calendar into a single, actionable morning dossier. Handle your day before it handles you.",
  keywords: "Google Workspace, automation, morning briefing, AI, productivity, Gmail, Google Calendar, Google Drive, CouchMail",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
