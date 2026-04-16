const HOST_API = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "http://127.0.0.1:3001"
  : "";

import './style.css';
import { ethers } from "ethers";

let provider;
let signer;
let userAddress;
let cachedTrendingTokens = [];

const CHAIN_CONFIG = {
  ethereum: {
    label: "Ethereum",
    rpcs: [
      "https://cloudflare-eth.com",
      "https://rpc.ankr.com/eth",
      "https://eth-rpc.gateway.pokt.network",
    ],
    nativeSymbol: "ETH",
    tokens: [
      { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2", decimals: 18 },
      { symbol: "USDC", address: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
      { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
    ],
  },
  arbitrum: {
    label: "Arbitrum",
    rpcs: [
      "https://arb1.arbitrum.io/rpc",
      "https://endpoints.omniatech.io/v1/arbitrum/mainnet",
      "https://rpc.ankr.com/arbitrum",
    ],
    nativeSymbol: "ETH",
    tokens: [
      { symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
      { symbol: "USDC", address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", decimals: 6 },
    ],
  },
  bsc: {
    label: "BSC",
    rpcs: [
      "https://bsc-dataseed.binance.org/",
      "https://rpc.ankr.com/bsc",
      "https://bsc.publicnode.com",
    ],
    nativeSymbol: "BNB",
    tokens: [
      { symbol: "WBNB", address: "0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18 },
      { symbol: "BUSD", address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", decimals: 18 },
    ],
  },
};

async function getRpcProvider(config) {
  const urls = config.rpcs || [config.rpc];
  let lastError = null;

  for (const url of urls) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      await provider.getNetwork();
      return provider;
    } catch (err) {
      lastError = err;
      console.warn(`RPC provider failed for ${config.label} at ${url}:`, err.message || err);
    }
  }

  throw new Error(`No available RPC providers for ${config.label}${lastError ? `: ${lastError.message || lastError}` : ""}`);
}

// ======================
// CONNECT WALLET
// ======================
window.connectEVM = async function () {
  try {
    if (!window.ethereum) {
      alert("No Ethereum provider found. Install MetaMask or another EVM wallet.");
      return;
    }

    const providerCandidate = window.ethereum.providers
      ? window.ethereum.providers.find((p) => p.isMetaMask) || window.ethereum.providers[0]
      : window.ethereum;

    if (!providerCandidate) {
      alert("Unable to access an Ethereum provider.");
      return;
    }

    await providerCandidate.request({ method: "eth_requestAccounts" });
    provider = new ethers.BrowserProvider(providerCandidate);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();
    window.userAddress = userAddress;

    document.getElementById("topbarActions").innerHTML = `
      <span>${userAddress.slice(0,6)}...${userAddress.slice(-4)}</span>
      <button onclick="disconnectEVM()">Disconnect</button>
      <button onclick="sendEVM()">Send EVM</button>
    `;

    console.log("✅ Connected:", userAddress);
    loadTrackedPortfolio();
  } catch (err) {
    console.error(err);
    alert("Failed to connect wallet. If you have multiple wallet extensions, try disabling one.");
  }
};

// ======================
// DISCONNECT
// ======================
window.disconnectEVM = function () {
  location.reload();
};

window.sendEVM = async function () {
  alert("Swap feature is preparing. Connect wallet and enter amount to trade.");
};

// ======================
// SWAP FUNCTION
// ======================
window.swap = async function () {
  try {
    if (!signer) {
      alert("Connect wallet first");
      return;
    }

    const amountInput = document.querySelector(".swap input").value;
    if (!amountInput) return alert("Enter amount");

    const sellAmount = ethers.parseUnits(amountInput, 6);

    const sellToken = "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"; // USDC
    const buyToken = "0xC02aaa39b223FE8D0A0e5C4F27eAD9083C756Cc2";  // WETH

    const res = await fetch(
      `${HOST_API}/swap?sellToken=${sellToken}&buyToken=${buyToken}&sellAmount=${sellAmount}&takerAddress=${userAddress}`
    );

    const data = await res.json();

    await approveToken(sellToken, data.allowanceTarget, sellAmount);

    const tx = {
      to: data.to,
      data: data.data,
      value: data.value || "0"
    };

    const txResponse = await signer.sendTransaction(tx);

    document.getElementById("activityFeed").innerHTML = `
      ⏳ Sending TX... <br/> ${txResponse.hash}
    `;

    const receipt = await txResponse.wait();

    document.getElementById("activityFeed").innerHTML = `
      ✅ Swap Success <br/> ${receipt.hash}
    `;

  } catch (err) {
    console.error(err);
    alert("Swap failed");
  }
};

// ======================
// APPROVE TOKEN
// ======================
async function approveToken(token, spender, amount) {
  const abi = ["function approve(address spender, uint256 amount) public returns (bool)"];
  const contract = new ethers.Contract(token, abi, signer);

  const tx = await contract.approve(spender, amount);
  await tx.wait();
}

// ======================
// TRENDING TOKENS (AVE)
// ======================
function normalizeAVETrendingResponse(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.tokens)) return data.tokens;
  if (Array.isArray(data.data?.tokens)) return data.data.tokens;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

async function loadTrendingTokens() {
  const container = document.getElementById("tokenList");

  try {
    const res = await fetch(`${HOST_API}/ave/trending?chain=solana`);
    const data = await res.json();
    const tokens = normalizeAVETrendingResponse(data);
    cachedTrendingTokens = tokens;

    if (!tokens.length) {
      container.innerHTML = "No trending AVE tokens available.";
      return;
    }

    container.innerHTML = tokens.slice(0, 5).map(t => `
      <p>
        🔥 ${t.symbol || t.name || "TOKEN"} <br/>
        💰 $${t.price || t.market_price || "N/A"}
      </p>
    `).join("");
  } catch (err) {
    console.error("AVE trending failed:", err);
    container.innerHTML = "Unable to load AVE trending tokens.";
  }
}

async function loadPriceAlerts() {
  const container = document.getElementById("alertList");
  try {
    const res = await fetch(`${HOST_API}/ave/trending?chain=solana`);
    const data = await res.json();
    const tokens = normalizeAVETrendingResponse(data).map((t) => ({
      symbol: t.symbol || t.name || "TOKEN",
      price: Number(t.price || t.market_price || 0),
      change: Number(t.price_change_24h ?? t.change_24h ?? t.market_change_24h ?? 0),
    }));

    const alerts = tokens.filter((t) => Math.abs(t.change) >= 10);
    if (!alerts.length) {
      container.innerHTML = "No strong price alerts detected.";
      return;
    }

    container.innerHTML = alerts.slice(0, 4).map((t) => `
      <div class="alert-item">
        <strong>${t.symbol}</strong> ${t.change >= 0 ? "📈" : "📉"}<br />
        ${t.change.toFixed(1)}% in 24h<br />
        Price: $${t.price.toFixed(2)}
      </div>
    `).join("");
  } catch (err) {
    console.error("AVE price alerts failed:", err);
    container.innerHTML = "Unable to load AVE price alerts.";
  }
}

async function loadRiskWarnings() {
  const container = document.getElementById("riskList");
  try {
    const pair = "2prhzdRwWzas2f4g5AAjyRUBcQcdajxd8NAzKcqhv76P-solana";
    const res = await fetch(`${HOST_API}/ave/txs/swap/${pair}?limit=10`);
    const data = await res.json();
    const txs = data.txs || [];

    if (!txs.length) {
      container.innerHTML = "No recent on-chain risk signals available.";
      updateRiskSummary("Normal", "No major risk signals detected.");
      return;
    }

    const buys = txs.filter((tx) => tx.from_symbol === "USDC");
    const sells = txs.filter((tx) => tx.to_symbol === "USDC");
    const volume = txs.reduce((sum, tx) => sum + Number(tx.from_amount || 0), 0);
    const largeTrades = txs.filter((tx) => Number(tx.from_amount || 0) > 50000).length;

    const warnings = [];
    if (Math.abs(volume) > 220000) {
      warnings.push("High market volume detected. Watch for quick moves.");
    }
    if (largeTrades >= 2) {
      warnings.push("Large transactions seen. Possible whale activity.");
    }
    if (sells.length > buys.length) {
      warnings.push("Sell pressure is stronger than buy pressure.");
    }
    if (!warnings.length) {
      warnings.push("No major risk signals detected.");
    }

    container.innerHTML = warnings.map((msg) => `<p>${msg}</p>`).join("");
    updateRiskSummary(warnings.length ? "Elevated" : "Normal", warnings[0] || "No major risk signals detected.");
  } catch (err) {
    console.error("AVE risk warnings failed:", err);

    if (cachedTrendingTokens.length) {
      const highVol = cachedTrendingTokens.some((t) => Math.abs(Number(t.price_change_24h ?? t.change_24h ?? 0)) > 15);
      container.innerHTML = highVol
        ? "<p>Trend volatility is elevated; monitor positions closely.</p>"
        : "<p>Unable to fetch swap risk signals; using trend-volatility fallback.</p>";
      updateRiskSummary(highVol ? "Elevated" : "Normal", "Trend volatility used as fallback risk indicator.");
    } else {
      container.innerHTML = "Unable to load AVE risk warnings.";
      updateRiskSummary("Data unavailable", "Risk data unavailable.");
    }
  }
}

function updateRiskSummary(score, summary) {
  const scoreEl = document.getElementById("riskScore");
  const textEl = document.getElementById("riskSummary");
  if (scoreEl) scoreEl.textContent = score;
  if (textEl) textEl.textContent = summary;
}

async function loadDashboardSummary() {
  const totalValueEl = document.getElementById("totalValue");
  const alertCountEl = document.getElementById("alertsCount");
  const smartSignalsEl = document.getElementById("smartSignals");
  const portfolioChangeEl = document.getElementById("portfolioChange");

  let tokens = [];

  try {
    const trendingRes = await fetch(`${HOST_API}/ave/trending?chain=solana`);
    const trendingData = await trendingRes.json();
    tokens = normalizeAVETrendingResponse(trendingData);
    cachedTrendingTokens = tokens;

    const alerts = tokens.filter((t) => Math.abs(Number(t.price_change_24h ?? t.change_24h ?? 0)) >= 10);

    if (totalValueEl) {
      totalValueEl.textContent = tokens.length ? `$${Number(tokens[0].price || 0).toLocaleString(undefined, {maximumFractionDigits:2})}` : "$0.00";
    }
    if (portfolioChangeEl) {
      const topChange = Number(tokens[0]?.price_change_24h ?? tokens[0]?.change_24h ?? 0);
      portfolioChangeEl.textContent = `${topChange >= 0 ? "+" : ""}${Number.isFinite(topChange) ? topChange.toFixed(1) : 0}% 24h`;
    }
    if (alertCountEl) alertCountEl.textContent = String(alerts.length || 0);

    await loadCurrentPrices(tokens);
  } catch (err) {
    console.error("Dashboard trending failed:", err);
    if (totalValueEl) totalValueEl.textContent = "$0.00";
    if (portfolioChangeEl) portfolioChangeEl.textContent = "--";
    if (alertCountEl) alertCountEl.textContent = "0";
    const priceListEl = document.getElementById("priceList");
    if (priceListEl) priceListEl.innerHTML = "Unable to load current prices.";
  }

  try {
    const smartRes = await fetch(`${HOST_API}/ave/smart_wallets?chain=solana`);
    const smartData = await smartRes.json();
    const wallets = smartData.data || [];
    if (smartSignalsEl) smartSignalsEl.textContent = String(wallets.length || 0);
  } catch (err) {
    console.error("Smart wallet summary failed:", err);
    if (smartSignalsEl) smartSignalsEl.textContent = "0";
  }
}

async function loadCurrentPrices(tokens = null) {
  const container = document.getElementById("priceList");
  if (!container) return;

  try {
    if (!tokens || !tokens.length) {
      const res = await fetch(`${HOST_API}/ave/trending?chain=solana`);
      const data = await res.json();
      tokens = normalizeAVETrendingResponse(data);
    }

    if (!tokens || !tokens.length) {
      container.innerHTML = "No current prices available.";
      return;
    }

    container.innerHTML = tokens.slice(0, 6).map((t) => {
      const price = Number(t.price ?? t.market_price ?? t.market_price_usd ?? 0);
      const change = Number(t.price_change_24h ?? t.change_24h ?? t.market_change_24h ?? 0);
      return `
        <p>
          <strong>${t.symbol || t.name || "TOKEN"}</strong><br />
          Price: $${Number.isFinite(price) ? price.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0.00"}<br />
          Change: ${Number.isFinite(change) ? change.toFixed(2) : "0.00"}%
        </p>
      `;
    }).join("");
  } catch (err) {
    console.error("Current prices failed:", err);
    container.innerHTML = "Unable to load current prices.";
  }
}

window.loadTrackedPortfolio = async function () {
  const container = document.getElementById("portfolioList");
  const walletInput = document.getElementById("trackAddressInput").value.trim();
  const chainKey = document.getElementById("trackChainSelect").value;
  const config = CHAIN_CONFIG[chainKey] || CHAIN_CONFIG.ethereum;
  let address = walletInput || userAddress || window.ethereum?.selectedAddress || window.userAddress;

  if (!address && window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts?.length) {
        address = accounts[0];
      }
    } catch (err) {
      console.warn("Could not read connected accounts:", err);
    }
  }

  if (!address) {
    container.innerHTML = "<p>Enter a wallet address or connect your wallet to track assets.</p>";
    return;
  }

  if (!ethers.isAddress(address)) {
    container.innerHTML = "<p>Invalid wallet address.</p>";
    return;
  }

  if (!userAddress && window.ethereum?.selectedAddress) {
    userAddress = window.ethereum.selectedAddress;
  }

  try {
    const rpcProvider = await getRpcProvider(config);
    const nativeBalance = await rpcProvider.getBalance(address);
    const nativeValue = Number(ethers.formatEther(nativeBalance));

    const tokenAbi = ["function balanceOf(address owner) view returns (uint256)"];
    const tokenResults = await Promise.allSettled(config.tokens.map(async (token) => {
      const contract = new ethers.Contract(token.address, tokenAbi, rpcProvider);
      const raw = await contract.balanceOf(address);
      return {
        symbol: token.symbol,
        amount: Number(ethers.formatUnits(raw, token.decimals)),
        success: true,
      };
    }));

    const formattedTokens = tokenResults.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      return {
        symbol: config.tokens[index].symbol,
        amount: 0,
        success: false,
      };
    });

    container.innerHTML = `
      <div><strong>Chain</strong>: ${config.label}</div>
      <div><strong>Wallet</strong>: ${address.slice(0, 6)}...${address.slice(-4)}</div>
      <div><strong>${config.nativeSymbol}</strong>: ${nativeValue.toFixed(4)} ${config.nativeSymbol}</div>
      ${formattedTokens.map((token) => `
        <div>
          <strong>${token.symbol}</strong>: ${token.amount.toFixed(4)}${token.success ? "" : " (unavailable)"}
        </div>
      `).join("")}
    `;
  } catch (err) {
    console.error("Tracked portfolio error:", err);
    container.innerHTML = "Unable to load tracked portfolio. Check chain selection or RPC connectivity.";
  }
}

