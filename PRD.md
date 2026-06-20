# Simple Refuel Estimator - Product Requirements Document

## Document Control

- Product: Simple Refuel Estimator
- Version: 1.9
- Last updated: 2026-06-20
- Status: Active development
- Maintenance rule: Update this document whenever product features or requirements change.

## 1. Product Summary

Simple Refuel Estimator is a client-side web application for estimating post-trip fuel replacement. Users manually enter their completed trip distance, vehicle fuel efficiency, fuel price, and an optional reserve margin. The app calculates the recommended refuel amount and estimated cost.

The app stores trip history and Google Maps route links in the root-level `trips.json` file. The user selects and authorizes the project folder so the browser can update that file.

## 2. Goals

- Provide a fast post-trip fuel and cost estimate.
- Keep route distance under the user's control through manual input.
- Maintain a persistent trip history in a readable local JSON file.
- Track which trips have already been refueled.
- Show aggregate liters and estimated cost still outstanding.
- Operate without a backend, framework, database server, build tool, or Google Maps API.

## 3. Target Environment

- Desktop or laptop computer.
- Current Google Chrome or Microsoft Edge browser.
- Served from `localhost` or HTTPS because folder write access requires a secure browser context.
- Recommended local command: `python -m http.server 8000`.
- Application URL during local use: `http://localhost:8000`.
- VS Code users can run the default build task with `Ctrl+Shift+B` to start the local server in the integrated terminal.
- `start-server.ps1` creates an empty root-level `trips.json` when the file does not exist. Existing history is never overwritten by this initialization.

## 4. Technical Constraints

- HTML, CSS, and vanilla JavaScript only.
- No backend or server-side file handling.
- No database server.
- No framework, package manager, or build process.
- Google Maps is opened as an external visual aid only.
- The app must not scrape or automatically read Google Maps distance.
- Local file writes use the File System Access API after explicit user authorization.
- A small IndexedDB database may retain the selected directory handle. Trip records are not stored in IndexedDB.

## 5. Fuel Estimator Requirements

### Inputs

- Trip date.
- Required Google Maps route link.
- Total distance in kilometers.
- Vehicle fuel efficiency in km/L.
- Fuel price per liter in Indonesian Rupiah.
- Optional reserve margin percentage, defaulting to 10%.

### Calculations

```text
minimumFuelLiter = totalDistanceKm / fuelEfficiencyKmPerLiter

recommendedFuelLiter = minimumFuelLiter + (minimumFuelLiter * marginPercent / 100)

estimatedCost = recommendedFuelLiter * fuelPricePerLiter
```

### Validation and Formatting

- Distance, fuel efficiency, and fuel price must be greater than zero.
- Margin cannot be negative.
- Numeric inputs accept comma or dot decimal separators.
- Liter and distance values display two decimal places.
- Currency displays as Indonesian Rupiah.

## 6. Local Trip History

### Folder Authorization

- The app automatically loads root-level `trips.json` in read-only mode when served from localhost or HTTPS.
- The user explicitly chooses the `Simple Refuel Estimator` project folder.
- The app requests read/write permission for that folder.
- Folder permission is required only for saving trips, changing refuel checkboxes, and deleting trips.
- The directory handle is retained in IndexedDB when supported.
- The browser may require the user to grant permission again in a later session.

### Data Structure

