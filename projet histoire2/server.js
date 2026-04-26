const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const SOURCE_JSON = path.join(ROOT_DIR, "dev_construit_dnb.json");
const STATE_JSON = path.join(ROOT_DIR, "data", "editor_state.json");
const STATS_JSON = path.join(ROOT_DIR, "data", "game_stats.json");

function readJson(filePath, fallback = null) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeKey(theme, sujet) {
  return `${theme}|||${sujet}`;
}

function normalize(value) {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/\s+/g, " ");
}

function safeText(value, maxLen = 240) {
  return (value || "").toString().trim().slice(0, maxLen);
}

function parseIsoDate(value) {
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t) : null;
}

function splitPhrases(text) {
  const raw = (text || "").replace(/\r/g, "\n");
  const blocks = raw
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const phrases = [];
  for (const block of blocks) {
    const parts = block.match(/[^.!?]+[.!?]?/g) || [block];
    for (const part of parts) {
      const phrase = part.trim();
      if (phrase) phrases.push(phrase);
    }
  }
  return phrases;
}

function repairArtifacts(value) {
  if (typeof value !== "string" || value.length === 0) return value;
  let out = value;
  if (/[ÃÂ]/.test(out)) {
    try {
      const decoded = Buffer.from(out, "latin1").toString("utf8");
      if (!decoded.includes("\uFFFD")) out = decoded;
    } catch (_error) {
      // Keep original text if decoding fails.
    }
  }
  out = out.replaceAll("\u0019", "'");
  return out;
}