// ======================
// SMART WALLET TRACKING
// ======================
async function loadSmartWallets() {
  try {
    const res = await fetch(`${HOST_API}/ave/smart_wallets?chain=solana`);
    const data = await res.json();
    const wallets = data.data || [];

    const container = document.getElementById("smartMoneyList");

    if (!wallets.length) {
      container.innerHTML = "No AVE smart wallet signal data available.";
      return;
    }

    container.innerHTML = wallets.slice(0, 5).map(w => `
      <p>
        🐋 <strong>${w.wallet_address.slice(0,6)}...${w.wallet_address.slice(-4)}</strong><br/>
        Profit: $${Number(w.total_profit || 0).toFixed(2)}<br/>
        Signal: ${(Number(w.token_profit_rate || 0) * 100).toFixed(1)}%
      </p>
    `).join("");
  } catch (err) {
    console.error("AVE smart wallets failed:", err);
    document.getElementById("smartMoneyList").innerHTML = "Unable to load AVE smart wallets.";
  }
}

// ======================
// LIVE TRADES (AUTO LOOP)
// ======================
async function loadLiveTrades() {
  try {
    const pair = "2prhzdRwWzas2f4g5AAjyRUBcQcdajxd8NAzKcqhv76P-solana";
    const res = await fetch(`${HOST_API}/ave/txs/swap/${pair}?limit=5`);
    const data = await res.json();
    const txs = data.txs || [];

    const feed = document.getElementById("activityFeed");

    if (!txs.length) {
      feed.innerHTML = "No AVE trade activity available.";
      runClawAI([]);
      return;
    }

    feed.innerHTML = txs.map(tx => `
      <p>
        ${tx.from_symbol} → ${tx.to_symbol} <br/>
        💰 ${tx.from_amount}
      </p>
    `).join("");

    runClawAI(txs);
  } catch (err) {
    console.error("AVE live trades failed:", err);
    document.getElementById("activityFeed").innerHTML = "Unable to load AVE live trades.";
  }
}