```text
Simple Refuel Estimator/
`-- trips.json
```

- The history filename is hardcoded as `trips.json`.
- No separate `data` directory is used.
- `trips.json` is excluded from Git so local trip history is not published.
- A newly cloned project receives its initial `trips.json` when `start-server.ps1` is run.

### Trip Record

Each record in `trips.json` contains:

- Unique trip ID.
- Trip date.
- Required Google Maps URL.
- Distance, efficiency, fuel price, and margin.
- Minimum fuel, recommended fuel, and estimated cost.
- Refueled status.
- Creation timestamp.
- Refueled timestamp when applicable.

### History Operations

- Save a calculated trip.
- Display saved trips in a horizontal table.
- Open a valid saved Google Maps link.
- Mark or unmark each trip as refueled using a checkbox.
- Persist refuel status changes immediately to `trips.json`.
- Delete a trip after confirmation.

## 7. Outstanding Refuel Totals

- Include only trips where `isRefueled` is false.
- Outstanding liters equal the sum of each outstanding trip's recommended fuel amount.
- Outstanding cost equals the sum of each outstanding trip's estimated cost.
- Both totals update immediately when a checkbox changes, a trip is added, or a trip is deleted.

## 8. Estimated Cost Trend Graph

- Display a responsive line graph above the trip history table.
- Use trip date as the X-axis, ordered chronologically.
- Use estimated fuel cost as the Y-axis.
- Render the graph with native SVG and vanilla JavaScript; no chart library is used.
- Hovering or focusing a data point shows its trip date, estimated cost, distance, fuel efficiency, fuel price per liter, and recommended fuel liters.
- The graph updates whenever a trip is added, deleted, or its refuel status changes.

## 9. Local Preferences

The current form values may be retained in `localStorage` for convenience. These values are separate from the permanent trip history in `trips.json`.

## 10. Error Handling

The UI must show actionable messages for:

- Unsupported File System Access API.
- Folder selection cancellation or access failure.
- Invalid or malformed `trips.json`.
- File write failures.
- Missing or invalid Google Maps route link.
- Attempting to save before calculating.
- Invalid estimator input.

## 11. Responsive UI

- Desktop: map and calculator appear side by side.
- Narrow screens: map appears above the calculator.
- History uses a horizontal table with columns for date, distance, recommended fuel, estimated cost, refueled checkbox, and actions.
- The history table scrolls horizontally on narrow screens.
- Controls and labels remain keyboard accessible.

## 12. Current Project Files

```text
Simple Refuel Estimator/
|-- index.html
|-- style.css
|-- script.js
|-- PRD.md
|-- start-server.ps1
|-- .gitignore
|-- .vscode/
|   `-- tasks.json
`-- trips.json (runtime-generated and ignored by Git)
```

The runtime creates `trips.json` through `start-server.ps1` when it is missing. The user must select the project folder and grant browser permission before the app can update the file.

## 13. Out of Scope

- Automatic route distance extraction.
- Google Maps API integration.
- User accounts or cloud synchronization.
- Multi-user concurrent editing.
- Mobile filesystem support guarantees.
- Automatic screenshot capture.

## 14. Revision History

### Version 1.9 - 2026-06-20

- Added automatic creation of an empty `trips.json` from `start-server.ps1` when missing.
- Added `trips.json` to `.gitignore` to keep local trip history out of the repository.
- Existing `trips.json` content remains untouched when the server starts.

### Version 1.8 - 2026-06-20

- Fixed the cost graph not appearing before folder authorization.
- Added automatic read-only loading from root-level `trips.json`.
- Disabled write actions until the project folder has read/write permission.

### Version 1.7 - 2026-06-20

- Added an SVG line graph with trip date on the X-axis and estimated cost on the Y-axis.
- Added hover and keyboard-focus annotations for distance, efficiency, fuel price, and recommended liters.

### Version 1.6 - 2026-06-13

- Replaced trip history cards with a horizontal table.
- Added responsive horizontal scrolling for the history table on narrow screens.

### Version 1.5 - 2026-06-13

- Moved `trips.json` from the `data` directory to the project root.
- Removed the `data` directory requirement.
- Hardcoded all history reads and writes to root-level `trips.json` after project-folder authorization.

### Version 1.4 - 2026-06-13

- Removed route screenshot upload, storage, display, and deletion.
- Retained the required Google Maps route link as the route reference.
- Removed the redundant status statistic from history cards; refuel state is represented by the checkbox.

### Version 1.3 - 2026-06-13

- Removed the trip name field and trip-name requirement.
- Made the Google Maps route link mandatory for calculation and history storage.
- Updated history card titles to use the trip date.

### Version 1.2 - 2026-06-13

- Added a VS Code task for starting `python -m http.server 8000` from the integrated terminal.
- Configured the server task as the default build task.
- Added a launcher that supports both `python` and the Windows `py` launcher and reports when Python is unavailable.

### Version 1.1 - 2026-06-13

- Added local folder-based trip history.
- Added per-trip refueled checkbox.
- Added outstanding liters and estimated cost totals.
- Added local JSON and image storage requirements.

### Version 1.0 - 2026-06-13

- Defined the manual-distance refuel estimator and Google Maps visual-reference workflow.
