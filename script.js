"use strict";

const STORAGE_KEY = "simpleRefuelEstimatorInputs";
const DB_NAME = "simpleRefuelEstimatorHandles";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "projectDirectory";
const LEGACY_HANDLE_KEY = "dataDirectory";
const TRIPS_FILENAME = "trips.json";
const RECENT_TRIP_LIMIT = 5;

const state = {
  directoryHandle: null,
  hasWriteAccess: false,
  trips: [],
  currentEstimate: null,
  showAllTrips: false,
  chartMetric: "cost",
  chartPeriod: "all",
  deleteTripId: null,
  touchedFields: new Set(),
  toastTimer: null
};

const fields = {
  tripDate: document.querySelector("#trip-date"),
  mapUrl: document.querySelector("#map-url"),
  distance: document.querySelector("#distance"),
  efficiency: document.querySelector("#efficiency"),
  fuelPrice: document.querySelector("#fuel-price"),
  margin: document.querySelector("#margin")
};

const elements = {
  form: document.querySelector("#calculator-form"),
  calculateButton: document.querySelector("#calculate-button"),
  openMapLink: document.querySelector("#open-map-link"),
  quickOptions: [...document.querySelectorAll(".quick-option")],
  resultRecommended: document.querySelector("#result-recommended"),
  resultCost: document.querySelector("#result-cost"),
  resultMinimum: document.querySelector("#result-minimum"),
  resultDistance: document.querySelector("#result-distance"),
  resultMargin: document.querySelector("#result-margin"),
  saveTrip: document.querySelector("#save-trip"),
  toast: document.querySelector("#toast"),
  tabs: [...document.querySelectorAll("[role='tab']")],
  panels: [...document.querySelectorAll("[role='tabpanel']")],
  chooseFolder: document.querySelector("#choose-folder"),
  folderStatus: document.querySelector("#folder-status"),
  historyMessage: document.querySelector("#history-message"),
  tableWrapper: document.querySelector("#history-table-wrapper"),
  tableBody: document.querySelector("#history-table-body"),
  cardList: document.querySelector("#history-card-list"),
  emptyHistory: document.querySelector("#empty-history"),
  viewAllTrips: document.querySelector("#view-all-trips"),
  outstandingFuel: document.querySelector("#outstanding-fuel"),
  outstandingCost: document.querySelector("#outstanding-cost"),
  recordGlobalRefuel: document.querySelector("#record-global-refuel"),
  summaryFuel: document.querySelector("#summary-fuel"),
  summarySpending: document.querySelector("#summary-spending"),
  summaryAverage: document.querySelector("#summary-average"),
  summaryDistance: document.querySelector("#summary-distance"),
  metricButtons: [...document.querySelectorAll("[data-metric]")],
  periodButtons: [...document.querySelectorAll("[data-period]")],
  chartTitle: document.querySelector("#chart-title"),
  chartContainer: document.querySelector("#chart-container"),
  chartSvg: document.querySelector("#analytics-chart-svg"),
  chartTooltip: document.querySelector("#chart-tooltip"),
  chartEmpty: document.querySelector("#chart-empty"),
  globalRefuelDialog: document.querySelector("#global-refuel-dialog"),
  globalOutstanding: document.querySelector("#global-outstanding"),
  globalCoveredTrips: document.querySelector("#global-covered-trips"),
  globalRefuelAmount: document.querySelector("#global-refuel-amount"),
  globalRefuelError: document.querySelector("#global-refuel-error"),
  globalRefuelPreview: document.querySelector("#global-refuel-preview"),
  cancelGlobalRefuel: document.querySelector("#cancel-global-refuel"),
  applyGlobalRefuel: document.querySelector("#apply-global-refuel"),
  deleteDialog: document.querySelector("#delete-dialog"),
  cancelDelete: document.querySelector("#cancel-delete"),
  confirmDelete: document.querySelector("#confirm-delete")
};

const errorElements = Object.fromEntries(
  Object.keys(fields).map((name) => [name, document.querySelector(`#${toKebabCase(name)}-error`)])
);

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function parseDecimal(value) {
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  return normalized === "" ? Number.NaN : Number(normalized);
}

function parseFuelPrice(value) {
  let normalized = String(value).trim().replace(/\s/g, "");
  if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) normalized = normalized.replace(/\./g, "");
  return normalized === "" ? Number.NaN : Number(normalized);
}

function getFormValues() {
  return {
    tripDate: fields.tripDate.value,
    mapUrl: fields.mapUrl.value.trim(),
    distance: parseDecimal(fields.distance.value),
    efficiency: parseDecimal(fields.efficiency.value),
    fuelPrice: parseFuelPrice(fields.fuelPrice.value),
    margin: parseDecimal(fields.margin.value)
  };
}

