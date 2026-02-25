/* ==============================
   WLCSMS app.js — FULL FILE (stable)
   - Operator controls stay visible (operator.html + CSS)
   - Stage Requirements panel + CHANGE summaries
   - "On Deck" naming (internally status = "blue", displayed as ON DECK)
   - Queue behavior: LIVE -> BACKSTAGE -> ON DECK -> QUEUED
   - Color signals: Ahead/Behind/On-Time + Show Status + Offset + Over/Under
============================== */

// ==============================
// Firebase config
// ==============================
const firebaseConfig = {
  apiKey: "AIzaSyBAFSNhMWbMXUPR10b8ynjiKD8tVRK6tQ8",
  authDomain: "wlc-talent-show-sms.firebaseapp.com",
  projectId: "wlc-talent-show-sms",
  storageBucket: "wlc-talent-show-sms.firebasestorage.app",
  messagingSenderId: "941916915658",
  appId: "1:941916915658:web:06e04e1ace6a640d237133",
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  collection,
  serverTimestamp,
  writeBatch,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==============================
// Show seed data (edit later)
// Add: requirements per item (mics, chairs, instruments, other)
// ==============================
const SHOW_ID = "main";

const seedItems = [
  {
    order: 1,
    title: "Opening Welcome",
    type: "NARRATION",
    performers: ["Student MCs"],
    plannedSeconds: 180,
    requirements: { mics: "2 handheld, 1 stand", chairs: "0", instruments: "None", other: "None" },
  },
  {
    order: 2,
    title: "Sunrise Beats",
    type: "ACT",
    performers: ["Jazz Ensemble"],
    plannedSeconds: 240,
    requirements: { mics: "2 handheld, 1 stand", chairs: "2", instruments: "Piano", other: "None" },
  },
  {
    order: 3,
    title: "Spotlight Solo",
    type: "ACT",
    performers: ["Maya R."],
    plannedSeconds: 210,
    requirements: { mics: "1 handheld", chairs: "0", instruments: "None", other: "None" },
  },
  {
    order: 4,
    title: "Community Announcements",
    type: "NARRATION",
    performers: ["Student Council"],
    plannedSeconds: 120,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "None" },
  },
  {
    order: 5,
    title: "Dance Crew Showcase",
    type: "ACT",
    performers: ["Momentum Crew"],
    plannedSeconds: 300,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "Open stage" },
  },
  {
    order: 6,
    title: "Intermission",
    type: "INTERMISSION",
    performers: [],
    plannedSeconds: 600,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "House music" },
  },
  {
    order: 7,
    title: "Acoustic Duet",
    type: "ACT",
    performers: ["Noah & Priya"],
    plannedSeconds: 240,
    requirements: { mics: "2 handheld", chairs: "2 stools", instruments: "2 guitars", other: "2 DI boxes" },
  },
  {
    order: 8,
    title: "Comedy Spotlight",
    type: "ACT",
    performers: ["Jordan L."],
    plannedSeconds: 180,
    requirements: { mics: "1 handheld", chairs: "1 stool", instruments: "None", other: "None" },
  },
  {
    order: 9,
    title: "Senior Tribute",
    type: "NARRATION",
    performers: ["Senior Class"],
    plannedSeconds: 180,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "None" },
  },
  {
    order: 10,
    title: "Finale Medley",
    type: "ACT",
    performers: ["All Performers"],
    plannedSeconds: 360,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "Open stage" },
  },
  {
    order: 11,
    title: "Closing Thanks",
    type: "NARRATION",
    performers: ["Student MCs"],
    plannedSeconds: 150,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "None" },
  },
];

const ITEM_COUNT = seedItems.length;

const showRef = doc(db, "shows", SHOW_ID);
const itemsRef = collection(showRef, "items");

function itemIdForIndex(i) {
  return `item-${i + 1}`;
}
function itemRefByIndex(i) {
  return doc(itemsRef, itemIdForIndex(i));
}

// ==============================
// Subscriptions
// ==============================
function subscribeShow(callback) {
  return onSnapshot(showRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() : null);
  });
}

function subscribeItems(callback) {
  const itemsQuery = query(itemsRef, orderBy("order", "asc"));
  return onSnapshot(itemsQuery, (snapshot) => {
    const items = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    callback(items);
  });
}

