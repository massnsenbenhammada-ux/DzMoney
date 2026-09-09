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

echo 'Installing official Telegram Android Beta APK...'
curl -fL --retry 8 --retry-all-errors --retry-delay 3 --connect-timeout 30 --max-time 600 -o /tmp/telegram.apk https://telegram.org/dl/android/apk-public-beta
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

TELEGRAM_PACKAGE="$(cat /tmp/dzmoney-telegram-package)"
test -n "$TELEGRAM_PACKAGE"

echo 'Launching Telegram Android Beta...'
adb shell monkey -p "$TELEGRAM_PACKAGE" 1
sleep 8
adb shell pidof "$TELEGRAM_PACKAGE"
adb shell dumpsys package "$TELEGRAM_PACKAGE" | head -n 40

echo 'Authenticating the dedicated Telegram Test Environment account...'
TELEGRAM_PACKAGE="$TELEGRAM_PACKAGE" bash scripts/telegram-android-test-auth.sh

echo 'Resolving the actual Telegram activity for the Mini App VIEW intent...'
TELEGRAM_ACTIVITY="$(adb shell cmd package resolve-activity --brief -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "$DZ_MONEY_MINI_APP_URL" "$TELEGRAM_PACKAGE" | tail -n 1 | tr -d '\r')"
test -n "$TELEGRAM_ACTIVITY"
test "$TELEGRAM_ACTIVITY" != 'No activity found'
case "$TELEGRAM_ACTIVITY" in
  "$TELEGRAM_PACKAGE"/*) ;;
  *)
    echo "ERROR: Resolved Mini App activity '$TELEGRAM_ACTIVITY' does not belong to Telegram package '$TELEGRAM_PACKAGE'."
    exit 1
    ;;
esac
echo "Telegram Mini App activity: $TELEGRAM_ACTIVITY"

echo 'Opening the Test Bot Direct Mini App link explicitly inside authenticated Telegram...'
adb shell am start -W -n "$TELEGRAM_ACTIVITY" -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "$DZ_MONEY_MINI_APP_URL"
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
if [ "$WEBVIEW_EXIT" -ne 0 ]; then
  echo 'Authenticated Telegram WebView gate failed; preserving the failure as runtime evidence.'
  exit "$WEBVIEW_EXIT"
fi

echo 'Capturing Telegram + Mini App launch evidence...'
adb exec-out screencap -p > telegram-mini-app-runtime.png
adb logcat -d -t 500 > telegram-mini-app-logcat.txt
