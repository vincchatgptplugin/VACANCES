const state = {
  themes: [],
  subjects: [],
  selectedTheme: "",
  selectedSujet: "",
  currentEntry: null,
  selection: null,
  game: null,
  stats: { sessions: [], subjects: [] },
};

const dom = {
  tabEdit: document.getElementById("tab-edit"),
  tabGame: document.getElementById("tab-game"),
  tabStats: document.getElementById("tab-stats"),
  editView: document.getElementById("edit-view"),
  gameView: document.getElementById("game-view"),
  statsView: document.getElementById("stats-view"),
  themeSelect: document.getElementById("theme-select"),
  subjectSelect: document.getElementById("subject-select"),
  subjectStatus: document.getElementById("subject-status"),
  phrasesList: document.getElementById("phrases-list"),
  selectionBox: document.getElementById("selection-box"),
  pointsSelect: document.getElementById("points-select"),
  isVerbCheckbox: document.getElementById("is-verb-checkbox"),
  addKeywordBtn: document.getElementById("add-keyword-btn"),
  keywordsList: document.getElementById("keywords-list"),
  startGameBtn: document.getElementById("start-game-btn"),
  gameModeSelect: document.getElementById("game-mode-select"),
  gamePhrases: document.getElementById("game-phrases"),
  optionsList: document.getElementById("options-list"),
  optionsPanel: document.getElementById("options-panel"),
  endQuiz: document.getElementById("end-quiz"),
  endQuizSelect: document.getElementById("end-quiz-select"),
  endQuizValidate: document.getElementById("end-quiz-validate"),
  endQuizResult: document.getElementById("end-quiz-result"),
  score: document.getElementById("score"),
  remaining: document.getElementById("remaining"),
  gameHelp: document.getElementById("game-help"),
  burstLayer: document.getElementById("burst-layer"),
  statsTheme: document.getElementById("stats-theme"),
  statsSubject: document.getElementById("stats-subject"),
  statsMode: document.getElementById("stats-mode"),
  statsViewSelect: document.getElementById("stats-view-select"),
  statsRefresh: document.getElementById("stats-refresh"),
  statsCards: document.getElementById("stats-cards"),
  statsTableTitle: document.getElementById("stats-table-title"),
  statsTable: document.getElementById("stats-table"),
  completionModal: document.getElementById("completion-modal"),
  completionSummary: document.getElementById("completion-summary"),
  completionClose: document.getElementById("completion-close"),
  completionOpenStats: document.getElementById("completion-open-stats"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Erreur API");
  }
  return data;
}

function setActiveTab(mode) {
  const isEdit = mode === "edit";
  const isGame = mode === "game";
  const isStats = mode === "stats";
  dom.tabEdit.classList.toggle("active", isEdit);
  dom.tabGame.classList.toggle("active", isGame);
  dom.tabStats.classList.toggle("active", isStats);
  dom.editView.classList.toggle("active", isEdit);
  dom.gameView.classList.toggle("active", isGame);
  dom.statsView.classList.toggle("active", isStats);
}

function renderThemeOptions() {
  dom.themeSelect.innerHTML = state.themes
    .map(
      (item) =>
        `<option value="${escapeHtml(item.theme)}">${escapeHtml(item.theme)} (${item.editedSubjects}/${item.totalSubjects})</option>`
    )
    .join("");
}

function renderSubjectOptions() {
  dom.subjectSelect.innerHTML = state.subjects
    .map(
      (item) =>
        `<option value="${escapeHtml(item.sujet)}">${escapeHtml(item.sujet)} ${item.edited ? "OK" : ""}</option>`
    )
    .join("");
}

function keywordRowHtml(keyword) {
  const verbBadge = keyword.isVerb ? `<span class="tag-verb">Verbe</span>` : "";
  const normText = escapeAttr(normalize(keyword.text));
  return `
    <div class="keyword-row" data-keyword-id="${keyword.id}" data-phrase-index="${keyword.phraseIndex}" data-norm-text="${normText}">
      <span class="keyword-pill p${keyword.points}">${keyword.points} pt</span>
      <span><strong>Phrase ${keyword.phraseIndex + 1}</strong> - ${escapeHtml(keyword.text)}</span>
      ${verbBadge}
      <select class="keyword-points" data-id="${keyword.id}">
        <option value="1" ${keyword.points === 1 ? "selected" : ""}>1</option>
        <option value="2" ${keyword.points === 2 ? "selected" : ""}>2</option>
        <option value="3" ${keyword.points === 3 ? "selected" : ""}>3</option>
      </select>
      <label class="inline-check"><input type="checkbox" class="keyword-verb" data-id="${keyword.id}" ${keyword.isVerb ? "checked" : ""}/>Verbe</label>
      <button class="btn delete-keyword-btn" data-id="${keyword.id}">Supprimer</button>
    </div>
  `;
}

