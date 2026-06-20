"use strict";

const STORAGE_KEY = "simpleRefuelEstimatorInputs";
const DB_NAME = "simpleRefuelEstimatorHandles";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "dataDirectory";
const TRIPS_FILENAME = "trips.json";

const state = {
  directoryHandle: null,
  hasWriteAccess: false,
  trips: [],
  currentEstimate: null
};

const form = document.querySelector("#calculator-form");
const fields = {
  tripDate: document.querySelector("#trip-date"),
  mapUrl: document.querySelector("#map-url"),
  distance: document.querySelector("#distance"),
  efficiency: document.querySelector("#efficiency"),
  fuelPrice: document.querySelector("#fuel-price"),
  margin: document.querySelector("#margin")
};
const numericFields = ["distance", "efficiency", "fuelPrice", "margin"];
const validatedFields = [...numericFields, "mapUrl"];
const errorElements = {
  distance: document.querySelector("#distance-error"),
  efficiency: document.querySelector("#efficiency-error"),
  fuelPrice: document.querySelector("#fuel-price-error"),
  margin: document.querySelector("#margin-error"),
  mapUrl: document.querySelector("#map-url-error")
};
const results = {
  distance: document.querySelector("#result-distance"),
  minimum: document.querySelector("#result-minimum"),
  recommended: document.querySelector("#result-recommended"),
  cost: document.querySelector("#result-cost"),
  status: document.querySelector("#result-status")
};
const historyElements = {
  chooseFolder: document.querySelector("#choose-folder"),
  folderStatus: document.querySelector("#folder-status"),
  historyMessage: document.querySelector("#history-message"),
  tableWrapper: document.querySelector("#trip-table-wrapper"),
  list: document.querySelector("#trip-history"),
  empty: document.querySelector("#empty-history"),
  outstandingLiters: document.querySelector("#outstanding-liters"),
  outstandingCost: document.querySelector("#outstanding-cost"),
  chart: document.querySelector("#cost-chart"),
  chartSvg: document.querySelector("#cost-chart-svg"),
  chartTooltip: document.querySelector("#chart-tooltip"),
  chartEmpty: document.querySelector("#chart-empty"),
  saveTrip: document.querySelector("#save-trip"),
  saveMessage: document.querySelector("#save-trip-message")
};

function parseNumber(value) {
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  return normalized === "" ? Number.NaN : Number(normalized);
}

function validateInputs(values, mapUrl) {
  const errors = {};
  if (!Number.isFinite(values.distance) || values.distance <= 0) errors.distance = "Enter a distance greater than 0 km.";
  if (!Number.isFinite(values.efficiency) || values.efficiency <= 0) errors.efficiency = "Enter fuel efficiency greater than 0 km/L.";
  if (!Number.isFinite(values.fuelPrice) || values.fuelPrice <= 0) errors.fuelPrice = "Enter a fuel price greater than Rp0.";
  if (!Number.isFinite(values.margin) || values.margin < 0) errors.margin = "Reserve margin cannot be negative.";
  if (!mapUrl) errors.mapUrl = "Enter the Google Maps route link.";
  else if (!isSafeMapUrl(mapUrl)) errors.mapUrl = "Enter a valid HTTPS Google Maps link.";
  return errors;
}

function calculateEstimate(values) {
  const minimumFuelLiter = values.distance / values.efficiency;
  const recommendedFuelLiter = minimumFuelLiter + (minimumFuelLiter * values.margin / 100);
  return { minimumFuelLiter, recommendedFuelLiter, estimatedCost: recommendedFuelLiter * values.fuelPrice };
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value).replace(/\s/g, "");
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(date);
}

function renderResult(values, estimate) {
  results.distance.textContent = `${formatNumber(values.distance)} km`;
  results.minimum.textContent = `${formatNumber(estimate.minimumFuelLiter)} L`;
  results.recommended.textContent = `${formatNumber(estimate.recommendedFuelLiter)} L`;
  results.cost.textContent = formatCurrency(estimate.estimatedCost);
  results.status.textContent = `Includes a ${formatNumber(values.margin)}% reserve margin.`;
}

function clearResults() {
  Object.values(results).slice(0, 4).forEach((element) => { element.textContent = "--"; });
  results.status.textContent = "Enter your trip details to see an estimate.";
  state.currentEstimate = null;
  updateSaveButton();
}

function renderErrors(errors) {
  validatedFields.forEach((name) => {
    const message = errors[name] || "";
    errorElements[name].textContent = message;
    fields[name].setAttribute("aria-invalid", message ? "true" : "false");
  });
  const firstInvalid = validatedFields.find((name) => errors[name]);
  if (firstInvalid) fields[firstInvalid].focus();
}

