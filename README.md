# Kettle & Trail

A personal tracker for kettlebell training, cardio (step-ups, walking pad, rebounding, hiking) and daily eating, with weekly, monthly and yearly charts. It is a static site: plain HTML, CSS and JavaScript with no build step, so it runs on GitHub Pages as-is and installs on your phone like an app.

## What it does

**Today**
- Log kettlebell sessions with several exercises each (bell weight in kg or lb, sets, reps, minutes, effort). Shows what you lifted last time for each exercise, offers your usual bells as one-tap choices, and can repeat your last session.
- Log cardio with fields that fit the activity: distance and steps for the walking pad, step-up count, box height and added load for step-ups, distance, elevation gain and trail name for hikes. Effort and average heart rate are optional on everything.
- Daily food check-in: "Ate well / Mixed / Off track", habit checkboxes (editable), water, sleep, bodyweight, energy and notes.
- Weekly goal meters (cardio minutes, kettlebell sessions, days eating well) and training/eating streaks.
- Move between days to back-fill anything you missed.

**Progress** (week, month or year, with arrows to step back in time)
- Scoreboard: active days, training time, kettlebell volume, distance, days eating well, and weeks that hit every goal, each compared with the same point in the previous period.
- Charts: training minutes by activity, activity mix, kettlebell volume, progress for any exercise (heaviest bell, total reps or volume), eating split and habits kept, eating by month, bodyweight and sleep.
- A calendar (or a GitHub-style year grid) shaded by training minutes or colored by eating rating. Tap a day to see it.
- Every chart can switch to a table.
- Personal records: heaviest bell and most reps per exercise, longest and farthest sessions, most climbing, longest streaks.

**History** lists everything newest first, with filters and search. **Settings** covers units (lb/kg, mi/km), week start, light/dark theme, goals, the exercise/activity/habit lists, sync, backups (JSON and CSV), sample data and erasing.

## Put it on GitHub Pages

1. Create a new repository on GitHub, for example `fitness-tracker`. It can be public or private (private Pages needs a paid plan).
2. Upload everything in this folder to the root of the repository, keeping the folder structure. On the web: **Add file → Upload files**, drag the contents in, and commit. Or from a terminal:
   ```bash
   cd kettle-trail
   git init && git add . && git commit -m "Kettle & Trail tracker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/fitness-tracker.git
   git push -u origin main
   ```
3. In the repository, open **Settings → Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, and save.
4. After a minute the site is live at `https://<your-username>.github.io/fitness-tracker/`.

The included `.nojekyll` file tells Pages to serve the files exactly as they are.

### Install on your phone
Open the site on your phone, then use **Share → Add to Home Screen** (iPhone, Safari) or **⋮ → Install app** (Android, Chrome). It opens full-screen and works offline.

## Where your data lives

Your entries are saved in your browser's local storage on each device. The code is public if the repository is, but **your data is never in the repository**.

Because each browser keeps its own copy, use one of these to keep it safe and in sync:

- **Sync (recommended if you use more than one device).** In Settings, paste a GitHub token that has only the `gist` scope (create it at GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic), or use a fine-grained token with the account permission *Gists: read and write*). The app creates a secret gist on your account and merges changes record by record whenever you open it or log something. Paste the same token on each device. Secret gists are unlisted but not encrypted, so anyone with the gist's link could read it; the token itself stays in that browser only.
- **Backups.** Settings → *Download backup (JSON)* saves everything; *Restore from backup* merges a backup back in. *Download spreadsheet (CSV)* gives you a flat file for Excel or Google Sheets.

## Trying it out

Settings → *Load sample data* fills in about nine months of realistic entries so you can see every chart. *Remove sample data* takes them out again without touching your own entries.

To run it locally, serve the folder with any static server (opening `index.html` directly from disk will not load the scripts):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Customizing

- **Exercises, cardio activities and eating habits** can be added in Settings. New exercise names typed into a session are added automatically.
- **New cardio fields:** `CARDIO_FIELDS` in `js/store.js` decides which optional fields each activity shows. A custom activity gets distance by default.
- **Colors and fonts** are CSS variables at the top of `css/styles.css`. Activity colors are assigned in a fixed order (kettlebell first, then cardio activities as listed in Settings) from a palette checked for color-blind separation; keep that order if you change them.
- **After changing files,** bump `VERSION` in `sw.js` so installed copies pick up the update right away. Otherwise they update on the following visit.

## Files

```
index.html             app shell
css/styles.css         all styling, light and dark
js/app.js              start-up, routing, theme, sync status
js/store.js            data model and local storage
js/stats.js            totals, streaks, records, chart series
js/charts.js           Chart.js setup
js/today.js            Today screen
js/progress.js         Progress screen
js/history.js          History screen
js/settings.js         Settings screen, CSV export
js/forms.js            logging forms
js/sync.js             GitHub Gist sync
js/demo.js             sample data
sw.js                  offline cache
manifest.webmanifest   install info for phones
vendor/                Chart.js 4.5.1 (MIT)
fonts/                 Barlow and Barlow Condensed (SIL Open Font License)
icons/                 app icons
```
