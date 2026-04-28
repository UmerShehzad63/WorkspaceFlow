# CouchMail — AI-Powered Gmail & Calendar Automation

Transform your inbox into an intelligent workspace. CouchMail is an AI-powered automation platform that brings daily briefings, smart email management, and always-on workflows to Gmail, Calendar, Drive, and Telegram.

> **Built for operators, assistants, founders, and busy teams** who live in Gmail and need to focus on what matters.

---

## ✨ Features

### 📋 Morning Briefing
Get a daily executive summary delivered to your inbox and Telegram:
- **Calendar digest** – Today's meetings with context, attendees, and preparation notes
- **Email triage** – VIP messages, urgent items, and newsletters grouped by priority
- **Smart summaries** – AI-generated insights from your calendar and inbox
- **Drive context** – Recent files and documents relevant to your day

### 🤖 AI Command Bar
Run natural-language commands from your dashboard:
- **Draft emails** – "Write a meeting recap to the team with attached notes"
- **Manage calendar** – "Block 2 hours tomorrow morning for deep work"
- **Search & organize** – "Find all invoices from Q4 and create a folder"
- **Create automations** – "Send me a Telegram when someone from [Company] emails"

### ⚡ Automation Rules (No-Code Workflows)
Build repeatable workflows without coding:
- **Inbox triage** – Auto-label, archive, or flag emails based on rules
- **Morning agenda** – Automatically send meeting prep to Telegram daily
- **Follow-up drafts** – Create templated responses for common email types
- **Alert workflows** – Notify you on Telegram when specific conditions match

### 📱 Telegram Integration
Control everything from Telegram:
- Execute AI commands from chat
- Get real-time notifications
- Manage automations
- View briefings on the go

### 🔐 Enterprise-Grade Security
- **OAuth 2.0** – Secure Google authentication, no passwords stored
- **256-bit encryption** – All data in transit and at rest
- **SOC 2 compliant** – Enterprise security standards
- **Read-only option** – Choose what the app can access

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CouchMail Platform                       │
├──────────────────────┬──────────────────────────────────────┤
│  Frontend (Next.js)  │          Backend (FastAPI)           │
│  ├─ Dashboard        │  ├─ Google Workspace API             │
│  ├─ Auth flow        │  ├─ AI Engine (GPT-4)                │
│  ├─ Automation UI    │  ├─ Telegram Bot                     │
│  └─ Email/Calendar   │  ├─ Scheduler (APScheduler)          │
│                      │  └─ Webhook handlers                 │
├──────────────────────┼──────────────────────────────────────┤
│     Database (Supabase PostgreSQL)                          │
│  ├─ User profiles    │  ├─ Automation rules                 │
│  ├─ Auth tokens      │  ├─ Briefing history                │
│  └─ Settings         │  └─ Webhook subscriptions            │
└──────────────────────┴──────────────────────────────────────┘
```

### Services Integrated
- **Google Workspace** – Gmail, Calendar, Drive, Docs
- **Telegram** – Real-time notifications & commands
- **OpenAI GPT-4** – Intent parsing, email drafting, summarization
- **Supabase** – Authentication, database, real-time updates

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Python 3.10+
- Google OAuth credentials (for development)
- Supabase account
- OpenAI API key
- Telegram Bot Token

### 1. Clone & Setup

```bash
git clone <repo-url>
cd workspaceflow

# Install frontend dependencies
npm install

# Create Python virtual environment
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables

**Frontend (.env.local):**
```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-google-client-id
```

**Backend (.env):**
```bash
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-key
OPENAI_API_KEY=your-openai-key
TELEGRAM_BOT_TOKEN=your-bot-token
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret
```

See `.env.example` for complete configuration.

### 3. Run Development Servers

**Terminal 1 – Frontend:**
```bash
npm run dev
# Runs on http://localhost:3000
```

**Terminal 2 – Backend:**
```bash
cd backend
uvicorn main:app --reload --port 8000
# Runs on http://localhost:8000
```

Visit `http://localhost:3000` in your browser.

---

## 📁 Project Structure

