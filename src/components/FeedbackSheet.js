/**
 * FeedbackSheet
 *
 * Minimal, non-blocking feedback collection. The sheet asks one question
 * (sentiment chip), accepts an optional line of text, and submits.
 *
 * D36b (BottomSheet migration, 2026-07-10): renders through the shared
 * <BottomSheet> chrome (backdrop, handle, insets, reduce-motion, gesture
 * dismiss) instead of a hand-rolled Modal + Animated slide. The exported
 * imperative ref API is UNCHANGED (open/close) so every call site
 * (WorkoutSummaryScreen, SettingsAboutScreen, the shake handler below, the
 * FeedbackProvider singleton) needed zero changes: this component is now a
 * thin adapter that turns open()/close() into internal `visible` state fed
 * to <BottomSheet visible onClose>. `config` (the sheet's content data) is
 * only ever SET by open() and is deliberately never cleared on close — the
 * shared BottomSheet keeps the last-rendered children mounted for the
 * duration of its own close animation (real gorhom behaviour, mirrored by
 * __mocks__/@gorhom/bottom-sheet.js), so nulling it out on close would blank
 * the panel mid-slide; the next open() call replaces it before it is ever
 * shown again.
 *
 * Imperative usage from any screen:
 *
 *   const ref = useRef();
 *   <FeedbackSheet ref={ref} />
 *   ref.current.open({ trigger: 'contextual', triggerKey: 'first_workout' });
 *
 * Or app-globally via the singleton mount in App.js + the
 * `useFeedback().open(...)` hook (defined below).
 *
 * Honour the contract: NEVER auto-pop without an explicit
 * shouldPrompt() check first. This component will gladly show
 * itself every time .open() is called, suppression lives at
 * the caller via the feedback.js helpers.
 */

import {
  useImperativeHandle, useRef, useState, useEffect, useCallback, forwardRef, createContext, useContext,
} from 'react';
import {
  View, Text, StyleSheet, Keyboard, TouchableWithoutFeedback, Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as haptics from '../lib/haptics';
import { colors, fontSize, fontWeight, spacing, type, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import useAppStore from '../store/useAppStore';
import { submitFeedback, markPromptShown } from '../lib/feedback';
import BottomSheet from './BottomSheet';
import Button from './Button';
import Chip from './Chip';
import TextField from './TextField';

const SENTIMENTS = [
  { key: 'love',      icon: 'heart',                  label: 'Love it'   },
  { key: 'helpful',   icon: 'thumbs-up-outline',      label: 'Helpful'   },
  { key: 'confusing', icon: 'help-circle-outline',    label: 'Confusing' },
  { key: 'slow',      icon: 'speedometer-outline',    label: 'Slow'      },
  { key: 'buggy',     icon: 'bug-outline',            label: 'Buggy'     },
];

const FeedbackContext = createContext(null);

export function useFeedback() {
  return useContext(FeedbackContext);
}

/**
 * Mount this once at the App root. Renders the sheet at a global
 * z-level so any screen can open it via useFeedback().open(...).
 *
 * The provider also installs the shake-to-report handler when
 * expo-sensors is available. Triggering on a sustained shake (not
 * a single jolt) avoids accidental opens during heavy lifts.
 * Suppressed for 30 seconds after each open so the user doesn't
 * get prompted twice in a row.
 */
export function FeedbackProvider({ children }) {
  const ref = useRef(null);
  const api = {
    open: (opts = {}) => ref.current?.open(opts),
    close: () => ref.current?.close(),
  };

  useEffect(() => {
    // expo-sensors is a runtime-optional dep; lazy require so the
    // app keeps building if it ever gets removed. No-op on web /
    // platforms without an accelerometer.
    //
    // Explicit web bypass: expo-sensors on web has historically thrown
    // during Accelerometer.setUpdateInterval (no Web Sensor API on
    // most browsers). Codex caught this as a real web startup crash
    //, gate it here so the rest of the lazy chain doesn't even run.
    if (Platform.OS === 'web') return;
    let Accelerometer;
    try {
      // eslint-disable-next-line global-require, import/no-unresolved
      const sensors = require('expo-sensors');
      Accelerometer = sensors.Accelerometer;
    } catch (_) { return; }
    if (!Accelerometer?.addListener) return;
    // Sample at ~5 Hz, high enough to detect a shake, low enough
    // to be invisible to battery. Threshold tuned so a phone in a
    // gym bag bouncing about doesn't trigger.
    Accelerometer.setUpdateInterval(200);
    let lastOpen = 0;
    let shakeStreak = 0;
    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      // Idle phone reads ~1.0 (gravity). A vigorous shake spikes to
      // >2.5. Require three consecutive samples above the threshold
      // (~0.6s of sustained shaking) so a single thump doesn't fire.
      if (magnitude > 2.5) {
        shakeStreak++;
        if (shakeStreak >= 3 && Date.now() - lastOpen > 30_000) {
          lastOpen = Date.now();
          shakeStreak = 0;
          try {
            ref.current?.open({ trigger: 'shake' });
          } catch (_) {}
        }
      } else if (magnitude < 1.5) {
        shakeStreak = 0;
      }
    });
    return () => { try { subscription?.remove?.(); } catch (_) {} };
  }, []);

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <FeedbackSheet ref={ref} />
    </FeedbackContext.Provider>
  );
}