// ==============================
// Time helpers
// ==============================
function normalizeTimestamp(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function formatClock(date) {
  if (!date) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return "—";
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatOffset(offsetSeconds) {
  if (offsetSeconds == null || Number.isNaN(offsetSeconds)) return "—";
  return formatDuration(Math.abs(offsetSeconds));
}

function getStatusLabel(offsetSeconds) {
  if (offsetSeconds == null || Number.isNaN(offsetSeconds)) return "ON TIME";
  if (Math.abs(offsetSeconds) <= 10) return "ON TIME";
  return offsetSeconds > 0 ? "BEHIND" : "AHEAD";
}

function displayStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "blue") return "ON DECK";
  return s ? s.toUpperCase() : "—";
}

// ==============================
// Signal / chip helpers (colors)
// ==============================
const SIGNAL_CLASSES = ["signal-success", "signal-danger", "signal-warn", "signal-info", "signal-muted"];
const CHIP_CLASSES = ["chip-running", "chip-hold", "chip-stopped"];

function clearSignalClasses(el) {
  if (!el) return;
  SIGNAL_CLASSES.forEach((c) => el.classList.remove(c));
}
function applySignal(el, tone) {
  if (!el) return;
  clearSignalClasses(el);
  const map = {
    success: "signal-success",
    danger: "signal-danger",
    warn: "signal-warn",
    info: "signal-info",
    muted: "signal-muted",
  };
  el.classList.add(map[tone] || "signal-info");
}
function applyScheduleSignal(el, offsetSeconds) {
  const label = getStatusLabel(offsetSeconds);
  if (label === "AHEAD") return applySignal(el, "success");
  if (label === "BEHIND") return applySignal(el, "danger");
  return applySignal(el, "info");
}
function applyOffsetSignal(el, offsetSeconds) {
  if (offsetSeconds == null || Number.isNaN(offsetSeconds)) return applySignal(el, "muted");
  if (Math.abs(offsetSeconds) <= 10) return applySignal(el, "info");
  return applySignal(el, offsetSeconds > 0 ? "danger" : "success");
}
function applyOverUnderSignal(el, diffSeconds) {
  if (diffSeconds == null || Number.isNaN(diffSeconds)) return applySignal(el, "muted");
  if (Math.abs(diffSeconds) <= 10) return applySignal(el, "info");
  return applySignal(el, diffSeconds > 0 ? "danger" : "success");
}
function clearChipClasses(el) {
  if (!el) return;
  CHIP_CLASSES.forEach((c) => el.classList.remove(c));
}
function applyShowStatusChip(el, status) {
  if (!el) return;
  clearChipClasses(el);
  const s = String(status || "").toLowerCase();
  if (s === "running") el.classList.add("chip-running");
  else if (s === "hold") el.classList.add("chip-hold");
  else el.classList.add("chip-stopped");
}

// ==============================
// Requirements helpers
// ==============================
function getRequirement(item, key) {
  const req = item?.requirements;
  if (!req) return "—";
  const val = req[key];
  if (val == null) return "—";
  const s = String(val).trim();
  return s.length ? s : "—";
}

function normalizeItemName(nameRaw) {
  let name = String(nameRaw || "").trim().toLowerCase();
  if (!name) return "";

  const map = {
    handhelds: "handheld",
    handheld: "handheld",
    stands: "stand",
    stand: "stand",
    stools: "stool",
    stool: "stool",
    chairs: "chair",
    chair: "chair",
    "di boxes": "di box",
    "di box": "di box",
    guitars: "guitar",
    guitar: "guitar",
  };
  if (map[name]) return map[name];

  if (name.endsWith("s") && name.length > 3) name = name.slice(0, -1);
  return name;
}

function parseRequirementValue(value) {
  const s0 = String(value || "").trim();
  if (!s0) return {};
  const s = s0.toLowerCase();
  if (s === "—" || s === "none" || s === "0" || s === "n/a") return {};

  const parts = s0.split(",").map((p) => p.trim()).filter(Boolean);
  const counts = {};

  parts.forEach((p) => {
    const m = p.match(/^(\d+)\s+(.*)$/);
    let count = 1;
    let name = p;

    if (m) {
      count = Number(m[1]);
      name = m[2];
    }

    name = normalizeItemName(name);
    if (!name) return;

    counts[name] = (counts[name] || 0) + (Number.isFinite(count) ? count : 1);
  });

  return counts;
}

