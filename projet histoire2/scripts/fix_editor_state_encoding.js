const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TARGET = path.join(ROOT, "data", "editor_state.json");
const SOURCE = path.join(ROOT, "dev_construit_dnb.json");

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

function deepMap(value, fn) {
  const next = fn(value);
  if (Array.isArray(next)) return next.map((v) => deepMap(v, fn));
  if (next && typeof next === "object") {
    const out = {};
    for (const [k, v] of Object.entries(next)) {
      out[k] = deepMap(v, fn);
    }
    return out;
  }
  return next;
}

function fixKnownArtifacts(value) {
  let out = value;

  out = out.replaceAll("\u0019", "'");
  out = out.replaceAll("'", "'");

  out = out.replace(
    /([A-Za-zÀ-ÖØ-öø-ÿ])['\u2019]\"(?=[A-Za-zÀ-ÖØ-öø-ÿ])/g,
    "$1'"
  );

  out = out.replace(
    /\b([dDjJlLmMnNsStTcC])\uFFFD(?=[aàâäeéèêëiîïoôöuùûüyÿhH])/g,
    "$1'"
  );
  out = out.replace(
    /\b([dDjJlLmMnNsStTcC])\uFFFD\"(?=[A-Za-zÀ-ÖØ-öø-ÿ])/g,
    "$1'"
  );

  out = out
    .replaceAll("\uFFFD la", "à la")
    .replaceAll("s'\uFFFDtend", "s'étend")
    .replaceAll("S'\uFFFDtend", "S'étend")
    .replaceAll("Gr'ce \uFFFD", "Grâce à")
    .replaceAll("gr'ce \uFFFD", "grâce à")
    .replaceAll("Gr\uFFFDce \uFFFD", "Grâce à")
    .replaceAll("gr\uFFFDce \uFFFD", "grâce à");

  return out;
}

function escapeRegex(value) {
  return (value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fixString(value) {
  if (typeof value !== "string") return value;
  return fixKnownArtifacts(value);
}

function recoverFromPhrase(keywordText, phrase) {
  const keyword = fixString(keywordText || "");
  if (!keyword.includes("\uFFFD")) return keyword;
  const source = fixString(phrase || "");
  if (!source) return keyword;

  let pattern = "";
  for (const ch of keyword) {
    if (ch === "\uFFFD") {
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
  } catch {
    return keyword;
  }
  return keyword;
}

function normalize(value) {
  return (value || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
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

function loadSourceEntries() {
  const raw = stripBom(fs.readFileSync(SOURCE, "utf8"));
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((row) => {
    const theme = fixString((row && row.theme) || "");
    const sujet = fixString((row && row.sujet) || "");
    const texte = fixString((row && row.texte) || "");
    return { theme, sujet, phrases: splitPhrases(texte) };
  });
}

function canonicalizeState(stateRows, sourceEntries) {
  const out = [];
  for (const row of stateRows) {
    const theme = fixString((row && row.theme) || "");
    const sujet = fixString((row && row.sujet) || "");
    const key = typeof row?.key === "string" ? fixString(row.key) : "";

    const match = sourceEntries.find(
      (e) => normalize(e.theme) === normalize(theme) && normalize(e.sujet) === normalize(sujet)
    );
    const canonicalTheme = match ? match.theme : theme;
    const canonicalSujet = match ? match.sujet : sujet;
    const canonicalKey =
      canonicalTheme && canonicalSujet ? `${canonicalTheme}|||${canonicalSujet}` : key || `${theme}|||${sujet}`;

    const keywords = Array.isArray(row?.keywords) ? row.keywords : [];
    const nextKeywords = keywords.map((kw) => {
      const phraseIndex = Number(kw?.phraseIndex);
      const phraseText =
        match && Number.isInteger(phraseIndex) && phraseIndex >= 0 && phraseIndex < match.phrases.length
          ? match.phrases[phraseIndex]
          : "";
      const next = {
        ...kw,
        text: phraseText ? recoverFromPhrase((kw && kw.text) || "", phraseText) : fixString((kw && kw.text) || ""),
        phraseSnapshot: fixString((kw && kw.phraseSnapshot) || ""),
      };
      if (match && Number.isInteger(phraseIndex) && phraseIndex >= 0 && phraseIndex < match.phrases.length) {
        next.phraseSnapshot = normalize(match.phrases[phraseIndex]);
      }
      return next;
    });

    out.push({
      ...row,
      key: canonicalKey,
      theme: canonicalTheme,
      sujet: canonicalSujet,
      keywords: nextKeywords,
    });
  }
  return out;
}

function main() {
  const raw = stripBom(fs.readFileSync(TARGET, "utf8"));
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("JSON.parse failed:", error.message);
    process.exitCode = 1;
    return;
  }

  const fixed = deepMap(parsed, fixString);
  const sourceEntries = loadSourceEntries();
  const fixedRows = Array.isArray(fixed) ? fixed : [fixed].filter(Boolean);
  const canonical = canonicalizeState(fixedRows, sourceEntries);
  const nextText = `${JSON.stringify(canonical, null, 2)}\n`;

  if (nextText === `${raw.trimEnd()}\n`) {
    console.log("No change needed.");
    return;
  }

  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const backup = `${TARGET}.bak-${stamp}`;
  fs.copyFileSync(TARGET, backup);
  fs.writeFileSync(TARGET, nextText, "utf8");
  console.log(`Fixed encoding and wrote backup: ${path.basename(backup)}`);
}

main();

