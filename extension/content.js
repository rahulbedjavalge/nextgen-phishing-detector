let NGPD_THRESHOLD = 0.55;
const OPENROUTER_API_KEY = "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";
const OPENROUTER_MODEL = "deepseek/deepseek-r1:free";

async function analyzeWithLLM(text) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content: "You are a security assistant. Given the following email or webmail content, analyze and return ONLY a JSON object with a 'phishing_risk' field (0-1, 1=definite phishing), and a 'reason' field explaining your assessment."
          },
          {
            role: "user",
            content: text.slice(0, 8000)
          }
        ]
      })
    });
    if (!response.ok) throw new Error("OpenRouter API error");
    const data = await response.json();
    const msg = data.choices?.[0]?.message?.content;
    if (!msg) throw new Error("No LLM response");
    // Try to parse JSON from LLM response
    const match = msg.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in LLM response");
    const result = JSON.parse(match[0]);
    return result;
  } catch (e) {
    console.warn("LLM analysis failed", e);
    return null;
  }
}

(async function init() {
  const cfg = await sendMessagePromise({ type: "getConfig" });
  if (!cfg.enabled) return;
  NGPD_THRESHOLD = typeof cfg.threshold === "number" ? cfg.threshold : 0.55;


  rescore();
  // LLM analysis
  analyzeCurrentMailWithLLM();
async function analyzeCurrentMailWithLLM() {
  const text = getCurrentMailText();
  if (!text || text.length < 20) return;
  const banner = ensureLLMBanner();
  banner.textContent = "Analyzing with AI...";
  const result = await analyzeWithLLM(text);
  if (result && typeof result.phishing_risk === "number") {
    const pct = Math.round(result.phishing_risk * 100);
    banner.textContent = `AI Phishing risk: ${pct}%\n${result.reason || ''}`;
    banner.style.background = result.phishing_risk >= 0.75 ? "#ff5252" : result.phishing_risk >= 0.55 ? "#ffd54f" : "#4caf50";
  } else {
    banner.textContent = "AI analysis unavailable.";
    banner.style.background = "#bdbdbd";
  }
}

function ensureLLMBanner() {
  let banner = document.getElementById("ngpd-llm-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "ngpd-llm-banner";
    banner.style.position = "fixed";
    banner.style.top = "0";
    banner.style.right = "0";
    banner.style.zIndex = 99999;
    banner.style.padding = "8px 16px";
    banner.style.fontSize = "15px";
    banner.style.fontWeight = "bold";
    banner.style.color = "#222";
    banner.style.borderRadius = "0 0 0 8px";
    banner.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
    banner.style.background = "#eee";
    // Add a quick rescan button for debugging
    const btn = document.createElement('button');
    btn.textContent = 'Rescan';
    btn.style.marginLeft = '12px';
    btn.style.padding = '4px 8px';
    btn.style.fontSize = '12px';
    btn.onclick = () => {
      console.debug('NGPD: manual rescan triggered');
      rescore();
      analyzeCurrentMailWithLLM();
    };
    banner.appendChild(btn);
    document.body.appendChild(banner);
  }
  return banner;
}

  // Re-score when the DOM changes, but only if message text changed
  let lastHash = "";
  const mo = new MutationObserver(() => {
    const h = hashStr(getCurrentMailText().slice(0, 8000));
    if (h !== lastHash) {
      lastHash = h;
      rescore();
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();

function rescore() {
  const { score, details, linkFindings } = analyzePage();
  console.debug('NGPD: rescore invoked — score', score, 'details', details, 'links', linkFindings.length);
  renderBanner(score, details);
  linkFindings.forEach(l => {
    try {
      if (l.el) {
        if (l.level === "bad") l.el.classList.add("ngpd-link-bad");
        if (l.level === "warn") l.el.classList.add("ngpd-link-warn");
      }
    } catch {}
  });
}

function getEmailRoots() {
  const roots = [];
  // Gmail
  document.querySelectorAll("div.a3s").forEach(el => roots.push(el));
  // Gmail alternate containers
  document.querySelectorAll('div.ii').forEach(el => roots.push(el));
  // Outlook Web
  document.querySelectorAll('div[aria-label="Message body"]').forEach(el => roots.push(el));
  document.querySelectorAll('[data-test-id="messageBody"]').forEach(el => roots.push(el));
  // Yahoo
  document.querySelectorAll('[data-test-id="message-view-body"]').forEach(el => roots.push(el));

  // Generic common containers
  document.querySelectorAll('article, main, [role="main"]').forEach(el => roots.push(el));

  if (!roots.length) {
    // Fallback to the largest content-like container
    let candidate = null;
    document.querySelectorAll("article, main, .message, .mail-body, .ii.gt, .a3s").forEach(el => {
      if (!candidate || (el.innerText || "").length > (candidate.innerText || "").length) candidate = el;
    });
    if (candidate) roots.push(candidate);
  }
  return roots;
}

function getCurrentMailText() {
  return getEmailRoots().map(el => el.innerText || "").join("\n");
}

function collectLinksFromRoots() {
  const roots = getEmailRoots();
  return roots.flatMap(el => Array.from(el.querySelectorAll("a[href]")));
}

function analyzePage() {
  const text = getCurrentMailText();
  // Debug: expose extracted text length for troubleshooting
  try { console.debug('NGPD: extracted text length', (text || '').length, 'preview:', (text || '').slice(0,200).replace(/\n/g,' ')); } catch(e) {}
  const links = collectLinksFromRoots();

  const suspiciousWords = [
    "verify your account","urgent","update your password","confirm your identity",
    "security alert","reset your password","unusual activity","login immediately",
    "suspend","account closed","click below","wire transfer","gift card","invoice attached"
  ];
  let wordHits = 0;
  const wordHitList = [];
  for (const w of suspiciousWords) {
    const re = new RegExp(w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i");
    if (re.test(text)) { wordHits += 1; wordHitList.push(w); }
  }

  const forms = getEmailRoots().flatMap(r => Array.from(r.querySelectorAll("form")));
  const passwordInputs = getEmailRoots().flatMap(r => Array.from(r.querySelectorAll('input[type="password"]')));
  let formSignals = 0;
  const formFindings = [];
  if (passwordInputs.length > 0) { formSignals += 1; formFindings.push("Password field present"); }
  forms.forEach(f => {
    const action = (f.getAttribute("action") || "").toLowerCase();
    if (action && isSensible(action) && looksExternal(action)) {
      formSignals += 1;
      formFindings.push(`Form posts to ${action.slice(0, 60)}...`);
    }
  });

  const linkFindings = [];
  let linkBad = 0, linkWarn = 0;
  links.forEach(el => {
    const href = el.getAttribute("href") || "";
    const textLabel = (el.innerText || "").trim();
    const r = analyzeUrl(href, textLabel);
    if (r.level !== "ok") {
      linkFindings.push({ ...r, el });
      if (r.level === "bad") linkBad += 1;
      if (r.level === "warn") linkWarn += 1;
    }
  });

  const f = {
    wordHits,
    linkBad,
    linkWarn,
    formSignals,
    exclamations: (text.match(/!/g) || []).length,
    allCapsWords: (text.match(/\b[A-Z]{6,}\b/g) || []).length
  };

  const weights = {
    bias: -1.2,
    wordHits: 0.5,
    linkBad: 0.8,
    linkWarn: 0.35,
    formSignals: 0.6,
    exclamations: 0.05,
    allCapsWords: 0.08
  };
  const linear = weights.bias +
    weights.wordHits * f.wordHits +
    weights.linkBad * f.linkBad +
    weights.linkWarn * f.linkWarn +
    weights.formSignals * f.formSignals +
    weights.exclamations * f.exclamations +
    weights.allCapsWords * f.allCapsWords;

  const prob = 1 / (1 + Math.exp(-linear));

  const details = [];
  if (wordHitList.length) details.push("Suspicious phrases: " + wordHitList.slice(0, 6).join(", "));
  if (formFindings.length) details.push("Form signals: " + formFindings.join("; "));
  if (linkBad > 0 || linkWarn > 0) details.push(`Link issues: ${linkBad} bad, ${linkWarn} warn`);

  return { score: prob, details, linkFindings, wordHits: f.wordHits, formSignals: f.formSignals, linkBad: f.linkBad, linkWarn: f.linkWarn };
}

function renderBanner(score, details) {
  let banner = document.getElementById("ngpd-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "ngpd-banner";
    const card = document.createElement("div");
    card.className = "ngpd-card";
    card.innerHTML = `
      <div class="ngpd-score"><span id="ngpd-score"></span></div>
      <ul class="ngpd-list" id="ngpd-list"></ul>
    `;
    banner.appendChild(card);
    document.documentElement.appendChild(banner);
  }
  updateBanner(score, details);
}

function updateBanner(score, details) {
  const card = document.querySelector("#ngpd-banner .ngpd-card");
  if (!card) return;
  const scoreEl = document.getElementById("ngpd-score");
  const listEl = document.getElementById("ngpd-list");
  const pct = Math.round(score * 100);

  card.classList.remove("ngpd-good","ngpd-warn","ngpd-bad");
  // Use user threshold from popup
  if (score >= Math.max(0.75, NGPD_THRESHOLD + 0.2)) card.classList.add("ngpd-bad");
  else if (score >= NGPD_THRESHOLD) card.classList.add("ngpd-warn");
  else card.classList.add("ngpd-good");

  scoreEl.textContent = `Phishing risk: ${pct}%`;
  listEl.innerHTML = "";
  details.slice(0, 6).forEach(d => {
    const li = document.createElement("li");
    li.textContent = d;
    li.className = "ngpd-item";
    listEl.appendChild(li);
  });
}

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); }
function sendMessagePromise(msg) { return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve)); }
function isSensible(url) { try { new URL(url, window.location.href); return true; } catch { return false; } }
function looksExternal(url) { try { const u = new URL(url, window.location.href); return u.origin !== location.origin; } catch { return false; } }
