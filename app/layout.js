import "./globals.css";

export const metadata = {
  title: "WorkspaceFlow — Your Google Workspace, on Autopilot",
  description: "AI-powered automation for Google Workspace. Get daily morning briefings, natural language commands, and automated rules. Save 30+ minutes every day.",
  keywords: "Google Workspace, automation, morning briefing, AI, productivity, Gmail, Google Calendar, Google Drive",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
