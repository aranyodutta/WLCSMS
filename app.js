// ============================
// WLCSMS app.js (GitHub Pages + Firebase CDN)
// ============================

// --- Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyBAFSNhMWbMXUPR10b8ynjiKD8tVRK6tQ8",
  authDomain: "wlc-talent-show-sms.firebaseapp.com",
  projectId: "wlc-talent-show-sms",
  storageBucket: "wlc-talent-show-sms.firebasestorage.app",
  messagingSenderId: "941916915658",
  appId: "1:941916915658:web:06e04e1ace6a640d237133",
};

// --- Firebase imports (CDN, no npm) ---
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
  getDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// --- Init ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- Constants ---
const SHOW_ID = "main";
const showRef = doc(db, "shows", SHOW_ID);
const itemsRef = collection(showRef, "items");

// --- Seed data (replace later with real lineup) ---
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

// ============================
// Helpers (time + formatting)
// ============================
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

function getElapsedSeconds(actualStartAt) {
  const start = normalizeTimestamp(actualStartAt);
  if (!start) return null;
  return Math.floor((Date.now() - start.getTime()) / 1000);
}

function computeRemainingSeconds(items) {
  return items
    .filter((i) => i.status !== "done")
    .reduce((sum, i) => sum + (i.plannedSeconds || 0), 0);
}

// Compute projected start timers for backstage/blue based on planned durations.
// This is "good enough" for a live show.
function getProjectedStartTimes(items) {
  const live = items.find((i) => i.status === "live");
  const backstage = items.find((i) => i.status === "backstage");
  const now = Date.now();

  const liveStart = normalizeTimestamp(live?.actualStartAt);
  const liveBase = liveStart ? liveStart.getTime() : now;
  const livePlanned = live?.plannedSeconds || 0;

  const backstageStartMs = live ? liveBase + livePlanned * 1000 : now;
  const blueStartMs = backstageStartMs + (backstage?.plannedSeconds || 0) * 1000;

  return {
    backstageEtaSeconds: Math.max(0, Math.floor((backstageStartMs - now) / 1000)),
    blueEtaSeconds: Math.max(0, Math.floor((blueStartMs - now) / 1000)),
  };
}

function getPerformersText(item) {
  if (!item || !Array.isArray(item.performers) || item.performers.length === 0) return "—";
  return item.performers.join(", ");
}

function safeObject(obj) {
  // Removes undefined fields so Firestore never errors.
  const cleaned = {};
  Object.keys(obj).forEach((k) => {
    if (obj[k] !== undefined) cleaned[k] = obj[k];
  });
  return cleaned;
}

// ============================
// Firestore subscriptions
// ============================
function subscribeShow(callback) {
  return onSnapshot(showRef, (snap) => callback(snap.exists() ? snap.data() : null));
}

function subscribeItems(callback) {
  const itemsQuery = query(itemsRef, orderBy("order", "asc"));
  return onSnapshot(itemsQuery, (snapshot) => {
    const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    callback(items);
  });
}

// ============================
// Init / Reset (seed)
// ============================
function buildInitialItems() {
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

  // Deterministic IDs: item-1, item-2, ...
  const firstItemId = initialItems.length ? "item-1" : null;

  const totalPlannedSeconds = initialItems.reduce((sum, i) => sum + (i.plannedSeconds || 0), 0);
  const plannedEndBaselineAt = new Date(now.getTime() + totalPlannedSeconds * 1000);

  // Show doc (NEVER undefined)
  batch.set(
    showRef,
    safeObject({
      status: "stopped",
      holdMessage: "",
      currentItemId: firstItemId, // null if none, never undefined
      plannedEndBaselineAt,
      projectedEndAt: plannedEndBaselineAt,
      offsetSeconds: 0,
      updatedAt: serverTimestamp(),
    })
  );

  // Items
  initialItems.forEach((item, index) => {
    const itemId = `item-${index + 1}`;
    batch.set(doc(itemsRef, itemId), safeObject(item));
  });

  await batch.commit();
}

