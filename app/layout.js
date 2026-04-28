import "./globals.css";

export const metadata = {
  title: "WorkspaceFlow | Google Workspace Automation System",
  description:
    "WorkspaceFlow is a Google Workspace automation system for daily briefings, AI commands, and always-on workflows across Gmail, Calendar, Drive, and Telegram.",
  keywords:
    "WorkspaceFlow, Google Workspace automation, Gmail automation, Google Calendar automation, Google Drive automation, AI commands, daily briefing",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
