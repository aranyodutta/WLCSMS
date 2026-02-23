// ==============================
// WLCSMS app.js — FULL FILE (queue shift fixed + "ON DECK")
// ==============================

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
// Show seed data
// ==============================
const SHOW_ID = "main";

const seedItems = [
  { order: 1, title: "Opening Welcome", type: "NARRATION", performers: ["Student MCs"], plannedSeconds: 180 },
  { order: 2, title: "Sunrise Beats", type: "ACT", performers: ["Jazz Ensemble"], plannedSeconds: 240 },
  { order: 3, title: "Spotlight Solo", type: "ACT", performers: ["Maya R."], plannedSeconds: 210 },
  { order: 4, title: "Community Announcements", type: "NARRATION", performers: ["Student Council"], plannedSeconds: 120 },
  { order: 5, title: "Dance Crew Showcase", type: "ACT", performers: ["Momentum Crew"], plannedSeconds: 300 },
  { order: 6, title: "Intermission", type: "INTERMISSION", performers: [], plannedSeconds: 600 },
  { order: 7, title: "Acoustic Duet", type: "ACT", performers: ["Noah & Priya"], plannedSeconds: 240 },
  { order: 8, title: "Comedy Spotlight", type: "ACT", performers: ["Jordan L."], plannedSeconds: 180 },
  { order: 9, title: "Senior Tribute", type: "NARRATION", performers: ["Senior Class"], plannedSeconds: 180 },
  { order: 10, title: "Finale Medley", type: "ACT", performers: ["All Performers"], plannedSeconds: 360 },
  { order: 11, title: "Closing Thanks", type: "NARRATION", performers: ["Student MCs"], plannedSeconds: 150 },
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
// Formatting
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

// Blue -> ON DECK (display only)
function displayStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "blue") return "ON DECK";
  return s ? s.toUpperCase() : "—";
}

const DEFAULT_STAGE_NEEDS = Object.freeze({
  mics: "—",
  chairs: "—",
  instruments: "—",
  other: "—",
});

const DEMO_STAGE_NEEDS_BY_TITLE = {
  "Opening Welcome": { mics: "1 handheld", chairs: "0", instruments: "None", other: "Podium optional" },
  "Sunrise Beats": { mics: "2 handheld, 1 stand", chairs: "2", instruments: "Piano", other: "Piano bench" },
  "Spotlight Solo": { mics: "1 handheld", chairs: "1", instruments: "None", other: "Music stand (optional)" },
  "Community Announcements": { mics: "2 handheld", chairs: "0", instruments: "None", other: "Clipboards" },
  "Dance Crew Showcase": { mics: "0", chairs: "0", instruments: "None", other: "Center stage clear" },
  "Intermission": { mics: "0", chairs: "0", instruments: "None", other: "Reset stage" },
  "Acoustic Duet": { mics: "2 handheld, 1 stand", chairs: "2", instruments: "Guitar", other: "DI box / cable" },
  "Comedy Spotlight": { mics: "1 handheld", chairs: "1", instruments: "None", other: "Stool" },
  "Choir Harmony": { mics: "4 stand", chairs: "0", instruments: "Keyboard", other: "Risers (if available)" },
  "Senior Speech": { mics: "1 handheld", chairs: "0", instruments: "None", other: "Podium" },
  "Finale": { mics: "4 handheld", chairs: "0", instruments: "None", other: "All performers on deck" },
};

function getStageNeeds(item) {
  const source = item?.stageNeeds || DEMO_STAGE_NEEDS_BY_TITLE[item?.title] || DEFAULT_STAGE_NEEDS;
  return {
    mics: source?.mics || "—",
    chairs: source?.chairs || "—",
    instruments: source?.instruments || "—",
    other: source?.other || "—",
  };
}

function getOffsetToneClass(offsetSeconds) {
  if (offsetSeconds == null || Number.isNaN(offsetSeconds)) return "is-on-time";
  if (Math.abs(offsetSeconds) <= 10) return "is-on-time";
  return offsetSeconds > 0 ? "is-behind" : "is-ahead";
}

