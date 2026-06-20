# Simple Refuel Estimator - Product Requirements Document

## Document Control

- Product: Simple Refuel Estimator
- Version: 2.0
- Last updated: 2026-06-20
- Status: Active development
- Maintenance rule: Update this document whenever product features or requirements change.

## 1. Product Summary

Simple Refuel Estimator is a responsive client-side dashboard for calculating the fuel amount and estimated cost required after a completed trip. The user reviews a route in Google Maps, enters the actual distance manually, and calculates minimum fuel, recommended fuel including reserve margin, and estimated refuel cost.

The application stores trip history in the root-level `trips.json`. It can load history read-only from the local static server and uses the File System Access API, after explicit user permission, to save changes directly to the project folder.

## 2. Goals

- Make fuel calculation the primary workflow.
- Present the recommended fuel amount as the strongest result.
- Minimize page length and visual clutter.
- Keep history, analytics, and formulas available without showing all secondary content at once.
- Track refueled and not-refueled trips.
- Preserve local, readable trip data without a backend or database server.
- Provide an accessible desktop and mobile experience.

## 3. Technical Constraints

- HTML, CSS, and vanilla JavaScript only.
- No frontend framework, chart library, build process, or package manager.
- No backend or database server.
- Google Maps is a visual reference and external route link only.
- Distance is never imported, scraped, or calculated from Google Maps.
- Charts use native SVG.
- File writes use the File System Access API and require Chrome or Edge with user authorization.
- Current form preferences may use `localStorage`.
- The selected folder handle may use IndexedDB.

## 4. Runtime Environment

- Desktop or laptop browser served from `localhost` or HTTPS.
- Recommended browsers: current Google Chrome or Microsoft Edge.
- Recommended startup: VS Code default build task with `Ctrl+Shift+B`.
- Direct startup command: `python -m http.server 8000`.
- Local URL: `http://localhost:8000`.
- `start-server.ps1` creates `trips.json` containing `[]` when it is missing and never overwrites an existing file.

## 5. Dashboard Structure

### Compact Header

- Label: `ROUTE FUEL CALCULATOR`.
- Title: `Simple Refuel Estimator`.
- Description: `Estimate the fuel amount and cost required for your trip.`
- Small fuel/vehicle visual icon.

### Calculator Workspace

- One primary card contains both Google Maps preview and trip form.
- Desktop uses map left and form right.
- Mobile places the form first and map second.
- Map includes an `Open in Google Maps` action.
- Notice states that trip distance must be entered manually.

### Primary Result

- One result card emphasizes recommended fuel.
- Supporting values show estimated cost, minimum fuel, total distance, and reserve margin.
- `Save Trip` is the primary result action.
- Save feedback uses a temporary toast.

### Secondary Tabs

- Trip History.
- Analytics.
- How It Works.
- Only one panel is visible at a time.
- Tabs support keyboard arrow, Home, and End navigation.

## 6. Calculator Requirements

### Inputs

- Required trip date.
- Required HTTPS Google Maps route URL.
- Required total distance in kilometers.
- Required fuel efficiency in km/L.
- Required fuel price in Rupiah per liter.
- Required reserve margin from 0% to 100%, defaulting to 10%.
- Quick reserve options: 0%, 5%, 10%, and 15%.

### Formulas

```text
minimumFuelLiter = totalDistanceKm / fuelEfficiencyKmPerLiter

recommendedFuelLiter = minimumFuelLiter * (1 + marginPercent / 100)

estimatedCost = recommendedFuelLiter * fuelPricePerLiter
```

### Validation

- Distance must be greater than zero.
- Fuel efficiency must be greater than zero.
- Fuel price must be greater than zero.
- Reserve margin must be between 0% and 100% inclusive.
- Google Maps URL must use HTTPS and an accepted Google Maps hostname.
- Errors appear inline after a field is touched or calculation is attempted.
- Calculate is disabled while required data is invalid.

### Formatting

- Comma and dot decimal input are accepted for decimal fields.
- Fuel amounts display two decimal places.
- Large numbers use Indonesian separators.
- Currency uses Indonesian Rupiah formatting.
- Fuel price input is formatted with thousand separators after editing.

