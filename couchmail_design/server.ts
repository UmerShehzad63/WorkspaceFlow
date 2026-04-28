import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import cookieSession from "cookie-session";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET || "default-secret"],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: true,
    sameSite: "none",
    httpOnly: true,
  })
);

// Google OAuth Client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/auth/callback`
);

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

// Auth Routes
app.get("/api/auth/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  res.json({ url });
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    req.session!.tokens = tokens;

    // Get user info to store in session
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    req.session!.user = userInfo.data;

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error getting tokens:", error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/api/auth/me", (req, res) => {
  if (req.session?.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session = null;
  res.json({ success: true });
});

// Workspace Data Routes
app.get("/api/gmail/messages", async (req, res) => {
  if (!req.session?.tokens) return res.status(401).json({ error: "Unauthorized" });
  oauth2Client.setCredentials(req.session.tokens);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  try {
    const list = await gmail.users.messages.list({ userId: "me", maxResults: 10 });
    const messages = await Promise.all(
      (list.data.messages || []).map(async (m) => {
        const detail = await gmail.users.messages.get({ userId: "me", id: m.id! });
        const headers = detail.data.payload?.headers;
        return {
          id: m.id,
          snippet: detail.data.snippet,
          subject: headers?.find(h => h.name === "Subject")?.value || "(No Subject)",
          from: headers?.find(h => h.name === "From")?.value || "Unknown",
          date: headers?.find(h => h.name === "Date")?.value || "",
        };
      })
    );
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch Gmail" });
  }
});

app.get("/api/calendar/events", async (req, res) => {
  if (!req.session?.tokens) return res.status(401).json({ error: "Unauthorized" });
  oauth2Client.setCredentials(req.session.tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  try {
    const list = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });
    res.json(list.data.items || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch Calendar" });
  }
});

app.get("/api/drive/files", async (req, res) => {
  if (!req.session?.tokens) return res.status(401).json({ error: "Unauthorized" });
  oauth2Client.setCredentials(req.session.tokens);
  const drive = google.drive({ version: "v3", auth: oauth2Client });
  try {
    const list = await drive.files.list({
      pageSize: 20,
      fields: "files(id, name, mimeType, webViewLink, iconLink)",
      orderBy: "modifiedTime desc",
    });
    res.json(list.data.files || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch Drive" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
