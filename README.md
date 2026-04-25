<div align="center">

<img src="screenshots/01-welcome-screen.png" alt="NexusAI Chat" width="800" />

# NexusAI Chat

**A production-ready AI chat application with ChatGPT-style UX, guest mode, dark theme, and full authentication.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://prisma.io/)
[![NextAuth](https://img.shields.io/badge/NextAuth-4-1D4ED8?logo=nextauth)](https://next-auth.js.org/)

[Live Demo](#-live-demo) &nbsp;&bull;&nbsp; [Screenshots](#-screenshots) &nbsp;&bull;&nbsp; [Getting Started](#-getting-started) &nbsp;&bull;&nbsp; [Tech Stack](#-tech-stack)

</div>

---

## 🌐 Live Demo

> **Add your deployment link here after deploying to Vercel/Netlify**
>
> `https://nexusai-chat.vercel.app`

---

## 📸 Screenshots

### Welcome Screen
Clean, minimal landing with suggestion cards for quick-start conversations.

<img src="screenshots/01-welcome-screen.png" alt="Welcome Screen" width="800" />

### AI Chat with Markdown & Code
Rich markdown rendering with syntax-highlighted code blocks and one-click copy.

<img src="screenshots/02-chat-conversation.png" alt="Chat Conversation" width="800" />

### Multi-Turn Conversations
Full conversation context with auto-scrolling, timestamps, and typing indicators.

<img src="screenshots/03-full-conversation.png" alt="Full Conversation" width="800" />

### Sidebar with Chat History
Collapsible sidebar with conversation list, timestamps, and bulk delete option.

<img src="screenshots/04-sidebar-history.png" alt="Sidebar History" width="800" />

### Dark Mode
System-aware theme with smooth toggle between light and dark modes.

<img src="screenshots/05-dark-mode.png" alt="Dark Mode" width="800" />

### Deferred Sign-Up Prompt
Guest users can chat freely. A soft prompt appears after a few exchanges — never forced.

<img src="screenshots/07-signup-prompt.png" alt="Sign Up Prompt" width="800" />

### Mobile Responsive
Fully responsive layout optimized for all screen sizes.

<img src="screenshots/06-mobile-view.png" alt="Mobile View" width="360" />

---

## ✨ Features

### 💬 AI Chat
- Real-time AI responses with full conversation context
- Markdown rendering (headings, lists, blockquotes, tables, links)
- Syntax-highlighted code blocks with copy button and line numbers
- Quick-start suggestion cards on the welcome screen
- Typing indicator with animated bouncing dots
- Auto-scroll to latest messages

### 🔐 Authentication (ChatGPT-Style)
- **Guest mode** — Chat without signing up, conversations stored in-memory
- **Deferred sign-up prompt** — Soft banner appears after ~6 messages
- **Tabbed auth modal** — Sign In and Create Account in one clean dialog
- **JWT sessions** — Persistent, database-backed conversation history
- **Profile editing** — Update name and avatar with instant session sync

### 📂 Conversation Management
- Collapsible sidebar with full chat history
- Create, delete individual chats, or bulk delete all
- Auto-generated conversation titles from first message
- Per-conversation custom system prompts
- Export conversations as Markdown or plain text

### 🎨 UI/UX
- Dark / Light theme with system-aware detection
- Fully responsive (mobile, tablet, desktop)
- Framer Motion animations throughout
- Custom scrollbars matching the theme
- Skeleton loading states
- Toast notifications for all actions

---

## 🛠 Tech Stack

[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com/)

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Frontend** | React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4, shadcn/ui (40+ components) |
| **Animations** | Framer Motion 12 |
| **State** | Zustand 5 |
| **Auth** | NextAuth.js 4 (JWT, Credentials Provider) |
| **Database** | Supabase (PostgreSQL) via Prisma ORM 6 |
| **AI** | z-ai-web-dev-sdk (Chat Completions API) |
| **Markdown** | react-markdown, react-syntax-highlighter |
| **Icons** | Lucide React |
| **Validation** | Zod 4, React Hook Form |
| **Notifications** | Sonner |
| **Dates** | date-fns |
| **Hosting** | Vercel (serverless) |
| **Local Dev** | SQLite via Prisma ORM 6 |

---

## 📁 Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Main chat page (guest + auth)
│   ├── layout.tsx                  # Root layout with providers
│   ├── globals.css                 # Tailwind v4 theme (oklch colors)
│   └── api/
│       ├── auth/
│       │   ├── [...nextauth]/       # NextAuth handlers
│       │   └── register/            # User registration
│       ├── chat/                    # AI chat (works for guests)
│       ├── conversations/           # CRUD + bulk delete
│       │   └── [id]/messages/       # Send message in conversation
│       └── user/                    # Profile read + update
├── components/
│   ├── auth/
│   │   ├── auth-modal.tsx           # Sign in / Register dialog
│   │   └── profile-dialog.tsx       # Edit profile dialog
│   ├── chat/
│   │   ├── chat-area.tsx            # Messages + welcome + export
│   │   ├── chat-input.tsx           # Auto-resizing textarea input
│   │   ├── chat-sidebar.tsx         # Conversation list + delete all
│   │   ├── message-bubble.tsx       # Markdown + code highlighting
│   │   ├── prompt-editor.tsx        # Per-conv system prompt
│   │   ├── signup-prompt.tsx        # Deferred sign-up banner
│   │   └── user-menu.tsx            # Avatar dropdown
│   ├── ui/                          # shadcn/ui (40+ components)
│   └── providers.tsx                # Theme + Session + Query
├── lib/
│   ├── auth.ts                      # NextAuth config + JWT callbacks
│   ├── db.ts                        # Prisma client singleton
│   ├── store.ts                     # Zustand chat store
│   ├── export.ts                    # Markdown/text export utils
│   └── utils.ts                     # cn() utility
└── types/
    └── next-auth.d.ts               # Type extensions
```

---

## ⚙️ Getting Started

### Prerequisites

- Node.js 18+ or Bun 1.0+
- npm, yarn, or bun

### Quick Start (Local Dev)

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/nexusai-chat.git
cd nexusai-chat

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env — keep DATABASE_URL as: file:./db/custom.db

# 4. Generate a NextAuth secret
openssl rand -base64 32
# Paste it into .env as NEXTAUTH_SECRET

# 5. Initialize SQLite database
npx prisma db push

# 6. Start dev server
npm run dev
```

Open **http://localhost:3000** and start chatting as a guest — no sign-up required.

### Environment Variables

| Variable | Local Dev | Vercel (Supabase) |
|---|---|---|
| `DATABASE_URL` | `file:./db/custom.db` | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres` |
| `NEXTAUTH_SECRET` | Any random string | Same (from Vercel env vars) |
| `NEXTAUTH_URL` | `http://localhost:3000` | Auto-set by Vercel |

---

## 🗄 Database

**Local:** SQLite (zero config, works out of the box)
**Production:** Supabase PostgreSQL (free tier, serverless-compatible)

Prisma auto-detects the `DATABASE_URL` format — no code changes needed.

```
User  1──*  Account  (credentials auth with bcrypt)
User  1──*  Conversation
Conversation  1──*  Message
```

---

## 🔌 API Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/chat` | Optional | Send message, get AI response |
| `POST` | `/api/auth/register` | No | Create account |
| `POST` | `/api/auth/[...]` | No | Sign in / sign out |
| `GET` | `/api/conversations` | Yes | List all chats |
| `POST` | `/api/conversations` | Yes | New conversation |
| `DELETE` | `/api/conversations` | Yes | Delete all chats |
| `GET` | `/api/conversations/:id` | Yes | Get chat + messages |
| `DELETE` | `/api/conversations/:id` | Yes | Delete one chat |
| `POST` | `/api/conversations/:id/messages` | Yes | Send message |
| `GET` | `/api/user` | Yes | Get profile |
| `PATCH` | `/api/user` | Yes | Update profile |

---

## 🧠 Architecture Highlights

**ChatGPT-Style Guest Flow** — No forced sign-up. Guests chat freely with in-memory conversations via Zustand. After ~6 messages, a subtle animated banner suggests signing in for persistence.

**Dual Send Paths** — `handleSend()` routes through two completely different pipelines: guests hit `/api/chat` directly (no DB), authenticated users go through the full conversation CRUD with message storage and auto-title generation.

**JWT + DB Re-fetch** — Profile edits call `updateSession()` which triggers NextAuth's `trigger: 'update'` JWT callback, re-fetching fresh user data from the database so changes persist across refreshes without re-authentication.

**Tailwind v4 CSS-Only** — Zero JavaScript config. All theme tokens defined via `@theme inline` in CSS with `oklch()` perceptual color space. Dark mode via `.dark` class variant from `next-themes`.

---

## 🚀 Deploy to Vercel + Supabase

### Step 1: Create Supabase Database (Free)

1. Go to **https://supabase.com** → Sign up / Sign in
2. Click **"New Project"**
3. Fill in: **Name** = `nexusai-chat`, **Database Password** = (save this!), **Region** = closest to you
4. Wait ~2 minutes for provisioning
5. Go to **Settings** → **Database** → Scroll to **Connection string**
6. Switch to **"Transaction"** mode (uses port 6543) — this is important for Vercel serverless
7. Copy the connection string, it looks like:
   ```
   postgresql://postgres.abc123:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```

### Step 2: Push Schema to Supabase

```bash
# Temporarily set your Supabase DATABASE_URL to push schema
DATABASE_URL="postgresql://postgres.abc123:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres" npx prisma db push
```

You should see: `🚀 Your database is now in sync with your Prisma schema.`

### Step 3: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<your-username>/nexusai-chat.git
git branch -M main
git push -u origin main
```

### Step 4: Deploy to Vercel

1. Go to **https://vercel.com** → Sign up with GitHub
2. Click **"Add New Project"** → Select `nexusai-chat` → Import
3. Vercel auto-detects Next.js — click **Deploy**
4. Wait for build to complete

### Step 5: Add Environment Variables on Vercel

1. In Vercel → your project → **Settings** → **Environment Variables**
2. Add these:

| Name | Value |
|---|---|
| `DATABASE_URL` | Your Supabase **Transaction** pooler URL (from Step 1) |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` to generate |

3. Click **Save**
4. Go to **Deployments** → **Redeploy** the latest deployment

### Step 6: Done!

Your app is live at `https://nexusai-chat.vercel.app` 🎉

> **Supabase Free Tier includes:** 500 MB database, 50,000 monthly active users, unlimited API requests.
> No credit card required.

---

## 🔧 Supabase Dashboard

After deployment, you can manage your database at:

- **https://supabase.com/dashboard** → your project
- **Table Editor** — view Users, Conversations, Messages
- **SQL Editor** — run raw SQL queries
- **Auth** — built-in auth (we use custom credentials via NextAuth)
- **Settings** → **Database** → connection strings, password reset

---

## 📋 Scripts

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint check
npm run db:push      # Push schema to database
npm run db:generate  # Generate Prisma client
npm run db:reset     # Reset all data
```

---

<div align="center">

**Built with Next.js, React, TypeScript, Tailwind CSS, Prisma, Supabase & NextAuth**

If you find this project helpful, please consider giving it a ⭐ on GitHub!

</div>