function diffCounts(fromCounts, toCounts) {
  const keys = new Set([...Object.keys(fromCounts), ...Object.keys(toCounts)]);
  const adds = [];
  const removes = [];

  keys.forEach((k) => {
    const a = fromCounts[k] || 0;
    const b = toCounts[k] || 0;
    const d = b - a;
    if (d > 0) adds.push({ name: k, count: d });
    if (d < 0) removes.push({ name: k, count: -d });
  });

  adds.sort((x, y) => x.name.localeCompare(y.name));
  removes.sort((x, y) => x.name.localeCompare(y.name));

  return { adds, removes };
}

function describeChangePills(fromVal, toVal) {
  const fromCounts = parseRequirementValue(fromVal);
  const toCounts = parseRequirementValue(toVal);
  const { adds, removes } = diffCounts(fromCounts, toCounts);

  const pills = [];
  removes.forEach((r) => pills.push({ type: "remove", text: `-${r.count} ${r.name}` }));
  adds.forEach((a) => pills.push({ type: "add", text: `+${a.count} ${a.name}` }));
  return pills;
}

function renderChangeSummary(containerEl, fromItem, toItem) {
  if (!containerEl) return;

  const fields = [
    { key: "mics", label: "Mics" },
    { key: "chairs", label: "Chairs" },
    { key: "instruments", label: "Instruments" },
    { key: "other", label: "Other" },
  ];

  if (!fromItem || !toItem) {
    containerEl.innerHTML = `<div class="no-change">—</div>`;
    return;
  }

  const lines = [];

  fields.forEach((f) => {
    const fromVal = getRequirement(fromItem, f.key);
    const toVal = getRequirement(toItem, f.key);

    const pills = describeChangePills(fromVal, toVal);
    if (pills.length === 0) return;

    const pillHtml = pills.map((p) => `<span class="pill ${p.type}">${p.text}</span>`).join("");
    lines.push(`
      <div class="change-line">
        <div class="change-label">${f.label}</div>
        <div class="change-pills">${pillHtml}</div>
      </div>
    `);
  });

  containerEl.innerHTML = lines.length
    ? lines.join("")
    : `<div class="no-change">No stage changes.</div>`;
}

// ==============================
// Projected timing
// ==============================
function computeRemainingSeconds(items) {
  return items
    .filter((item) => item.status !== "done")
    .reduce((sum, item) => sum + (item.plannedSeconds || 0), 0);
}

function computeProjectedTiming(showData, items) {
  const remainingSeconds = computeRemainingSeconds(items);
  const now = new Date();
  const projectedEndAt = new Date(now.getTime() + remainingSeconds * 1000);

  const baseline = normalizeTimestamp(showData.plannedEndBaselineAt) || projectedEndAt;
  const offsetSeconds = Math.round((projectedEndAt - baseline) / 1000);

  return { projectedEndAt, offsetSeconds };
}

// ==============================
// Init / seed show
// ==============================
function buildInitialItems() {
  return seedItems.map((item, index) => {
    const status = index === 0 ? "backstage" : index === 1 ? "blue" : "queued";
    return { ...item, status, actualStartAt: null, actualEndAt: null, notes: "" };
  });
}

async function initShow() {
  const batch = writeBatch(db);
  const now = new Date();
  const initialItems = buildInitialItems();
  const totalPlannedSeconds = initialItems.reduce((sum, item) => sum + (item.plannedSeconds || 0), 0);
  const plannedEndBaselineAt = new Date(now.getTime() + totalPlannedSeconds * 1000);

  batch.set(showRef, {
    status: "stopped",
    holdMessage: "",
    currentItemId: "item-1",
    plannedEndBaselineAt,
    projectedEndAt: plannedEndBaselineAt,
    offsetSeconds: 0,
    updatedAt: serverTimestamp(),
  });

  initialItems.forEach((item, index) => batch.set(itemRefByIndex(index), item));
  await batch.commit();
}

// ==============================
// Transaction-safe item loading
// ==============================
async function txGetAllItems(transaction) {
  const items = [];
  for (let i = 0; i < ITEM_COUNT; i++) {
    const snap = await transaction.get(itemRefByIndex(i));
    if (snap.exists()) items.push({ id: snap.id, ...snap.data() });
  }
  items.sort((a, b) => (a.order || 0) - (b.order || 0));
  return items;
}

