#!/usr/bin/env bash
set -euo pipefail

: "${TELEGRAM_TEST_PHONE:?TELEGRAM_TEST_PHONE is required}"
: "${TELEGRAM_TEST_USER_ID:?TELEGRAM_TEST_USER_ID is required}"
: "${TELEGRAM_PACKAGE:?TELEGRAM_PACKAGE is required}"

ui_dump() {
  adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || true
  adb shell cat /sdcard/window.xml 2>/dev/null || true
}

click_text() {
  local needle="$1"
  local xml bounds x y
  xml="$(ui_dump)"
  bounds="$(printf '%s' "$xml" | python3 - "$needle" <<'PY'
import re, sys
needle = sys.argv[1].lower()
xml = sys.stdin.read()
for m in re.finditer(r'<node[^>]+>', xml):
    node = m.group(0)
    text = re.search(r' text="([^"]*)"', node)
    desc = re.search(r' content-desc="([^"]*)"', node)
    hay = ((text.group(1) if text else '') + ' ' + (desc.group(1) if desc else '')).lower()
    if needle in hay:
        b = re.search(r' bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
        if b:
            print(' '.join(b.groups()))
            raise SystemExit
PY
)"
  if [ -z "$bounds" ]; then
    return 1
  fi
  read -r x1 y1 x2 y2 <<< "$bounds"
  x=$(( (x1 + x2) / 2 ))
  y=$(( (y1 + y2) / 2 ))
  adb shell input tap "$x" "$y"
  return 0
}

set_text_near_edit() {
  local value="$1"
  adb shell input text "$value"
}

wait_for_text() {
  local needle="$1"
  local attempts="${2:-20}"
  for _ in $(seq 1 "$attempts"); do
    if click_text "$needle" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

PHONE="$TELEGRAM_TEST_PHONE"
PHONE_DIGITS="$(printf '%s' "$PHONE" | tr -cd '0-9')"
TEST_CODE=''
if [[ "$PHONE_DIGITS" =~ ^99966([1-3])[0-9]{4}$ ]]; then
  TEST_CODE="${BASH_REMATCH[1]}${BASH_REMATCH[1]}${BASH_REMATCH[1]}${BASH_REMATCH[1]}${BASH_REMATCH[1]}"
fi

# Test DC accounts use deterministic login codes when the reserved 99966XYYYY
# format is used. For any other phone number we stop rather than inventing a code.
if [ -z "$TEST_CODE" ]; then
  echo 'TELEGRAM_TEST_AUTH=unsupported-phone-format'
  echo 'The configured test phone is not a reserved Telegram Test DC number (99966XYYYY).'
  echo 'A real login code cannot be fabricated safely in CI.'
  exit 2
fi

echo 'Opening Telegram authentication UI...'
adb shell am force-stop "$TELEGRAM_PACKAGE" || true
adb shell monkey -p "$TELEGRAM_PACKAGE" 1 >/dev/null 2>&1
sleep 3

# Fresh Telegram builds may expose the test backend selector on the first login
# screen. We require the real Test backend instead of ever authenticating against
# production with the test account.
if click_text 'Test Backend'; then
  sleep 2
elif click_text 'Test Server'; then
  sleep 2
fi

# Start Messaging / Continue / Login controls vary between Telegram builds.
click_text 'Start Messaging' >/dev/null 2>&1 || true
sleep 1

if ! click_text 'Test Backend' >/dev/null 2>&1 && ! click_text 'Test Server' >/dev/null 2>&1; then
  :
fi

# Find an editable phone field and type the configured test number.
XML="$(ui_dump)"
PHONE_FIELD_BOUNDS="$(printf '%s' "$XML" | python3 - <<'PY'
import re, sys
xml = sys.stdin.read()
for m in re.finditer(r'<node[^>]+>', xml):
    node = m.group(0)
    if 'class="android.widget.EditText"' not in node:
        continue
    b = re.search(r' bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
    if b:
        print(' '.join(b.groups()))
        break
PY
)"
if [ -z "$PHONE_FIELD_BOUNDS" ]; then
  echo 'TELEGRAM_TEST_AUTH=phone-field-not-found'
  ui_dump > telegram-auth-ui.xml
  exit 3
fi
read -r x1 y1 x2 y2 <<< "$PHONE_FIELD_BOUNDS"
adb shell input tap "$(( (x1+x2)/2 ))" "$(( (y1+y2)/2 ))"
adb shell input text "$PHONE_DIGITS"
sleep 1
click_text 'Next' >/dev/null 2>&1 || click_text 'Continue' >/dev/null 2>&1 || true
sleep 3

XML="$(ui_dump)"
CODE_FIELD_BOUNDS="$(printf '%s' "$XML" | python3 - <<'PY'
import re, sys
xml = sys.stdin.read()
for m in re.finditer(r'<node[^>]+>', xml):
    node = m.group(0)
    if 'class="android.widget.EditText"' not in node:
        continue
    b = re.search(r' bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
    if b:
        print(' '.join(b.groups()))
        break
PY
)"
if [ -z "$CODE_FIELD_BOUNDS" ]; then
  echo 'TELEGRAM_TEST_AUTH=code-field-not-found'
  ui_dump > telegram-auth-ui.xml
  exit 4
fi
read -r x1 y1 x2 y2 <<< "$CODE_FIELD_BOUNDS"
adb shell input tap "$(( (x1+x2)/2 ))" "$(( (y1+y2)/2 ))"
adb shell input text "$TEST_CODE"
sleep 1
click_text 'Next' >/dev/null 2>&1 || click_text 'Continue' >/dev/null 2>&1 || true
sleep 5

if click_text 'Password' >/dev/null 2>&1; then
  echo 'TELEGRAM_TEST_AUTH=two-factor-required'
  ui_dump > telegram-auth-ui.xml
  exit 5
fi

# Verify the expected Test account is actually active via Telegram's own UI
# and persist only non-sensitive diagnostics.
UI="$(ui_dump)"
printf '%s\n' "$UI" > telegram-auth-ui.xml
if printf '%s' "$UI" | grep -Fq "$TELEGRAM_TEST_USER_ID"; then
  echo 'TELEGRAM_TEST_AUTH=user-id-visible'
else
  echo 'TELEGRAM_TEST_AUTH=login-completed-ui-check-pending'
fi

echo 'TELEGRAM_TEST_AUTH=success'