function applyOffsetTone(el, offsetSeconds) {
  if (!el) return;
  el.classList.remove("is-ahead", "is-behind", "is-on-time");
  el.classList.add(getOffsetToneClass(offsetSeconds));
}

function getShowStatusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "running") return "status-running";
  if (s === "hold") return "status-hold";
  return "status-idle";
}

function applyShowStatusTone(el, status) {
  if (!el) return;
  el.classList.remove("status-running", "status-hold", "status-idle");
  el.classList.add(getShowStatusClass(status));
}

function escapeHtml(value) {
  return String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function requirementsCardHtml(label, item) {
  const needs = getStageNeeds(item);
  const title = item?.title || "—";
  const type = item?.type ? displayType(item.type) : "—";
  return `
    <div class="materials-slot-head">
      <div class="materials-slot-label">${escapeHtml(label)}</div>
      <div class="materials-slot-title">${escapeHtml(title)}</div>
      <div class="materials-slot-type">${escapeHtml(type)}</div>
    </div>
    <div class="materials-kv">
      <div class="materials-kv-row"><span>Mics</span><strong>${escapeHtml(needs.mics)}</strong></div>
      <div class="materials-kv-row"><span>Chairs</span><strong>${escapeHtml(needs.chairs)}</strong></div>
      <div class="materials-kv-row"><span>Instruments</span><strong>${escapeHtml(needs.instruments)}</strong></div>
      <div class="materials-kv-row"><span>Other</span><strong>${escapeHtml(needs.other)}</strong></div>
    </div>
  `;
}

function renderRequirementsCard(container, label, item) {
  if (!container) return;
  container.innerHTML = requirementsCardHtml(label, item);
}

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
  // BEFORE START:
  // item-1 = backstage
  // item-2 = blue (displayed as ON DECK)
  // rest = queued
  return seedItems.map((item, index) => {
    const status = index === 0 ? "backstage" : index === 1 ? "blue" : "queued";
    return {
      ...item,
      status,
      actualStartAt: null,
      actualEndAt: null,
      notes: "",
    };
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

  initialItems.forEach((item, index) => {
    batch.set(itemRefByIndex(index), item);
  });

  await batch.commit();
}

// ==============================
// Transaction-safe item loading
// ==============================
async function txGetAllItems(transaction) {
  const items = [];
  for (let i = 0; i < ITEM_COUNT; i++) {
    const ref = itemRefByIndex(i);
    const snap = await transaction.get(ref);
    if (snap.exists()) items.push({ id: snap.id, ...snap.data() });
  }
  items.sort((a, b) => (a.order || 0) - (b.order || 0));
  return items;
}

// ==============================
// Core rule: LIVE -> BACKSTAGE -> ON DECK
// This function builds the exact target status map.
// ==============================
function buildShiftMap(items, liveId) {
  const idx = items.findIndex((it) => it.id === liveId);
  if (idx < 0) return null;

  // all non-done items in order
  const notDone = items.filter((it) => it.status !== "done");

  // find the liveId inside notDone order
  const ndIdx = notDone.findIndex((it) => it.id === liveId);
  if (ndIdx < 0) return null;

  const nextBackstage = notDone[ndIdx + 1] || null;
  const nextDeck = notDone[ndIdx + 2] || null;

  const map = new Map();
  items.forEach((it) => {
    if (it.status === "done") map.set(it.id, "done");
    else map.set(it.id, "queued");
  });

  map.set(liveId, "live");
  if (nextBackstage) map.set(nextBackstage.id, "backstage");
  if (nextDeck) map.set(nextDeck.id, "blue"); // internal is still "blue", displayed as ON DECK

  return map;
}

// ==============================
// Operator actions
// ==============================
async function startCurrentItem() {
  await runTransaction(db, async (transaction) => {
    const showSnap = await transaction.get(showRef);
    if (!showSnap.exists()) throw new Error("Show not initialized. Click Init Show / Reset first.");
    const showData = showSnap.data();

    const items = await txGetAllItems(transaction);

    const currentId = showData.currentItemId;
    const currentItem = items.find((it) => it.id === currentId);
    if (!currentItem) throw new Error(`Current item not found: ${currentId}`);

    // Build target statuses: LIVE -> BACKSTAGE -> ON DECK
    const target = buildShiftMap(items, currentId);
    if (!target) throw new Error("Could not build queue shift map.");

    // Apply updates
    items.forEach((it) => {
      const desired = target.get(it.id) || it.status;
      const patch = {};
      let changed = false;

      if (it.status !== desired) {
        patch.status = desired;
        changed = true;
      }

      // Start time for the live item
      if (it.id === currentId && !it.actualStartAt) {
        patch.actualStartAt = new Date();
        changed = true;
      }

      if (changed) transaction.update(doc(itemsRef, it.id), patch);
    });

    const previewItems = items.map((it) => ({
      ...it,
      status: target.get(it.id) || it.status,
      actualStartAt: it.id === currentId ? (it.actualStartAt || new Date()) : it.actualStartAt,
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

    // Mark live item done
    transaction.update(doc(itemsRef, liveItem.id), {
      status: "done",
      actualEndAt: new Date(),
    });

    // Next up: first non-done item after marking this done
    const remaining = items
      .filter((it) => it.id !== liveItem.id)
      .map((it) => (it.status === "done" ? it : { ...it, status: "queued" }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const notDone = remaining.filter((it) => it.status !== "done");
    const nextBackstage = notDone[0] || null;
    const nextDeck = notDone[1] || null;

    // Set next statuses
    notDone.forEach((it, idx) => {
      const desired = idx === 0 ? "backstage" : idx === 1 ? "blue" : "queued";
      transaction.update(doc(itemsRef, it.id), { status: desired });
    });

    const nextCurrentId = nextBackstage ? nextBackstage.id : "";
    const nextShowStatus = nextCurrentId ? (showData.status === "hold" ? "hold" : "running") : "stopped";

    // Timing preview items
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
      currentItemId: nextCurrentId || "item-1",
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
  await updateDoc(showRef, {
    currentItemId: itemId,
    updatedAt: serverTimestamp(),
  });
}

async function updatePlannedSeconds(itemId, plannedSeconds) {
  await updateDoc(doc(itemsRef, itemId), { plannedSeconds });
}

// ==============================
// Undo (snapshot-based — safe)
// ==============================
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

// ==============================
// View helpers
// ==============================
function getPerformersText(item) {
  if (!item || !item.performers || !item.performers.length) return "—";
  return item.performers.join(", ");
}

function summarizeUpcoming(items, currentId) {
  const doneItems = items.filter((item) => item.status === "done").slice(-2);
  const currentItem = items.find((item) => item.id === currentId);
  const backstage = items.find((item) => item.status === "backstage");
  const deck = items.find((item) => item.status === "blue");
  const queued = items.filter((item) => item.status === "queued").slice(0, 4);
  return [...doneItems, currentItem, backstage, deck, ...queued].filter(Boolean);
}

function getElapsedSeconds(actualStartAt) {
  const start = normalizeTimestamp(actualStartAt);
  if (!start) return null;
  return Math.floor((Date.now() - start.getTime()) / 1000);
}

function getProjectedStartTimes(items) {
  const live = items.find((item) => item.status === "live");
  const backstage = items.find((item) => item.status === "backstage");

  const now = Date.now();
  const liveStart = normalizeTimestamp(live?.actualStartAt);
  const liveBase = liveStart ? liveStart.getTime() : now;
  const livePlanned = live?.plannedSeconds || 0;

  const backstageStart = live ? liveBase + livePlanned * 1000 : now;
  const deckStart = backstageStart + (backstage?.plannedSeconds || 0) * 1000;

  return {
    backstageEtaSeconds: Math.max(0, Math.floor((backstageStart - now) / 1000)),
    deckEtaSeconds: Math.max(0, Math.floor((deckStart - now) / 1000)),
  };
}

// ==============================
// OPEN VIEW
// ==============================
function initOpenView() {
  const scheduleStatusEl = document.getElementById("scheduleStatus");
  if (!scheduleStatusEl) return;

  const projectedEndEl = document.getElementById("projectedEnd");
  const currentTimeEl = document.getElementById("currentTime");
  const showStatusEl = document.getElementById("showStatus");
  const holdBarEl = document.getElementById("holdBar");
  const upcomingListEl = document.getElementById("upcomingList");

  const liveTitleEl = document.getElementById("liveTitle");
  const livePerformersEl = document.getElementById("livePerformers");

  const backstageTitleEl = document.getElementById("backstageTitle");
  const backstagePerformersEl = document.getElementById("backstagePerformers");
  const backstageTimerEl = document.getElementById("backstageTimer");

  const deckTitleEl = document.getElementById("blueTitle");
  const deckPerformersEl = document.getElementById("bluePerformers");
  const deckTimerEl = document.getElementById("blueTimer");

  let showData = null;
  let items = [];

  function updateClock() {
    currentTimeEl.textContent = formatClock(new Date());
    if (!items.length) return;
    const { backstageEtaSeconds, deckEtaSeconds } = getProjectedStartTimes(items);
    backstageTimerEl.textContent = `GO TO STAGE IN: ${formatDuration(backstageEtaSeconds)}`;
    deckTimerEl.textContent = `GET READY IN: ${formatDuration(deckEtaSeconds)}`;
  }

  subscribeShow((data) => {
    showData = data;
    if (!data) return;

    const offset = data.offsetSeconds;
    const label = getStatusLabel(offset);
    scheduleStatusEl.textContent = label === "ON TIME" ? "ON TIME" : `${label} ${formatOffset(offset)}`;
    applyOffsetTone(scheduleStatusEl, offset);

    projectedEndEl.textContent = formatClock(data.projectedEndAt?.toDate?.() || data.projectedEndAt);

    showStatusEl.textContent = data.status ? data.status.toUpperCase() : "—";
    applyShowStatusTone(showStatusEl, data.status);

    if (data.status === "hold") {
      holdBarEl.style.display = "block";
      holdBarEl.textContent = data.holdMessage || "HOLD";
    } else {
      holdBarEl.style.display = "none";
    }
  });

  subscribeItems((list) => {
    items = list;

    const liveItem = items.find((i) => i.status === "live") || null;
    const backstageItem = items.find((i) => i.status === "backstage") || null;
    const deckItem = items.find((i) => i.status === "blue") || null;

    liveTitleEl.textContent = liveItem?.title || "—";
    livePerformersEl.textContent = getPerformersText(liveItem);

    backstageTitleEl.textContent = backstageItem?.title || "—";
    backstagePerformersEl.textContent = getPerformersText(backstageItem);

    deckTitleEl.textContent = deckItem?.title || "—";
    deckPerformersEl.textContent = getPerformersText(deckItem);

    // Upcoming list with pills + row accents (your CSS already styles this)
    upcomingListEl.innerHTML = "";
    summarizeUpcoming(items, showData?.currentItemId).forEach((item) => {
      const status = String(item.status || "queued").toLowerCase();
      const row = document.createElement("div");
      row.className = `list-item status-${status}`;
      row.innerHTML = `
        <div>
          <div>${item.title}</div>
          <div class="meta">${item.type || ""}</div>
        </div>
        <div class="status-wrap">
          <span class="tag ${status}">${displayStatus(status)}</span>
        </div>
      `;
      upcomingListEl.appendChild(row);
    });
  });

  setInterval(updateClock, 1000);
  updateClock();
}

// ==============================
// OPERATOR VIEW
// ==============================
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

  const startBtn = document.getElementById("startBtn");
  const endBtn = document.getElementById("endBtn");
  const undoBtn = document.getElementById("undoBtn");
  const holdBtn = document.getElementById("holdBtn");
  const initBtn = document.getElementById("initBtn");

  const runTableBody = document.querySelector("#runTable tbody");
  const advancedToggle = document.getElementById("advancedToggle");
  const advancedHeader = document.getElementById("advancedHeader");
  const reqCurrentEl = document.getElementById("reqCurrent");
  const reqBackstageEl = document.getElementById("reqBackstage");
  const reqOnDeckEl = document.getElementById("reqOnDeck");

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
      showData.offsetSeconds == null ? "—" : `${showData.offsetSeconds > 0 ? "+" : ""}${formatOffset(showData.offsetSeconds)}`;
    applyOffsetTone(operatorOffsetEl, showData.offsetSeconds);

    const statusText = showData.status?.toUpperCase() || "—";
    operatorShowStatusEl.textContent = statusText;
    applyShowStatusTone(operatorShowStatusEl, showData.status);
    if (operatorHeaderStatusEl) {
      operatorHeaderStatusEl.textContent = statusText;
      applyShowStatusTone(operatorHeaderStatusEl, showData.status);
    }

    const currentItem =
      items.find((item) => item.status === "live") ||
      items.find((item) => item.id === showData.currentItemId);

    const backstageItem = items.find((item) => item.status === "backstage");
    const deckItem = items.find((item) => item.status === "blue");

    currentTitleEl.textContent = currentItem?.title || "—";
    currentTypeEl.textContent = currentItem?.type || "—";
    currentStatusEl.textContent = displayStatus(currentItem?.status);
    currentPlannedEl.textContent = currentItem?.plannedSeconds ? formatDuration(currentItem.plannedSeconds) : "—";
    currentStartTimeEl.textContent = formatClock(currentItem?.actualStartAt?.toDate?.() || currentItem?.actualStartAt);

    backstageTitleEl.textContent = backstageItem?.title || "—";
    backstagePlannedEl.textContent = backstageItem?.plannedSeconds ? formatDuration(backstageItem.plannedSeconds) : "—";

    deckTitleEl.textContent = deckItem?.title || "—";
    deckPlannedEl.textContent = deckItem?.plannedSeconds ? formatDuration(deckItem.plannedSeconds) : "—";

    renderRequirementsCard(reqCurrentEl, "On Stage (Now)", currentItem);
    renderRequirementsCard(reqBackstageEl, "Backstage (Next)", backstageItem);
    renderRequirementsCard(reqOnDeckEl, "On Deck", deckItem);
  }

  function updateClock() {
    operatorTimeEl.textContent = formatClock(new Date());
    const currentItem = items.find((it) => it.status === "live") || items.find((it) => it.id === showData?.currentItemId);
    const elapsed = getElapsedSeconds(currentItem?.actualStartAt);
    currentElapsedEl.textContent = elapsed == null ? "—" : formatDuration(elapsed);

    const planned = currentItem?.plannedSeconds || 0;
    if (elapsed != null) {
      const diff = elapsed - planned;
      const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
      currentOverUnderEl.textContent = `${sign}${formatDuration(Math.abs(diff))}`;
    } else {
      currentOverUnderEl.textContent = "—";
    }
  }

  subscribeShow((data) => {
    showData = data;
    renderShow();
  });

  subscribeItems((list) => {
    items = list;
    renderShow();
    renderRunTable();
  });

  async function safeRun(fn) {
    try {
      await fn();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

  startBtn?.addEventListener("click", () =>
    safeRun(async () => {
      lastSnapshot = snapshotState();
      await startCurrentItem();
    })
  );

  endBtn?.addEventListener("click", () =>
    safeRun(async () => {
      lastSnapshot = snapshotState();
      await endCurrentItem();
    })
  );

  undoBtn?.addEventListener("click", () =>
    safeRun(async () => {
      if (!lastSnapshot) return;
      await undoSnapshot(lastSnapshot);
      lastSnapshot = null;
    })
  );

  holdBtn?.addEventListener("click", () =>
    safeRun(async () => {
      const message = prompt("Hold message", showData?.holdMessage || "HOLD");
      await toggleHold(showData?.status, message);
    })
  );

  initBtn?.addEventListener("click", () =>
    safeRun(async () => {
      if (!confirm("Reset the show? This will overwrite all data.")) return;
      await initShow();
    })
  );

  advancedToggle?.addEventListener("change", () => {
    const isEnabled = advancedToggle.checked;
    document.querySelectorAll(".advanced").forEach((cell) => {
      cell.style.display = isEnabled ? "table-cell" : "none";
    });
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

  setInterval(updateClock, 1000);
  updateClock();
}

// ==============================
// Boot
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  initOpenView();
  initOperatorView();
});
