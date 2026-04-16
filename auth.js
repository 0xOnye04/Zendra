// ======================
// AUTH VIEW HELPERS
// ======================
window.showLogin = function () {
  document.getElementById("loginBox").classList.remove("hidden");
  document.getElementById("signupBox").classList.add("hidden");
  setActiveButton();
};

window.showSignup = function () {
  document.getElementById("signupBox").classList.remove("hidden");
  document.getElementById("loginBox").classList.add("hidden");
  setActiveButton();
};

function setActiveButton() {
  document.getElementById('btnSignup').classList.toggle('active', document.getElementById('signupBox').classList.contains('hidden') === false);
  document.getElementById('btnLogin').classList.toggle('active', document.getElementById('loginBox').classList.contains('hidden') === false);
}

const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "http://127.0.0.1:3001"
  : "";

// ======================
// SIGNUP
// ======================
async function signup() {
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value.trim();

  if (!email || !password) {
    return showMsg("Fill all fields");
  }

  try {
    const res = await fetch(`${API_BASE}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      return showMsg(data.error || "Signup failed");
    }

    showMsg("✅ Account created! Please login.");
    showLogin();
  } catch (err) {
    console.error(err);
    showMsg("Signup service unavailable");
  }
}

// ======================
// LOGIN
// ======================
async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!email || !password) {
    return showMsg("Fill all fields");
  }

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      return showMsg(data.error || "Login failed");
    }

    if (!data.token) {
      return showMsg("Login failed: token missing from server response.");
    }
    localStorage.setItem("authToken", data.token);
    window.location.href = "index.html";
  } catch (err) {
    console.error(err);
    showMsg("Login service unavailable");
  }
}

// ======================
function showMsg(msg) {
  document.getElementById("authMsg").innerText = msg;
}

function initAuth() {
  verifyExistingSession();

  const hash = window.location.hash.toLowerCase();
  if (hash === '#login') {
    showLogin();
  } else {
    showSignup();
  }
}

async function verifyExistingSession() {
  const token = localStorage.getItem("authToken");
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      window.location.href = "index.html";
      return;
    }
  } catch (err) {
    console.warn("Session verification failed:", err);
  }

  localStorage.removeItem("authToken");
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}