function escapeRegex(value) {
  return (value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLooseTextRegex(value) {
  const input = (value || "").toString().trim();
  if (!input) return null;
  let pattern = "";
  for (const ch of input) {
    if (/\s/.test(ch)) {
      pattern += "\\s+";
      continue;
    }
    if (ch === "'" || ch === "'" || ch === "'" || ch === "`" || ch === "´") {
      pattern += "['''`´]";
      continue;
    }
    pattern += escapeRegex(ch);
  }
  return pattern ? new RegExp(pattern, "iu") : null;
}

function findLooseMatch(text, value, fromIndex = 0) {
  const regex = buildLooseTextRegex(value);
  if (!regex) return null;
  const start = Math.max(0, Number(fromIndex) || 0);
  const input = (text || "").slice(start);
  const match = input.match(regex);
  if (!match) return null;
  return {
    index: start + (match.index || 0),
    length: (match[0] || "").length,
  };
}

function highlightPhrase(phrase, phraseIndex, keywords) {
  const rawPhrase = phrase || "";
  if (!keywords || keywords.length === 0) {
    return escapeHtml(rawPhrase);
  }

  // De-dup by normalized keyword text to avoid repeated markup noise.
  const seen = new Set();
  const uniq = [];
  for (const kw of keywords) {
    const k = normalize(kw.text);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(kw);
  }

  // Prefer longer matches first to reduce nested/partial highlights.
  uniq.sort((a, b) => (b.text || "").length - (a.text || "").length);

  let i = 0;
  let out = "";

  while (i < rawPhrase.length) {
    let best = null;
    let bestIdx = -1;
    let bestLen = 0;

    for (const kw of uniq) {
      const match = findLooseMatch(rawPhrase, kw.text || "", i);
      if (!match) continue;
      const idx = match.index;
      const len = match.length;
      if (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && len > bestLen)) {
        best = kw;
        bestIdx = idx;
        bestLen = len;
      }
    }

    if (!best) {
      out += escapeHtml(rawPhrase.slice(i));
      break;
    }

    if (bestIdx > i) {
      out += escapeHtml(rawPhrase.slice(i, bestIdx));
    }

    const matchText = rawPhrase.slice(bestIdx, bestIdx + bestLen);
    const pointsClass = `p${best.points || 1}`;
    const verbClass = best.isVerb ? " is-verb" : "";
    out += `<span class="kw-hit ${pointsClass}${verbClass}" data-phrase-index="${phraseIndex}" data-norm-text="${escapeAttr(
      normalize(best.text)
    )}" title="${escapeAttr(
      `${best.points || 1} point(s)${best.isVerb ? " - verbe" : ""}`
    )}">${escapeHtml(matchText)}</span>`;

    i = bestIdx + bestLen;
  }

  return out;
}

function renderEntry() {
  const entry = state.currentEntry;
  if (!entry) return;

  const byPhrase = new Map();
  for (const kw of entry.keywords || []) {
    if (!byPhrase.has(kw.phraseIndex)) byPhrase.set(kw.phraseIndex, []);
    byPhrase.get(kw.phraseIndex).push(kw);
  }

  dom.phrasesList.innerHTML = entry.phrases
    .map(
      (phrase, index) => {
        const kws = byPhrase.get(index) || [];
        const managed = kws.length > 0 ? " managed" : "";
        const managedCount = kws.length > 0 ? `<span class="managed-count">${kws.length}</span>` : "";
        return `
    <div class="phrase editable-phrase${managed}" data-phrase-index="${index}">
      <small>Phrase ${index + 1}</small>
      ${managedCount}
      <span class="phrase-text">${highlightPhrase(phrase, index, kws)}</span>
    </div>
  `;
      }
    )
    .join("");

  if ((entry.keywords || []).length === 0) {
    dom.keywordsList.innerHTML = `<div class="hint">Aucun mot-cle pour ce sujet.</div>`;
  } else {
    dom.keywordsList.innerHTML = [...entry.keywords]
      .sort((a, b) => {
        const phraseDelta = (Number(b.phraseIndex) || 0) - (Number(a.phraseIndex) || 0);
        if (phraseDelta !== 0) return phraseDelta;
        const createdDelta =
          (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
        if (createdDelta !== 0) return createdDelta;
        return String(b.id || "").localeCompare(String(a.id || ""));
      })
      .map(keywordRowHtml)
      .join("");
  }

  dom.subjectStatus.textContent = `${entry.keywords.length} mot(s)-cle`;
  attachEditPhraseSelection();
  attachKeywordActions();
  attachPhraseKeywordJump();
}

function attachPhraseKeywordJump() {
  // Clicking a highlighted chunk in the left panel jumps to the matching row on the right.
  dom.phrasesList.addEventListener("click", (event) => {
    const target = event.target;
    if (!target || !target.classList || !target.classList.contains("kw-hit")) return;
    const phraseIndex = Number(target.dataset.phraseIndex);
    const normText = target.dataset.normText || "";
    if (!Number.isInteger(phraseIndex) || !normText) return;

    const rows = [...dom.keywordsList.querySelectorAll(".keyword-row")];
    const match = rows.find(
      (row) =>
        Number(row.dataset.phraseIndex) === phraseIndex &&
        (row.dataset.normText || "") === normText
    );
    if (!match) return;
    match.scrollIntoView({ behavior: "smooth", block: "center" });
    match.classList.add("flash");
    setTimeout(() => match.classList.remove("flash"), 900);
  }, { once: true });
}

function attachKeywordActions() {
  const deleteButtons = dom.keywordsList.querySelectorAll(".delete-keyword-btn");
  for (const button of deleteButtons) {
    button.addEventListener("click", async () => {
      try {
        await api("/api/keyword", {
          method: "DELETE",
          body: JSON.stringify({
            theme: state.selectedTheme,
            sujet: state.selectedSujet,
            keywordId: button.dataset.id,
          }),
        });
        await loadEntry();
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const pointSelects = dom.keywordsList.querySelectorAll(".keyword-points");
  for (const select of pointSelects) {
    select.addEventListener("change", async () => {
      await updateKeyword(select.dataset.id, {
        points: Number(select.value),
      });
    });
  }

  const verbChecks = dom.keywordsList.querySelectorAll(".keyword-verb");
  for (const check of verbChecks) {
    check.addEventListener("change", async () => {
      await updateKeyword(check.dataset.id, {
        isVerb: check.checked,
      });
    });
  }
}

async function updateKeyword(keywordId, patch) {
  try {
    await api("/api/keyword", {
      method: "PATCH",
      body: JSON.stringify({
        theme: state.selectedTheme,
        sujet: state.selectedSujet,
        keywordId,
        ...patch,
      }),
    });
    await loadEntry();
  } catch (error) {
    alert(error.message);
  }
}

function attachEditPhraseSelection() {
  const phrases = dom.phrasesList.querySelectorAll(".editable-phrase");
  for (const node of phrases) {
    node.addEventListener("mouseup", () => {
      const selected = window.getSelection();
      const text = selected ? selected.toString().trim() : "";
      if (!text) {
        state.selection = null;
        dom.selectionBox.textContent = "Aucune selection.";
        dom.addKeywordBtn.disabled = true;
        return;
      }
      if (!node.contains(selected.anchorNode) || !node.contains(selected.focusNode)) {
        return;
      }
      state.selection = {
        phraseIndex: Number(node.dataset.phraseIndex),
        text,
      };
      dom.selectionBox.textContent = `Phrase ${state.selection.phraseIndex + 1}: "${text}"`;
      dom.addKeywordBtn.disabled = false;
      dom.addKeywordBtn.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

async function loadThemes() {
  state.themes = await api("/api/themes");
  renderThemeOptions();
  if (state.themes.length === 0) {
    dom.subjectStatus.textContent = "Aucune donnee";
    return;
  }
  state.selectedTheme = state.themes[0].theme;
  dom.themeSelect.value = state.selectedTheme;
  await loadSubjects();
}

async function loadSubjects() {
  state.subjects = await api(`/api/subjects?theme=${encodeURIComponent(state.selectedTheme)}`);
  renderSubjectOptions();
  if (state.subjects.length === 0) {
    state.selectedSujet = "";
    state.currentEntry = null;
    dom.phrasesList.innerHTML = "";
    dom.keywordsList.innerHTML = "";
    return;
  }
  state.selectedSujet = state.subjects[0].sujet;
  dom.subjectSelect.value = state.selectedSujet;
  await loadEntry();
}

async function loadEntry() {
  const entry = await api(
    `/api/entry?theme=${encodeURIComponent(state.selectedTheme)}&sujet=${encodeURIComponent(state.selectedSujet)}`
  );
  state.currentEntry = entry;
  state.selection = null;
  dom.selectionBox.textContent = "Aucune selection.";
  dom.addKeywordBtn.disabled = true;
  renderEntry();
  resetGameView();
}

function randomFrom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function buildOptions(correctKeyword, globalPool) {
  const normalized = new Set([normalize(correctKeyword.text)]);
  const candidates = globalPool.filter(
    (item) => normalize(item.text) !== normalize(correctKeyword.text)
  );
  shuffle(candidates);
  const options = [correctKeyword.text];

  for (const item of candidates) {
    const key = normalize(item.text);
    if (normalized.has(key)) continue;
    normalized.add(key);
    options.push(item.text);
    if (options.length >= 5) break;
  }

  while (options.length < 5) {
    options.push(`Option ${options.length + 1}`);
  }
  shuffle(options);
  return options;
}

function resetGameView() {
  state.game = null;
  dom.gamePhrases.innerHTML = `<div class="hint">Demarre une partie pour jouer.</div>`;
  dom.optionsList.innerHTML = "";
  dom.score.textContent = "0";
  dom.remaining.textContent = "0";
  dom.gameHelp.textContent = "Selectionne un trou pour afficher les choix.";
  dom.endQuiz.classList.add("hidden");
  dom.endQuizResult.textContent = "";
}

function modeLabel(mode) {
  if (mode === "verbs") return "Verbes";
  if (mode === "rest") return "Reste";
  return "Tous";
}

function formatDateTime(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function formatDuration(ms) {
  const total = Math.max(0, Number(ms) || 0);
  const sec = Math.floor(total / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function computeMaxScore(game) {
  const base = (game.rounds || []).reduce((sum, r) => sum + (Number(r.keyword?.points) || 0), 0);
  return base + 5;
}

function renderGameText() {
  const game = state.game;
  const byPhrase = new Map(game.rounds.map((row) => [row.phraseIndex, row]));
  dom.gamePhrases.innerHTML = game.phrases
    .map((phrase, index) => {
      const round = byPhrase.get(index);
      if (!round) {
        return `<div class="phrase"><small>Phrase ${index + 1}</small>${escapeHtml(phrase)}</div>`;
      }
      const hidden = round.state === "pending" || round.state === "active";
      const holeClass = [
        "hole",
        round.state === "active" ? "current" : "",
        round.state === "solved" ? "revealed correct" : "",
        round.state === "revealed" ? "revealed failed" : "",
      ]
        .join(" ")
        .trim();
      const holeText = hidden ? "____" : escapeHtml(round.keyword.text);
      const holeHtml = `<button class="${holeClass}" data-round-id="${round.roundId}">${holeText}</button>`;
      const match = findLooseMatch(phrase || "", round.keyword.text || "", 0);
      const phraseHtml = match
        ? `${escapeHtml((phrase || "").slice(0, match.index))}${holeHtml}${escapeHtml(
            (phrase || "").slice(match.index + match.length)
          )}`
        : escapeHtml(phrase);
      return `
        <div class="phrase">
          <small>Phrase ${index + 1}</small>
          ${phraseHtml}
        </div>
      `;
    })
    .join("");

  const holeButtons = dom.gamePhrases.querySelectorAll(".hole:not(.revealed)");
  for (const button of holeButtons) {
    button.addEventListener("click", () => activateRound(button.dataset.roundId));
  }
}

function activateFirstPendingRound() {
  const game = state.game;
  if (!game) return;
  const next = game.rounds.find((item) => item.state === "pending");
  if (!next) return;
  activateRound(next.roundId);
}

function activateRound(roundId) {
  const game = state.game;
  const round = game.rounds.find((item) => item.roundId === roundId);
  if (!round || round.state === "solved" || round.state === "revealed") return;
  for (const item of game.rounds) {
    if (item.state === "active") item.state = "pending";
  }
  round.state = "active";
  renderGameText();
  renderOptions(round);
  dom.gameHelp.textContent = "Zone active choisie. Tu peux changer de trou tant que tu n'as pas valide de reponse.";
}

function renderOptions(round) {
  const game = state.game;
  const options = buildOptions(round.keyword, game.globalKeywordPool);
  dom.optionsList.innerHTML = options
    .map(
      (option) =>
        `<button class="option-btn" data-value="${escapeAttr(option)}">${escapeHtml(option)}</button>`
    )
    .join("");
  dom.gameHelp.textContent = "Choisis la bonne reponse. Si faux, la bonne reponse devient verte: clique-la pour continuer.";

  const buttons = dom.optionsList.querySelectorAll(".option-btn");
  for (const button of buttons) {
    button.addEventListener("click", () => onOptionClick(round.roundId, button.dataset.value, button));
  }
}

function maybeShowEndQuiz() {
  const game = state.game;
  if (!game) return;
  if (game.endQuizDone) return;
  const remaining = game.rounds.filter((item) => item.state === "pending" || item.state === "active").length;
  if (remaining !== 0) return;

  dom.endQuiz.classList.remove("hidden");
  dom.endQuizResult.textContent = "";
  dom.endQuizValidate.disabled = false;

  api(`/api/subjects?theme=${encodeURIComponent(game.theme)}`)
    .then((subjects) => {
      const options = subjects.map((s) => s.sujet);
      // Ensure the correct subject exists in list.
      if (!options.some((s) => normalize(s) === normalize(game.sujet))) {
        options.unshift(game.sujet);
      }
      dom.endQuizSelect.innerHTML = options
        .map((s) => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`)
        .join("");
      dom.endQuizSelect.value = game.sujet;
    })
    .catch(() => {
      dom.endQuizSelect.innerHTML = `<option value="${escapeAttr(game.sujet)}">${escapeHtml(game.sujet)}</option>`;
      dom.endQuizSelect.value = game.sujet;
    });
}

function onOptionClick(roundId, value, clickedButton) {
  const game = state.game;
  const round = game.rounds.find((item) => item.roundId === roundId);
  if (!round || round.state !== "active") return;
  const correct = normalize(value) === normalize(round.keyword.text);

  if (correct) {
    round.state = "solved";
    game.score += round.keyword.points;
    renderBurst(round.keyword.points);
    dom.score.textContent = String(game.score);
    dom.optionsList.innerHTML = "";
    dom.gameHelp.textContent = `+${round.keyword.points} point(s). Choisis un autre trou.`;
    updateRemaining();
    renderGameText();
    // Auto-select next pending round to keep flow; user can click a different hole if desired.
    activateFirstPendingRound();
    maybeShowEndQuiz();
    return;
  }

  clickedButton.classList.add("wrong");
  const buttons = [...dom.optionsList.querySelectorAll(".option-btn")];
  const correctButton = buttons.find(
    (item) => normalize(item.dataset.value) === normalize(round.keyword.text)
  );
  if (correctButton) {
    correctButton.classList.add("correct");
    dom.gameHelp.textContent = "Reponse affichee en vert: clique dessus pour valider et passer a la suite.";
    for (const button of buttons) {
      if (button !== correctButton) {
        button.disabled = true;
      }
    }
    correctButton.addEventListener(
      "click",
      () => {
        round.state = "revealed";
        dom.optionsList.innerHTML = "";
        dom.gameHelp.textContent = "Mot revele (0 point). Choisis un autre trou.";
        updateRemaining();
        renderGameText();
        activateFirstPendingRound();
        maybeShowEndQuiz();
      },
      { once: true }
    );
  }
}

function updateRemaining() {
  const remaining = state.game.rounds.filter((item) => item.state === "pending" || item.state === "active").length;
  dom.remaining.textContent = String(remaining);
}

function renderBurst(points) {
  const count = points === 3 ? 12 : points === 2 ? 8 : 5;
  const colors =
    points === 3
      ? ["#be123c", "#f59e0b", "#ec4899"]
      : points === 2
        ? ["#d97706", "#f59e0b", "#facc15"]
        : ["#0284c7", "#06b6d4", "#67e8f9"];

  for (let i = 0; i < count; i += 1) {
    const node = document.createElement("div");
    node.className = "burst";
    node.style.background = randomFrom(colors);
    node.style.width = `${12 + Math.random() * 34}px`;
    node.style.height = node.style.width;
    node.style.left = `${20 + Math.random() * 60}%`;
    node.style.top = `${20 + Math.random() * 60}%`;
    node.style.animationDuration = `${600 + Math.random() * 300}ms`;
    dom.burstLayer.appendChild(node);
    setTimeout(() => node.remove(), 1000);
  }

  if (points === 3) {
    renderConfettiRain();
  }
}

function renderConfettiRain() {
  const colors = ["#be123c", "#f59e0b", "#ec4899", "#06b6d4", "#22c55e", "#facc15"];
  const pieces = 120;
  for (let i = 0; i < pieces; i += 1) {
    const node = document.createElement("div");
    node.className = "confetti";
    node.style.background = randomFrom(colors);
    node.style.left = `${Math.random() * 100}%`;
    node.style.width = `${6 + Math.random() * 7}px`;
    node.style.height = `${8 + Math.random() * 12}px`;
    node.style.transform = `rotate(${Math.random() * 360}deg)`;
    node.style.animationDuration = `${1300 + Math.random() * 900}ms`;
    node.style.animationDelay = `${Math.random() * 260}ms`;
    dom.burstLayer.appendChild(node);
    setTimeout(() => node.remove(), 2800);
  }
}

function renderFinale() {
  for (let i = 0; i < 10; i += 1) {
    setTimeout(() => renderBurst(3), i * 90);
  }
  for (let i = 0; i < 6; i += 1) {
    setTimeout(() => renderBurst(2), 300 + i * 120);
  }
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function normalize(value) {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return (value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function getFilteredSessions() {
  const theme = dom.statsTheme.value || "__ALL__";
  const sujet = dom.statsSubject.value || "__ALL__";
  const mode = dom.statsMode.value || "any";
  return (state.stats.sessions || []).filter((s) => {
    if (theme !== "__ALL__" && normalize(s.theme) !== normalize(theme)) return false;
    if (theme !== "__ALL__" && sujet !== "__ALL__" && normalize(s.sujet) !== normalize(sujet)) return false;
    if (mode !== "any" && (s.mode || "all") !== mode) return false;
    return true;
  });
}

function renderStatsCards(sessions) {
  const total = sessions.length;
  const best = sessions.reduce((m, s) => Math.max(m, Number(s.score) || 0), 0);
  const avg = total === 0 ? 0 : sessions.reduce((sum, s) => sum + (Number(s.score) || 0), 0) / total;
  const selectedMode = dom.statsMode.value || "any";
  const availableSubjects = getFilteredStatsSubjects(selectedMode).length;
  const doneSubjects = new Set(sessions.map((s) => `${normalize(s.theme)}|||${normalize(s.sujet)}`)).size;
  const neverDone = Math.max(0, availableSubjects - doneSubjects);
  dom.statsCards.innerHTML = [
    `<div class="stat-card"><div class="k">Parties terminees</div><div class="v">${total}</div></div>`,
    `<div class="stat-card"><div class="k">Score moyen</div><div class="v">${avg.toFixed(1)}</div></div>`,
    `<div class="stat-card"><div class="k">Meilleur score</div><div class="v">${best}</div></div>`,
    `<div class="stat-card"><div class="k">DC jamais faits</div><div class="v">${neverDone}</div></div>`,
  ].join("");
}

function renderStatsTableSessions(sessions) {
  dom.statsTableTitle.textContent = `Dernieres parties (${sessions.length})`;
  const rows = sessions
    .slice()
    .sort((a, b) => (Date.parse(b.endedAt || "") || 0) - (Date.parse(a.endedAt || "") || 0))
    .slice(0, 50);

  dom.statsTable.innerHTML = `
    <thead>
      <tr>
        <th>Debut</th>
        <th>Fin</th>
        <th>Duree</th>
        <th>Theme</th>
        <th>DC</th>
        <th>Mode</th>
        <th>Score</th>
        <th>Quiz bonus</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((s) => {
          const ok = s.endQuizCorrect ? `<span class="pill ok">OK</span>` : `<span class="pill err">Faux</span>`;
          const score = s.maxScore ? `${s.score}/${s.maxScore}` : `${s.score}`;
          return `
            <tr>
              <td>${escapeHtml(formatDateTime(s.startedAt))}</td>
              <td>${escapeHtml(formatDateTime(s.endedAt))}</td>
              <td>${escapeHtml(formatDuration(s.durationMs))}</td>
              <td>${escapeHtml(s.theme || "")}</td>
              <td>${escapeHtml(s.sujet || "")}</td>
              <td>${escapeHtml(modeLabel(s.mode || "all"))}</td>
              <td><strong>${escapeHtml(score)}</strong></td>
              <td>${ok}</td>
            </tr>
          `;
        })
        .join("")}
    </tbody>
  `;
}

function aggregateBy(list, keyFn) {
  const map = new Map();
  for (const s of list) {
    const k = keyFn(s);
    if (!k) continue;
    if (!map.has(k)) map.set(k, { key: k, count: 0, best: 0, sum: 0 });
    const row = map.get(k);
    const score = Number(s.score) || 0;
    row.count += 1;
    row.sum += score;
    row.best = Math.max(row.best, score);
  }
  const out = [...map.values()];
  out.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "fr"));
  return out.map((r) => ({ ...r, avg: r.count ? r.sum / r.count : 0 }));
}

function getFilteredStatsSubjects(mode = "any") {
  const theme = dom.statsTheme.value || "__ALL__";
  const sujet = dom.statsSubject.value || "__ALL__";
  return (state.stats.subjects || []).filter((item) => {
    if (theme !== "__ALL__" && normalize(item.theme) !== normalize(theme)) return false;
    if (theme !== "__ALL__" && sujet !== "__ALL__" && normalize(item.sujet) !== normalize(sujet)) return false;
    if (mode === "verbs" && Number(item.verbCount) <= 0) return false;
    if (mode === "rest" && Number(item.restCount) <= 0) return false;
    if (mode === "all" && Number(item.keywordCount) <= 0) return false;
    return true;
  });
}

function buildReviewRows(sessions) {
  const mode = dom.statsMode.value || "any";
  const bySubject = new Map();
  for (const session of sessions) {
    const key = `${normalize(session.theme)}|||${normalize(session.sujet)}`;
    if (!bySubject.has(key)) {
      bySubject.set(key, {
        count: 0,
        best: 0,
        sum: 0,
        lastAt: "",
        allCount: 0,
        verbsCount: 0,
        restCount: 0,
      });
    }
    const row = bySubject.get(key);
    const score = Number(session.score) || 0;
    const endedAt = session.endedAt || session.startedAt || "";
    row.count += 1;
    row.sum += score;
    row.best = Math.max(row.best, score);
    if ((Date.parse(endedAt) || 0) > (Date.parse(row.lastAt) || 0)) row.lastAt = endedAt;
    if ((session.mode || "all") === "verbs") row.verbsCount += 1;
    else if ((session.mode || "all") === "rest") row.restCount += 1;
    else row.allCount += 1;
  }

  return getFilteredStatsSubjects(mode)
    .map((subject) => {
      const stats = bySubject.get(`${normalize(subject.theme)}|||${normalize(subject.sujet)}`) || {
        count: 0,
        best: 0,
        sum: 0,
        lastAt: "",
        allCount: 0,
        verbsCount: 0,
        restCount: 0,
      };
      return {
        ...subject,
        ...stats,
        avg: stats.count ? stats.sum / stats.count : 0,
      };
    })
    .sort((a, b) => {
      const countDelta = a.count - b.count;
      if (countDelta !== 0) return countDelta;
      const lastDelta = (Date.parse(a.lastAt) || 0) - (Date.parse(b.lastAt) || 0);
      if (lastDelta !== 0) return lastDelta;
      return `${a.theme} ${a.sujet}`.localeCompare(`${b.theme} ${b.sujet}`, "fr");
    });
}

function renderStatsTableReview(sessions) {
  const rows = buildReviewRows(sessions);
  const never = rows.filter((row) => row.count === 0).length;
  dom.statsTableTitle.textContent = `A revoir - moins faits d'abord (${never} jamais faits)`;

  dom.statsTable.innerHTML = `
    <thead>
      <tr>
        <th>Priorite</th>
        <th>Theme</th>
        <th>DC</th>
        <th>Terminees</th>
        <th>Modes faits</th>
        <th>Derniere fois</th>
        <th>Score moyen</th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((r, index) => {
          const priority =
            r.count === 0
              ? `<span class="pill err">Jamais fait</span>`
              : index < 10
                ? `<span class="pill warn">A revoir</span>`
                : `<span class="pill">OK</span>`;
          const modes = [
            `Tous ${r.allCount}`,
            `Verbes ${r.verbsCount}`,
            `Reste ${r.restCount}`,
          ].join(" · ");
          const avg = r.count ? r.avg.toFixed(1) : "-";
          const last = r.lastAt ? formatDateTime(r.lastAt) : "-";
          return `
            <tr>
              <td>${priority}</td>
              <td>${escapeHtml(r.theme)}</td>
              <td>${escapeHtml(r.sujet)}</td>
              <td><strong>${r.count}</strong></td>
              <td>${escapeHtml(modes)}</td>
              <td>${escapeHtml(last)}</td>
              <td>${escapeHtml(avg)}</td>
              <td><button class="btn stats-open-subject" data-theme="${escapeAttr(r.theme)}" data-sujet="${escapeAttr(r.sujet)}">Ouvrir</button></td>
            </tr>
          `;
        })
        .join("")}
    </tbody>
  `;
  attachStatsSubjectOpenActions();
}

function renderStatsTableThemes(sessions) {
  dom.statsTableTitle.textContent = `Par theme (${sessions.length} parties)`;
  const rows = aggregateBy(sessions, (s) => s.theme);
  dom.statsTable.innerHTML = `
    <thead>
      <tr>
        <th>Theme</th>
        <th>Terminees</th>
        <th>Score moyen</th>
        <th>Meilleur</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r) => `
          <tr>
            <td>${escapeHtml(r.key)}</td>
            <td><strong>${r.count}</strong></td>
            <td>${r.avg.toFixed(1)}</td>
            <td>${r.best}</td>
          </tr>
        `
        )
        .join("")}
    </tbody>
  `;
}

function renderStatsTableSubjects(sessions) {
  const theme = dom.statsTheme.value || "__ALL__";
  dom.statsTableTitle.textContent =
    theme === "__ALL__" ? "Par DC (choisis un theme pour detailler)" : `Par DC - ${theme}`;

  const rows = aggregateBy(sessions, (s) => s.sujet);
  dom.statsTable.innerHTML = `
    <thead>
      <tr>
        <th>DC (sujet)</th>
        <th>Terminees</th>
        <th>Score moyen</th>
        <th>Meilleur</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r) => `
          <tr>
            <td>${escapeHtml(r.key)}</td>
            <td><strong>${r.count}</strong></td>
            <td>${r.avg.toFixed(1)}</td>
            <td>${r.best}</td>
          </tr>
        `
        )
        .join("")}
    </tbody>
  `;
}

async function populateStatsFilters() {
  const previous = dom.statsTheme.value || "__ALL__";
  dom.statsTheme.innerHTML = [`<option value="__ALL__">Tous</option>`]
    .concat(state.themes.map((t) => `<option value="${escapeAttr(t.theme)}">${escapeHtml(t.theme)}</option>`))
    .join("");
  dom.statsTheme.value = previous && (previous === "__ALL__" || state.themes.some((t) => t.theme === previous))
    ? previous
    : "__ALL__";

  if (dom.statsTheme.value === "__ALL__") {
    dom.statsSubject.innerHTML = `<option value="__ALL__">Tous</option>`;
    dom.statsSubject.value = "__ALL__";
    dom.statsSubject.disabled = true;
    return;
  }

  dom.statsSubject.disabled = false;
  try {
    const subjects = await api(`/api/subjects?theme=${encodeURIComponent(dom.statsTheme.value)}`);
    const prev = dom.statsSubject.value || "__ALL__";
    dom.statsSubject.innerHTML = [`<option value="__ALL__">Tous</option>`]
      .concat(subjects.map((s) => `<option value="${escapeAttr(s.sujet)}">${escapeHtml(s.sujet)}</option>`))
      .join("");
    dom.statsSubject.value = prev && (prev === "__ALL__" || subjects.some((s) => s.sujet === prev)) ? prev : "__ALL__";
  } catch (_error) {
    dom.statsSubject.innerHTML = `<option value="__ALL__">Tous</option>`;
    dom.statsSubject.value = "__ALL__";
  }
}

async function loadAllStatsSubjects() {
  const rows = [];
  for (const theme of state.themes || []) {
    const subjects = await api(`/api/subjects?theme=${encodeURIComponent(theme.theme)}`);
    for (const subject of subjects) {
      const keywordCount = Number(subject.keywordCount) || 0;
      let verbCount = 0;
      try {
        const entry = await api(
          `/api/entry?theme=${encodeURIComponent(subject.theme)}&sujet=${encodeURIComponent(subject.sujet)}`
        );
        verbCount = (entry.keywords || []).filter((keyword) => keyword.isVerb).length;
      } catch (_error) {
        verbCount = 0;
      }
      rows.push({
        theme: subject.theme,
        sujet: subject.sujet,
        keywordCount,
        verbCount,
        restCount: Math.max(0, keywordCount - verbCount),
      });
    }
  }
  state.stats.subjects = rows;
}

function attachStatsSubjectOpenActions() {
  const buttons = dom.statsTable.querySelectorAll(".stats-open-subject");
  for (const button of buttons) {
    button.addEventListener("click", async () => {
      const theme = button.dataset.theme || "";
      const sujet = button.dataset.sujet || "";
      if (!theme || !sujet) return;
      state.selectedTheme = theme;
      dom.themeSelect.value = theme;
      await loadSubjects();
      state.selectedSujet = sujet;
      dom.subjectSelect.value = sujet;
      await loadEntry();
      setActiveTab("game");
    });
  }
}

function renderStats() {
  const filtered = getFilteredSessions();
  renderStatsCards(filtered);
  const view = dom.statsViewSelect.value || "sessions";
  if (view === "review") return renderStatsTableReview(filtered);
  if (view === "themes") return renderStatsTableThemes(filtered);
  if (view === "subjects") return renderStatsTableSubjects(filtered);
  return renderStatsTableSessions(filtered);
}

async function refreshStats() {
  const data = await api("/api/stats");
  state.stats.sessions = Array.isArray(data.sessions) ? data.sessions : [];
  if (!Array.isArray(state.stats.subjects) || state.stats.subjects.length === 0) {
    await loadAllStatsSubjects();
  }
  await populateStatsFilters();
  renderStats();
}

function closeCompletionModal() {
  dom.completionModal.classList.add("hidden");
}

function openCompletionModal(summaryHtml) {
  dom.completionSummary.innerHTML = summaryHtml;
  dom.completionModal.classList.remove("hidden");
}

async function init() {
  dom.tabEdit.addEventListener("click", () => setActiveTab("edit"));
  dom.tabGame.addEventListener("click", () => setActiveTab("game"));
  dom.tabStats.addEventListener("click", async () => {
    setActiveTab("stats");
    await refreshStats();
  });

  dom.themeSelect.addEventListener("change", async (event) => {
    state.selectedTheme = event.target.value;
    await loadSubjects();
  });

  dom.subjectSelect.addEventListener("change", async (event) => {
    state.selectedSujet = event.target.value;
    await loadEntry();
  });

  dom.addKeywordBtn.addEventListener("click", async () => {
    if (!state.selection) return;
    try {
      await api("/api/keyword", {
        method: "POST",
        body: JSON.stringify({
          theme: state.selectedTheme,
          sujet: state.selectedSujet,
          phraseIndex: state.selection.phraseIndex,
          text: state.selection.text,
          points: Number(dom.pointsSelect.value),
          isVerb: dom.isVerbCheckbox.checked,
        }),
      });
      dom.pointsSelect.value = "1";
      dom.isVerbCheckbox.checked = false;
      await loadEntry();
    } catch (error) {
      alert(error.message);
    }
  });

  dom.startGameBtn.addEventListener("click", async () => {
    try {
      const game = await api("/api/game/build", {
        method: "POST",
        body: JSON.stringify({
          theme: state.selectedTheme,
          sujet: state.selectedSujet,
          mode: dom.gameModeSelect.value,
        }),
      });
      state.game = {
        ...game,
        score: 0,
        endQuizDone: false,
        startedAt: new Date().toISOString(),
        clientTz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      };
      state.game.maxScore = computeMaxScore(state.game);
      dom.score.textContent = "0";
      dom.optionsList.innerHTML = "";
      dom.gameHelp.textContent = "Clique un trou pour commencer.";
      updateRemaining();
      renderGameText();
      setActiveTab("game");
      // Start with an auto-selected round if any.
      activateFirstPendingRound();
    } catch (error) {
      alert(error.message);
    }
  });

  dom.endQuizValidate.addEventListener("click", async () => {
    const game = state.game;
    if (!game || game.endQuizDone) return;
    const chosen = dom.endQuizSelect.value || "";
    const ok = normalize(chosen) === normalize(game.sujet);
    if (ok) {
      game.score += 5;
      dom.score.textContent = String(game.score);
      dom.endQuizResult.textContent = "Correct: +5 points";
      dom.endQuizResult.style.color = "#15803d";
    } else {
      dom.endQuizResult.textContent = `Faux (bonne reponse: ${game.sujet})`;
      dom.endQuizResult.style.color = "#b91c1c";
    }
    game.endQuizDone = true;
    dom.endQuizValidate.disabled = true;

    const endedAt = new Date().toISOString();
    const solvedCount = game.rounds.filter((r) => r.state === "solved").length;
    const revealedCount = game.rounds.filter((r) => r.state === "revealed").length;
    const payload = {
      theme: game.theme,
      sujet: game.sujet,
      mode: game.mode || "all",
      startedAt: game.startedAt,
      endedAt,
      score: game.score,
      maxScore: game.maxScore,
      roundCount: game.rounds.length,
      solvedCount,
      revealedCount,
      endQuizChosen: chosen,
      endQuizCorrect: ok,
      clientTz: game.clientTz || "",
    };

    try {
      const result = await api("/api/stats", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (result?.session) {
        state.stats.sessions = [result.session].concat(state.stats.sessions || []);
      }

      renderFinale();
      const durationMs = (Date.parse(endedAt) || 0) - (Date.parse(game.startedAt) || 0);
      openCompletionModal(`
        <div><span class="pill">${escapeHtml(game.theme)}</span> <span class="pill">${escapeHtml(game.sujet)}</span> <span class="pill">${escapeHtml(modeLabel(game.mode || "all"))}</span></div>
        <div>Debut: <strong>${escapeHtml(formatDateTime(game.startedAt))}</strong></div>
        <div>Fin: <strong>${escapeHtml(formatDateTime(endedAt))}</strong> (${escapeHtml(formatDuration(durationMs))})</div>
        <div>Score: <strong>${escapeHtml(String(game.score))}${game.maxScore ? `/${escapeHtml(String(game.maxScore))}` : ""}</strong></div>
        <div>Trous: <strong>${solvedCount}</strong> correct(s), <strong>${revealedCount}</strong> revele(s) (sur ${game.rounds.length})</div>
        <div>Quiz bonus: ${ok ? `<span class="pill ok">OK</span>` : `<span class="pill err">Faux</span>`}</div>
      `);
    } catch (error) {
      dom.endQuizResult.textContent = `Partie terminee, mais enregistrement impossible: ${error.message}`;
      dom.endQuizResult.style.color = "#b91c1c";
    }
  });

  dom.statsRefresh.addEventListener("click", async () => {
    await refreshStats();
  });
  dom.statsTheme.addEventListener("change", async () => {
    await populateStatsFilters();
    renderStats();
  });
  dom.statsSubject.addEventListener("change", () => renderStats());
  dom.statsMode.addEventListener("change", () => renderStats());
  dom.statsViewSelect.addEventListener("change", () => renderStats());

  dom.completionClose.addEventListener("click", () => closeCompletionModal());
  dom.completionOpenStats.addEventListener("click", async () => {
    closeCompletionModal();
    setActiveTab("stats");
    await refreshStats();
  });
  dom.completionModal.addEventListener("click", (event) => {
    if (event.target === dom.completionModal) closeCompletionModal();
  });

  await loadThemes();
  await loadAllStatsSubjects();
  await populateStatsFilters();
}

init().catch((error) => {
  alert(error.message);
});

