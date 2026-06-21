Two independent fixes.

---

## 1. Client calendar look-ahead + hide future phases

### Problem
- Client's **Training** tab (`ClientProgramView`) lists every phase in their assigned program — they can see the next phase before the coach has moved them into it.
- Client's **Calendar** loads a 30-back / 90-forward window, so they can scroll ahead and see scheduled workouts weeks before they're "supposed to."

### Solution (mirrors Trainerize "Limit calendar look-ahead")

**Per-client setting on `coach_clients` table** — coach chooses how far ahead each client can see.

```sql
ALTER TABLE public.coach_clients
  ADD COLUMN IF NOT EXISTS calendar_lookahead_days INTEGER NOT NULL DEFAULT 14;
```

Default 14 days. Coach picks from: 7 / 14 / 21 / 28 / 42 / 56 days (1–8 weeks), matching Trainerize's options.

**Coach UI** — small dropdown in `ClientDetail` page header (next to the existing client info row):
- "Calendar look-ahead: 14 days ▾"
- onChange → `UPDATE coach_clients SET calendar_lookahead_days = N WHERE coach_id = me AND client_id = X`

**Client enforcement** — two surfaces:

1. **`src/pages/Calendar.tsx`** — when `role === "client"`, fetch their lookahead from `coach_clients` once on mount, then cap the forward window:
   ```ts
   const horizon = addDays(today, lookaheadDays);
   // also clamp endStr used in the supabase .lte(...) filters
   ```
   Past dates stay accessible (history is fine). Forward navigation past `horizon` is blocked — week/month nav buttons disabled, calendar grid rows past horizon are dimmed and not interactive.

2. **`src/components/training/ClientProgramView.tsx`** — when `role === "client"`, only render the **current active phase** (the one matching `client_program_assignments.current_phase_id`, fallback to first phase by `phase_order` if null). Other phases are filtered out of `phaseDetails` before rendering. Coach view of the same component is unchanged.

### Files
- `supabase/migrations/<new>.sql` — add column with default 14.
- `src/pages/ClientDetail.tsx` — add lookahead dropdown (coach-only).
- `src/pages/Calendar.tsx` — fetch lookahead for clients, clamp `dateRange.end`, disable forward nav past horizon, dim out-of-range cells.
- `src/components/training/ClientProgramView.tsx` — filter phases to current phase only for clients.

### Out of scope
- No changes for coach calendar view.
- No "Follow Training Phase" auto-mode (just the day-count cap). Can be added later if needed.

---

## 2. Rest timer sound in background (on another app / locked)

### Why it's currently silent in background
The background path schedules a `LocalNotifications.schedule()` with `sound: "rest-timer-complete.mp3"`. **iOS does not accept MP3 for notification sounds.** Notification sound files must be **`.caf` / `.aiff` / `.wav`** with PCM / IMA4 / μ-law / a-law encoding, under 30 seconds, in the app bundle root. iOS silently drops the unsupported MP3 sound and fires the notification with the default tone (or no tone if the notification body is empty, which ours is). That's why nothing is heard.

### Fix
Convert the cue to a CAF (IMA4 ADPCM) variant for the **notification** path only. Keep the MP3 for the **in-app** AVAudioPlayer path (mp3 is fine there).

Steps:

1. **Generate `rest-timer-complete.caf`** from the existing mp3 in the sandbox:
   ```bash
   nix shell nixpkgs#ffmpeg -c ffmpeg -y -i public/sounds/rest-timer-complete.mp3 \
     -ar 44100 -ac 1 -c:a adpcm_ima_qt -f caf public/sounds/rest-timer-complete.caf
   ```
   IMA4-in-CAF is universally supported by iOS `UNNotificationSound`.

2. **`scripts/post-cap-sync.sh`** — also copy the `.caf` to `ios/App/App/rest-timer-complete.caf` (same pattern as the existing mp3 copy block). Add the same one-time Xcode "drag into App target" note.

3. **`src/utils/restTimerAudio.ts`** — change `NOTIFICATION_SOUND` constant from `"rest-timer-complete.mp3"` to `"rest-timer-complete.caf"`. Also give the scheduled notification a non-empty `title`/`body` (e.g. title "Rest complete", body "Time for your next set 💪"), since some iOS versions suppress the sound when both are empty/whitespace.

4. **Permission UX** — `ensureNotificationPermission()` already requests once on first timer mount. Add a one-liner toast on the very first denial telling the user: *"Enable notifications in Settings to hear the rest timer when the app is in the background."* — so they know why it doesn't play if they tapped Don't Allow.

### What this preserves
- Foreground path (in-app AVAudioPlayer + `.mixWithOthers`) is **untouched** — Spotify / Apple Music keep playing.
- Background path now actually plays the bundled sound on the lock screen / when on another app, via the local-notification sound channel. The notification sound also respects `.mixWithOthers` semantics on iOS — it ducks/layers, doesn't kill, other audio.
- No new Capacitor plugins, no AudioKit, no Xcode rebuild beyond the one-time "add the .caf to the App target" drag (same pattern they already did for the .mp3).

### Files
- `public/sounds/rest-timer-complete.caf` — new bundled asset (generated from the mp3, kept small — IMA4 ~4× smaller than PCM).
- `scripts/post-cap-sync.sh` — add `.caf` copy step.
- `src/utils/restTimerAudio.ts` — switch notification sound filename, add real title/body, add denial toast.

### Out of scope
- No `UIBackgroundModes: audio` change, no `AVAudioPlayer.play(atTime:)` background-mode audio path (would require a new native method and an Info.plist change you've explicitly asked to avoid).
- No edits to `InlineRestTimer.tsx`'s scheduling/cancellation logic — that flow is already correct, only the sound file format was wrong.
- Old MP3 file stays in place for the foreground AVAudioPlayer.

---

## Test plan

**Look-ahead:**
1. Coach sets a client's look-ahead to 7 days → log in as that client → Calendar can't navigate past today+7, scheduled workouts beyond day 7 are not visible.
2. Coach raises to 28 days → client sees up to today+28.
3. Client on Training tab sees only the current phase, not future phases.
4. Coach's own calendar view is unaffected.

**Rest timer:**
1. Start a rest timer in-app → background the app (home button / switch to Safari / lock the screen) → at zero, the bundled cue plays at the system notification volume; Spotify (if playing) keeps playing.
2. Return to app before zero → background notif is cancelled, foreground AVAudioPlayer plays the cue → Spotify still playing.
3. Skip mid-rest → no sound fires, no notification banner appears later.