// ============================
// Timing updates
// ============================
async function updateProjectedTiming(transaction, showData, items) {
  const remainingSeconds = computeRemainingSeconds(items);
  const now = new Date();
  const projectedEndAt = new Date(now.getTime() + remainingSeconds * 1000);

  const baseline = normalizeTimestamp(showData.plannedEndBaselineAt) || projectedEndAt;
  const offsetSeconds = Math.round((projectedEndAt - baseline) / 1000);

  transaction.update(showRef, safeObject({ projectedEndAt, offsetSeconds, updatedAt: serverTimestamp() }));
}

// ============================
// Operator actions
// ============================
async function startCurrentItem() {
  await runTransaction(db, async (transaction) => {
    const showSnap = await transaction.get(showRef);
    if (!showSnap.exists()) throw new Error("Show not initialized");

    const showData = showSnap.data();
    const itemsQ = query(itemsRef, orderBy("order", "asc"));
    const itemsSnap = await transaction.get(itemsQ);
    const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const currentId = showData.currentItemId || items.find((i) => i.status === "backstage")?.id || null;
    if (!currentId) return;

    // Ensure only the current item is live
    items.filter((i) => i.status === "live" && i.id !== currentId).forEach((i) => {
      transaction.update(doc(itemsRef, i.id), { status: "queued" });
    });

    const currentItem = items.find((i) => i.id === currentId);
    if (!currentItem) return;

    transaction.update(doc(itemsRef, currentId), safeObject({
      status: "live",
      actualStartAt: currentItem.actualStartAt || new Date(),
    }));

    transaction.update(showRef, safeObject({
      status: "running",
      currentItemId: currentId, // keep consistent
      updatedAt: serverTimestamp(),
    }));

    await updateProjectedTiming(transaction, showData, items);
  });
}

async function endCurrentItem() {
  await runTransaction(db, async (transaction) => {
    const showSnap = await transaction.get(showRef);
    if (!showSnap.exists()) throw new Error("Show not initialized");

    const showData = showSnap.data();
    const itemsQ = query(itemsRef, orderBy("order", "asc"));
    const itemsSnap = await transaction.get(itemsQ);
    const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const currentId = showData.currentItemId;
    const currentIndex = items.findIndex((i) => i.id === currentId);
    const liveItem = items.find((i) => i.status === "live") || items[currentIndex];

    if (liveItem) {
      transaction.update(doc(itemsRef, liveItem.id), safeObject({
        status: "done",
        actualEndAt: new Date(),
      }));
    }

    // Reset non-done items to queued
    const remainingItems = items
      .filter((i) => i.id !== liveItem?.id)
      .map((i) => (i.status === "done" ? i : { ...i, status: "queued" }));

    const notDone = remainingItems.filter((i) => i.status !== "done").sort((a, b) => (a.order || 0) - (b.order || 0));
    const nextBackstage = notDone[0] || null;
    const nextBlue = notDone[1] || null;

    if (nextBackstage) transaction.update(doc(itemsRef, nextBackstage.id), { status: "backstage" });
    if (nextBlue) transaction.update(doc(itemsRef, nextBlue.id), { status: "blue" });

    const nextCurrentId = nextBackstage?.id || null;
    const nextStatus = notDone.length ? "running" : "stopped";

    // Only include currentItemId if non-null. Never undefined.
    const showUpdate = safeObject({
      status: nextStatus,
      updatedAt: serverTimestamp(),
      currentItemId: nextCurrentId,
    });

    transaction.update(showRef, showUpdate);

    // Update projected timing using an "expected state" list
    const updatedItems = items.map((i) => {
      if (i.id === liveItem?.id) return { ...i, status: "done" };
      if (i.id === nextBackstage?.id) return { ...i, status: "backstage" };
      if (i.id === nextBlue?.id) return { ...i, status: "blue" };
      if (i.status === "done") return i;
      return { ...i, status: "queued" };
    });

    await updateProjectedTiming(transaction, showData, updatedItems);
  });
}

