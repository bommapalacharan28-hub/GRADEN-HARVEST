# Garden Harvest Register — Android & iOS

A native React Native + Expo mobile app adapted from the existing `garden_harvest_register_website.html` website. This is **not a WebView**. The screens are native React Native components and data is stored in a local SQLite database.

## Website features carried over

- Garden Harvest Register identity, green/forest palette, project #67 branding and `Record · Track · Grow` message.
- Dashboard: total harvested, number of entries, average per entry and most-harvested crop.
- Add harvest form with crop name, category (`Fruit`, `Leafy`, `Root`, `Other`), quantity in kg and date.
- Same website validation constraints: crop name required (max 45 characters), quantity greater than 0 and at most 1,000 kg, valid date.
- Search by crop/category and category filtering.
- Record deletion; mobile app also adds record editing.
- Weekly Monday–Sunday totals and per-crop breakdown for a selected date's week.
- Executive summary: highest/lowest entry, fruit and leafy totals, crop distribution chart.
- Anomaly warning for records above 500 kg.
- Add 40 realistic demo records.
- CSV import with row validation and skipped-row reporting.
- JSON import for the website's JSON export format.
- CSV, JSON, TXT and Markdown export using the native share sheet.
- Local-first operation, light/dark/system theme, onboarding, connectivity indicator and offline notice.

## Data migration from the existing website

The website stores records in browser `localStorage` under `gardenHarvestRegister67`. A separately installed native app cannot directly read browser localStorage. To migrate existing records:

1. Open the existing website in the browser where its data is stored.
2. Press **Export CSV** or **Export JSON** on the website.
3. Transfer the exported file to your phone (or use it from an emulator/device file picker).
4. In the mobile app open **More → Import CSV** or **Import JSON**.

The importer validates every row and reports how many rows were skipped. The website's CSV (`date,crop,category,quantity_kg`) and JSON (`date,crop,category,qty`) formats are supported.

## Requirements

- Node.js LTS (18.18+; Node 20 LTS recommended)
- VS Code
- Expo Go on an Android/iOS device for quick testing
- For store/distributable builds: an Expo account and EAS CLI

## Run from VS Code

1. Extract this folder and open `GardenHarvestMobile` in VS Code.
2. Open Terminal → New Terminal.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start Expo:

   ```bash
   npx expo start
   ```

5. Install **Expo Go** on your phone. Scan the QR code shown in the terminal/browser. Keep the phone and computer on the same Wi-Fi network. If LAN discovery fails, run `npx expo start --tunnel`.

Useful commands:

```bash
npm run android
npm run ios
npx expo-doctor
```

`npm run ios` requires macOS with Xcode for a local iOS simulator. A physical iPhone can also open the Expo Go QR code during development.

## Android APK

The simplest reproducible APK path uses EAS Build:

```bash
npm install
npm install --global eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

The `preview` profile in `eas.json` is configured to produce an installable APK. When EAS finishes, open the build URL and download the APK. Transfer it to the Android phone and allow installation from that source if Android asks.

For a Play Store release, use:

```bash
eas build --platform android --profile production
```

## iOS build

For a cloud iOS build (requires Apple Developer account for device/App Store distribution):

```bash
eas build --platform ios --profile production
```

For an App Store submission:

```bash
eas submit --platform ios
```

A local iOS simulator build requires macOS and Xcode. Windows users can use EAS cloud builds for iOS.

## Project structure

```text
GardenHarvestMobile/
├── App.js                 # Native screens, app state and business logic
├── app.json               # Expo app identity, icon, splash and native config
├── package.json           # Dependencies and scripts
├── eas.json               # APK / production build profiles
├── assets/
│   ├── icon.png
│   ├── adaptive-icon.png
│   └── splash.png
└── README.md
```

## Storage and privacy

- SQLite database: `garden-harvest.db` in the app's private application storage.
- Theme and onboarding preference: AsyncStorage.
- No login, remote API, cloud database or account system existed in the source website, so none has been invented here.
- Harvest records remain on the device unless the user explicitly exports/shares them.
- This is an offline-first register; the connection indicator is informational, not a cloud-sync indicator.

## Native capabilities and scope

Implemented where relevant to the source website: native file picking/import, file generation/sharing, local database, offline operation, native navigation, splash/icon assets, theme selection and connectivity status. Camera, GPS, phone calling, push notifications and emergency alerts were not added because the original harvest register has no feature that requires them; adding unrelated permissions would reduce user privacy and app quality.

## Important quantity note

The original website records every quantity in kilograms, so this app retains kg as the single unit. This keeps totals, averages and crop comparisons mathematically consistent.