const FeedbackSheet = forwardRef(function FeedbackSheet(_, ref) {
  // CP-10 theming batch (component sweep, 2026-07-10): live theme.
  const t = useTheme();
  const live = buildLiveStyles(t);
  const userId = useAppStore(s => s.user?.id);

  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState(null);
  const [sentiment, setSentiment] = useState(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const autoDismissRef = useRef(null);

  function clearAutoDismiss() {
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }
  }

  function scheduleAutoDismiss() {
    clearAutoDismiss();
    autoDismissRef.current = setTimeout(() => {
      if (!sentiment && !message) closeSheet();
    }, 12_000);
  }

  // D36b: the single close path, replacing the old animateOut(). BottomSheet
  // owns the close animation (and its reduce-motion branch) itself; this only
  // has to flip the controlling `visible` prop and tidy up side effects that
  // used to live in animateOut's completion callback (dismiss the keyboard,
  // stop the auto-dismiss timer).
  const closeSheet = useCallback(() => {
    clearAutoDismiss();
    Keyboard.dismiss();
    setVisible(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    open: (cfg = {}) => {
      setConfig({ trigger: 'settings', triggerKey: null, ...cfg });
      setSentiment(null);
      setMessage('');
      setDone(false);
      setSubmitting(false);
      // Record that we showed the prompt so the suppression window
      // starts even if the user dismisses without submitting.
      if (cfg.triggerKey) markPromptShown(cfg.triggerKey).catch(() => {});
      haptics.selection();
      setVisible(true);
    },
    close: () => closeSheet(),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [closeSheet]);

  // Auto-dismiss if untouched for 12s. Resets every time the user interacts
  // (sentiment select or text change, via scheduleAutoDismiss() calls below).
  useEffect(() => {
    if (!visible) return undefined;
    scheduleAutoDismiss();
    return () => clearAutoDismiss();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function handleSubmit() {
    if (!sentiment) return;
    setSubmitting(true);
    clearAutoDismiss();
    try {
      await submitFeedback({
        trigger: config?.trigger || 'settings',
        triggerKey: config?.triggerKey || null,
        sentiment,
        message: message.trim() || null,
        userId,
      });
      // Single success note (planReady's signature, reused so the
      // vocabulary's reduce-motion gate covers it).
      haptics.planReady();
      setDone(true);
      // Stay on the success state briefly, then dismiss.
      setTimeout(() => closeSheet(), 1400);
    } catch (_) {
      // submitFeedback never throws, but be defensive.
      setSubmitting(false);
    }
  }

  const sheetLabel = done ? 'Thanks' : (config?.trigger === 'shake' ? "What's wrong?" : 'How was that?');

  return (
    <BottomSheet
      visible={visible}
      onClose={closeSheet}
      keyboardAvoiding
      accessibilityLabel={sheetLabel}
    >
      {!config ? null : done ? (
        <View style={styles.doneBlock}>
          <Ionicons name="checkmark-circle" size={36} color={t.colors.success} />
          <Text style={[styles.doneTitle, live.doneTitle]}>Thanks</Text>
          <Text style={[styles.doneSub, live.doneSub]}>Your feedback's on its way.</Text>
        </View>
      ) : (
        <>
          <Text style={[styles.title, live.title]}>
            {config.trigger === 'shake' ? "What's wrong?" : 'How was that?'}
          </Text>
          <Text style={[styles.sub, live.sub]}>
            {config.trigger === 'shake'
              ? "Tell us what just happened. We attach the rest automatically."
              : "Pick the closest match. One tap is plenty."}
          </Text>

          <View style={styles.chipRow}>
            {SENTIMENTS.map(s => (
              <Chip
                key={s.key}
                label={s.label}
                icon={s.icon}
                selected={sentiment === s.key}
                onPress={() => {
                  setSentiment(s.key);
                  scheduleAutoDismiss();
                  haptics.selection();
                }}
                accessibilityRole="radio"
                accessibilityLabel={`${s.label} sentiment`}
                style={styles.sentimentChip}
                labelStyle={[styles.sentimentChipText, live.sentimentChipText]}
                selectedLabelStyle={[styles.sentimentChipTextSelected, live.sentimentChipTextSelected]}
              />
            ))}
          </View>

          <TouchableWithoutFeedback accessibilityRole="button" onPress={() => scheduleAutoDismiss()}>
            <View>
              <TextField
                placeholder="Anything specific? (optional)"
                placeholderTextColor={t.colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={500}
                value={message}
                onChangeText={(txt) => { setMessage(txt); scheduleAutoDismiss(); }}
                accessibilityLabel="Optional details"
                surface="surface2"
                containerStyle={styles.inputContainer}
                fieldStyle={styles.inputField}
                inputStyle={styles.inputText}
              />
            </View>
          </TouchableWithoutFeedback>

          <View style={styles.actions}>
            <Button
              title="Cancel"
              onPress={() => closeSheet()}
              variant="secondary"
              fullWidth={false}
              style={styles.cancelBtn}
              textStyle={[styles.cancelText, live.cancelText]}
              accessibilityLabel="Cancel feedback"
            />
            <Button
              title="Send"
              onPress={handleSubmit}
              disabled={!sentiment || submitting}
              loading={submitting}
              fullWidth={false}
              style={styles.submitBtn}
              textStyle={[styles.submitText, live.submitText]}
              accessibilityLabel="Send feedback"
            />
          </View>

          <Text style={[styles.privacy, live.privacy]}>
            Sent with build info, your last few actions, and a recent error if any.
            Body measurements and names are stripped before sending.
          </Text>
        </>
      )}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.bold, fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xxs,
  },
  sub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sentimentChip: {
    paddingVertical: spacing.sm,
  },
  sentimentChipText: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.medium, fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  sentimentChipTextSelected: {
    color: colors.textPrimary,
    fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold,
  },

  inputContainer: {
    gap: 0,
    marginBottom: spacing.md,
  },
  inputField: {
    minHeight: 80,
    borderWidth: 1,
  },
  inputText: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.sm,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cancelBtn: {
    flex: 1,
  },
  cancelText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  submitBtn: {
    flex: 1.5,
  },
  submitText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.bold, fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },

  privacy: {
    ...type.captionTight,
    color: colors.textMuted,
    textAlign: 'center',
  },

  doneBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  doneTitle: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.bold, fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  doneSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});

// CP-10 theming batch (component sweep, 2026-07-10): live override for the
// frozen `styles` block above, same "frozen base + live override" pattern as
// BottomSheet.js's buildLiveStyles. chipRow/sentimentChip/inputContainer/
// inputField/inputText/actions/cancelBtn/submitBtn/doneBlock have no colour
// tokens. D36b (2026-07-10): backdrop/sheet/handle entries removed, that
// chrome now lives in BottomSheet.js's own buildLiveStyles.
function buildLiveStyles(t) {
  return {
    title: { color: t.colors.textPrimary },
    sub: { color: t.colors.textMuted },
    sentimentChipText: { color: t.colors.textSecondary },
    sentimentChipTextSelected: { color: t.colors.textPrimary },
    cancelText: { color: t.colors.textSecondary },
    submitText: { color: t.colors.textPrimary },
    privacy: { ...t.type.captionTight, color: t.colors.textMuted },
    doneTitle: { color: t.colors.textPrimary },
    doneSub: { color: t.colors.textMuted },
  };
}

export default FeedbackSheet;