async function toggleHold(currentStatus, message) {
  const nextStatus = currentStatus === "hold" ? "running" : "hold";
  await updateDoc(
    showRef,
    safeObject({
      status: nextStatus,
      holdMessage: nextStatus === "hold" ? (message || "HOLD") : "",
      updatedAt: serverTimestamp(),
    })
  );
}

async function setCurrentItem(itemId) {
  if (!itemId) return; // prevent undefined/empty writes
  await updateDoc(showRef, safeObject({ currentItemId: itemId, updatedAt: serverTimestamp() }));
}

async function updatePlannedSeconds(itemId, plannedSeconds) {
  if (!itemId) return;
  const seconds = Number(plannedSeconds);
  if (Number.isNaN(seconds) || seconds < 0) return;
  await updateDoc(doc(itemsRef, itemId), safeObject({ plannedSeconds: seconds }));
}

// ============================
// Undo system (hardened)
// ============================
async function undoAction(action) {
  if (!action) return;

  if (action.type === "start") {
    await runTransaction(db, async (transaction) => {
      if (!action.itemId) return;
      transaction.update(doc(itemsRef, action.itemId), safeObject({
        status: action.previousStatus || "backstage",
        actualStartAt: action.previousStart ?? null,
      }));
      transaction.update(showRef, safeObject({
        status: action.showStatus || "stopped",
        updatedAt: serverTimestamp(),
      }));
    });
    return;
  }

  if (action.type === "end") {
    const batch = writeBatch(db);

    // Restore items
    action.items.forEach((item) => {
      batch.update(doc(itemsRef, item.id), safeObject({
        status: item.status,
        actualStartAt: item.actualStartAt ?? null,
        actualEndAt: item.actualEndAt ?? null,
      }));
    });

    // Restore show (DO NOT write undefined)
    const showPatch = safeObject({
      status: action.show?.status || "stopped",
      updatedAt: serverTimestamp(),
    });

    // Only set currentItemId if it exists
    if (action.show && action.show.currentItemId != null) {
      showPatch.currentItemId = action.show.currentItemId;
    }

    batch.update(showRef, showPatch);
    await batch.commit();
  }
}

// ============================
// UI: Open View
// ============================
function summarizeUpcoming(items, currentId) {
  const doneItems = items.filter((i) => i.status === "done").slice(-2);
  const currentItem = items.find((i) => i.id === currentId);
  const backstage = items.find((i) => i.status === "backstage");
  const blue = items.find((i) => i.status === "blue");
  const queued = items.filter((i) => i.status === "queued").slice(0, 3);

  return [...doneItems, currentItem, backstage, blue, ...queued].filter(Boolean);
}