## 7. Trip History

- Load `trips.json` read-only automatically.
- Require project-folder permission for save, status changes, and deletion.
- Show five most recent trips initially.
- Provide `View all trips` and `Show recent trips` controls.
- Desktop uses a compact table.
- Mobile uses stacked cards without horizontal scrolling.
- Each trip displays date, distance, recommended fuel, estimated cost, and text status.
- Status badges explicitly say `Refueled` or `Not refueled` and do not rely only on color.
- A three-dot menu provides:
  - Open route.
  - Mark as refueled or not refueled.
  - Delete trip.
- Deletion requires confirmation through a modal dialog.
- Outstanding recommended liters and estimated cost include only trips not marked as refueled.

## 8. Analytics

### Summary Metrics

- Total recommended fuel across saved trips.
- Total estimated fuel spending.
- Average estimated trip cost.
- Total distance traveled.

### Trend Chart

- Native responsive SVG line chart.
- Default metric: estimated fuel cost by trip date.
- Metric switcher:
  - Fuel Cost.
  - Fuel Used.
  - Distance.
- Period filters:
  - 7 Days.
  - 30 Days.
  - All.
- Cost axis uses compact Indonesian Rupiah labels such as `Rp5 rb`.
- Hover and keyboard focus tooltip includes date, active metric, distance, efficiency, fuel price, and recommended fuel.
- Analytics update after adding, changing, or deleting a trip.

## 9. How It Works

- Explain the workflow in three concise steps.
- Display formulas in code-style cards.
- Show a disclaimer covering traffic, road conditions, driving style, vehicle condition, and load.

## 10. Local Data

### Project Structure

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

### Trip Record

Each JSON record contains:

- Unique ID.
- Trip date.
- Google Maps route URL.
- Distance in kilometers.
- Fuel efficiency in km/L.
- Fuel price per liter.
- Reserve margin percentage.
- Minimum and recommended fuel liters.
- Estimated cost.
- Refueled status.
- Creation and optional refueled timestamps.

### Git Behavior

- `trips.json` is ignored by Git to prevent local route history from being published.
- `start-server.ps1` regenerates an empty file after clone when needed.

## 11. Responsive Design

- Maximum content width is approximately 1200px.
- Desktop uses a two-column calculator workspace.
- Tablet layout balances available space and stacks when necessary.
- Mobile uses one column, form before map, full-width controls, and trip cards.
- Mobile history avoids horizontal scrolling.
- Touch targets are at least approximately 44px for primary controls.

## 12. Accessibility

- Semantic labels for all fields.
- Visible focus states.
- Keyboard-operable tabs, chart points, menus, and dialog.
- Accessible names for icon-only menu buttons.
- Status is expressed using text and color.
- Inline errors use associated descriptions.
- Toast uses a live region.
- Text and controls maintain sufficient contrast.

## 13. Out of Scope

- Automatic Google Maps distance extraction.
- Google Maps API integration.
- Automatic route screenshot capture.
- Cloud synchronization or user accounts.
- Concurrent multi-user editing.
- Guaranteed mobile filesystem writing.

## 14. Revision History

### Version 2.0 - 2026-06-20

- Redesigned the application as a compact SaaS-style dashboard.
- Consolidated map and calculator into one primary workspace.
- Replaced equal result cards with one recommended-fuel-focused result.
- Added margin quick options and real-time form validity.
- Added tabbed Trip History, Analytics, and How It Works sections.
- Added five-trip history limit, responsive cards, status badges, action menus, and deletion dialog.
- Added analytics summaries, period filters, and fuel cost/fuel used/distance chart metrics.
- Replaced permanent save messages with temporary toast feedback.

### Version 1.9 - 2026-06-20

- Added runtime creation and Git exclusion of `trips.json`.

### Version 1.8 - 2026-06-20

- Added automatic read-only history loading before folder authorization.

### Version 1.7 - 2026-06-20

- Added the original estimated-cost line graph.