function getRawInputs() {
  return Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.value.trim()]));
}

function getNumericValues() {
  return {
    distance: parseNumber(fields.distance.value),
    efficiency: parseNumber(fields.efficiency.value),
    fuelPrice: parseNumber(fields.fuelPrice.value),
    margin: parseNumber(fields.margin.value.trim() || "10")
  };
}

function saveInputs() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(getRawInputs())); } catch (error) { /* Storage may be unavailable. */ }
}

function restoreInputs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      Object.keys(fields).forEach((name) => { if (typeof saved[name] === "string") fields[name].value = saved[name]; });
    }
  } catch (error) { /* Ignore invalid local preferences. */ }
  if (!fields.tripDate.value) fields.tripDate.value = new Date().toISOString().slice(0, 10);
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
  const db = await openHandleDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(HANDLE_STORE, "readwrite");
    transaction.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function getStoredDirectoryHandle() {
  const db = await openHandleDatabase();
  const handle = await new Promise((resolve, reject) => {
    const request = db.transaction(HANDLE_STORE).objectStore(HANDLE_STORE).get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}

async function chooseDataFolder() {
  clearMessage(historyElements.historyMessage);
  if (!("showDirectoryPicker" in window)) {
    showMessage(historyElements.historyMessage, "This browser does not support folder access. Use a current Chrome or Edge browser.", true);
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ id: "refuel-estimator-project", mode: "readwrite" });
    await connectDirectory(handle);
    await storeDirectoryHandle(handle);
  } catch (error) {
    if (error.name !== "AbortError") showMessage(historyElements.historyMessage, `Could not open the folder: ${error.message}`, true);
  }
}

async function connectDirectory(handle) {
  state.directoryHandle = handle;
  state.hasWriteAccess = true;
  state.trips = await readTripsFile();
  historyElements.folderStatus.textContent = `Connected project folder: ${handle.name}`;
  historyElements.chooseFolder.textContent = "Change project folder";
  updateSaveButton();
  await renderHistory();
}

async function restoreDirectoryConnection() {
  if (!("showDirectoryPicker" in window)) {
    historyElements.folderStatus.textContent = "Folder access requires a current Chrome or Edge browser.";
    return;
  }
  try {
    const handle = await getStoredDirectoryHandle();
    if (!handle) return;
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission === "granted") {
      await connectDirectory(handle);
    } else {
      state.directoryHandle = handle;
      state.hasWriteAccess = false;
      historyElements.folderStatus.textContent = `Project folder remembered: ${handle.name}. Click reconnect to grant access.`;
      historyElements.chooseFolder.textContent = "Reconnect project folder";
    }
  } catch (error) {
    showMessage(historyElements.historyMessage, "The previous project folder could not be restored.", true);
  }
}

