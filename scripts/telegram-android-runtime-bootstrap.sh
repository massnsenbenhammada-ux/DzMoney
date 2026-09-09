#!/usr/bin/env bash
set -eu

adb wait-for-device
adb shell getprop ro.build.version.sdk
adb shell getprop ro.product.model
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0

echo 'Checking outbound HTTPS connectivity from the Android runtime...'
adb shell ping -c 1 telegram.org || true

echo 'Installing official Telegram Android APK...'
curl -fL --retry 8 --retry-all-errors --retry-delay 3 --connect-timeout 30 --max-time 600 -o /tmp/telegram.apk https://telegram.org/dl/android/apk
test -s /tmp/telegram.apk
adb install -r /tmp/telegram.apk

echo 'Locating Android SDK build-tools aapt2...'
find /usr/local/lib/android/sdk/build-tools -type f -name aapt2 -print -quit > /tmp/dzmoney-aapt2
test -s /tmp/dzmoney-aapt2
echo "Android SDK root: /usr/local/lib/android/sdk"
echo "Using aapt2 candidate: $(cat /tmp/dzmoney-aapt2)"
test -x "$(cat /tmp/dzmoney-aapt2)"

echo 'Discovering the installed Telegram package from the APK itself...'
$(cat /tmp/dzmoney-aapt2) dump badging /tmp/telegram.apk | sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -n 1 > /tmp/dzmoney-telegram-package
test -s /tmp/dzmoney-telegram-package
echo "Telegram package: $(cat /tmp/dzmoney-telegram-package)"
adb shell pm path "$(cat /tmp/dzmoney-telegram-package)"
adb shell pm list packages | grep -F "package:$(cat /tmp/dzmoney-telegram-package)"

echo 'Launching Telegram Android...'
adb shell monkey -p "$(cat /tmp/dzmoney-telegram-package)" 1
sleep 8
adb shell pidof "$(cat /tmp/dzmoney-telegram-package)"
adb shell dumpsys package "$(cat /tmp/dzmoney-telegram-package)" | head -n 40

echo 'Resolving Telegram launcher activity for explicit Mini App intent routing...'
TELEGRAM_PACKAGE="$(cat /tmp/dzmoney-telegram-package)"
test -n "$TELEGRAM_PACKAGE"
TELEGRAM_ACTIVITY="$(adb shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER "$TELEGRAM_PACKAGE" | tail -n 1 | tr -d '\r')"
test -n "$TELEGRAM_ACTIVITY"
test "$TELEGRAM_ACTIVITY" != 'No activity found'
case "$TELEGRAM_ACTIVITY" in
  "$TELEGRAM_PACKAGE"/*) ;;
  *)
    echo "ERROR: Resolved launcher activity '$TELEGRAM_ACTIVITY' does not belong to Telegram package '$TELEGRAM_PACKAGE'."
    exit 1
    ;;
esac
echo "Telegram launcher activity: $TELEGRAM_ACTIVITY"

echo 'Opening the Test Bot Direct Mini App link explicitly inside Telegram...'
adb shell am start -W -n "$TELEGRAM_ACTIVITY" -a android.intent.action.VIEW -d "$DZ_MONEY_MINI_APP_URL"
sleep 8
FOREGROUND_STATE="$(adb shell dumpsys activity activities | grep -E 'mResumedActivity|mCurrentFocus' | head -n 5 || true)"
printf '%s\n' "$FOREGROUND_STATE"
printf '%s\n' "$FOREGROUND_STATE" | grep -F "$TELEGRAM_PACKAGE" || {
  echo "ERROR: Mini App deep link was not routed to Telegram package $TELEGRAM_PACKAGE."
  echo 'Foreground activity evidence above is required to diagnose Android intent routing.'
  exit 1
}
adb shell pidof "$TELEGRAM_PACKAGE"

echo 'Inspecting the real Telegram Android WebView boundary...'
set +e
TELEGRAM_PACKAGE_FILE=/tmp/dzmoney-telegram-package node scripts/telegram-android-webview-runtime.js > telegram-webview-runtime.txt 2>&1
WEBVIEW_EXIT=$?
set -e
cat telegram-webview-runtime.txt
if [ "$WEBVIEW_EXIT" -ne 0 ] && [ "${TELEGRAM_WEBVIEW_BLOCKING:-false}" = "true" ]; then
  echo 'Authenticated Telegram WebView gate is blocking: real initData + /api/me evidence is required.'
  exit "$WEBVIEW_EXIT"
fi
if [ "$WEBVIEW_EXIT" -ne 0 ]; then
  echo 'WebView authentication is not yet a blocking gate; preserving the failure as diagnostic evidence.'
fi

echo 'Capturing Telegram + Mini App launch evidence...'
adb exec-out screencap -p > telegram-mini-app-runtime.png
adb logcat -d -t 500 > telegram-mini-app-logcat.txt
