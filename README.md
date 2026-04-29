# 🛡️ CampusShield — Campus Women Safety Platform

> A real-time safety platform built to protect women on campus — powered by AI, Socket.IO live alerts, and a full-stack TypeScript architecture.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-campus--women--safety.onrender.com-brightgreen?style=for-the-badge)](https://campus-women-safety.onrender.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-91.8%25-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Powered by Gemini](https://img.shields.io/badge/AI-Gemini%20API-4285F4?style=for-the-badge&logo=google)](https://ai.google.dev/)
[![Deployed on Render](https://img.shields.io/badge/Deployed%20on-Render-46E3B7?style=for-the-badge&logo=render)](https://render.com/)

---

## 🌐 Live Deployment

**👉 [https://campus-women-safety.onrender.com/](https://campus-women-safety.onrender.com/)**

---

## 📖 About

**CampusShield** is a full-stack web application designed to enhance the safety of women on college campuses. It combines real-time communication via WebSockets, AI-powered assistance through Google Gemini, and emergency alert systems to create a comprehensive safety ecosystem.

---

## ✨ Features

- 🚨 **Real-Time SOS Alerts** — Instant distress notifications powered by Socket.IO
- 🤖 **AI Safety Assistant** — Gemini AI integration for contextual safety guidance
- 🔐 **Secure Authentication** — JWT-based auth with bcrypt password hashing
- 📍 **Location Tracking** — Campus-aware incident reporting and geolocation support
- 💬 **Live Communication** — Bidirectional WebSocket channel for campus safety officers
- 🗄️ **Lightweight Database** — SQLite via `better-sqlite3` for zero-config persistence
- ⚡ **Vite Frontend** — Blazing-fast React SPA with Tailwind CSS v4

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React + Vite + Tailwind CSS v4 |
| **Backend** | Node.js + Express + TypeScript |
| **Real-Time** | Socket.IO (client + server) |
| **AI** | Google Gemini API (`@google/genai`) |
| **Auth** | JWT (`jsonwebtoken`) + bcryptjs |
| **Database** | SQLite (`better-sqlite3`) + LowDB |
| **Runtime** | `tsx` (TypeScript execution) |
| **Deployment** | Render.com |

---

## 📁 Project Structure

```
piyushhh/
├── backend/
│   └── src/
│       ├── routes/        # Express API routes
│       └── sockets/       # Socket.IO event handlers
├── frontend/
│   └── ts/                # Frontend TypeScript modules
├── src/                   # React SPA source
├── server.ts              # Express + Vite unified server
├── vite.config.ts         # Vite build config
├── tsconfig.json          # TypeScript config
├── .env.example           # Environment variable template
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js `>= 18`
- A [Google Gemini API Key](https://aistudio.google.com/app/apikey)

### 1. Clone the Repository

```bash
git clone https://github.com/gamer1-2/piyushhh.git
cd piyushhh
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Then edit `.env`:

```env
GEMINI_API_KEY="your_gemini_api_key_here"
APP_URL="http://localhost:3000"
```

### 4. Run in Development Mode

```bash
npm run dev
```

The app will be available at **http://localhost:3000**

### 5. Build for Production

```bash
npm run build
npm start
```

---

## 🌍 Deployment (Render)

This project is configured for one-click deployment on [Render](https://render.com/).

1. Push the repo to GitHub
2. Create a new **Web Service** on Render
3. Set **Build Command**: `npm run build`
4. Set **Start Command**: `npm start`
5. Add environment variables:
   - `GEMINI_API_KEY` — your Gemini API key
   - `APP_URL` — your Render service URL
   - `NODE_ENV` — `production`

---

## 🔐 Environment Variables

| Variable | Description | Required |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini AI API key | ✅ Yes |
| `APP_URL` | Hosted app URL (for callbacks and self-refs) | ✅ Yes |
| `NODE_ENV` | Set to `production` for deployment | Recommended |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

This project is open source. Feel free to use, modify, and distribute.

---

<div align="center">
  Built with ❤️ to make campuses safer for everyone.
  <br/>
  <a href="https://campus-women-safety.onrender.com/">🌐 Live Demo</a> · <a href="https://github.com/gamer1-2/piyushhh/issues">🐛 Report Bug</a> · <a href="https://github.com/gamer1-2/piyushhh/issues">✨ Request Feature</a>
</div>