function initOpenView() {
  const scheduleStatusEl = document.getElementById("scheduleStatus");
  if (!scheduleStatusEl) return; // not on open page

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

  const blueTitleEl = document.getElementById("blueTitle");
  const bluePerformersEl = document.getElementById("bluePerformers");
  const blueTimerEl = document.getElementById("blueTimer");

  let showData = null;
  let items = [];

  function updateClock() {
    currentTimeEl.textContent = formatClock(new Date());
    if (!items.length) return;

    const { backstageEtaSeconds, blueEtaSeconds } = getProjectedStartTimes(items);
    if (backstageTimerEl) backstageTimerEl.textContent = `GO TO STAGE IN: ${formatDuration(backstageEtaSeconds)}`;
    if (blueTimerEl) blueTimerEl.textContent = `GET READY IN: ${formatDuration(blueEtaSeconds)}`;
  }

  subscribeShow((data) => {
    showData = data;
    if (!data) {
      scheduleStatusEl.textContent = "—";
      projectedEndEl.textContent = "—";
      showStatusEl.textContent = "—";
      return;
    }
    const offset = data.offsetSeconds;
    const label = getStatusLabel(offset);
    scheduleStatusEl.textContent = label === "ON TIME" ? "ON TIME" : `${label} ${formatOffset(offset)}`;

    projectedEndEl.textContent = formatClock(normalizeTimestamp(data.projectedEndAt));
    showStatusEl.textContent = data.status ? String(data.status).toUpperCase() : "—";

    if (data.status === "hold") {
      holdBarEl.style.display = "block";
      holdBarEl.textContent = data.holdMessage || "HOLD";
    } else {
      holdBarEl.style.display = "none";
    }
  });

  subscribeItems((list) => {
    items = list;

    const liveItem = items.find((i) => i.status === "live") || items.find((i) => i.id === showData?.currentItemId);
    const backstageItem = items.find((i) => i.status === "backstage");
    const blueItem = items.find((i) => i.status === "blue");

    liveTitleEl.textContent = liveItem?.title || "—";
    livePerformersEl.textContent = getPerformersText(liveItem);

    backstageTitleEl.textContent = backstageItem?.title || "—";
    backstagePerformersEl.textContent = getPerformersText(backstageItem);

    blueTitleEl.textContent = blueItem?.title || "—";
    bluePerformersEl.textContent = getPerformersText(blueItem);

    upcomingListEl.innerHTML = "";
    summarizeUpcoming(items, showData?.currentItemId).forEach((item) => {
      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `
        <div>
          <div>${item.title}</div>
          <div class="meta">${item.type || ""}</div>
        </div>
        <div class="meta">${String(item.status || "").toUpperCase()}</div>
      `;
      upcomingListEl.appendChild(row);
    });
  });

  setInterval(updateClock, 1000);
  updateClock();
}