function validateForm(values) {
  const errors = {};
  if (!values.tripDate) errors.tripDate = "Select the trip date.";
  if (!values.mapUrl) errors.mapUrl = "Enter the Google Maps route URL.";
  else if (!isSafeMapUrl(values.mapUrl)) errors.mapUrl = "Enter a valid HTTPS Google Maps URL.";
  if (!Number.isFinite(values.distance) || values.distance <= 0) errors.distance = "Distance must be greater than 0 km.";
  if (!Number.isFinite(values.efficiency) || values.efficiency <= 0) errors.efficiency = "Fuel efficiency must be greater than 0 km/L.";
  if (!Number.isFinite(values.fuelPrice) || values.fuelPrice <= 0) errors.fuelPrice = "Fuel price must be greater than Rp0.";
  if (!Number.isFinite(values.margin) || values.margin < 0 || values.margin > 100) errors.margin = "Reserve margin must be between 0% and 100%.";
  return errors;
}

function renderValidation(errors, showAll = false) {
  Object.keys(fields).forEach((name) => {
    const showMessage = showAll || state.touchedFields.has(name);
    const message = showMessage ? errors[name] || "" : "";
    errorElements[name].textContent = message;
    fields[name].setAttribute("aria-invalid", errors[name] && showMessage ? "true" : "false");
  });
  elements.calculateButton.disabled = Object.keys(errors).length > 0;
  updateSaveButton(errors);
}

function calculateFuelEstimate(values) {
  const minimumFuelLiter = values.distance / values.efficiency;
  const recommendedFuelLiter = minimumFuelLiter * (1 + values.margin / 100);
  return {
    minimumFuelLiter,
    recommendedFuelLiter,
    estimatedCost: recommendedFuelLiter * values.fuelPrice
  };
}

function formatNumber(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(Number(value) || 0);
}