// ======================
// AI ENGINE (CLAW)
// ======================
function runClawAI(txs) {
  let signal = "🟡 NEUTRAL";

  const buys = txs.filter(t => t.from_symbol === "USDC");
  const sells = txs.filter(t => t.to_symbol === "USDC");

  if (buys.length > sells.length) signal = "🟢 BUY SIGNAL";
  if (sells.length > buys.length) signal = "🔴 SELL SIGNAL";

  document.getElementById("agentOutput").innerHTML = signal;
}

// ======================
// SIDEBAR CONTROLS
// ======================
window.showDashboard = function () {
  loadDashboardSummary();
  loadTrendingTokens();
  loadLiveTrades();
  loadPriceAlerts();
  loadRiskWarnings();
  loadTrackedPortfolio();
};

window.showMarkets = function () {
  loadTrendingTokens();
  loadPriceAlerts();
};

window.showSwap = function () {
  const element = document.querySelector(".swap-card");
  if (element) element.scrollIntoView({ behavior: "smooth" });
};

window.showSmartMoney = function () {
  loadSmartWallets();
};

window.runAgent = function () {
  loadLiveTrades();
};

// ======================
// AUTO START
// ======================
console.log("🚀 ZENDRA SYSTEM STARTED");

loadTrendingTokens();
loadLiveTrades();
loadDashboardSummary();
loadTrendingTokens();
loadLiveTrades();
loadPriceAlerts();
loadRiskWarnings();
loadTrackedPortfolio();

// refresh every 5 seconds
setInterval(() => {
  loadLiveTrades();
  loadDashboardSummary();
}, 5000);

window.logout = function () {
  window.location.href = "index.html";
};