```
workspaceflow/
├── app/                          # Next.js frontend
│   ├── page.js                  # Landing page
│   ├── layout.js                # Root layout & metadata
│   ├── login/                   # Authentication
│   ├── dashboard/               # User dashboard
│   │   ├── components/          # Dashboard UI components
│   │   ├── overview/            # Home/overview page
│   │   ├── rules/               # Automation rules UI
│   │   ├── commands/            # Command center
│   │   ├── settings/            # Settings page
│   │   ├── team/                # Team management
│   │   └── telegram/            # Telegram settings
│   ├── components/              # Shared components
│   │   ├── Navbar.js
│   │   ├── Footer.js
│   │   └── ...
│   ├── api/                     # Backend API routes (if needed)
│   └── globals.css              # Global styles
│
├── backend/                      # FastAPI backend
│   ├── main.py                  # App entry point
│   ├── ai_engine.py             # GPT integration
│   ├── command_executor.py      # Command execution
│   ├── email_service.py         # Email composition & sending
│   ├── google_service.py        # Google Workspace API wrapper
│   ├── telegram_service.py      # Telegram API wrapper
│   ├── routes/                  # API endpoints
│   │   ├── telegram.py          # Telegram webhook & commands
│   │   └── whatsapp.py          # WhatsApp integration (beta)
│   ├── services/                # Business logic
│   │   ├── telegram.py
│   │   └── whatsapp.py
│   ├── jobs/                    # Background jobs
│   │   ├── scheduler.py         # Task scheduling
│   │   ├── automation_executor.py  # Rule execution
│   │   ├── gmail_push.py        # Gmail push notifications
│   │   └── ...
│   └── requirements.txt         # Python dependencies
│
├── lib/                         # Shared utilities
│   ├── supabase.js             # Supabase client
│   ├── ai.js                   # AI utilities
│   └── briefingCache.js        # Caching logic
│
├── public/                      # Static assets
│   └── icon.png                # App logo
│
├── docker/                      # Docker config
│   ├── nginx.conf              # Reverse proxy
│   └── supervisord.conf        # Process manager
│
└── package.json                 # Project metadata
```

---

## 🔌 API Reference

### Authentication
All requests require a valid Supabase session token.

**Login Flow:**
```
POST /auth/login (Google OAuth)
→ Supabase generates session token
→ Token stored in httpOnly cookie
→ Attached to all subsequent requests
```

### Core Endpoints

#### Briefings
```
GET /api/briefing/today
  Returns: { events: [...], emails: [...], summary: "..." }

POST /api/briefing/send-now
  Triggers immediate briefing delivery
```

#### Automations
```
GET /api/automations
  Returns: { rules: [...] }

POST /api/automations
  Create new automation rule

PUT /api/automations/{id}
  Update automation

DELETE /api/automations/{id}
  Delete automation
```

#### Commands
```
POST /api/command/execute
  Body: { command: "Send email to team about Q4 review" }
  Returns: { action: "email", draft: "...", status: "pending_approval" }

GET /api/command/history
  Returns: { history: [...] }
```

#### Gmail Webhook
```
POST /api/gmail/webhook
  Gmail push notification (auto-triggered)
  Updates briefing cache

POST /api/gmail/webhook/stop
  Disable push notifications
```

#### Telegram
```
POST /api/telegram/webhook
  Incoming Telegram messages
  Triggers command execution
```

---

## ⚙️ Configuration Guide

### Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable APIs: Gmail, Calendar, Drive, Tasks
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized JavaScript origins:
   - `http://localhost:3000` (dev)
   - `https://yourdomain.com` (production)
6. Add authorized redirect URIs:
   - `http://localhost:3000/auth/callback`
   - `https://yourdomain.com/auth/callback`

