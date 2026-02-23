// ==============================
// WLCSMS app.js — FULL FILE
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
// Show seed data (edit later)
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
  // BEFORE START:
  // item-1 = backstage
  // item-2 = blue
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
// Queue shifting helper
// ==============================
function computeShiftedStatuses(items, liveId) {
  // liveId must exist in items
  const idx = items.findIndex((it) => it.id === liveId);
  if (idx < 0) return null;

  // Next two items in order (ignoring DONE items in between)
  const notDoneAfter = items.filter((it, i) => i > idx && it.status !== "done");
  const nextBackstage = notDoneAfter[0] || null;
  const nextBlue = notDoneAfter[1] || null;

  const statusMap = new Map();
  items.forEach((it) => {
    if (it.status === "done") {
      statusMap.set(it.id, "done");
      return;
    }
    statusMap.set(it.id, "queued");
  });

  statusMap.set(liveId, "live");
  if (nextBackstage) statusMap.set(nextBackstage.id, "backstage");
  if (nextBlue) statusMap.set(nextBlue.id, "blue");

  return { statusMap, nextBackstage, nextBlue };
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

    const shift = computeShiftedStatuses(items, currentId);
    if (!shift) throw new Error("Could not compute queue shift.");

    // Apply new statuses
    items.forEach((it) => {
      const targetStatus = shift.statusMap.get(it.id) || it.status;

      const patch = {};
      let needsUpdate = false;

      if (it.status !== targetStatus) {
        patch.status = targetStatus;
        needsUpdate = true;
      }

      // Ensure LIVE item has a start time
      if (it.id === currentId && !it.actualStartAt) {
        patch.actualStartAt = new Date();
        needsUpdate = true;
      }

      if (needsUpdate) {
        transaction.update(doc(itemsRef, it.id), patch);
      }
    });

    // Projected timing
    const { projectedEndAt, offsetSeconds } = computeProjectedTiming(showData, items);

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

    // End the live item (or fall back to currentId)
    const liveItem = items.find((it) => it.status === "live") || items.find((it) => it.id === showData.currentItemId);
    if (!liveItem) throw new Error("No LIVE/current item found to end.");

    // Mark it done
    transaction.update(doc(itemsRef, liveItem.id), {
      status: "done",
      actualEndAt: new Date(),
    });

    // Determine next current: first NOT DONE item in order after this one
    const remaining = items
      .filter((it) => it.id !== liveItem.id)
      .map((it) => (it.status === "done" ? it : { ...it, status: "queued" }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const notDone = remaining.filter((it) => it.status !== "done");
    const nextCurrent = notDone[0] || null;
    const nextBlue = notDone[1] || null;

    // Apply statuses: nextCurrent = backstage, nextBlue = blue, rest queued
    notDone.forEach((it, idx) => {
      const targetStatus = idx === 0 ? "backstage" : idx === 1 ? "blue" : "queued";
      transaction.update(doc(itemsRef, it.id), { status: targetStatus });
    });

    const nextShowStatus = nextCurrent ? (showData.status === "hold" ? "hold" : "running") : "stopped";

    // Update show pointer
    transaction.update(showRef, {
      status: nextShowStatus,
      currentItemId: nextCurrent ? nextCurrent.id : "item-1",
      updatedAt: serverTimestamp(),
    });

    // Timing calc uses updated logical state
    const updatedItemsForTiming = [
      { ...liveItem, status: "done" },
      ...remaining.map((it) => {
        if (it.id === nextCurrent?.id) return { ...it, status: "backstage" };
        if (it.id === nextBlue?.id) return { ...it, status: "blue" };
        if (it.status === "done") return it;
        return { ...it, status: "queued" };
      }),
    ];

    const { projectedEndAt, offsetSeconds } = computeProjectedTiming(showData, updatedItemsForTiming);

    transaction.update(showRef, {
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
// Undo: snapshot-based (works for START and END)
// ==============================
async function undoAction(action) {
  if (!action) return;

  const batch = writeBatch(db);

  // Restore items
  action.items.forEach((item) => {
    batch.update(doc(itemsRef, item.id), {
      status: item.status,
      actualStartAt: item.actualStartAt || null,
      actualEndAt: item.actualEndAt || null,
    });
  });

  // Restore show
  batch.update(showRef, {
    currentItemId: action.show.currentItemId || "item-1",
    status: action.show.status || "stopped",
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

// ==============================
// View logic
// ==============================
function getPerformersText(item) {
  if (!item || !item.performers || !item.performers.length) return "—";
  return item.performers.join(", ");
}

function summarizeUpcoming(items, currentId) {
  const doneItems = items.filter((item) => item.status === "done").slice(-2);
  const currentItem = items.find((item) => item.id === currentId);
  const backstage = items.find((item) => item.status === "backstage");
  const blue = items.find((item) => item.status === "blue");
  const queued = items.filter((item) => item.status === "queued").slice(0, 3);
  return [...doneItems, currentItem, backstage, blue, ...queued].filter(Boolean);
}

function getElapsedSeconds(actualStartAt) {
  const start = normalizeTimestamp(actualStartAt);
  if (!start) return null;
  return Math.floor((Date.now() - start.getTime()) / 1000);
}

function getProjectedStartTimes(items) {
  const live = items.find((item) => item.status === "live");
  const backstage = items.find((item) => item.status === "backstage");
  const blue = items.find((item) => item.status === "blue");

  const now = Date.now();
  const liveStart = normalizeTimestamp(live?.actualStartAt);
  const liveBase = liveStart ? liveStart.getTime() : now;
  const livePlanned = live?.plannedSeconds || 0;

  const backstageStart = live ? liveBase + livePlanned * 1000 : now;
  const blueStart = backstageStart + (backstage?.plannedSeconds || 0) * 1000;

  return {
    backstageEtaSeconds: Math.max(0, Math.floor((backstageStart - now) / 1000)),
    blueEtaSeconds: Math.max(0, Math.floor((blueStart - now) / 1000)),
  };
}

// ------------------------------
// OPEN VIEW
// ------------------------------
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

  const blueTitleEl = document.getElementById("blueTitle");
  const bluePerformersEl = document.getElementById("bluePerformers");
  const blueTimerEl = document.getElementById("blueTimer");

  let showData = null;
  let items = [];

  function updateClock() {
    currentTimeEl.textContent = formatClock(new Date());
    if (!items.length) return;
    const { backstageEtaSeconds, blueEtaSeconds } = getProjectedStartTimes(items);
    backstageTimerEl.textContent = `GO TO STAGE IN: ${formatDuration(backstageEtaSeconds)}`;
    blueTimerEl.textContent = `GET READY IN: ${formatDuration(blueEtaSeconds)}`;
  }

  subscribeShow((data) => {
    showData = data;
    if (!data) return;

    const offset = data.offsetSeconds;
    const label = getStatusLabel(offset);
    scheduleStatusEl.textContent = label === "ON TIME" ? "ON TIME" : `${label} ${formatOffset(offset)}`;
    projectedEndEl.textContent = formatClock(data.projectedEndAt?.toDate?.() || data.projectedEndAt);
    showStatusEl.textContent = data.status ? data.status.toUpperCase() : "—";

    if (data.status === "hold") {
      holdBarEl.style.display = "block";
      holdBarEl.textContent = data.holdMessage || "HOLD";
    } else {
      holdBarEl.style.display = "none";
    }
  });

  subscribeItems((list) => {
    items = list;

    // ON STAGE = only show LIVE (don’t fake it)
    const liveItem = items.find((item) => item.status === "live") || null;

    const backstageItem = items.find((item) => item.status === "backstage");
    const blueItem = items.find((item) => item.status === "blue");

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

// ------------------------------
// OPERATOR VIEW
// ------------------------------
function initOperatorView() {
  const operatorTimeEl = document.getElementById("operatorTime");
  if (!operatorTimeEl) return;

  const operatorProjectedEndEl = document.getElementById("operatorProjectedEnd");
  const operatorOffsetEl = document.getElementById("operatorOffset");
  const operatorShowStatusEl = document.getElementById("operatorShowStatus");

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

  function renderShow() {
    if (!showData) return;

    operatorProjectedEndEl.textContent = formatClock(showData.projectedEndAt?.toDate?.() || showData.projectedEndAt);
    operatorOffsetEl.textContent =
      showData.offsetSeconds == null
        ? "—"
        : `${showData.offsetSeconds > 0 ? "+" : ""}${formatOffset(showData.offsetSeconds)}`;

    operatorShowStatusEl.textContent = showData.status?.toUpperCase() || "—";

    const currentItem =
      items.find((item) => item.id === showData.currentItemId) ||
      items.find((item) => item.status === "live");

    const backstageItem = items.find((item) => item.status === "backstage");
    const blueItem = items.find((item) => item.status === "blue");

    currentTitleEl.textContent = currentItem?.title || "—";
    currentTypeEl.textContent = currentItem?.type || "—";
    currentStatusEl.textContent = currentItem?.status ? currentItem.status.toUpperCase() : "—";
    currentPlannedEl.textContent = currentItem?.plannedSeconds ? formatDuration(currentItem.plannedSeconds) : "—";
    currentStartTimeEl.textContent = formatClock(currentItem?.actualStartAt?.toDate?.() || currentItem?.actualStartAt);

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
        <td>${item.order}</td>
        <td>${item.title}</td>
        <td>${item.type}</td>
        <td><span class="tag ${item.status}">${item.status}</span></td>
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

  function updateClock() {
    operatorTimeEl.textContent = formatClock(new Date());
    const currentItem = items.find((item) => item.id === showData?.currentItemId);
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

  function snapshotState() {
    return {
      show: {
        currentItemId: showData?.currentItemId,
        status: showData?.status,
      },
      items: items.map((item) => ({
        id: item.id,
        status: item.status,
        actualStartAt: item.actualStartAt || null,
        actualEndAt: item.actualEndAt || null,
      })),
    };
  }

  startBtn?.addEventListener("click", () =>
    safeRun(async () => {
      lastAction = { type: "snapshot", ...snapshotState() };
      await startCurrentItem();
    })
  );

  endBtn?.addEventListener("click", () =>
    safeRun(async () => {
      lastAction = { type: "snapshot", ...snapshotState() };
      await endCurrentItem();
    })
  );

  undoBtn?.addEventListener("click", () =>
    safeRun(async () => {
      if (!lastAction) return;
      await undoAction(lastAction);
      lastAction = null;
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
      if (action === "set") {
        await setCurrentItem(itemId);
      }
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