function escapeRegex(value) {
  return (value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function recoverFromPhrase(keywordText, phrase) {
  const keyword = repairArtifacts(keywordText || "");
  if (!keyword.includes("\uFFFD")) return keyword;
  const source = repairArtifacts(phrase || "");
  if (!source) return keyword;

  let pattern = "";
  for (const ch of keyword) {
    if (ch === "\uFFFD") {
      // Replacement char means a lost character; match 1-2 source chars.
      pattern += ".{1,2}?";
    } else if (/\s/.test(ch)) {
      pattern += "\\s+";
    } else {
      pattern += escapeRegex(ch);
    }
  }

  try {
    const re = new RegExp(pattern, "iu");
    const match = source.match(re);
    if (match && match[0]) return match[0];
  } catch (_error) {
    // Keep repaired keyword as-is if regex construction fails.
  }
  return keyword;
}

function stripDiacritics(value) {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenizeForMatch(value) {
  return stripDiacritics(repairArtifacts(value || ""))
    .toLowerCase()
    .replaceAll("œ", "oe")
    .replaceAll("æ", "ae")
    .replace(/[''`´]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function tokenJaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let overlap = 0;
  for (const token of sa) {
    if (sb.has(token)) overlap += 1;
  }
  const union = sa.size + sb.size - overlap;
  return union > 0 ? overlap / union : 0;
}

function simplifyForSimilarity(value) {
  return stripDiacritics((value || "").toString())
    .toLowerCase()
    .replaceAll("œ", "oe")
    .replaceAll("æ", "ae")
    .replaceAll("\uFFFD", "")
    .replace(/[^a-z0-9]/g, "");
}

function bigramDice(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map();
  for (let i = 0; i < a.length - 1; i += 1) {
    const g = a.slice(i, i + 2);
    counts.set(g, (counts.get(g) || 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const g = b.slice(i, i + 2);
    const n = counts.get(g) || 0;
    if (n > 0) {
      overlap += 1;
      counts.set(g, n - 1);
    }
  }
  return (2 * overlap) / ((a.length - 1) + (b.length - 1));
}

function recoverCanonicalEntry(source, themeText, sujetText) {
  const theme = (themeText || "").toString();
  const sujet = (sujetText || "").toString();
  const exact = source.find(
    (item) => normalize(item.theme) === normalize(theme) && normalize(item.sujet) === normalize(sujet)
  );
  if (exact) return exact;

  const themeMatches = source.filter((item) => normalize(item.theme) === normalize(theme));
  if (themeMatches.length === 0) return null;

  const sujetTokens = tokenizeForMatch(sujet);
  let best = null;
  let bestScore = 0;
  let secondBest = 0;
  for (const item of themeMatches) {
    const score = tokenJaccard(sujetTokens, tokenizeForMatch(item.sujet));
    if (score > bestScore) {
      secondBest = bestScore;
      bestScore = score;
      best = item;
    } else if (score > secondBest) {
      secondBest = score;
    }
  }

  if (!best) return null;
  if (bestScore >= 0.7 && bestScore - secondBest >= 0.1) return best;

  const sujetCompact = simplifyForSimilarity(sujet);
  let bestChar = null;
  let bestCharScore = 0;
  let secondCharScore = 0;
  for (const item of themeMatches) {
    const score = bigramDice(sujetCompact, simplifyForSimilarity(item.sujet));
    if (score > bestCharScore) {
      secondCharScore = bestCharScore;
      bestCharScore = score;
      bestChar = item;
    } else if (score > secondCharScore) {
      secondCharScore = score;
    }
  }
  if (bestChar && bestCharScore >= 0.9 && bestCharScore - secondCharScore >= 0.05) {
    return bestChar;
  }
  return null;
}

function loadSource() {
  const data = readJson(SOURCE_JSON, []);
  if (!Array.isArray(data)) return [];
  return data.map((row, index) => ({
    id: index,
    theme: row.theme || "A_CLASSER",
    sujet: row.sujet || `Sujet ${index + 1}`,
    texte: row.texte || "",
    phrases: splitPhrases(row.texte || ""),
  }));
}

function normalizeKeyword(keyword) {
  return {
    ...keyword,
    text: repairArtifacts(keyword.text || ""),
    phraseSnapshot: repairArtifacts(keyword.phraseSnapshot || ""),
    isVerb: !!keyword.isVerb,
    points: Number(keyword.points) || 1,
  };
}

function loadStateMap() {
  const raw = readJson(STATE_JSON, []);
  const map = new Map();
  let dirty = false;
  let rows = [];
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (raw && typeof raw === "object" && raw.key) {
    rows = [raw];
  } else if (raw && typeof raw === "object") {
    rows = Object.values(raw).filter((item) => item && typeof item === "object" && item.key);
  }
  if (!rows.length) return map;
  const source = loadSource();
  for (const row of rows) {
    if (!row) continue;
    let theme = repairArtifacts(row.theme || "");
    let sujet = repairArtifacts(row.sujet || "");
    const key = row.key || "";

    const direct = source.find((item) => item.theme === theme && item.sujet === sujet);
    if (!direct) {
      const recovered = recoverCanonicalEntry(source, theme, sujet);
      if (recovered) {
        theme = recovered.theme;
        sujet = recovered.sujet;
        dirty = true;
      }
    }

    if ((!theme || !sujet) && key.includes("|||")) {
      const [kTheme, kSujet] = key.split("|||");
      const fixedTheme = repairArtifacts(kTheme || "");
      const fixedSujet = repairArtifacts(kSujet || "");
      const recoveredByKey = recoverCanonicalEntry(source, fixedTheme, fixedSujet);
      if (recoveredByKey) {
        theme = recoveredByKey.theme;
        sujet = recoveredByKey.sujet;
        dirty = true;
      } else {
        theme = fixedTheme;
        sujet = fixedSujet;
      }
    }

    if (!theme || !sujet) continue;
    const canonicalKey = makeKey(theme, sujet);
    if (canonicalKey !== key || theme !== (row.theme || "") || sujet !== (row.sujet || "")) {
      dirty = true;
    }
    if (!map.has(canonicalKey)) {
      map.set(canonicalKey, {
        key: canonicalKey,
        theme,
        sujet,
        keywords: [],
      });
    }
    const target = map.get(canonicalKey);
    const sourceEntry = source.find(
      (item) => normalize(item.theme) === normalize(theme) && normalize(item.sujet) === normalize(sujet)
    );
    const incoming = Array.isArray(row.keywords)
      ? row.keywords.map((kw) => {
          const normalizedKw = normalizeKeyword(kw || {});
          const phraseIndex = Number(normalizedKw.phraseIndex);
          const sourcePhrase =
            sourceEntry && Number.isInteger(phraseIndex) && phraseIndex >= 0 && phraseIndex < sourceEntry.phrases.length
              ? sourceEntry.phrases[phraseIndex]
              : "";
          const next = {
            ...normalizedKw,
            text: sourcePhrase ? recoverFromPhrase(normalizedKw.text || "", sourcePhrase) : (normalizedKw.text || ""),
            phraseSnapshot: sourcePhrase ? normalize(sourcePhrase) : normalize(normalizedKw.phraseSnapshot || ""),
          };
          if (
            next.text !== (kw?.text || "") ||
            next.phraseSnapshot !== (kw?.phraseSnapshot || "") ||
            next.text !== normalizedKw.text ||
            next.phraseSnapshot !== normalizedKw.phraseSnapshot
          ) {
            dirty = true;
          }
          return next;
        })
      : [];
    target.keywords.push(...incoming);
  }

  for (const item of map.values()) {
    const seen = new Set();
    const before = item.keywords.length;
    item.keywords = item.keywords.filter((keyword) => {
      const sig = `${keyword.phraseIndex}|${normalize(keyword.text)}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
    if (item.keywords.length !== before) dirty = true;
  }
  if (dirty) {
    saveStateMap(map);
  }
  return map;
}

function saveStateMap(stateMap) {
  const rows = [...stateMap.values()];
  writeJson(STATE_JSON, rows);
}

function loadStats() {
  const raw = readJson(STATS_JSON, null);
  if (!raw) return { version: 1, sessions: [] };
  const version = raw && typeof raw === "object" ? Number(raw.version) || 1 : 1;
  const sessions = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray(raw.sessions) ? raw.sessions : [];
  const source = loadSource();
  return {
    version,
    sessions: sessions.map((session) => {
      const theme = repairArtifacts(session?.theme || "");
      const sujet = repairArtifacts(session?.sujet || "");
      const canonical = recoverCanonicalEntry(source, theme, sujet);
      return {
        ...session,
        theme: canonical ? canonical.theme : theme,
        sujet: canonical ? canonical.sujet : sujet,
        endQuizChosen: repairArtifacts(session?.endQuizChosen || ""),
      };
    }),
  };
}

function saveStats(stats) {
  const payload = {
    version: 1,
    sessions: Array.isArray(stats.sessions) ? stats.sessions : [],
  };
  writeJson(STATS_JSON, payload);
}

function findEntry(entries, theme, sujet) {
  const themeNorm = normalize(theme);
  const sujetNorm = normalize(sujet);
  return entries.find(
    (entry) => normalize(entry.theme) === themeNorm && normalize(entry.sujet) === sujetNorm
  );
}

function getEntryByQuery(entries, searchParams) {
  const theme = (searchParams.get("theme") || "").trim();
  const sujet = (searchParams.get("sujet") || "").trim();
  return findEntry(entries, theme, sujet);
}

function findState(stateMap, theme, sujet) {
  const t = normalize(theme);
  const s = normalize(sujet);
  return [...stateMap.values()].find(
    (item) => normalize(item.theme) === t && normalize(item.sujet) === s
  );
}

function buildThemeSummary(entries, stateMap) {
  const byTheme = new Map();
  for (const entry of entries) {
    const key = makeKey(entry.theme, entry.sujet);
    const state = stateMap.get(key);
    const edited = !!state && state.keywords.length > 0;
    if (!byTheme.has(entry.theme)) {
      byTheme.set(entry.theme, { theme: entry.theme, totalSubjects: 0, editedSubjects: 0 });
    }
    const item = byTheme.get(entry.theme);
    item.totalSubjects += 1;
    if (edited) item.editedSubjects += 1;
  }
  return [...byTheme.values()].sort((a, b) => a.theme.localeCompare(b.theme, "fr"));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1_000_000) {
        reject(new Error("Payload trop volumineux"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        reject(new Error("JSON invalide"));
      }
    });
    req.on("error", reject);
  });
}

function validatePoints(points) {
  const value = Number(points);
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function serveStatic(reqPath, res) {
  const safePath = reqPath === "/" ? "/index.html" : reqPath;
  const fullPath = path.join(PUBLIC_DIR, safePath);
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(fullPath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const contentTypeByExt = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    };
    res.writeHead(200, {
      "Content-Type": contentTypeByExt[ext] || "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const entries = loadSource();
    const stateMap = loadStateMap();
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/themes" && req.method === "GET") {
      return sendJson(res, 200, buildThemeSummary(entries, stateMap));
    }

    if (url.pathname === "/api/subjects" && req.method === "GET") {
      const theme = (url.searchParams.get("theme") || "").trim();
      if (!theme) return sendJson(res, 400, { error: "Parametre theme requis." });
      const themeNorm = normalize(theme);
      const rows = entries
        .filter((entry) => normalize(entry.theme) === themeNorm)
        .map((entry) => {
          const st = findState(stateMap, entry.theme, entry.sujet);
          return {
            theme: entry.theme,
            sujet: entry.sujet,
            edited: !!st && st.keywords.length > 0,
            keywordCount: st?.keywords?.length || 0,
          };
        })
        .sort((a, b) => a.sujet.localeCompare(b.sujet, "fr"));
      return sendJson(res, 200, rows);
    }

    if (url.pathname === "/api/entry" && req.method === "GET") {
      const entry = getEntryByQuery(entries, url.searchParams);
      if (!entry) return sendJson(res, 404, { error: "Sujet introuvable." });
      const key = makeKey(entry.theme, entry.sujet);
      const st = stateMap.get(key);
      return sendJson(res, 200, {
        theme: entry.theme,
        sujet: entry.sujet,
        texte: entry.texte,
        phrases: entry.phrases,
        keywords: st?.keywords || [],
      });
    }

    if (url.pathname === "/api/keyword" && req.method === "POST") {
      const payload = await readRequestBody(req);
      const theme = (payload.theme || "").trim();
      const sujet = (payload.sujet || "").trim();
      const phraseIndex = Number(payload.phraseIndex);
      const text = (payload.text || "").trim();
      const points = validatePoints(payload.points);
      const isVerb = !!payload.isVerb;

      if (!theme || !sujet || !Number.isInteger(phraseIndex) || !text || !points) {
        return sendJson(res, 400, { error: "Donnees invalides." });
      }

      const entry = findEntry(entries, theme, sujet);
      if (!entry) return sendJson(res, 404, { error: "Sujet introuvable." });
      if (phraseIndex < 0 || phraseIndex >= entry.phrases.length) {
        return sendJson(res, 400, { error: "phraseIndex invalide." });
      }

      const key = makeKey(entry.theme, entry.sujet);
      if (!stateMap.has(key)) {
        stateMap.set(key, { key, theme: entry.theme, sujet: entry.sujet, keywords: [] });
      }
      const st = stateMap.get(key);
      const keywordNorm = normalize(text);
      const duplicate = st.keywords.find(
        (item) => item.phraseIndex === phraseIndex && normalize(item.text) === keywordNorm
      );
      if (duplicate) {
        return sendJson(res, 409, { error: "Ce mot-cle existe deja pour cette phrase." });
      }

      const keyword = {
        id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
        phraseIndex,
        text,
        points,
        isVerb,
        phraseSnapshot: normalize(entry.phrases[phraseIndex]),
        createdAt: new Date().toISOString(),
      };
      st.keywords.push(keyword);
      saveStateMap(stateMap);
      return sendJson(res, 201, keyword);
    }

    if (url.pathname === "/api/keyword" && req.method === "PATCH") {
      const payload = await readRequestBody(req);
      const theme = (payload.theme || "").trim();
      const sujet = (payload.sujet || "").trim();
      const keywordId = (payload.keywordId || "").trim();
      if (!theme || !sujet || !keywordId) {
        return sendJson(res, 400, { error: "Donnees invalides." });
      }
      const st = findState(stateMap, theme, sujet);
      if (!st) return sendJson(res, 404, { error: "Aucune annotation trouvee." });
      const keyword = st.keywords.find((item) => item.id === keywordId);
      if (!keyword) return sendJson(res, 404, { error: "Mot-cle introuvable." });

      if (payload.points !== undefined) {
        const points = validatePoints(payload.points);
        if (!points) return sendJson(res, 400, { error: "Points invalides." });
        keyword.points = points;
      }
      if (payload.isVerb !== undefined) {
        keyword.isVerb = !!payload.isVerb;
      }
      saveStateMap(stateMap);
      return sendJson(res, 200, { ok: true, keyword });
    }

    if (url.pathname === "/api/keyword" && req.method === "DELETE") {
      const payload = await readRequestBody(req);
      const theme = (payload.theme || "").trim();
      const sujet = (payload.sujet || "").trim();
      const keywordId = payload.keywordId || "";
      if (!theme || !sujet || !keywordId) {
        return sendJson(res, 400, { error: "Donnees invalides." });
      }
      const st = findState(stateMap, theme, sujet);
      if (!st) return sendJson(res, 404, { error: "Aucune annotation trouvee." });
      const before = st.keywords.length;
      st.keywords = st.keywords.filter((item) => item.id !== keywordId);
      if (st.keywords.length === before) {
        return sendJson(res, 404, { error: "Mot-cle introuvable." });
      }
      saveStateMap(stateMap);
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === "/api/stats" && req.method === "GET") {
      const stats = loadStats();
      const limit = Number(url.searchParams.get("limit") || 0);
      const sessions = (stats.sessions || [])
        .slice()
        .sort((a, b) => (Date.parse(b.endedAt || b.startedAt || "") || 0) - (Date.parse(a.endedAt || a.startedAt || "") || 0));
      return sendJson(res, 200, {
        version: 1,
        sessions: Number.isFinite(limit) && limit > 0 ? sessions.slice(0, limit) : sessions,
      });
    }

    if (url.pathname === "/api/stats" && req.method === "POST") {
      const payload = await readRequestBody(req);
      const theme = safeText(payload.theme, 180);
      const sujet = safeText(payload.sujet, 240);
      const modeRaw = safeText(payload.mode, 20) || "all";
      const mode = modeRaw === "verbs" || modeRaw === "rest" || modeRaw === "all" ? modeRaw : "all";

      const startedAt = safeText(payload.startedAt, 60);
      const endedAt = safeText(payload.endedAt, 60);
      const startedDate = parseIsoDate(startedAt);
      const endedDate = parseIsoDate(endedAt);

      const score = Number(payload.score);
      const maxScore = payload.maxScore === undefined ? null : Number(payload.maxScore);
      const roundCount = Number(payload.roundCount);
      const solvedCount = Number(payload.solvedCount);
      const revealedCount = Number(payload.revealedCount);
      const endQuizChosen = safeText(payload.endQuizChosen, 240);
      const endQuizCorrect = payload.endQuizCorrect === true;
      const clientTz = safeText(payload.clientTz, 80);

      if (!theme || !sujet || !startedDate || !endedDate) {
        return sendJson(res, 400, { error: "Donnees stats invalides (theme/sujet/dates)." });
      }
      if (!Number.isFinite(score) || score < 0) {
        return sendJson(res, 400, { error: "Score invalide." });
      }
      if (!Number.isFinite(roundCount) || roundCount < 0) {
        return sendJson(res, 400, { error: "roundCount invalide." });
      }
      if (!Number.isFinite(solvedCount) || solvedCount < 0) {
        return sendJson(res, 400, { error: "solvedCount invalide." });
      }
      if (!Number.isFinite(revealedCount) || revealedCount < 0) {
        return sendJson(res, 400, { error: "revealedCount invalide." });
      }

      // Canonicalize theme/sujet if possible to keep stats consistent with source.
      const canonical = findEntry(entries, theme, sujet);
      const themeFinal = canonical ? canonical.theme : theme;
      const sujetFinal = canonical ? canonical.sujet : sujet;

      const durationMs = Math.max(0, endedDate.getTime() - startedDate.getTime());
      const session = {
        id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
        theme: themeFinal,
        sujet: sujetFinal,
        mode,
        startedAt: startedDate.toISOString(),
        endedAt: endedDate.toISOString(),
        durationMs,
        score,
        maxScore: Number.isFinite(maxScore) ? maxScore : null,
        roundCount,
        solvedCount,
        revealedCount,
        endQuizChosen,
        endQuizCorrect,
        clientTz,
        createdAt: new Date().toISOString(),
      };

      const stats = loadStats();
      const sessions = Array.isArray(stats.sessions) ? stats.sessions : [];
      sessions.push(session);
      // Keep file size bounded.
      const MAX_SESSIONS = 5000;
      stats.sessions = sessions.length > MAX_SESSIONS ? sessions.slice(-MAX_SESSIONS) : sessions;
      saveStats(stats);
      return sendJson(res, 201, { ok: true, session });
    }

    if (url.pathname === "/api/game/build" && req.method === "POST") {
      const payload = await readRequestBody(req);
      const theme = (payload.theme || "").trim();
      const sujet = (payload.sujet || "").trim();
      const mode = (payload.mode || "all").trim();
      const entry = findEntry(entries, theme, sujet);
      if (!entry) return sendJson(res, 404, { error: "Sujet introuvable." });

      const key = makeKey(entry.theme, entry.sujet);
      const st = stateMap.get(key);
      const keywords = (st?.keywords || []).filter((item) => {
        if (mode === "verbs") return !!item.isVerb;
        if (mode === "rest") return !item.isVerb;
        return true;
      });
      if (keywords.length === 0) {
        const message =
          mode === "verbs"
            ? "Ce sujet n'a aucun verbe d'articulation edite."
            : mode === "rest"
              ? "Ce sujet n'a aucun mot-cle (hors verbes) edite."
              : "Ce sujet n'a aucun mot-cle edite.";
        return sendJson(res, 400, { error: message });
      }

      const byPhrase = new Map();
      for (const item of keywords) {
        if (!byPhrase.has(item.phraseIndex)) byPhrase.set(item.phraseIndex, []);
        byPhrase.get(item.phraseIndex).push(item);
      }

      const rounds = [];
      const usedTexts = new Set();
      const phraseIndexes = [...byPhrase.keys()].sort((a, b) => a - b);
      for (const phraseIndex of phraseIndexes) {
        const options = byPhrase.get(phraseIndex).slice();
        const uniqueOptions = options.filter((item) => !usedTexts.has(normalize(item.text)));
        const selected = pickRandom(uniqueOptions.length > 0 ? uniqueOptions : options);
        if (!selected) continue;
        usedTexts.add(normalize(selected.text));
        rounds.push({
          roundId: selected.id,
          phraseIndex,
          phrase: entry.phrases[phraseIndex],
          keyword: selected,
          state: "pending",
        });
      }

      const globalKeywordPool = [];
      for (const stateItem of stateMap.values()) {
        for (const word of stateItem.keywords || []) {
          if (mode === "verbs" && !word.isVerb) continue;
          if (mode === "rest" && word.isVerb) continue;
          globalKeywordPool.push({ text: word.text, points: word.points, refId: word.id, isVerb: !!word.isVerb });
        }
      }

      return sendJson(res, 200, {
        theme: entry.theme,
        sujet: entry.sujet,
        mode,
        texte: entry.texte,
        phrases: entry.phrases,
        rounds,
        globalKeywordPool,
      });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Erreur serveur" });
  }
});

server.listen(PORT, () => {
  console.log(`Serveur lance: http://localhost:${PORT}`);
});