function formatFuel(value) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Number(value) || 0).replace(/\s/g, "");
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatShortDate(value) {
  const date = new Date(`${value || ""}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "N/A"
    : new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(date);
}

function renderResult(values, estimate) {
  elements.resultRecommended.textContent = `${formatFuel(estimate.recommendedFuelLiter)} L`;
  elements.resultCost.textContent = formatCurrency(estimate.estimatedCost);
  elements.resultMinimum.textContent = `${formatFuel(estimate.minimumFuelLiter)} L`;
  elements.resultDistance.textContent = `${formatNumber(values.distance)} km`;
  elements.resultMargin.textContent = `${formatNumber(values.margin)}%`;
}

function renderSampleResult() {
  const values = { distance: 200, efficiency: 40, fuelPrice: 10000, margin: 10 };
  renderResult(values, calculateFuelEstimate(values));
}

function updateQuickOptions() {
  const margin = parseDecimal(fields.margin.value);
  elements.quickOptions.forEach((button) => {
    const selected = Number(button.dataset.margin) === margin;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function updateMapLink() {
  const value = fields.mapUrl.value.trim();
  const valid = isSafeMapUrl(value);
  elements.openMapLink.href = valid ? value : "https://www.google.com/maps";
  elements.openMapLink.firstChild.textContent = valid ? "Open route in Google Maps " : "Open in Google Maps ";
}

function isSafeMapUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      hostname === "google.com" ||
      hostname.endsWith(".google.com") ||
      hostname === "maps.app.goo.gl"
    );
  } catch (error) {
    return false;
  }
}

function saveFormPreferences() {
  const raw = Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value]));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(raw)); } catch (error) { /* Preferences are optional. */ }
}

function restoreFormPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      Object.keys(fields).forEach((name) => {
        if (typeof saved[name] === "string" && saved[name] !== "") fields[name].value = saved[name];
      });
    }
  } catch (error) { /* Ignore malformed preferences. */ }
  if (!fields.tripDate.value) fields.tripDate.value = new Date().toISOString().slice(0, 10);
  formatFuelPriceInput();
  updateQuickOptions();
  updateMapLink();
}

function formatFuelPriceInput() {
  const value = parseFuelPrice(fields.fuelPrice.value);
  if (Number.isFinite(value) && value > 0) fields.fuelPrice.value = formatNumber(value, 0);
}

function invalidateEstimateIfNeeded(fieldName) {
  if (["distance", "efficiency", "fuelPrice", "margin"].includes(fieldName)) {
    state.currentEstimate = null;
  }
}

function updateSaveButton(errors = validateForm(getFormValues())) {
  elements.saveTrip.disabled = !state.hasWriteAccess || !state.currentEstimate || Object.keys(errors).length > 0;
  elements.saveTrip.title = !state.hasWriteAccess
    ? "Connect the project folder to save this trip."
    : !state.currentEstimate
      ? "Calculate the estimate before saving."
      : "Save this trip";
}

function showToast(message, isError = false) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 3200);
}

function openHandleDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(HANDLE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeDirectoryHandle(handle) {
  const database = await openHandleDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(HANDLE_STORE, "readwrite");
    transaction.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function getStoredDirectoryHandle() {
  const database = await openHandleDatabase();
  const handle = await new Promise((resolve, reject) => {
    const store = database.transaction(HANDLE_STORE).objectStore(HANDLE_STORE);
    const request = store.get(HANDLE_KEY);
    request.onsuccess = () => {
      if (request.result) return resolve(request.result);
      const legacyRequest = database.transaction(HANDLE_STORE).objectStore(HANDLE_STORE).get(LEGACY_HANDLE_KEY);
      legacyRequest.onsuccess = () => resolve(legacyRequest.result || null);
      legacyRequest.onerror = () => reject(legacyRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
  database.close();
  return handle;
}

async function chooseProjectFolder() {
  clearInlineMessage();
  if (!("showDirectoryPicker" in window)) {
    setInlineMessage("Folder access requires a current Chrome or Edge browser.", true);
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ id: "refuel-estimator-project", mode: "readwrite" });
    await connectDirectory(handle);
    await storeDirectoryHandle(handle);
    showToast("Project folder connected.");
  } catch (error) {
    if (error.name !== "AbortError") setInlineMessage(`Could not connect the folder: ${error.message}`, true);
  }
}

async function connectDirectory(handle) {
  state.directoryHandle = handle;
  state.hasWriteAccess = true;
  state.trips = await readTripsFile();
  elements.folderStatus.textContent = `Connected to ${handle.name}. Changes are saved to trips.json.`;
  elements.chooseFolder.textContent = "Change folder";
  updateSaveButton();
  renderHistory();
  renderAnalytics();
}

async function restoreDirectoryConnection() {
  if (!("showDirectoryPicker" in window)) return;
  try {
    const handle = await getStoredDirectoryHandle();
    if (!handle) return;
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission === "granted") await connectDirectory(handle);
    else {
      state.directoryHandle = handle;
      elements.folderStatus.textContent = `${handle.name} is remembered. Reconnect to enable changes.`;
      elements.chooseFolder.textContent = "Reconnect folder";
    }
  } catch (error) { /* Read-only loading remains available. */ }
}

async function reconnectRememberedFolder() {
  if (!state.directoryHandle) return chooseProjectFolder();
  try {
    const permission = await state.directoryHandle.requestPermission({ mode: "readwrite" });
    if (permission === "granted") {
      await connectDirectory(state.directoryHandle);
      showToast("Project folder reconnected.");
    }
  } catch (error) {
    setInlineMessage(`Could not reconnect the folder: ${error.message}`, true);
  }
}

async function loadTripsReadOnly() {
  try {
    const response = await fetch(TRIPS_FILENAME, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = await response.json();
    if (!Array.isArray(parsed)) throw new Error("trips.json must contain a JSON array.");
    state.trips = parsed;
    if (!state.directoryHandle) elements.folderStatus.textContent = "Read-only history loaded. Connect the project folder to make changes.";
    renderHistory();
    renderAnalytics();
  } catch (error) {
    setInlineMessage(`Could not load trips.json: ${error.message}`, true);
    renderHistory();
    renderAnalytics();
  }
}

async function readTripsFile() {
  try {
    const handle = await state.directoryHandle.getFileHandle(TRIPS_FILENAME);
    const text = await (await handle.getFile()).text();
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("trips.json must contain a JSON array.");
    return parsed;
  } catch (error) {
    if (error.name === "NotFoundError") {
      await writeTripsFile([]);
      return [];
    }
    throw error;
  }
}

async function writeTripsFile(trips = state.trips) {
  const handle = await state.directoryHandle.getFileHandle(TRIPS_FILENAME, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(trips, null, 2));
  await writable.close();
}

async function saveCurrentTrip() {
  if (!state.hasWriteAccess || !state.currentEstimate) return;
  const values = getFormValues();
  const errors = validateForm(values);
  if (Object.keys(errors).length) {
    renderValidation(errors, true);
    return;
  }

  elements.saveTrip.disabled = true;
  const estimate = state.currentEstimate.estimate;
  const trip = {
    id: crypto.randomUUID(),
    tripDate: values.tripDate,
    mapUrl: values.mapUrl,
    distanceKm: values.distance,
    efficiencyKmPerLiter: values.efficiency,
    fuelPricePerLiter: values.fuelPrice,
    marginPercent: values.margin,
    minimumFuelLiter: estimate.minimumFuelLiter,
    recommendedFuelLiter: estimate.recommendedFuelLiter,
      estimatedCost: estimate.estimatedCost,
      refueledFuelLiter: 0,
      isRefueled: false,
    createdAt: new Date().toISOString(),
    refueledAt: null
  };
  state.trips.unshift(trip);
  try {
    await writeTripsFile();
    state.showAllTrips = false;
    renderHistory();
    renderAnalytics();
    showToast("Trip saved successfully.");
  } catch (error) {
    state.trips = state.trips.filter((item) => item.id !== trip.id);
    showToast(`Could not save trip: ${error.message}`, true);
  } finally {
    updateSaveButton();
  }
}

function getTripTimestamp(trip) {
  const date = Date.parse(`${trip.tripDate || ""}T00:00:00`);
  if (Number.isFinite(date)) return date;
  const created = Date.parse(trip.createdAt || "");
  return Number.isFinite(created) ? created : 0;
}

function sortTripsNewest(trips) {
  return [...trips].sort((a, b) => getTripTimestamp(b) - getTripTimestamp(a));
}

function getRecommendedFuel(trip) {
  return Math.max(Number(trip.recommendedFuelLiter) || 0, 0);
}

function getRefueledFuel(trip) {
  const storedAmount = Number(trip.refueledFuelLiter);
  if (Number.isFinite(storedAmount) && storedAmount >= 0) return storedAmount;
  return trip.isRefueled ? getRecommendedFuel(trip) : 0;
}

function getRemainingFuel(trip) {
  return Math.max(getRecommendedFuel(trip) - getRefueledFuel(trip), 0);
}

function getRefuelStatus(trip) {
  return getRemainingFuel(trip) <= 0.000001 ? "refueled" : "pending";
}

function createStatusBadge(trip) {
  const status = getRefuelStatus(trip);
  const labels = { pending: "Not refueled", refueled: "Refueled" };
  const badge = document.createElement("span");
  badge.className = `status-badge status-${status}`;
  badge.textContent = labels[status];
  return badge;
}

function createActionMenu(trip) {
  const wrapper = document.createElement("div");
  wrapper.className = "action-menu";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "menu-trigger";
  trigger.textContent = "\u22ef";
  trigger.setAttribute("aria-label", `Actions for trip on ${formatDate(trip.tripDate)}`);
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-haspopup", "menu");

  const menu = document.createElement("div");
  menu.className = "menu-popover";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  if (isSafeMapUrl(trip.mapUrl)) {
    const routeLink = document.createElement("a");
    routeLink.className = "menu-item";
    routeLink.href = trip.mapUrl;
    routeLink.target = "_blank";
    routeLink.rel = "noopener noreferrer";
    routeLink.textContent = "Open route";
    routeLink.setAttribute("role", "menuitem");
    menu.append(routeLink);
  }
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "menu-item menu-item-danger";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.id = trip.id;
  deleteButton.setAttribute("role", "menuitem");
  deleteButton.disabled = !state.hasWriteAccess;
  deleteButton.textContent = "Delete trip";
  menu.append(deleteButton);

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = menu.hidden;
    closeActionMenus();
    menu.hidden = !willOpen;
    trigger.setAttribute("aria-expanded", String(willOpen));
  });
  wrapper.append(trigger, menu);
  return wrapper;
}

function renderHistory() {
  elements.tableBody.replaceChildren();
  elements.cardList.replaceChildren();
  renderOutstandingTotals();
  const sorted = sortTripsNewest(state.trips);
  const visibleTrips = state.showAllTrips ? sorted : sorted.slice(0, RECENT_TRIP_LIMIT);
  const hasTrips = sorted.length > 0;

  elements.tableWrapper.hidden = !hasTrips;
  elements.cardList.hidden = !hasTrips;
  elements.emptyHistory.hidden = hasTrips;
  elements.viewAllTrips.hidden = sorted.length <= RECENT_TRIP_LIMIT;
  elements.viewAllTrips.textContent = state.showAllTrips ? "Show recent trips" : `View all trips (${sorted.length})`;

  visibleTrips.forEach((trip) => {
    const row = document.createElement("tr");
    const values = [
      formatDate(trip.tripDate),
      `${formatNumber(trip.distanceKm)} km`,
      `${formatFuel(trip.recommendedFuelLiter)} L`,
      formatCurrency(trip.estimatedCost)
    ];
    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    const statusCell = document.createElement("td");
    statusCell.append(createStatusBadge(trip));
    const actionCell = document.createElement("td");
    actionCell.append(createActionMenu(trip));
    row.append(statusCell, actionCell);
    elements.tableBody.append(row);

    const card = document.createElement("article");
    card.className = "trip-card";
    const top = document.createElement("div");
    top.className = "trip-card-top";
    const heading = document.createElement("div");
    const date = document.createElement("p");
    date.className = "trip-card-date";
    date.textContent = formatDate(trip.tripDate);
    heading.append(date, createStatusBadge(trip));
    top.append(heading, createActionMenu(trip));
    const stats = document.createElement("div");
    stats.className = "trip-card-stats";
    [
      ["Distance", `${formatNumber(trip.distanceKm)} km`],
      ["Fuel", `${formatFuel(trip.recommendedFuelLiter)} L`],
      ["Cost", formatCurrency(trip.estimatedCost)]
    ].forEach(([label, value]) => {
      const block = document.createElement("div");
      const labelElement = document.createElement("span");
      const valueElement = document.createElement("strong");
      labelElement.textContent = label;
      valueElement.textContent = value;
      block.append(labelElement, valueElement);
      stats.append(block);
    });
    card.append(top, stats);
    elements.cardList.append(card);
  });
}

function renderOutstandingTotals() {
  const fuel = state.trips.reduce((sum, trip) => sum + getRemainingFuel(trip), 0);
  const cost = state.trips.reduce((sum, trip) => {
    return sum + getRemainingFuel(trip) * (Number(trip.fuelPricePerLiter) || 0);
  }, 0);
  elements.outstandingFuel.textContent = `${formatFuel(fuel)} L`;
  elements.outstandingCost.textContent = formatCurrency(cost);
  elements.recordGlobalRefuel.disabled = !state.hasWriteAccess || fuel <= 0.000001;
  elements.recordGlobalRefuel.title = !state.hasWriteAccess
    ? "Connect the project folder to record a global refuel."
    : fuel <= 0.000001
      ? "All saved trips have reached break-even."
      : "Allocate a refuel amount to the oldest outstanding trips.";
}

function closeActionMenus() {
  document.querySelectorAll(".menu-popover:not([hidden])").forEach((menu) => { menu.hidden = true; });
  document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach((button) => button.setAttribute("aria-expanded", "false"));
}

function calculateGlobalAllocation(amount) {
  let available = Math.max(Number(amount) || 0, 0);
  let coveredTrips = 0;
  const allocations = [];
  const outstandingTrips = [...state.trips]
    .filter((trip) => getRemainingFuel(trip) > 0.000001)
    .sort((a, b) => getTripTimestamp(a) - getTripTimestamp(b));

  outstandingTrips.forEach((trip) => {
    if (available <= 0.000001) return;
    const remaining = getRemainingFuel(trip);
    const allocated = Math.min(remaining, available);
    if (allocated <= 0) return;
    const reachesBreakEven = allocated + 0.000001 >= remaining;
    allocations.push({ trip, allocated, reachesBreakEven });
    if (reachesBreakEven) coveredTrips += 1;
    available -= allocated;
  });

  const totalOutstanding = state.trips.reduce((sum, trip) => sum + getRemainingFuel(trip), 0);
  const allocatedTotal = allocations.reduce((sum, item) => sum + item.allocated, 0);
  return {
    allocations,
    coveredTrips,
    allocatedTotal,
    remainingAfter: Math.max(totalOutstanding - allocatedTotal, 0),
    excess: Math.max(amount - allocatedTotal, 0)
  };
}

function openGlobalRefuelDialog() {
  const outstanding = state.trips.reduce((sum, trip) => sum + getRemainingFuel(trip), 0);
  if (!state.hasWriteAccess || outstanding <= 0.000001) return;
  elements.globalOutstanding.textContent = `${formatFuel(outstanding)} L`;
  elements.globalRefuelAmount.value = "";
  elements.globalRefuelError.textContent = "";
  updateGlobalRefuelPreview();
  elements.globalRefuelDialog.showModal();
  elements.globalRefuelAmount.focus();
}

function updateGlobalRefuelPreview() {
  const amount = parseDecimal(elements.globalRefuelAmount.value);
  const valid = Number.isFinite(amount) && amount > 0;
  elements.globalRefuelError.textContent = valid ? "" : "Enter a refuel amount greater than 0 liters.";
  elements.globalRefuelAmount.setAttribute("aria-invalid", valid ? "false" : "true");
  elements.applyGlobalRefuel.disabled = !valid;
  const allocation = calculateGlobalAllocation(valid ? amount : 0);
  elements.globalCoveredTrips.textContent = `${allocation.coveredTrips} ${allocation.coveredTrips === 1 ? "trip" : "trips"}`;
  const excessText = allocation.excess > 0.000001 ? ` Excess ${formatFuel(allocation.excess)} L is not allocated.` : "";
  elements.globalRefuelPreview.textContent = `Remaining after allocation: ${formatFuel(allocation.remainingAfter)} L.${excessText}`;
}

async function applyGlobalRefuel() {
  const amount = parseDecimal(elements.globalRefuelAmount.value);
  if (!state.hasWriteAccess || !Number.isFinite(amount) || amount <= 0) return;
  const allocation = calculateGlobalAllocation(amount);
  if (!allocation.allocations.length) return;
  const previous = allocation.allocations.map(({ trip }) => ({
    trip,
    refueledFuelLiter: trip.refueledFuelLiter,
    isRefueled: trip.isRefueled,
    refueledAt: trip.refueledAt,
    refuelUpdatedAt: trip.refuelUpdatedAt
  }));
  const now = new Date().toISOString();
  allocation.allocations.forEach(({ trip, allocated }) => {
    trip.refueledFuelLiter = getRefueledFuel(trip) + allocated;
    trip.isRefueled = getRemainingFuel(trip) <= 0.000001;
    trip.refueledAt = trip.isRefueled ? now : null;
    trip.refuelUpdatedAt = now;
  });
  elements.applyGlobalRefuel.disabled = true;
  try {
    await writeTripsFile();
    elements.globalRefuelDialog.close();
    renderHistory();
    renderAnalytics();
    const excessText = allocation.excess > 0.000001 ? ` ${formatFuel(allocation.excess)} L excess was not allocated.` : "";
    showToast(`${formatFuel(allocation.allocatedTotal)} L allocated; ${allocation.coveredTrips} trips reached break-even.${excessText}`);
  } catch (error) {
    previous.forEach((item) => {
      item.trip.refueledFuelLiter = item.refueledFuelLiter;
      item.trip.isRefueled = item.isRefueled;
      item.trip.refueledAt = item.refueledAt;
      item.trip.refuelUpdatedAt = item.refuelUpdatedAt;
    });
    elements.applyGlobalRefuel.disabled = false;
    showToast(`Could not apply global refuel: ${error.message}`, true);
  }
}

function requestTripDeletion(id) {
  state.deleteTripId = id;
  closeActionMenus();
  if (typeof elements.deleteDialog.showModal === "function") elements.deleteDialog.showModal();
  else if (window.confirm("Delete this trip permanently?")) confirmTripDeletion();
}

async function confirmTripDeletion() {
  const id = state.deleteTripId;
  const trip = state.trips.find((item) => item.id === id);
  if (!trip || !state.hasWriteAccess) return;
  const previous = [...state.trips];
  state.trips = state.trips.filter((item) => item.id !== id);
  if (elements.deleteDialog.open) elements.deleteDialog.close();
  state.deleteTripId = null;
  try {
    await writeTripsFile();
    renderHistory();
    renderAnalytics();
    showToast("Trip deleted.");
  } catch (error) {
    state.trips = previous;
    renderHistory();
    renderAnalytics();
    showToast(`Could not delete trip: ${error.message}`, true);
  }
}

function renderAnalytics() {
  const count = state.trips.length;
  const totalFuel = state.trips.reduce((sum, trip) => sum + (Number(trip.recommendedFuelLiter) || 0), 0);
  const totalSpending = state.trips.reduce((sum, trip) => sum + (Number(trip.estimatedCost) || 0), 0);
  const totalDistance = state.trips.reduce((sum, trip) => sum + (Number(trip.distanceKm) || 0), 0);
  elements.summaryFuel.textContent = `${formatFuel(totalFuel)} L`;
  elements.summarySpending.textContent = formatCurrency(totalSpending);
  elements.summaryAverage.textContent = formatCurrency(count ? totalSpending / count : 0);
  elements.summaryDistance.textContent = `${formatNumber(totalDistance)} km`;
  renderAnalyticsChart();
}

function getFilteredChartTrips() {
  const sorted = [...state.trips].sort((a, b) => getTripTimestamp(a) - getTripTimestamp(b));
  if (state.chartPeriod === "all") return sorted;
  const days = Number(state.chartPeriod);
  const threshold = Date.now() - (days * 24 * 60 * 60 * 1000);
  return sorted.filter((trip) => getTripTimestamp(trip) >= threshold);
}

function getMetricDefinition() {
  const definitions = {
    cost: {
      title: "Estimated cost by trip date",
      value: (trip) => Number(trip.estimatedCost) || 0,
      format: formatCurrency,
      axis: (value) => `Rp${new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`
    },
    fuel: {
      title: "Fuel used by trip date",
      value: (trip) => Number(trip.recommendedFuelLiter) || 0,
      format: (value) => `${formatFuel(value)} L`,
      axis: (value) => `${formatNumber(value, 1)} L`
    },
    distance: {
      title: "Distance traveled by trip date",
      value: (trip) => Number(trip.distanceKm) || 0,
      format: (value) => `${formatNumber(value)} km`,
      axis: (value) => `${formatNumber(value, 0)} km`
    }
  };
  return definitions[state.chartMetric];
}

function niceStep(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function renderAnalyticsChart() {
  const svg = elements.chartSvg;
  svg.replaceChildren();
  hideChartTooltip();
  const trips = getFilteredChartTrips();
  const metric = getMetricDefinition();
  elements.chartTitle.textContent = metric.title;
  elements.chartContainer.hidden = trips.length === 0;
  elements.chartEmpty.hidden = trips.length > 0;
  if (!trips.length) return;

  const width = 960;
  const height = 330;
  const margin = { top: 22, right: 26, bottom: 50, left: 78 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(...trips.map(metric.value), 1);
  const step = niceStep(maximum / 3);
  const yMaximum = Math.max(step * Math.ceil(maximum / step), step);
  const xAt = (index) => trips.length === 1 ? margin.left + plotWidth / 2 : margin.left + (index / (trips.length - 1)) * plotWidth;
  const yAt = (value) => margin.top + plotHeight - (value / yMaximum) * plotHeight;

  const defs = createSvgElement("defs");
  const gradient = createSvgElement("linearGradient", { id: "chart-area-gradient", x1: "0", y1: "0", x2: "0", y2: "1" });
  gradient.append(
    createSvgElement("stop", { offset: "0%", "stop-color": "#07835f", "stop-opacity": ".22" }),
    createSvgElement("stop", { offset: "100%", "stop-color": "#07835f", "stop-opacity": ".01" })
  );
  defs.append(gradient);
  svg.append(defs);

  for (let index = 0; index <= 3; index += 1) {
    const value = (yMaximum / 3) * index;
    const y = yAt(value);
    svg.append(createSvgElement("line", { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: "chart-grid-line" }));
    const label = createSvgElement("text", { x: margin.left - 11, y: y + 4, "text-anchor": "end", class: "chart-axis-label" });
    label.textContent = metric.axis(value);
    svg.append(label);
  }
  svg.append(
    createSvgElement("line", { x1: margin.left, y1: margin.top, x2: margin.left, y2: height - margin.bottom, class: "chart-axis-line" }),
    createSvgElement("line", { x1: margin.left, y1: height - margin.bottom, x2: width - margin.right, y2: height - margin.bottom, class: "chart-axis-line" })
  );

  const points = trips.map((trip, index) => ({ trip, value: metric.value(trip), x: xAt(index), y: yAt(metric.value(trip)) }));
  const coordinates = points.map((point) => `${point.x},${point.y}`).join(" ");
  if (points.length > 1) {
    svg.append(createSvgElement("polygon", {
      points: `${points[0].x},${height - margin.bottom} ${coordinates} ${points.at(-1).x},${height - margin.bottom}`,
      class: "chart-area"
    }));
    svg.append(createSvgElement("polyline", { points: coordinates, class: "chart-line" }));
  }

  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  points.forEach((point, index) => {
    if (index % labelStep === 0 || index === points.length - 1) {
      const label = createSvgElement("text", { x: point.x, y: height - margin.bottom + 24, "text-anchor": "middle", class: "chart-axis-label" });
      label.textContent = formatShortDate(point.trip.tripDate);
      svg.append(label);
    }
    const circle = createSvgElement("circle", {
      cx: point.x,
      cy: point.y,
      r: 5,
      class: "chart-point",
      tabindex: "0",
      role: "button",
      "aria-label": `${formatDate(point.trip.tripDate)}, ${metric.format(point.value)}`
    });
    circle.addEventListener("mouseenter", () => showChartTooltip(point, metric));
    circle.addEventListener("mousemove", () => showChartTooltip(point, metric));
    circle.addEventListener("mouseleave", hideChartTooltip);
    circle.addEventListener("focus", () => showChartTooltip(point, metric));
    circle.addEventListener("blur", hideChartTooltip);
    svg.append(circle);
  });
}

function showChartTooltip(point, metric) {
  elements.chartTooltip.replaceChildren();
  const title = document.createElement("strong");
  const detail = document.createElement("span");
  title.textContent = metric.format(point.value);
  detail.textContent = `${formatDate(point.trip.tripDate)} \u00b7 ` +
    `${formatNumber(point.trip.distanceKm)} km \u00b7 ` +
    `${formatNumber(point.trip.efficiencyKmPerLiter)} km/L \u00b7 ` +
    `${formatCurrency(point.trip.fuelPricePerLiter)}/L \u00b7 ` +
    `${formatFuel(point.trip.recommendedFuelLiter)} L recommended`;
  elements.chartTooltip.append(title, detail);
  elements.chartTooltip.hidden = false;
  elements.chartTooltip.style.left = `${(point.x / 960) * 100}%`;
  elements.chartTooltip.style.top = `${(point.y / 330) * 100}%`;
  elements.chartTooltip.style.transform = point.x < 170
    ? "translate(0, calc(-100% - 12px))"
    : point.x > 790
      ? "translate(-100%, calc(-100% - 12px))"
      : "translate(-50%, calc(-100% - 12px))";
}

function hideChartTooltip() {
  elements.chartTooltip.hidden = true;
}

function activateTab(tab) {
  elements.tabs.forEach((item) => {
    const active = item === tab;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
  });
  elements.panels.forEach((panel) => { panel.hidden = panel.id !== tab.dataset.tab; });
  if (tab.dataset.tab === "analytics-panel") renderAnalyticsChart();
}

function setInlineMessage(message, isError = false) {
  elements.historyMessage.textContent = message;
  elements.historyMessage.classList.toggle("error", isError);
}

function clearInlineMessage() {
  setInlineMessage("");
}

async function initializeHistory() {
  await restoreDirectoryConnection();
  if (!state.hasWriteAccess) await loadTripsReadOnly();
}

elements.form.addEventListener("input", (event) => {
  if (!event.target.name) return;
  state.touchedFields.add(event.target.name);
  invalidateEstimateIfNeeded(event.target.name);
  if (event.target === fields.margin) updateQuickOptions();
  if (event.target === fields.mapUrl) updateMapLink();
  const errors = validateForm(getFormValues());
  renderValidation(errors);
  saveFormPreferences();
});

elements.form.addEventListener("focusout", (event) => {
  if (!event.target.name) return;
  state.touchedFields.add(event.target.name);
  if (event.target === fields.fuelPrice) formatFuelPriceInput();
  renderValidation(validateForm(getFormValues()));
});

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = getFormValues();
  const errors = validateForm(values);
  if (Object.keys(errors).length) {
    Object.keys(fields).forEach((name) => state.touchedFields.add(name));
    renderValidation(errors, true);
    fields[Object.keys(errors)[0]].focus();
    return;
  }
  const estimate = calculateFuelEstimate(values);
  state.currentEstimate = { values, estimate };
  renderResult(values, estimate);
  updateSaveButton({});
  saveFormPreferences();
});

elements.form.addEventListener("reset", () => {
  window.setTimeout(() => {
    fields.tripDate.value = new Date().toISOString().slice(0, 10);
    fields.mapUrl.value = "";
    fields.distance.value = "200";
    fields.efficiency.value = "40";
    fields.fuelPrice.value = "10.000";
    fields.margin.value = "10";
    state.currentEstimate = null;
    state.touchedFields.clear();
    updateQuickOptions();
    updateMapLink();
    renderSampleResult();
    renderValidation(validateForm(getFormValues()));
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* Preferences are optional. */ }
  }, 0);
});

elements.quickOptions.forEach((button) => {
  button.addEventListener("click", () => {
    fields.margin.value = button.dataset.margin;
    state.touchedFields.add("margin");
    state.currentEstimate = null;
    updateQuickOptions();
    renderValidation(validateForm(getFormValues()));
    saveFormPreferences();
  });
});

elements.saveTrip.addEventListener("click", saveCurrentTrip);
elements.recordGlobalRefuel.addEventListener("click", openGlobalRefuelDialog);
elements.chooseFolder.addEventListener("click", () => {
  if (state.directoryHandle && !state.hasWriteAccess) reconnectRememberedFolder();
  else chooseProjectFolder();
});
elements.viewAllTrips.addEventListener("click", () => {
  state.showAllTrips = !state.showAllTrips;
  renderHistory();
});

elements.tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let targetIndex = index;
    if (event.key === "ArrowRight") targetIndex = (index + 1) % elements.tabs.length;
    if (event.key === "ArrowLeft") targetIndex = (index - 1 + elements.tabs.length) % elements.tabs.length;
    if (event.key === "Home") targetIndex = 0;
    if (event.key === "End") targetIndex = elements.tabs.length - 1;
    activateTab(elements.tabs[targetIndex]);
    elements.tabs[targetIndex].focus();
  });
});

elements.metricButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.chartMetric = button.dataset.metric;
    elements.metricButtons.forEach((item) => item.classList.toggle("is-selected", item === button));
    renderAnalyticsChart();
  });
});

elements.periodButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.chartPeriod = button.dataset.period;
    elements.periodButtons.forEach((item) => item.classList.toggle("is-selected", item === button));
    renderAnalyticsChart();
  });
});

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (action) {
    const id = action.dataset.id;
    if (action.dataset.action === "delete") requestTripDeletion(id);
    closeActionMenus();
    return;
  }
  if (!event.target.closest(".action-menu")) closeActionMenus();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeActionMenus();
});

elements.globalRefuelAmount.addEventListener("input", updateGlobalRefuelPreview);
elements.globalRefuelAmount.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !elements.applyGlobalRefuel.disabled) {
    event.preventDefault();
    applyGlobalRefuel();
  }
});
elements.cancelGlobalRefuel.addEventListener("click", () => {
  elements.globalRefuelDialog.close();
});
elements.applyGlobalRefuel.addEventListener("click", applyGlobalRefuel);
elements.globalRefuelDialog.addEventListener("click", (event) => {
  if (event.target === elements.globalRefuelDialog) {
    elements.globalRefuelDialog.close();
  }
});

elements.cancelDelete.addEventListener("click", () => {
  elements.deleteDialog.close();
  state.deleteTripId = null;
});
elements.confirmDelete.addEventListener("click", confirmTripDeletion);
elements.deleteDialog.addEventListener("click", (event) => {
  if (event.target === elements.deleteDialog) {
    elements.deleteDialog.close();
    state.deleteTripId = null;
  }
});

restoreFormPreferences();
renderSampleResult();
renderValidation(validateForm(getFormValues()));
renderHistory();
renderAnalytics();
initializeHistory();
