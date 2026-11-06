# BLOODSEARCH v2.5.0 — ANDROID APK BUILD & RELEASE SIGNING GUIDE

## 1. Pre-Built APK Deliverables Included

Two verified Capacitor 8 Android APK packages (App ID: `bd.bloodsearch.app`, Version: `2.5.0` / `versionCode 250`, `minSdk 24`, `targetSdk 36`) are compiled and included in `/public/downloads/`:

1. **`BloodSearch-debug.apk`** — Signed with standard Android debug key for immediate sideload testing on physical Android phones or emulators.
2. **`BloodSearch-release-unsigned.apk`** — Optimized release APK (`debuggable=false`, `allowBackup=false`, `cleartextTrafficPermitted=false`) ready to sign with your private production keystore.

---

## 2. Rebuilding From Source Locally

### Prerequisites
- **Node.js 20+** and **npm**
- **JDK 21** (Eclipse Temurin / OpenJDK 21 — required by Android Gradle Plugin 8.13 & Capacitor 8)
- **Android SDK Command-Line Tools** (`platform-tools`, `platforms;android-36`, `build-tools;36.0.0`)

### Build Commands
```bash
# 1. Install dependencies
npm install

# 2. Set the HTTPS API origin used by the standalone Android app.
# Native Capacitor builds need this even when the API shares the website domain.
# Example in .env.production:
# VITE_API_BASE_URL="https://blood-search-apk.vercel.app"
# VITE_GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"

# 3. Build web bundle and sync into Capacitor Android project
npm run apk:build

# 4. Compile Debug and Release APKs via Gradle
cd android
./gradlew assembleDebug assembleRelease --no-daemon
```

Generated outputs:
- `android/app/build/outputs/apk/debug/app-debug.apk`
- `android/app/build/outputs/apk/release/app-release-unsigned.apk` (or `app-release.apk` when `ANDROID_KEYSTORE_*` env vars are set)

---

## 3. Signing the Release APK for Production / Google Play

Never share or commit your production `.jks` keystore. Generate and sign on your secure workstation or CI secret store:

### Step A — Generate Your Production Keystore (One-Time)
```bash
keytool -genkeypair -v \
  -keystore bloodsearch-release.jks \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -alias bloodsearch_prod
```

### Step B — Option 1: Sign Directly During Gradle Build (Recommended)
```bash
export ANDROID_KEYSTORE_PATH="/secure/path/bloodsearch-release.jks"
export ANDROID_KEYSTORE_PASSWORD="YOUR_KEYSTORE_PASSWORD"
export ANDROID_KEY_ALIAS="bloodsearch_prod"
export ANDROID_KEY_PASSWORD="YOUR_KEY_PASSWORD"

cd android
./gradlew assembleRelease bundleRelease --no-daemon
```
This produces:
- Signed APK: `android/app/build/outputs/apk/release/app-release.apk`
- Signed Play Store AAB: `android/app/build/outputs/bundle/release/app-release.aab`

### Step B — Option 2: Sign `BloodSearch-release-unsigned.apk` Using `zipalign` + `apksigner`
```bash
# 1. Align on 4-byte page boundaries
$ANDROID_SDK_ROOT/build-tools/36.0.0/zipalign -v -p 4 \
  BloodSearch-release-unsigned.apk \
  BloodSearch-release-aligned.apk

# 2. Sign with APK Signature Scheme v2 + v3
$ANDROID_SDK_ROOT/build-tools/36.0.0/apksigner sign \
  --ks bloodsearch-release.jks \
  --ks-key-alias bloodsearch_prod \
  --out BloodSearch-release-signed.apk \
  BloodSearch-release-aligned.apk

# 3. Verify signature
$ANDROID_SDK_ROOT/build-tools/36.0.0/apksigner verify --verbose BloodSearch-release-signed.apk
```

---

## 4. Backend CORS & Google Sign-In Configuration for Android APK

1. Ensure your backend `.env` includes the APK's Capacitor origins in `CORS_ALLOWED_ORIGINS`:
   ```env
   CORS_ALLOWED_ORIGINS="https://blood-search-apk.vercel.app,capacitor://localhost,https://localhost"
   ```
2. In **Google Cloud Console -> APIs & Services -> Credentials**:
   - Keep your **Web Application OAuth 2.0 Client ID** in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
   - Add `<YOUR_BACKEND_ORIGIN>/auth/callback` under **Authorized redirect URIs**.
   - If using native Android SHA-1 credential binding later, register package `bd.bloodsearch.app` with your release keystore SHA-1/SHA-256 fingerprint (`keytool -list -v -keystore bloodsearch-release.jks`).