async function loadTripsReadOnly() {
  try {
    const response = await fetch(TRIPS_FILENAME, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = await response.json();
    if (!Array.isArray(parsed)) throw new Error(`${TRIPS_FILENAME} must contain a JSON array.`);
    state.trips = parsed;
    if (!state.directoryHandle) {
      historyElements.folderStatus.textContent = "History loaded read-only. Connect the project folder to enable changes.";
    }
    await renderHistory();
  } catch (error) {
    showMessage(historyElements.historyMessage, `Could not load ${TRIPS_FILENAME}: ${error.message}`, true);
    renderCostChart();
  }
}

async function initializeHistory() {
  await restoreDirectoryConnection();
  if (!state.hasWriteAccess) await loadTripsReadOnly();
}

async function reconnectRememberedFolder() {
  if (!state.directoryHandle) return chooseDataFolder();
  try {
    const permission = await state.directoryHandle.requestPermission({ mode: "readwrite" });
    if (permission === "granted") await connectDirectory(state.directoryHandle);
  } catch (error) {
    showMessage(historyElements.historyMessage, `Could not reconnect: ${error.message}`, true);
  }
}

async function readTripsFile() {
  try {
    const handle = await state.directoryHandle.getFileHandle(TRIPS_FILENAME);
    const text = await (await handle.getFile()).text();
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error(`${TRIPS_FILENAME} must contain a JSON array.`);
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
  clearMessage(historyElements.saveMessage);
  if (!state.directoryHandle) {
    showMessage(historyElements.saveMessage, "Connect the project folder before saving a trip.", true);
    return;
  }
  if (!state.currentEstimate) {
    showMessage(historyElements.saveMessage, "Calculate the fuel estimate before saving.", true);
    return;
  }
  if (!isSafeMapUrl(fields.mapUrl.value.trim())) {
    showMessage(historyElements.saveMessage, "Enter a valid HTTPS Google Maps link before saving.", true);
    fields.mapUrl.focus();
    return;
  }

  historyElements.saveTrip.disabled = true;
  let tripId = null;
  try {
    tripId = crypto.randomUUID();
    const values = state.currentEstimate.values;
    const estimate = state.currentEstimate.estimate;
    state.trips.unshift({
      id: tripId,
      tripDate: fields.tripDate.value,
      mapUrl: fields.mapUrl.value.trim(),
      distanceKm: values.distance,
      efficiencyKmPerLiter: values.efficiency,
      fuelPricePerLiter: values.fuelPrice,
      marginPercent: values.margin,
      minimumFuelLiter: estimate.minimumFuelLiter,
      recommendedFuelLiter: estimate.recommendedFuelLiter,
      estimatedCost: estimate.estimatedCost,
      isRefueled: false,
      createdAt: new Date().toISOString(),
      refueledAt: null
    });
    await writeTripsFile();
    showMessage(historyElements.saveMessage, "Trip saved to trips.json.");
    await renderHistory();
  } catch (error) {
    if (tripId) state.trips = state.trips.filter((trip) => trip.id !== tripId);
    showMessage(historyElements.saveMessage, `Could not save trip: ${error.message}`, true);
  } finally {
    updateSaveButton();
  }
}

async function updateRefuelStatus(id, isRefueled) {
  if (!state.hasWriteAccess) return;
  const trip = state.trips.find((item) => item.id === id);
  if (!trip) return;
  const previous = trip.isRefueled;
  trip.isRefueled = isRefueled;
  trip.refueledAt = isRefueled ? new Date().toISOString() : null;
  try {
    await writeTripsFile();
    await renderHistory();
  } catch (error) {
    trip.isRefueled = previous;
    showMessage(historyElements.historyMessage, `Could not update trip: ${error.message}`, true);
    await renderHistory();
  }
}

async function deleteTrip(id) {
  if (!state.hasWriteAccess) return;
  const trip = state.trips.find((item) => item.id === id);
  if (!trip || !window.confirm(`Delete trip from ${formatDate(trip.tripDate)}?`)) return;
  const previousTrips = [...state.trips];
  state.trips = state.trips.filter((item) => item.id !== id);
  try {
    await writeTripsFile();
    await renderHistory();
  } catch (error) {
    state.trips = previousTrips;
    showMessage(historyElements.historyMessage, `Could not delete trip: ${error.message}`, true);
    await renderHistory();
  }
}

async function renderHistory() {
  historyElements.list.replaceChildren();
  renderOutstandingTotals();
  renderCostChart();
  historyElements.empty.hidden = state.trips.length > 0;
  historyElements.tableWrapper.hidden = state.trips.length === 0;
  if (!state.trips.length) {
    historyElements.empty.textContent = state.directoryHandle ? "No trips saved yet." : "Connect the project folder to load and save trip history.";
    return;
  }

  for (const trip of state.trips) {
    const row = document.createElement("tr");
    if (trip.isRefueled) row.classList.add("refueled");
    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(trip.tripDate);
    const distanceCell = document.createElement("td");
    distanceCell.textContent = `${formatNumber(Number(trip.distanceKm) || 0)} km`;
    const fuelCell = document.createElement("td");
    fuelCell.textContent = `${formatNumber(Number(trip.recommendedFuelLiter) || 0)} L`;
    const costCell = document.createElement("td");
    costCell.textContent = formatCurrency(Number(trip.estimatedCost) || 0);
    const refuelCell = document.createElement("td");
    const checkLabel = document.createElement("label");
    checkLabel.className = "refuel-check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(trip.isRefueled);
    checkbox.disabled = !state.hasWriteAccess;
    if (!state.hasWriteAccess) checkbox.title = "Connect the project folder to update this status.";
    checkbox.addEventListener("change", () => updateRefuelStatus(trip.id, checkbox.checked));
    checkLabel.append(checkbox, document.createTextNode("Done"));
    refuelCell.append(checkLabel);
    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "trip-actions";
    if (isSafeMapUrl(trip.mapUrl)) {
      const mapLink = document.createElement("a");
      mapLink.className = "button button-ghost";
      mapLink.href = trip.mapUrl;
      mapLink.target = "_blank";
      mapLink.rel = "noopener noreferrer";
      mapLink.textContent = "Open map";
      actions.append(mapLink);
    }
    const deleteButton = document.createElement("button");
    deleteButton.className = "button button-danger";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.disabled = !state.hasWriteAccess;
    if (!state.hasWriteAccess) deleteButton.title = "Connect the project folder to delete this trip.";
    deleteButton.addEventListener("click", () => deleteTrip(trip.id));
    actions.append(deleteButton);
    actionCell.append(actions);
    row.append(dateCell, distanceCell, fuelCell, costCell, refuelCell, actionCell);
    historyElements.list.append(row);
  }
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function getTripTimestamp(trip) {
  const dateTimestamp = Date.parse(`${trip.tripDate || ""}T00:00:00`);
  if (Number.isFinite(dateTimestamp)) return dateTimestamp;
  const createdTimestamp = Date.parse(trip.createdAt || "");
  return Number.isFinite(createdTimestamp) ? createdTimestamp : 0;
}

function formatCompactCurrency(value) {
  return new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function renderCostChart() {
  const svg = historyElements.chartSvg;
  svg.replaceChildren();
  hideChartTooltip();

  if (!state.trips.length) {
    historyElements.chart.hidden = true;
    historyElements.chartEmpty.hidden = false;
    historyElements.chartEmpty.textContent = state.directoryHandle
      ? "Save at least one trip to display the cost trend."
      : "Connect the project folder to display the cost trend.";
    return;
  }

  historyElements.chart.hidden = false;
  historyElements.chartEmpty.hidden = true;
  const trips = [...state.trips].sort((a, b) => getTripTimestamp(a) - getTripTimestamp(b));
  const width = 960;
  const height = 340;
  const margin = { top: 24, right: 28, bottom: 54, left: 82 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maximumCost = Math.max(...trips.map((trip) => Number(trip.estimatedCost) || 0), 1);
  const yMaximum = maximumCost * 1.12;
  const xForIndex = (index) => trips.length === 1
    ? margin.left + plotWidth / 2
    : margin.left + (index / (trips.length - 1)) * plotWidth;
  const yForCost = (cost) => margin.top + plotHeight - ((Number(cost) || 0) / yMaximum) * plotHeight;

  const defs = createSvgElement("defs");
  const gradient = createSvgElement("linearGradient", { id: "cost-area-gradient", x1: "0", y1: "0", x2: "0", y2: "1" });
  gradient.append(
    createSvgElement("stop", { offset: "0%", "stop-color": "#087f5b", "stop-opacity": ".28" }),
    createSvgElement("stop", { offset: "100%", "stop-color": "#087f5b", "stop-opacity": ".02" })
  );
  defs.append(gradient);
  svg.append(defs);

  const yTickCount = 4;
  for (let index = 0; index <= yTickCount; index += 1) {
    const value = (yMaximum / yTickCount) * index;
    const y = yForCost(value);
    svg.append(createSvgElement("line", {
      x1: margin.left,
      y1: y,
      x2: width - margin.right,
      y2: y,
      class: "chart-grid-line"
    }));
    const label = createSvgElement("text", {
      x: margin.left - 12,
      y: y + 4,
      "text-anchor": "end",
      class: "chart-axis-label"
    });
    label.textContent = `Rp${formatCompactCurrency(value)}`;
    svg.append(label);
  }

  svg.append(
    createSvgElement("line", { x1: margin.left, y1: margin.top, x2: margin.left, y2: height - margin.bottom, class: "chart-axis-line" }),
    createSvgElement("line", { x1: margin.left, y1: height - margin.bottom, x2: width - margin.right, y2: height - margin.bottom, class: "chart-axis-line" })
  );

  const points = trips.map((trip, index) => ({
    trip,
    x: xForIndex(index),
    y: yForCost(trip.estimatedCost)
  }));
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  if (points.length > 1) {
    const areaPoints = `${margin.left},${height - margin.bottom} ${linePoints} ${width - margin.right},${height - margin.bottom}`;
    svg.append(createSvgElement("polygon", { points: areaPoints, class: "chart-area" }));
    svg.append(createSvgElement("polyline", { points: linePoints, class: "chart-line" }));
  }

  const maximumLabels = 6;
  const labelStep = Math.max(1, Math.ceil(trips.length / maximumLabels));
  points.forEach((point, index) => {
    if (index % labelStep === 0 || index === points.length - 1) {
      const label = createSvgElement("text", {
        x: point.x,
        y: height - margin.bottom + 25,
        "text-anchor": "middle",
        class: "chart-axis-label"
      });
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
      "aria-label": getChartPointLabel(point.trip)
    });
    circle.addEventListener("mouseenter", () => showChartTooltip(point));
    circle.addEventListener("mousemove", () => showChartTooltip(point));
    circle.addEventListener("mouseleave", hideChartTooltip);
    circle.addEventListener("focus", () => showChartTooltip(point));
    circle.addEventListener("blur", hideChartTooltip);
    svg.append(circle);
  });
}

function formatShortDate(value) {
  const date = new Date(`${value || ""}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "No date"
    : new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(date);
}

function getChartPointLabel(trip) {
  return `${formatDate(trip.tripDate)}: ${formatCurrency(Number(trip.estimatedCost) || 0)}, ` +
    `${formatNumber(Number(trip.distanceKm) || 0)} km, ` +
    `${formatNumber(Number(trip.efficiencyKmPerLiter) || 0)} km/L, ` +
    `${formatCurrency(Number(trip.fuelPricePerLiter) || 0)} per liter, ` +
    `${formatNumber(Number(trip.recommendedFuelLiter) || 0)} liters recommended.`;
}

function showChartTooltip(point) {
  const tooltip = historyElements.chartTooltip;
  tooltip.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = `${formatDate(point.trip.tripDate)} - ${formatCurrency(Number(point.trip.estimatedCost) || 0)}`;
  const details = document.createElement("dl");
  const values = [
    ["Distance", `${formatNumber(Number(point.trip.distanceKm) || 0)} km`],
    ["Efficiency", `${formatNumber(Number(point.trip.efficiencyKmPerLiter) || 0)} km/L`],
    ["Fuel price", `${formatCurrency(Number(point.trip.fuelPricePerLiter) || 0)}/L`],
    ["Recommended", `${formatNumber(Number(point.trip.recommendedFuelLiter) || 0)} L`]
  ];
  values.forEach(([label, value]) => {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    details.append(term, description);
  });
  tooltip.append(title, details);
  tooltip.hidden = false;
  tooltip.style.left = `${(point.x / 960) * 100}%`;
  tooltip.style.top = `${(point.y / 340) * 100}%`;
  tooltip.style.transform = point.x < 180
    ? "translate(0, calc(-100% - 14px))"
    : point.x > 780
      ? "translate(-100%, calc(-100% - 14px))"
      : "translate(-50%, calc(-100% - 14px))";
}

function hideChartTooltip() {
  historyElements.chartTooltip.hidden = true;
}

function renderOutstandingTotals() {
  const outstanding = state.trips.filter((trip) => !trip.isRefueled);
  const liters = outstanding.reduce((total, trip) => total + (Number(trip.recommendedFuelLiter) || 0), 0);
  const cost = outstanding.reduce((total, trip) => total + (Number(trip.estimatedCost) || 0), 0);
  historyElements.outstandingLiters.textContent = `${formatNumber(liters)} L`;
  historyElements.outstandingCost.textContent = formatCurrency(cost);
}

function isSafeMapUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isGoogleHost = hostname === "google.com" || hostname.endsWith(".google.com") || hostname === "maps.app.goo.gl";
    return url.protocol === "https:" && isGoogleHost;
  } catch (error) { return false; }
}

function updateSaveButton() {
  historyElements.saveTrip.disabled = !state.hasWriteAccess || !state.currentEstimate;
}

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function clearMessage(element) {
  showMessage(element, "");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = getNumericValues();
  const errors = validateInputs(values, fields.mapUrl.value.trim());
  renderErrors(errors);
  saveInputs();
  if (Object.keys(errors).length) {
    clearResults();
    results.status.textContent = "Correct the highlighted fields to calculate your estimate.";
    return;
  }
  const estimate = calculateEstimate(values);
  state.currentEstimate = { values, estimate };
  renderResult(values, estimate);
  updateSaveButton();
  clearMessage(historyElements.saveMessage);
});

form.addEventListener("input", (event) => {
  saveInputs();
  if (numericFields.includes(event.target.name)) {
    state.currentEstimate = null;
    updateSaveButton();
  }
});

form.addEventListener("reset", () => {
  window.setTimeout(() => {
    fields.margin.value = "10";
    fields.tripDate.value = new Date().toISOString().slice(0, 10);
    renderErrors({});
    clearResults();
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* Storage may be unavailable. */ }
  }, 0);
});

historyElements.chooseFolder.addEventListener("click", () => {
  if (state.directoryHandle && historyElements.folderStatus.textContent.startsWith("Project folder remembered:")) reconnectRememberedFolder();
  else chooseDataFolder();
});
historyElements.saveTrip.addEventListener("click", saveCurrentTrip);

restoreInputs();
initializeHistory();