### Telegram Bot Setup
1. Talk to [@BotFather](https://t.me/botfather) on Telegram
2. Create new bot: `/newbot`
3. Copy the token
4. Set webhook: `/setwebhook`
   ```
   https://yourdomain.com/api/telegram/webhook?token=YOUR_BOT_TOKEN
   ```

### OpenAI Configuration
1. Create account at [openai.com](https://openai.com)
2. Generate API key from settings
3. Set usage limits and billing alerts
4. Add to `.env` as `OPENAI_API_KEY`

### Supabase Setup
1. Create project at [supabase.com](https://supabase.com)
2. Copy URL and anon key
3. Create database tables (migrations auto-run)
4. Enable Row Level Security (RLS) policies

---

## 🚢 Deployment

### Option 1: Fly.io (Recommended)
```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/

# Login
flyctl auth login

# Configure
flyctl launch

# Deploy
flyctl deploy --build-arg NEXT_PUBLIC_SITE_URL=https://yourdomain.com

# View logs
flyctl logs
```

### Option 2: Vercel (Frontend) + Render (Backend)
**Frontend:**
```bash
npm install -g vercel
vercel
```

**Backend:**
1. Push code to GitHub
2. Connect to Render.io
3. Set environment variables
4. Deploy

### Option 3: Docker Compose (Local/VPS)
```bash
docker-compose up -d
# Runs on http://localhost

# View logs
docker-compose logs -f
```

---

## 🛠️ Development

### Code Style
- **Frontend:** ESLint configured, Prettier for formatting
- **Backend:** Black for formatting, flake8 for linting

### Running Tests
```bash
# Frontend
npm test

# Backend
pytest backend/
```

### Database Migrations
```bash
# Create migration
supabase migration new add_feature

# Apply locally
supabase migration up

# Push to production
supabase db push
```

### Adding New Commands
1. Add intent definition in `ai_engine.py`
2. Implement executor in `command_executor.py`
3. Add route handler in `routes/telegram.py`
4. Test with `/test <command>`

---

## 🔒 Security

### Data Handling
- **Tokens:** Stored in Supabase, encrypted at rest
- **API Keys:** Never logged or cached
- **User Data:** Accessed only when needed, never stored
- **Backups:** Daily encrypted backups to secure storage

### Permissions
- **Gmail:** Scoped to `gmail.modify`, `gmail.send`
- **Calendar:** Scoped to `calendar.events`
- **Drive:** Read-only, scoped to search & view

### Rate Limiting
- API: 100 requests/minute per user
- Telegram: 30 messages/minute
- Gmail: Respects Google's quota

---

## 🐛 Troubleshooting

### Common Issues

**"Google authorization failed"**
- Check OAuth credentials in `.env`
- Verify redirect URI matches exactly
- Try logging out and back in

**"Telegram not receiving messages"**
- Verify bot token is correct
- Check webhook URL is accessible
- Run: `flyctl logs -a couchmail`

**"Briefing not generating"**
- Check OpenAI API key and quota
- Verify Gmail access is enabled
- Check job scheduler is running

**"Dashboard not loading"**
- Clear browser cache
- Check Supabase connection
- Verify `NEXT_PUBLIC_*` variables are set

For more help, check [GitHub Issues](https://github.com/yourusername/couchmail/issues).

---

## 📚 Learning Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [FastAPI Guide](https://fastapi.tiangolo.com)
- [Google Workspace API](https://developers.google.com/workspace/guides)
- [Supabase Docs](https://supabase.com/docs)
- [OpenAI API Reference](https://platform.openai.com/docs)

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Write tests for new features
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Workflow
```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes, test locally
npm run dev

# Commit & push
git add .
git commit -m "Add my feature"
git push origin feature/my-feature

# Create PR on GitHub
```

---

## 📄 License

MIT License — See LICENSE file for details.

---

## 🙋 Support

- **Documentation:** https://docs.couchmail.io
- **Email:** support@couchmail.io
- **Discord:** [Join Community](https://discord.gg/couchmail)
- **Twitter:** [@CouchMailApp](https://twitter.com/couchmail)

---

## 🎯 Roadmap

- ✅ Gmail automation & briefings
- ✅ Calendar integration
- ✅ Telegram notifications
- 🔄 WhatsApp integration (beta)
- 📋 Slack integration
- 📧 Microsoft 365 support
- 🔗 Zapier & Make.com connectors
- 📊 Advanced analytics dashboard
- 🎨 Custom branding for teams

---

**Built with ❤️ by the CouchMail Team**

*Automate your workflow. Focus on what matters.*