// ============================
// UI: Operator View
// ============================
function initOperatorView() {
  const operatorTimeEl = document.getElementById("operatorTime");
  if (!operatorTimeEl) return; // not on operator page

  const operatorProjectedEndEl = document.getElementById("operatorProjectedEnd");
  const operatorOffsetEl = document.getElementById("operatorOffset");
  const operatorShowStatusEl = document.getElementById("operatorShowStatus");
  const operatorStatusEl = document.getElementById("operatorStatus");

  const currentTitleEl = document.getElementById("currentTitle");
  const currentTypeEl = document.getElementById("currentType");
  const currentStatusEl = document.getElementById("currentStatus");
  const currentPlannedEl = document.getElementById("currentPlanned");
  const currentElapsedEl = document.getElementById("currentElapsed");
  const currentOverUnderEl = document.getElementById("currentOverUnder");
  const currentStartTimeEl = document.getElementById("currentStartTime");

  const backstageTitleEl = document.getElementById("backstageTitle");
  const backstagePlannedEl = document.getElementById("backstagePlanned");

  const blueTitleEl = document.getElementById("blueTitle");
  const bluePlannedEl = document.getElementById("bluePlanned");

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
  let lastAction = null;

  function updateClock() {
    operatorTimeEl.textContent = formatClock(new Date());

    const currentItem = items.find((i) => i.id === showData?.currentItemId);
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

  function renderShow() {
    if (!showData) {
      operatorProjectedEndEl.textContent = "—";
      operatorOffsetEl.textContent = "—";
      operatorShowStatusEl.textContent = "—";
      operatorStatusEl.textContent = "—";
      return;
    }

    operatorProjectedEndEl.textContent = formatClock(normalizeTimestamp(showData.projectedEndAt));
    operatorOffsetEl.textContent =
      showData.offsetSeconds == null
        ? "—"
        : `${showData.offsetSeconds > 0 ? "+" : ""}${formatOffset(showData.offsetSeconds)}`;

    operatorShowStatusEl.textContent = showData.status ? String(showData.status).toUpperCase() : "—";
    operatorStatusEl.textContent = showData.status ? String(showData.status).toUpperCase() : "—";

    const currentItem =
      items.find((i) => i.id === showData.currentItemId) ||
      items.find((i) => i.status === "live") ||
      items.find((i) => i.status === "backstage");

    const backstageItem = items.find((i) => i.status === "backstage");
    const blueItem = items.find((i) => i.status === "blue");

    currentTitleEl.textContent = currentItem?.title || "—";
    currentTypeEl.textContent = currentItem?.type || "—";
    currentStatusEl.textContent = currentItem?.status ? String(currentItem.status).toUpperCase() : "—";
    currentPlannedEl.textContent = currentItem?.plannedSeconds ? formatDuration(currentItem.plannedSeconds) : "—";
    currentStartTimeEl.textContent = formatClock(normalizeTimestamp(currentItem?.actualStartAt));

    backstageTitleEl.textContent = backstageItem?.title || "—";
    backstagePlannedEl.textContent = backstageItem?.plannedSeconds ? formatDuration(backstageItem.plannedSeconds) : "—";

    blueTitleEl.textContent = blueItem?.title || "—";
    bluePlannedEl.textContent = blueItem?.plannedSeconds ? formatDuration(blueItem.plannedSeconds) : "—";
  }

  function renderRunTable() {
    runTableBody.innerHTML = "";
    items.forEach((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${item.order ?? ""}</td>
        <td>${item.title ?? ""}</td>
        <td>${item.type ?? ""}</td>
        <td><span class="tag ${item.status}">${item.status}</span></td>
        <td>${item.plannedSeconds ? formatDuration(item.plannedSeconds) : "—"}</td>
        <td>${formatClock(normalizeTimestamp(item.actualStartAt))}</td>
        <td>${formatClock(normalizeTimestamp(item.actualEndAt))}</td>
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

  // Subscriptions
  subscribeShow((data) => {
    showData = data;
    renderShow();
    renderRunTable();
  });

  subscribeItems((list) => {
    items = list;
    renderShow();
    renderRunTable();
  });

  // Buttons
  startBtn?.addEventListener("click", async () => {
    const currentItem = items.find((i) => i.id === showData?.currentItemId) || items.find((i) => i.status === "backstage");
    lastAction = {
      type: "start",
      itemId: currentItem?.id || null,
      previousStatus: currentItem?.status || "backstage",
      previousStart: currentItem?.actualStartAt ?? null,
      showStatus: showData?.status || "stopped",
    };
    await startCurrentItem();
  });

  endBtn?.addEventListener("click", async () => {
    const snapshot = items.map((i) => ({
      id: i.id,
      status: i.status,
      actualStartAt: i.actualStartAt ?? null,
      actualEndAt: i.actualEndAt ?? null,
    }));
    lastAction = {
      type: "end",
      show: {
        currentItemId: showData?.currentItemId ?? null,
        status: showData?.status || "stopped",
      },
      items: snapshot,
    };
    await endCurrentItem();
  });

  undoBtn?.addEventListener("click", async () => {
    if (!lastAction) return;
    await undoAction(lastAction);
    lastAction = null;
  });

  holdBtn?.addEventListener("click", async () => {
    const message = prompt("Hold message", showData?.holdMessage || "HOLD");
    await toggleHold(showData?.status, message);
  });

  initBtn?.addEventListener("click", async () => {
    if (!confirm("Reset the show? This will overwrite all data.")) return;
    await initShow();
  });

  // Advanced controls toggle
  advancedToggle?.addEventListener("change", () => {
    const isEnabled = advancedToggle.checked;
    document.querySelectorAll(".advanced").forEach((cell) => (cell.style.display = isEnabled ? "table-cell" : "none"));
    if (advancedHeader) advancedHeader.style.display = isEnabled ? "table-cell" : "none";
  });

  // Advanced table actions (set current / edit planned)
  runTableBody?.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    const action = button.dataset.action;
    const itemId = button.dataset.id;

    if (action === "set") {
      await setCurrentItem(itemId);
    }

    if (action === "edit") {
      const value = prompt("Enter planned seconds", "180");
      const seconds = Number(value);
      if (!Number.isNaN(seconds) && seconds >= 0) {
        await updatePlannedSeconds(itemId, seconds);
      }
    }
  });

  setInterval(updateClock, 1000);
  updateClock();
}

// ============================
// Boot
// ============================
document.addEventListener("DOMContentLoaded", () => {
  initOpenView();
  initOperatorView();
});
