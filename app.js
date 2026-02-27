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
// Show seed data (REAL DATA)
// Add: requirements per item (mics, chairs, instruments, other)
// ==============================
const SHOW_ID = "main";

const seedItems = [
  {
    order: 1,
    title: "Pre-Show Host: Settle / QR Intro",
    type: "NARRATION",
    performers: ["Zayne"],
    plannedSeconds: 20,
    requirements: { mics: "1 handheld", chairs: "0", instruments: "None", other: "House address; QR on screen" },
    notes: "",
  },
  {
    order: 2,
    title: "Intro Video (progress montage)",
    type: "VIDEO",
    performers: [],
    plannedSeconds: 45,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "PROJ002" },
    notes: "",
  },
  {
    order: 3,
    title: "N1 Europe Arrival + Teleport Setup",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 75,
    requirements: {
      mics: "3 handheld",
      chairs: "0",
      instruments: "None",
      other: "Teleporter PRAC idle → pulse; sets Travel Anchor #1",
    },
    notes: "",
  },
  {
    order: 4,
    title: "Travel Anchor #1: Wormhole + Spain Intro",
    type: "VIDEO",
    performers: [],
    plannedSeconds: 45,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "PROJ010 (Spain); LX011/SND010/PRAC011" },
    notes: "",
  },
  {
    order: 5,
    title: "N2 Spain: Concert Night intro",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 35,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "Spain Vocals block (screen DOWN)" },
    notes: "",
  },
  {
    order: 6,
    title: "Performance 1",
    type: "ACT",
    performers: ["Renato"],
    plannedSeconds: 250,
    requirements: { mics: "1 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 7,
    title: "Performance 2",
    type: "ACT",
    performers: ["Renato", "Azul"],
    plannedSeconds: 205,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 8,
    title: "Performance 3",
    type: "ACT",
    performers: ["Azul", "Her Sister"],
    plannedSeconds: 265,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 9,
    title: "N3 Lead-in to street transition",
    type: "NARRATION",
    performers: ["Tanisha", "Christian"],
    plannedSeconds: 25,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "Sets PROJ011 transition" },
    notes: "",
  },
  {
    order: 10,
    title: "Transition Video: Spain Concert → Street",
    type: "TRANSITION",
    performers: [],
    plannedSeconds: 20,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "PROJ011" },
    notes: "",
  },
  {
    order: 11,
    title: "N4 Spain: Street scene intro",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 20,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 12,
    title: "Performance 4",
    type: "ACT",
    performers: ["Arielle", "Veda"],
    plannedSeconds: 310,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 13,
    title: "Performance 5",
    type: "ACT",
    performers: ["Shiva"],
    plannedSeconds: 145,
    requirements: { mics: "1 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 14,
    title: "N5 Cover: Screen UP + Spain Dance banter",
    type: "NARRATION",
    performers: ["Tanisha", "Christian"],
    plannedSeconds: 80,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "Cover SCR010 (screen UP); move into dance block" },
    notes: "",
  },
  {
    order: 15,
    title: "Performance 6",
    type: "ACT",
    performers: ["Mrs. Alonzo's Class"],
    plannedSeconds: 215,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 16,
    title: "Performance 7",
    type: "ACT",
    performers: ["Mrs. Dowd’s Class"],
    plannedSeconds: 130,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 17,
    title: "Performance 8",
    type: "ACT",
    performers: ["Dowd", "Abrego Classes"],
    plannedSeconds: 155,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 18,
    title: "N6 Glitch + Caravano intro (covers Screen DOWN)",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 80,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "Glitch SFX; cover SCR012 (screen DOWN)" },
    notes: "",
  },
  {
    order: 19,
    title: "Performance 9",
    type: "ACT",
    performers: ["Caravano"],
    plannedSeconds: 210,
    requirements: { mics: "1 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 20,
    title: "N7 Return to teleporter → France setup",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 35,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 21,
    title: "Travel Anchor #2: Wormhole + France Intro",
    type: "VIDEO",
    performers: [],
    plannedSeconds: 45,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "PROJ020 (France); LX050/SND030/PRAC011" },
    notes: "",
  },
  {
    order: 22,
    title: "N8 France intro",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 25,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 23,
    title: "Performance 10",
    type: "ACT",
    performers: ["Marjan", "Isel"],
    plannedSeconds: 310,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 24,
    title: "N9 France: MC fight → Skit setup",
    type: "NARRATION",
    performers: ["Tanisha", "Christian"],
    plannedSeconds: 45,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "Skit preset (table + chairs)" },
    notes: "",
  },
  {
    order: 25,
    title: "Performance 11",
    type: "ACT",
    performers: ["French Skit"],
    plannedSeconds: 345,
    requirements: { mics: "4 handheld", chairs: "4 chairs", instruments: "None", other: "1 table" },
    notes: "",
  },
  {
    order: 26,
    title: "N10 Post-skit → Italy travel setup",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 45,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 27,
    title: "Travel Anchor #3: Wormhole + Italy Intro",
    type: "VIDEO",
    performers: [],
    plannedSeconds: 45,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "PROJ030 (Italy); LX070/SND040/PRAC011" },
    notes: "",
  },
  {
    order: 28,
    title: "N11 Italy arrival intro",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 35,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 29,
    title: "Performance 12",
    type: "ACT",
    performers: ["Madame Mathew & Duo"],
    plannedSeconds: 265,
    requirements: { mics: "None", chairs: "0", instruments: "1 guitar", other: "None" },
    notes: "",
  },
  {
    order: 30,
    title: "Performance 13",
    type: "ACT",
    performers: ["Dr. Debari (Vocal)", "Emil", "Ishaan (Choir)"],
    plannedSeconds: 255,
    requirements: { mics: "None", chairs: "0", instruments: "1 guitar", other: "None" },
    notes: "",
  },
  {
    order: 31,
    title: "N12 Post-Italy → Arabia travel setup",
    type: "NARRATION",
    performers: ["Tanisha", "Christian"],
    plannedSeconds: 45,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 32,
    title: "Travel Anchor #4: Wormhole + Arabia Intro",
    type: "VIDEO",
    performers: [],
    plannedSeconds: 45,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "PROJ040 (Arabia); LX090/SND050/PRAC011" },
    notes: "",
  },
  {
    order: 33,
    title: "N13 Arabia arrival intro",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 40,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 34,
    title: "Performance 14",
    type: "ACT",
    performers: ["Marjan"],
    plannedSeconds: 210,
    requirements: { mics: "1 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 35,
    title: "N14 Coffee talk → Cafe transition",
    type: "NARRATION",
    performers: ["Tanisha", "Christian"],
    plannedSeconds: 20,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "Set PROJ041; clear for cafe preset" },
    notes: "",
  },
  {
    order: 36,
    title: "Transition Video: Courtyard → Maqha Cafe (preset table + 2 chairs SR)",
    type: "TRANSITION",
    performers: [],
    plannedSeconds: 20,
    requirements: { mics: "None", chairs: "2 chairs", instruments: "None", other: "PROJ041; preset 1 table SR" },
    notes: "",
  },
  {
    order: 37,
    title: "N15 Maqha cafe scene (dialogue)",
    type: "NARRATION",
    performers: ["Tanisha", "Christian"],
    plannedSeconds: 60,
    requirements: { mics: "2 handheld", chairs: "2 chairs", instruments: "None", other: "1 table + 2 chairs SR; cups" },
    notes: "",
  },
  {
    order: 38,
    title: "Performance 15",
    type: "ACT",
    performers: ["Angela"],
    plannedSeconds: 205,
    requirements: { mics: "1 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 39,
    title: "N16 Battery low → Intermission lead-in",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 40,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "Teleporter battery-low SFX; main curtain close" },
    notes: "",
  },
  {
    order: 40,
    title: "INTERMISSION",
    type: "INTERMISSION",
    performers: [],
    plannedSeconds: 600,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "House FULL; intermission music" },
    notes: "",
  },
  {
    order: 41,
    title: "N17 Return from Intermission (Arabia dance intro)",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 45,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "Main curtain OPEN; screen UP remains" },
    notes: "",
  },
  {
    order: 42,
    title: "Performance 16",
    type: "ACT",
    performers: ["Isel & Dancers"],
    plannedSeconds: 275,
    requirements: { mics: "1 handheld", chairs: "3 chairs", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 43,
    title: "Performance 17",
    type: "ACT",
    performers: ["Dabke Crew"],
    plannedSeconds: 140,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 44,
    title: "Performance 18",
    type: "ACT",
    performers: ["Azul"],
    plannedSeconds: 145,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 45,
    title: "Performance 19",
    type: "ACT",
    performers: ["Farida", "Farzana (\"Maha\") + 2"],
    plannedSeconds: 210,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 46,
    title: "N18 Carpet bit → India travel setup (covers Screen DOWN)",
    type: "NARRATION",
    performers: ["Tanisha", "Christian"],
    plannedSeconds: 85,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "Carpet prop; cover screen DOWN; sets Travel #5" },
    notes: "",
  },
  {
    order: 47,
    title: "Travel Anchor #5: Wormhole + India Intro",
    type: "VIDEO",
    performers: [],
    plannedSeconds: 45,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "PROJ050 (India); LX120/SND070/PRAC011" },
    notes: "",
  },
  {
    order: 48,
    title: "N19 India arrival intro (dialogue)",
    type: "NARRATION",
    performers: ["Tanisha", "Christian"],
    plannedSeconds: 70,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 49,
    title: "Performance 20",
    type: "ACT",
    performers: ["Yug"],
    plannedSeconds: 255,
    requirements: { mics: "1 handheld, 2 stand", chairs: "0", instruments: "1 guitar", other: "B - Guitar (No Aux)" },
    notes: "",
  },
  {
    order: 50,
    title: "N20 Cover: Screen UP + Chili gag (sets Perf21)",
    type: "NARRATION",
    performers: ["Tanisha", "Christian"],
    plannedSeconds: 80,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "Chili gag; cover screen UP" },
    notes: "",
  },
  {
    order: 51,
    title: "Performance 21",
    type: "ACT",
    performers: ["Aanya", "Harrini"],
    plannedSeconds: 510,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 52,
    title: "N21 Cover: Screen DOWN + Gene intro",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 80,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "Cover screen DOWN" },
    notes: "",
  },
  {
    order: 53,
    title: "Performance 22",
    type: "ACT",
    performers: ["Gene"],
    plannedSeconds: 130,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 54,
    title: "N22 Post-Gene → East Asia travel setup",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 60,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 55,
    title: "Travel Anchor #6: Wormhole + East Asia Intro",
    type: "VIDEO",
    performers: [],
    plannedSeconds: 45,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "PROJ060 (East Asia); LX140/SND080/PRAC011" },
    notes: "",
  },
  {
    order: 56,
    title: "N23 East Asia intro + bow gag",
    type: "NARRATION",
    performers: ["Megha (Narrator)", "Tanisha", "Christian"],
    plannedSeconds: 70,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 57,
    title: "Performance 23",
    type: "ACT",
    performers: ["Sarah"],
    plannedSeconds: 175,
    requirements: { mics: "1 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 58,
    title: "Performance 24",
    type: "ACT",
    performers: ["Sebastian"],
    plannedSeconds: 280,
    requirements: { mics: "1 stand", chairs: "0", instruments: "1 piano", other: "None" },
    notes: "",
  },
  {
    order: 59,
    title: "Performance 25",
    type: "ACT",
    performers: ["Balram", "Riyansh", "Niwin"],
    plannedSeconds: 285,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 60,
    title: "N24 Chopsticks bit + Screen UP (sets Perf26)",
    type: "NARRATION",
    performers: ["Tanisha", "Christian"],
    plannedSeconds: 85,
    requirements: { mics: "2 handheld", chairs: "0", instruments: "None", other: "Chopsticks + bowl gag; cover screen UP" },
    notes: "",
  },
  {
    order: 61,
    title: "Performance 26",
    type: "ACT",
    performers: ["Lucas"],
    plannedSeconds: 75,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 62,
    title: "Performance 27",
    type: "ACT",
    performers: ["Khushi"],
    plannedSeconds: 240,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 63,
    title: "N25 Post-East Asia → Finale intro",
    type: "NARRATION",
    performers: ["Tanisha", "Christian", "Megha (Narrator)"],
    plannedSeconds: 25,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "None" },
    notes: "",
  },
  {
    order: 64,
    title: "Grand Finale: World gathers (Finale Song + entrances)",
    type: "ACT",
    performers: ["Full Cast + Tanisha/Christian"],
    plannedSeconds: 210,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "MUS200; semicircle entrance" },
    notes: "",
  },
  {
    order: 65,
    title: "Concluding Speeches",
    type: "NARRATION",
    performers: ["Isel", "Zayne", "Madame", "Board"],
    plannedSeconds: 210,
    requirements: { mics: "3 handheld", chairs: "0", instruments: "None", other: "Podium/stand if available" },
    notes: "",
  },
  {
    order: 66,
    title: "Final Bow / House Up",
    type: "TRANSITION",
    performers: ["Full Cast"],
    plannedSeconds: 90,
    requirements: { mics: "None", chairs: "0", instruments: "None", other: "House HALF→FULL; music swell" },
    notes: "",
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
    return {
      ...item,
      status,
      actualStartAt: null,
      actualEndAt: null,
      // IMPORTANT: do NOT wipe seed notes
      notes: item.notes || "",
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
  const currentStartTimeEl = document.getElementById("currentStartTime"); // may not exist now (we removed Start Time row)

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

  // ==============================
  // FAST action lock (prevents double-click + feels instant)
  // ==============================
  let actionInFlight = false;

  function setActionButtonsDisabled(disabled) {
    if (startBtn) startBtn.disabled = disabled;
    if (endBtn) endBtn.disabled = disabled;
  }

  async function withActionLock(fn) {
    if (actionInFlight) return;
    actionInFlight = true;
    setActionButtonsDisabled(true);
    try {
      await fn();
    } finally {
      actionInFlight = false;
      setActionButtonsDisabled(false);
    }
  }

  function tsMs(v) {
    const d = normalizeTimestamp(v);
    return d ? d.getTime() : null;
  }

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

  // NEW: Live indicator (red + blinking dot) in the Now Running header row
  function renderNowRunningStatus(statusRaw) {
    if (!currentStatusEl) return;
    const s = String(statusRaw || "").toLowerCase();
    if (s === "live") {
      currentStatusEl.innerHTML = `<span class="live-badge"><span class="live-dot"></span>LIVE</span>`;
    } else {
      // plain text for other statuses
      currentStatusEl.textContent = displayStatus(s);
    }
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

    // CHANGED: status uses LIVE badge when live
    renderNowRunningStatus(currentItem?.status);

    currentPlannedEl.textContent = currentItem?.plannedSeconds ? formatDuration(currentItem.plannedSeconds) : "—";

    // Start Time row removed, but if element exists, keep it populated (safe)
    if (currentStartTimeEl) {
      currentStartTimeEl.textContent = formatClock(currentItem?.actualStartAt?.toDate?.() || currentItem?.actualStartAt);
    }

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

  // ==============================
  // FAST Start/End (batch write using already-loaded items)
  // ==============================
  async function startCurrentItemFast() {
    if (!showData) throw new Error("Show not initialized. Click Init Show / Reset first.");
    if (!Array.isArray(items) || items.length === 0) throw new Error("Items not loaded yet. Try again in a moment.");

    const currentId = showData.currentItemId || "item-1";
    const currentItem = items.find((it) => it.id === currentId);
    if (!currentItem) throw new Error(`Current item not found: ${currentId}`);

    const target = buildShiftMap(items, currentId);
    if (!target) throw new Error("Could not build queue shift map.");

    const now = new Date();

    // Snapshot BEFORE changes (for minimal writes)
    const before = items.map((it) => ({
      id: it.id,
      status: it.status,
      actualStartAt: it.actualStartAt || null,
      actualEndAt: it.actualEndAt || null,
    }));
    const beforeMap = new Map(before.map((x) => [x.id, x]));

    // Build preview items
    const previewItems = items.map((it) => {
      const desired = target.get(it.id) || it.status;
      const next = { ...it, status: desired };
      if (it.id === currentId && !it.actualStartAt) next.actualStartAt = now;
      return next;
    });

    const { projectedEndAt, offsetSeconds } = computeProjectedTiming(showData, previewItems);

    // Optimistic UI update (instant)
    items = previewItems;
    showData = {
      ...showData,
      status: showData.status === "hold" ? "hold" : "running",
      projectedEndAt,
      offsetSeconds,
    };
    renderShow();
    renderRunTable();

    // Batch commit (minimal patches)
    const batch = writeBatch(db);

    previewItems.forEach((it) => {
      const prev = beforeMap.get(it.id);
      if (!prev) return;

      const patch = {};
      let changed = false;

      if (prev.status !== it.status) {
        patch.status = it.status;
        changed = true;
      }

      const prevStart = tsMs(prev.actualStartAt);
      const nextStart = tsMs(it.actualStartAt);
      if (prevStart !== nextStart) {
        patch.actualStartAt = it.actualStartAt || null;
        changed = true;
      }

      if (changed) batch.update(doc(itemsRef, it.id), patch);
    });

    batch.update(showRef, {
      status: showData.status,
      projectedEndAt,
      offsetSeconds,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  }

  async function endCurrentItemFast() {
    if (!showData) throw new Error("Show not initialized. Click Init Show / Reset first.");
    if (!Array.isArray(items) || items.length === 0) throw new Error("Items not loaded yet. Try again in a moment.");

    const liveItem =
      items.find((it) => it.status === "live") ||
      items.find((it) => it.id === showData.currentItemId);

    if (!liveItem) throw new Error("No LIVE/current item found to end.");

    const now = new Date();

    // Snapshot BEFORE changes (for minimal writes)
    const before = items.map((it) => ({
      id: it.id,
      status: it.status,
      actualEndAt: it.actualEndAt || null,
    }));
    const beforeMap = new Map(before.map((x) => [x.id, x]));

    const byOrder = [...items].sort((a, b) => (a.order || 0) - (b.order || 0));

    // Mark ended item done + reset other not-done items to queued
    const base = byOrder.map((it) => {
      if (it.id === liveItem.id) return { ...it, status: "done", actualEndAt: now };
      if (it.status === "done") return it;
      return { ...it, status: "queued" };
    });

    const notDone = base.filter((it) => it.status !== "done");
    const nextBackstage = notDone[0] || null;
    const nextDeck = notDone[1] || null;

    const finalItems = base.map((it) => {
      if (it.status === "done") return it;
      if (nextBackstage && it.id === nextBackstage.id) return { ...it, status: "backstage" };
      if (nextDeck && it.id === nextDeck.id) return { ...it, status: "blue" };
      return it; // already queued
    });

    const nextCurrentId = nextBackstage ? nextBackstage.id : "item-1";
    const nextShowStatus = nextBackstage ? (showData.status === "hold" ? "hold" : "running") : "stopped";

    const { projectedEndAt, offsetSeconds } = computeProjectedTiming(showData, finalItems);

    // Optimistic UI update (instant)
    items = finalItems;
    showData = {
      ...showData,
      status: nextShowStatus,
      currentItemId: nextCurrentId,
      projectedEndAt,
      offsetSeconds,
    };
    renderShow();
    renderRunTable();

    // Batch commit (minimal patches)
    const batch = writeBatch(db);

    finalItems.forEach((it) => {
      const prev = beforeMap.get(it.id);
      if (!prev) return;

      const patch = {};
      let changed = false;

      if (prev.status !== it.status) {
        patch.status = it.status;
        changed = true;
      }

      if (it.id === liveItem.id) {
        // always set actualEndAt for ended item
        patch.actualEndAt = now;
        changed = true;
      }

      if (changed) batch.update(doc(itemsRef, it.id), patch);
    });

    batch.update(showRef, {
      status: nextShowStatus,
      currentItemId: nextCurrentId,
      projectedEndAt,
      offsetSeconds,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  }

  // ==============================
  // Controls (FAST wired)
  // ==============================
  startBtn?.addEventListener("click", () =>
    safeRun(() =>
      withActionLock(async () => {
        lastSnapshot = snapshotState();
        await startCurrentItemFast();
      })
    )
  );

  endBtn?.addEventListener("click", () =>
    safeRun(() =>
      withActionLock(async () => {
        lastSnapshot = snapshotState();
        await endCurrentItemFast();
      })
    )
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
// Open View logic (read-only) — OPTIMIZED (fixes lag)
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

  // Only show AHEAD/BEHIND if >= 3 minutes
  const OPEN_SCHEDULE_THRESHOLD_SECONDS = 180;

  function getOpenScheduleLabel(offsetSeconds) {
    if (offsetSeconds == null || Number.isNaN(offsetSeconds)) return "ON TIME";
    if (Math.abs(offsetSeconds) < OPEN_SCHEDULE_THRESHOLD_SECONDS) return "ON TIME";
    return offsetSeconds > 0 ? "BEHIND" : "AHEAD";
  }

  function applyOpenScheduleSignal(el, offsetSeconds) {
    const label = getOpenScheduleLabel(offsetSeconds);
    if (label === "AHEAD") return applySignal(el, "success");
    if (label === "BEHIND") return applySignal(el, "danger");
    return applySignal(el, "info");
  }

  // Cached / derived state (rebuilt only when snapshots change)
  const cache = {
    sorted: [],
    indexById: new Map(),
    prefixSeconds: [0], // prefix over "effective seconds" (done items contribute 0)
    anchor: null,       // on-stage item (any type)
    liveRuntime: null,  // the item that is actually running (status === "live")
    startIdx: 0,
    backstageAct: null,
    deckAct: null,
  };

  // Debounced render (prevents stutter on burst updates)
  let renderQueued = false;
  function scheduleRenderAll() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderAll();
    });
  }

  function formatPerformers(list) {
    const arr = Array.isArray(list) ? list : [];
    const s = arr.map((x) => String(x || "").trim()).filter(Boolean).join(", ");
    return s.length ? s : "—";
  }

  function typeUpper(item) {
    return String(item?.type || "").trim().toUpperCase();
  }

  function isAct(item) {
    return typeUpper(item) === "ACT";
  }

  function rebuildCache() {
    // Sort once
    cache.sorted = [...items].sort((a, b) => (a.order || 0) - (b.order || 0));

    // Index map once
    cache.indexById = new Map(cache.sorted.map((it, idx) => [it.id, idx]));

    // Prefix sum once (done items count as 0 seconds)
    const pref = [0];
    for (let i = 0; i < cache.sorted.length; i++) {
      const it = cache.sorted[i];
      const eff = it.status === "done" ? 0 : (it.plannedSeconds || 0);
      pref.push(pref[pref.length - 1] + eff);
    }
    cache.prefixSeconds = pref;

    // Live runtime item (must have actualStartAt ticking)
    cache.liveRuntime = items.find((it) => it.status === "live") || null;

    // Anchor (on-stage display can be ANY type)
    cache.anchor =
      cache.liveRuntime ||
      items.find((it) => it.id === showData?.currentItemId) ||
      null;

    const anchorIdx = cache.anchor ? (cache.indexById.get(cache.anchor.id) ?? -1) : -1;
    cache.startIdx = anchorIdx >= 0 ? anchorIdx : 0;

    // Next ACT-only pipeline (skip narration/video/etc)
    const upcomingNotDone = cache.sorted
      .slice(cache.startIdx)
      .filter((it) => it.status !== "done");

    const actsAfter = upcomingNotDone.filter((it) => isAct(it) && it.id !== cache.anchor?.id);

    cache.backstageAct = actsAfter[0] || null;
    cache.deckAct = actsAfter[1] || null;
  }

  function remainingSecondsForLive() {
    const live = cache.liveRuntime;
    if (!live) return null;
    const elapsed = getElapsedSeconds(live.actualStartAt);
    if (elapsed == null) return null;
    const planned = live.plannedSeconds || 0;
    return Math.max(0, planned - elapsed);
  }

  // Time until target STARTS (includes any narration/video/etc in-between)
  function secondsUntilItemStarts(targetItem) {
    if (!targetItem) return null;

    const showStatus = String(showData?.status || "").toLowerCase();
    const frozen = showStatus === "hold" || showStatus === "stopped";
    if (frozen) return null;

    const live = cache.liveRuntime;
    if (!live) return null;

    const baseRemaining = remainingSecondsForLive();
    if (baseRemaining == null) return null;

    const liveIdx = cache.indexById.get(live.id);
    const targetIdx = cache.indexById.get(targetItem.id);

    if (liveIdx == null || targetIdx == null) return null;
    if (targetIdx <= liveIdx) return null;

    // Sum of plannedSeconds for items between live and target (excluding both),
    // but done items contribute 0 via prefixSeconds.
    const between = cache.prefixSeconds[targetIdx] - cache.prefixSeconds[liveIdx + 1];

    return baseRemaining + between;
  }

  function renderHeaderAndTopStats() {
    // Current time
    currentTimeEl.textContent = formatClock(new Date());

    // Projected end
    const endAt = normalizeTimestamp(showData?.projectedEndAt) || normalizeTimestamp(showData?.plannedEndBaselineAt);
    projectedEndEl.textContent = formatClock(endAt);

    // Schedule status (AHEAD/BEHIND only if >= 3:00)
    const off = showData?.offsetSeconds;
    const label = getOpenScheduleLabel(off);
    if (label === "AHEAD") scheduleStatusEl.textContent = `AHEAD ${formatOffset(off)}`;
    else if (label === "BEHIND") scheduleStatusEl.textContent = `BEHIND ${formatOffset(off)}`;
    else scheduleStatusEl.textContent = "ON TIME";
    applyOpenScheduleSignal(scheduleStatusEl, off);

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

    // Upcoming list: ACTS only, from "now" forward, not done
    const acts = cache.sorted
      .slice(cache.startIdx)
      .filter((it) => it.status !== "done" && isAct(it));

    // Build DOM in a fragment for speed
    const frag = document.createDocumentFragment();

    if (acts.length === 0) {
      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `
        <div>
          <div>—</div>
          <div class="meta">No upcoming performances.</div>
        </div>
        <span class="tag queued">—</span>
      `;
      frag.appendChild(row);
      upcomingListEl.innerHTML = "";
      upcomingListEl.appendChild(frag);
      return;
    }

    const live = cache.liveRuntime;
    const backstageAct = cache.backstageAct;
    const deckAct = cache.deckAct;

    acts.forEach((it) => {
      let tagClass = "queued";
      if (live && it.id === live.id) tagClass = "live";
      else if (backstageAct && it.id === backstageAct.id) tagClass = "backstage";
      else if (deckAct && it.id === deckAct.id) tagClass = "blue";

      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `
        <div>
          <div>${it.title || "—"}</div>
          <div class="meta">${formatPerformers(it.performers)}</div>
        </div>
        <span class="tag ${tagClass}">${displayStatus(tagClass)}</span>
      `;
      frag.appendChild(row);
    });

    upcomingListEl.innerHTML = "";
    upcomingListEl.appendChild(frag);
  }

  function renderRightCards() {
    const anchor = cache.anchor;
    const backstageAct = cache.backstageAct;
    const deckAct = cache.deckAct;

    // ON STAGE (NOW) — can be anything
    if (liveTitleEl) liveTitleEl.textContent = anchor?.title || "—";
    if (livePerformersEl) livePerformersEl.textContent = formatPerformers(anchor?.performers);

    // BACKSTAGE / ON DECK — ACTS ONLY
    if (backstageTitleEl) backstageTitleEl.textContent = backstageAct?.title || "—";
    if (backstagePerformersEl) backstagePerformersEl.textContent = formatPerformers(backstageAct?.performers);

    if (blueTitleEl) blueTitleEl.textContent = deckAct?.title || "—";
    if (bluePerformersEl) bluePerformersEl.textContent = formatPerformers(deckAct?.performers);
  }

  function updateTimersOnly() {
    // keep clock updating
    currentTimeEl.textContent = formatClock(new Date());

    const showStatus = String(showData?.status || "").toLowerCase();
    const frozen = showStatus === "hold" || showStatus === "stopped";

    const tBack = frozen ? null : secondsUntilItemStarts(cache.backstageAct);
    const tBlue = frozen ? null : secondsUntilItemStarts(cache.deckAct);

    if (backstageTimerEl) backstageTimerEl.textContent = `GO TO STAGE IN: ${tBack == null ? "—" : formatDuration(tBack)}`;
    if (blueTimerEl) blueTimerEl.textContent = `GET READY IN: ${tBlue == null ? "—" : formatDuration(tBlue)}`;
  }

  function renderAll() {
    rebuildCache();
    renderHeaderAndTopStats();
    renderUpcomingList();
    renderRightCards();
    updateTimersOnly();
  }

  subscribeShow((data) => { showData = data; scheduleRenderAll(); });
  subscribeItems((list) => { items = list; scheduleRenderAll(); });

  setInterval(updateTimersOnly, 1000);
  updateTimersOnly();
}

// Boot
document.addEventListener("DOMContentLoaded", () => {
  const isOperator = !!document.getElementById("operatorTime");
  if (isOperator) initOperatorView();
  else initOpenView();
});