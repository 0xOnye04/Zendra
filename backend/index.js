import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import https from "https";
import crypto from "crypto";

dotenv.config();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_ORIGIN,
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10kb" }));

const OX_API_KEY = process.env.OX_API_KEY;
const AVE_API_KEY = process.env.AVE_API_KEY || process.env.OX_API_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const TOKEN_EXPIRATION_SECONDS = 60 * 60; // 1 hour
const USERS_PATH = path.resolve("backend/users.json");

console.log("AVE_API_KEY loaded:", !!AVE_API_KEY);
console.log("Backend environment:", { PORT: process.env.PORT || 3001, FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || "not-set", SSL_KEY_PATH: !!process.env.SSL_KEY_PATH, SSL_CERT_PATH: !!process.env.SSL_CERT_PATH });

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

function createAuthToken(email) {
  const payload = JSON.stringify({
    email: email.toLowerCase(),
    iat: Date.now(),
    exp: Date.now() + TOKEN_EXPIRATION_SECONDS * 1000,
  });
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== "string") return null;
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return null;
  try {
    const payload = Buffer.from(payloadEncoded, "base64url").toString("utf8");
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return null;
    }
    const data = JSON.parse(payload);
    if (Date.now() > data.exp) return null;
    return data;
  } catch (err) {
    return null;
  }
}

function getAuthTokenFromRequest(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}

async function loadUsers() {
  try {
    const raw = await fs.readFile(USERS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function saveUsers(users) {
  await fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2), "utf-8");
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!isValidEmail(email) || !isValidPassword(password)) {
      return res.status(400).json({ error: "Valid email and password (8+ chars) are required." });
    }

    const users = await loadUsers();
    if (users.find((user) => user.email === email.toLowerCase())) {
      return res.status(400).json({ error: "Account already exists." });
    }

    users.push({
      email: email.toLowerCase(),
      password: hashPassword(password),
      createdAt: new Date().toISOString(),
    });

    await saveUsers(users);
    res.json({ success: true, message: "Account created." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signup failed." });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!isValidEmail(email) || !isValidPassword(password)) {
      return res.status(400).json({ error: "Valid email and password are required." });
    }

    const users = await loadUsers();
    const user = users.find((item) => item.email === email.toLowerCase());
    if (!user || user.password !== hashPassword(password)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = createAuthToken(email);
    res.json({ success: true, message: "Login successful.", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed." });
  }
});

app.get("/verify", (req, res) => {
  const token = getAuthTokenFromRequest(req);
  const payload = verifyAuthToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
  res.json({ success: true, email: payload.email, expiresAt: payload.exp });
});

// ======================
// AVE PROXY
// ======================
app.get("/ave/trending", async (req, res) => {
  try {
    const chain = req.query.chain || "solana";
    const response = await axios.get("https://prod.ave-api.com/v2/tokens/trending", {
      params: { chain },
      headers: { "X-API-KEY": AVE_API_KEY },
    });
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "AVE trending failed" });
  }
});

app.get("/ave/txs/swap/:pair", async (req, res) => {
  try {
    const { pair } = req.params;
    const { limit = 10 } = req.query;
    const response = await axios.get(
      `https://prod.ave-api.com/v2/txs/swap/${encodeURIComponent(pair)}`,
      {
        params: { limit },
        headers: { "X-API-KEY": AVE_API_KEY },
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "AVE txs failed" });
  }
});

app.get("/ave/smart_wallets", async (req, res) => {
  try {
    const chain = req.query.chain || "solana";
    const response = await axios.get("https://prod.ave-api.com/v2/address/smart_wallet/list", {
      params: { chain },
      headers: { "X-API-KEY": AVE_API_KEY },
    });
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "AVE smart wallets failed" });
  }
});

// ======================
// QUOTE
// ======================
app.get("/quote", async (req, res) => {
  try {
    const { sellToken, buyToken, sellAmount } = req.query;

    const response = await axios.get(
      "https://api.0x.org/swap/permit2/quote",
      {
        params: { sellToken, buyToken, sellAmount },
        headers: { "0x-api-key": OX_API_KEY },
      }
    );

    res.json(response.data);
  } catch (err) {
    console.log(err.response?.data || err.message);
    res.status(500).json({ error: "Quote failed" });
  }
});

// ======================
// SWAP
// ======================
app.get("/swap", async (req, res) => {
  try {
    const { sellToken, buyToken, sellAmount, takerAddress } = req.query;

    const response = await axios.get(
      "https://api.0x.org/swap/permit2/quote",
      {
        params: {
          sellToken,
          buyToken,
          sellAmount,
          takerAddress,
          slippagePercentage: 0.01,
        },
        headers: {
          "0x-api-key": OX_API_KEY,
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    console.log(err.response?.data || err.message);
    res.status(500).json({ error: "Swap failed" });
  }
});

// ======================
const PORT = process.env.PORT || 3001;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;

if (SSL_KEY_PATH && SSL_CERT_PATH) {
  try {
    const [key, cert] = await Promise.all([
      fs.readFile(SSL_KEY_PATH),
      fs.readFile(SSL_CERT_PATH),
    ]);
    https.createServer({ key, cert }, app).listen(PORT, () => {
      console.log(`Secure server running on https://127.0.0.1:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start HTTPS server:", err);
    app.listen(PORT, () => {
      console.log(`Fallback HTTP server running on http://127.0.0.1:${PORT}`);
    });
  }
} else {
  app.listen(PORT, () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
  });
}