// ==============================
// Operator actions (LIVE -> BACKSTAGE -> ON DECK)
// ==============================
function buildShiftMap(items, currentId) {
  const byOrder = [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
  const cur = byOrder.find((it) => it.id === currentId);
  if (!cur) return null;

  const notDone = byOrder.filter((it) => it.status !== "done" && it.id !== currentId);
  const nextBackstage = notDone[0] || null;
  const nextDeck = notDone[1] || null;

  const map = new Map();
  byOrder.forEach((it) => {
    if (it.status === "done") map.set(it.id, "done");
    else if (it.id === currentId) map.set(it.id, "live");
    else if (nextBackstage && it.id === nextBackstage.id) map.set(it.id, "backstage");
    else if (nextDeck && it.id === nextDeck.id) map.set(it.id, "blue");
    else map.set(it.id, "queued");
  });

  return map;
}

async function startCurrentItem() {
  await runTransaction(db, async (transaction) => {
    const showSnap = await transaction.get(showRef);
    if (!showSnap.exists()) throw new Error("Show not initialized. Click Init Show / Reset first.");

    const showData = showSnap.data();
    const items = await txGetAllItems(transaction);

    const currentId = showData.currentItemId;
    const currentItem = items.find((it) => it.id === currentId);
    if (!currentItem) throw new Error(`Current item not found: ${currentId}`);

    const target = buildShiftMap(items, currentId);
    if (!target) throw new Error("Could not build queue shift map.");

    const now = new Date();

    items.forEach((it) => {
      const desired = target.get(it.id) || it.status;
      const patch = {};
      let changed = false;

      if (it.status !== desired) { patch.status = desired; changed = true; }
      if (it.id === currentId && !it.actualStartAt) { patch.actualStartAt = now; changed = true; }

      if (changed) transaction.update(doc(itemsRef, it.id), patch);
    });

    const previewItems = items.map((it) => ({
      ...it,
      status: target.get(it.id) || it.status,
      actualStartAt: it.id === currentId ? (it.actualStartAt || now) : it.actualStartAt,
    }));

    const { projectedEndAt, offsetSeconds } = computeProjectedTiming(showData, previewItems);

    transaction.update(showRef, {
      status: showData.status === "hold" ? "hold" : "running",
      projectedEndAt,
      offsetSeconds,
      updatedAt: serverTimestamp(),
    });
  });
}

async function endCurrentItem() {
  await runTransaction(db, async (transaction) => {
    const showSnap = await transaction.get(showRef);
    if (!showSnap.exists()) throw new Error("Show not initialized. Click Init Show / Reset first.");
    const showData = showSnap.data();

    const items = await txGetAllItems(transaction);

    const liveItem =
      items.find((it) => it.status === "live") ||
      items.find((it) => it.id === showData.currentItemId);

    if (!liveItem) throw new Error("No LIVE/current item found to end.");

    transaction.update(doc(itemsRef, liveItem.id), { status: "done", actualEndAt: new Date() });

    const remaining = items
      .filter((it) => it.id !== liveItem.id)
      .map((it) => (it.status === "done" ? it : { ...it, status: "queued" }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const notDone = remaining.filter((it) => it.status !== "done");
    const nextBackstage = notDone[0] || null;
    const nextDeck = notDone[1] || null;

    notDone.forEach((it, idx) => {
      const desired = idx === 0 ? "backstage" : idx === 1 ? "blue" : "queued";
      transaction.update(doc(itemsRef, it.id), { status: desired });
    });

    const nextCurrentId = nextBackstage ? nextBackstage.id : "item-1";
    const nextShowStatus = nextBackstage ? (showData.status === "hold" ? "hold" : "running") : "stopped";

    const updatedItemsForTiming = [
      { ...liveItem, status: "done" },
      ...remaining.map((it) => {
        if (it.id === nextBackstage?.id) return { ...it, status: "backstage" };
        if (it.id === nextDeck?.id) return { ...it, status: "blue" };
        if (it.status === "done") return it;
        return { ...it, status: "queued" };
      }),
    ];

    const { projectedEndAt, offsetSeconds } = computeProjectedTiming(showData, updatedItemsForTiming);

    transaction.update(showRef, {
      status: nextShowStatus,
      currentItemId: nextCurrentId,
      projectedEndAt,
      offsetSeconds,
      updatedAt: serverTimestamp(),
    });
  });
}

async function toggleHold(currentStatus, message) {
  const nextStatus = currentStatus === "hold" ? "running" : "hold";
  await updateDoc(showRef, {
    status: nextStatus,
    holdMessage: nextStatus === "hold" ? message || "HOLD" : "",
    updatedAt: serverTimestamp(),
  });
}

async function setCurrentItem(itemId) {
  await updateDoc(showRef, { currentItemId: itemId, updatedAt: serverTimestamp() });
}

async function updatePlannedSeconds(itemId, plannedSeconds) {
  await updateDoc(doc(itemsRef, itemId), { plannedSeconds });
}

// ==============================
// View logic (Operator only in this update)
// ==============================
function getElapsedSeconds(actualStartAt) {
  const start = normalizeTimestamp(actualStartAt);
  if (!start) return null;
  return Math.floor((Date.now() - start.getTime()) / 1000);
}

function initOperatorView() {
  const operatorTimeEl = document.getElementById("operatorTime");
  if (!operatorTimeEl) return;

  const operatorProjectedEndEl = document.getElementById("operatorProjectedEnd");
  const operatorOffsetEl = document.getElementById("operatorOffset");
  const operatorShowStatusEl = document.getElementById("operatorShowStatus");
  const operatorHeaderStatusEl = document.getElementById("operatorHeaderStatus");

  const currentTitleEl = document.getElementById("currentTitle");
  const currentTypeEl = document.getElementById("currentType");
  const currentStatusEl = document.getElementById("currentStatus");
  const currentPlannedEl = document.getElementById("currentPlanned");
  const currentElapsedEl = document.getElementById("currentElapsed");
  const currentOverUnderEl = document.getElementById("currentOverUnder");
  const currentStartTimeEl = document.getElementById("currentStartTime");

  const backstageTitleEl = document.getElementById("backstageTitle");
  const backstagePlannedEl = document.getElementById("backstagePlanned");
  const deckTitleEl = document.getElementById("blueTitle");
  const deckPlannedEl = document.getElementById("bluePlanned");

  const reqNowTitleEl = document.getElementById("reqNowTitle");
  const reqNowMicsEl = document.getElementById("reqNowMics");
  const reqNowChairsEl = document.getElementById("reqNowChairs");
  const reqNowInstrumentsEl = document.getElementById("reqNowInstruments");
  const reqNowOtherEl = document.getElementById("reqNowOther");

  const reqBackTitleEl = document.getElementById("reqBackTitle");
  const reqBackMicsEl = document.getElementById("reqBackMics");
  const reqBackChairsEl = document.getElementById("reqBackChairs");
  const reqBackInstrumentsEl = document.getElementById("reqBackInstruments");
  const reqBackOtherEl = document.getElementById("reqBackOther");
  const reqBackChangeEl = document.getElementById("reqBackChange");

  const reqDeckTitleEl = document.getElementById("reqDeckTitle");
  const reqDeckMicsEl = document.getElementById("reqDeckMics");
  const reqDeckChairsEl = document.getElementById("reqDeckChairs");
  const reqDeckInstrumentsEl = document.getElementById("reqDeckInstruments");
  const reqDeckOtherEl = document.getElementById("reqDeckOther");
  const reqDeckChangeEl = document.getElementById("reqDeckChange");

  const startBtn = document.getElementById("startBtn");
  const endBtn = document.getElementById("endBtn");
  const undoBtn = document.getElementById("undoBtn");
  const holdBtn = document.getElementById("holdBtn");
  const initBtn = document.getElementById("initBtn");

  const runTableBody = document.querySelector("#runTable tbody");
  const advancedToggle = document.getElementById("advancedToggle");
  const advancedHeader = document.getElementById("advancedHeader");

  let showData = null;
  let items = [];
  let lastSnapshot = null;

  function snapshotState() {
    return {
      show: {
        currentItemId: showData?.currentItemId,
        status: showData?.status,
        holdMessage: showData?.holdMessage || "",
      },
      items: items.map((it) => ({
        id: it.id,
        status: it.status,
        actualStartAt: it.actualStartAt || null,
        actualEndAt: it.actualEndAt || null,
        plannedSeconds: it.plannedSeconds || 0,
      })),
    };
  }

  async function undoSnapshot(snapshot) {
    if (!snapshot) return;
    const batch = writeBatch(db);

    snapshot.items.forEach((item) => {
      batch.update(doc(itemsRef, item.id), {
        status: item.status,
        actualStartAt: item.actualStartAt || null,
        actualEndAt: item.actualEndAt || null,
        plannedSeconds: item.plannedSeconds,
      });
    });

    batch.update(showRef, {
      currentItemId: snapshot.show.currentItemId || "item-1",
      status: snapshot.show.status || "stopped",
      holdMessage: snapshot.show.holdMessage || "",
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  }

  function renderRunTable() {
    if (!runTableBody) return;
    runTableBody.innerHTML = "";
    items.forEach((item) => {
      const status = String(item.status || "queued").toLowerCase();
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${item.order}</td>
        <td>${item.title}</td>
        <td>${item.type}</td>
        <td><span class="tag ${status}">${displayStatus(status)}</span></td>
        <td>${item.plannedSeconds ? formatDuration(item.plannedSeconds) : "—"}</td>
        <td>${formatClock(item.actualStartAt?.toDate?.() || item.actualStartAt)}</td>
        <td>${formatClock(item.actualEndAt?.toDate?.() || item.actualEndAt)}</td>
        <td class="advanced" style="display:none;">
          <div class="flex">
            <button data-action="set" data-id="${item.id}" class="secondary">Set as current</button>
            <button data-action="edit" data-id="${item.id}" class="secondary">Edit planned</button>
          </div>
        </td>
      `;
      runTableBody.appendChild(row);
    });
  }

  function renderShow() {
    if (!showData) return;

    operatorProjectedEndEl.textContent = formatClock(showData.projectedEndAt?.toDate?.() || showData.projectedEndAt);

    operatorOffsetEl.textContent =
      showData.offsetSeconds == null
        ? "—"
        : `${showData.offsetSeconds > 0 ? "+" : ""}${formatOffset(showData.offsetSeconds)}`;
    applyOffsetSignal(operatorOffsetEl, showData.offsetSeconds);

    const statusText = showData.status?.toUpperCase() || "—";
    operatorShowStatusEl.textContent = statusText;

    if (operatorHeaderStatusEl) {
      operatorHeaderStatusEl.textContent = statusText;
      applyShowStatusChip(operatorHeaderStatusEl, showData.status);
    }

    const liveItem = items.find((it) => it.status === "live");
    const currentItem = liveItem || items.find((it) => it.id === showData.currentItemId);
    const backstageItem = items.find((it) => it.status === "backstage");
    const deckItem = items.find((it) => it.status === "blue");

    currentTitleEl.textContent = currentItem?.title || "—";
    currentTypeEl.textContent = currentItem?.type || "—";
    currentStatusEl.textContent = displayStatus(currentItem?.status);
    currentPlannedEl.textContent = currentItem?.plannedSeconds ? formatDuration(currentItem.plannedSeconds) : "—";
    currentStartTimeEl.textContent = formatClock(currentItem?.actualStartAt?.toDate?.() || currentItem?.actualStartAt);

    backstageTitleEl.textContent = backstageItem?.title || "—";
    backstagePlannedEl.textContent = backstageItem?.plannedSeconds ? formatDuration(backstageItem.plannedSeconds) : "—";

    deckTitleEl.textContent = deckItem?.title || "—";
    deckPlannedEl.textContent = deckItem?.plannedSeconds ? formatDuration(deckItem.plannedSeconds) : "—";

    // Requirements values
    reqNowTitleEl.textContent = currentItem?.title || "—";
    reqNowMicsEl.textContent = getRequirement(currentItem, "mics");
    reqNowChairsEl.textContent = getRequirement(currentItem, "chairs");
    reqNowInstrumentsEl.textContent = getRequirement(currentItem, "instruments");
    reqNowOtherEl.textContent = getRequirement(currentItem, "other");

    reqBackTitleEl.textContent = backstageItem?.title || "—";
    reqBackMicsEl.textContent = getRequirement(backstageItem, "mics");
    reqBackChairsEl.textContent = getRequirement(backstageItem, "chairs");
    reqBackInstrumentsEl.textContent = getRequirement(backstageItem, "instruments");
    reqBackOtherEl.textContent = getRequirement(backstageItem, "other");

    reqDeckTitleEl.textContent = deckItem?.title || "—";
    reqDeckMicsEl.textContent = getRequirement(deckItem, "mics");
    reqDeckChairsEl.textContent = getRequirement(deckItem, "chairs");
    reqDeckInstrumentsEl.textContent = getRequirement(deckItem, "instruments");
    reqDeckOtherEl.textContent = getRequirement(deckItem, "other");

    // Change summaries
    renderChangeSummary(reqBackChangeEl, currentItem, backstageItem);
    renderChangeSummary(reqDeckChangeEl, backstageItem, deckItem);
  }

  function updateClock() {
    operatorTimeEl.textContent = formatClock(new Date());

    const currentItem =
      items.find((it) => it.status === "live") ||
      items.find((it) => it.id === showData?.currentItemId);

    const elapsed = getElapsedSeconds(currentItem?.actualStartAt);
    currentElapsedEl.textContent = elapsed == null ? "—" : formatDuration(elapsed);

    const planned = currentItem?.plannedSeconds || 0;
    if (elapsed != null) {
      const diff = elapsed - planned;
      const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
      currentOverUnderEl.textContent = `${sign}${formatDuration(Math.abs(diff))}`;
      applyOverUnderSignal(currentOverUnderEl, diff);
    } else {
      currentOverUnderEl.textContent = "—";
      applySignal(currentOverUnderEl, "muted");
    }
  }

  function safeRun(fn) {
    return fn().catch((e) => {
      console.error(e);
      alert(e?.message || String(e));
    });
  }

  startBtn?.addEventListener("click", () => safeRun(async () => { lastSnapshot = snapshotState(); await startCurrentItem(); }));
  endBtn?.addEventListener("click", () => safeRun(async () => { lastSnapshot = snapshotState(); await endCurrentItem(); }));
  undoBtn?.addEventListener("click", () => safeRun(async () => { if (!lastSnapshot) return; await undoSnapshot(lastSnapshot); lastSnapshot = null; }));
  holdBtn?.addEventListener("click", () => safeRun(async () => { const message = prompt("Hold message", showData?.holdMessage || "HOLD"); await toggleHold(showData?.status, message); }));
  initBtn?.addEventListener("click", () => safeRun(async () => { if (!confirm("Reset the show? This will overwrite all data.")) return; await initShow(); }));

  advancedToggle?.addEventListener("change", () => {
    const isEnabled = advancedToggle.checked;
    document.querySelectorAll(".advanced").forEach((cell) => (cell.style.display = isEnabled ? "table-cell" : "none"));
    const advancedHeader = document.getElementById("advancedHeader");
    if (advancedHeader) advancedHeader.style.display = isEnabled ? "table-cell" : "none";
  });

  runTableBody?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    const itemId = button.dataset.id;

    safeRun(async () => {
      if (action === "set") await setCurrentItem(itemId);
      if (action === "edit") {
        const value = prompt("Enter planned seconds", "180");
        const seconds = Number(value);
        if (!Number.isNaN(seconds)) await updatePlannedSeconds(itemId, seconds);
      }
    });
  });

  subscribeShow((data) => { showData = data; renderShow(); renderRunTable(); });
  subscribeItems((list) => { items = list; renderShow(); renderRunTable(); });

  setInterval(updateClock, 1000);
  updateClock();
}

// ==============================
// Open View logic (read-only)
// ==============================
function initOpenView() {
  const showStatusEl = document.getElementById("showStatus");
  const holdBarEl = document.getElementById("holdBar");

  const scheduleStatusEl = document.getElementById("scheduleStatus");
  const projectedEndEl = document.getElementById("projectedEnd");
  const currentTimeEl = document.getElementById("currentTime");

  const upcomingListEl = document.getElementById("upcomingList");

  const liveTitleEl = document.getElementById("liveTitle");
  const livePerformersEl = document.getElementById("livePerformers");

  const backstageTitleEl = document.getElementById("backstageTitle");
  const backstagePerformersEl = document.getElementById("backstagePerformers");
  const backstageTimerEl = document.getElementById("backstageTimer");

  const blueTitleEl = document.getElementById("blueTitle");
  const bluePerformersEl = document.getElementById("bluePerformers");
  const blueTimerEl = document.getElementById("blueTimer");

  // If these don't exist, we're not on open.html
  if (!scheduleStatusEl || !projectedEndEl || !currentTimeEl) return;

  let showData = null;
  let items = [];

  function formatPerformers(list) {
    const arr = Array.isArray(list) ? list : [];
    const s = arr.map((x) => String(x || "").trim()).filter(Boolean).join(", ");
    return s.length ? s : "—";
  }

  function getLiveItem() {
    return items.find((it) => it.status === "live") || items.find((it) => it.id === showData?.currentItemId) || null;
  }

  function getBackstageItem() {
    return items.find((it) => it.status === "backstage") || null;
  }

  function getBlueItem() {
    return items.find((it) => it.status === "blue") || null;
  }

  function secondsUntilBackstageOnStage() {
    const liveItem = items.find((it) => it.status === "live");
    if (!liveItem) return null;
    const elapsed = getElapsedSeconds(liveItem.actualStartAt);
    if (elapsed == null) return null;
    const planned = liveItem.plannedSeconds || 0;
    return Math.max(0, planned - elapsed);
  }

  function secondsUntilBlueMovesUp() {
    const tLive = secondsUntilBackstageOnStage();
    if (tLive == null) return null;
    const backstageItem = getBackstageItem();
    const backPlanned = backstageItem?.plannedSeconds || 0;
    return Math.max(0, tLive + backPlanned);
  }

  function renderHeaderAndTopStats() {
    // Current time
    currentTimeEl.textContent = formatClock(new Date());

    // Projected end
    const endAt = normalizeTimestamp(showData?.projectedEndAt) || normalizeTimestamp(showData?.plannedEndBaselineAt);
    projectedEndEl.textContent = formatClock(endAt);

    // Schedule status (AHEAD/BEHIND + offset)
    const off = showData?.offsetSeconds;
    const label = getStatusLabel(off);
    if (label === "AHEAD") scheduleStatusEl.textContent = `AHEAD ${formatOffset(off)}`;
    else if (label === "BEHIND") scheduleStatusEl.textContent = `BEHIND ${formatOffset(off)}`;
    else scheduleStatusEl.textContent = "ON TIME";
    applyScheduleSignal(scheduleStatusEl, off);

    // Status chip + hold bar
    const statusLower = String(showData?.status || "").toLowerCase();
    const statusText = showData?.status ? String(showData.status).toUpperCase() : "LOADING…";
    if (showStatusEl) {
      showStatusEl.textContent = statusText;
      applyShowStatusChip(showStatusEl, statusLower);
    }

    if (holdBarEl) {
      if (statusLower === "hold") {
        holdBarEl.style.display = "block";
        holdBarEl.textContent = showData?.holdMessage || "HOLD";
      } else {
        holdBarEl.style.display = "none";
        holdBarEl.textContent = "";
      }
    }
  }

  function renderUpcomingList() {
    if (!upcomingListEl) return;
    upcomingListEl.innerHTML = "";

    const byOrder = [...items].sort((a, b) => (a.order || 0) - (b.order || 0));

    byOrder.forEach((it) => {
      const status = String(it.status || "queued").toLowerCase();
      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `
        <div>
          <div>${it.title || "—"}</div>
          <div class="meta">${it.type || "—"}</div>
        </div>
        <span class="tag ${status}">${displayStatus(status)}</span>
      `;
      upcomingListEl.appendChild(row);
    });
  }

  function renderRightCards() {
    const liveItem = getLiveItem();
    const backstageItem = getBackstageItem();
    const blueItem = getBlueItem();

    if (liveTitleEl) liveTitleEl.textContent = liveItem?.title || "—";
    if (livePerformersEl) livePerformersEl.textContent = formatPerformers(liveItem?.performers);

    if (backstageTitleEl) backstageTitleEl.textContent = backstageItem?.title || "—";
    if (backstagePerformersEl) backstagePerformersEl.textContent = formatPerformers(backstageItem?.performers);

    if (blueTitleEl) blueTitleEl.textContent = blueItem?.title || "—";
    if (bluePerformersEl) bluePerformersEl.textContent = formatPerformers(blueItem?.performers);
  }

  function updateTimers() {
    const showStatus = String(showData?.status || "").toLowerCase();
    const frozen = showStatus === "hold" || showStatus === "stopped";

    const tBack = frozen ? null : secondsUntilBackstageOnStage();
    const tBlue = frozen ? null : secondsUntilBlueMovesUp();

    if (backstageTimerEl) backstageTimerEl.textContent = `GO TO STAGE IN: ${tBack == null ? "—" : formatDuration(tBack)}`;
    if (blueTimerEl) blueTimerEl.textContent = `GET READY IN: ${tBlue == null ? "—" : formatDuration(tBlue)}`;

    // keep clock updating too
    currentTimeEl.textContent = formatClock(new Date());
  }

  function renderAll() {
    renderHeaderAndTopStats();
    renderUpcomingList();
    renderRightCards();
    updateTimers();
  }

  subscribeShow((data) => { showData = data; renderAll(); });
  subscribeItems((list) => { items = list; renderAll(); });

  setInterval(updateTimers, 1000);
  updateTimers();
}

// Boot
document.addEventListener("DOMContentLoaded", () => {
  const isOperator = !!document.getElementById("operatorTime");
  if (isOperator) initOperatorView();
  else initOpenView();
});