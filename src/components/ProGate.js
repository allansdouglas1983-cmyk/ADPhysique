import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { colors, fontSize, fontWeight, spacing, radius, circle, type, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import BottomSheet from './BottomSheet';
import Button from './Button';
import useAppStore from '../store/useAppStore';
import TodaysPlateTeaser from './food/TodaysPlateTeaser';
import { restorePurchases } from '../lib/payments/restore';
import { track as trackEvent } from '../lib/engineTelemetry';
import { appAlert } from './AppAlert';

// COMP-CLARITY: one benefit line per gated feature, so the lock copy matches
// what the user actually tapped instead of the old one-size pitch (every route
// previously got the same "weekly coaching, the food diary, and your body
// metrics" line). Keys are the exact `feature` labels passed by withProGuard in
// RootNavigator.js. This is presentational copy only: it never consults or
// moves the free/Pro line, which stays enforced entirely by the tier check.
const FEATURE_BENEFIT = {
  'Food diary': 'Log meals against your own calorie and macro targets, with barcode and saved meals built in.',
  Nutrition: 'Log meals against your own calorie and macro targets, with barcode and saved meals built in.',
  'Food search': 'Search a full food database and log straight to your day against your targets.',
  'Barcode scanning': 'Scan a barcode to log a food in seconds, with its macros filled in for you.',
  'Label scanning': 'Snap a nutrition label to capture its macros without typing them in.',
  'Meal plan': 'Create a day of food around your own calories and macros, swap anything you like.',
  'Food insights': 'See how your eating tracks against your targets over the week, not just day by day.',
  Recipes: 'Save your own recipes and meals so logging the foods you eat often takes one tap.',
  'Saved meals': 'Save your own recipes and meals so logging the foods you eat often takes one tap.',
  'Meal names': 'Rename your meals to match how you actually eat, so the diary reads in your own words.',
  'Per-day targets': 'Give each day of the week its own calorie target, so weekends and midweek can carry different plans.',
  'Body metrics': 'Track your weight and measurements so coaching can read the trend and adjust your plan.',
  'Progress photos': 'Keep private progress photos with your stats, so you can see the changes the scales miss.',
  'Progress photos and Volyume Score': 'Keep private progress photos with your stats, with a Volyume Score when the photo read is strong enough.',
  'Nutrition targets': 'Get calorie and macro targets set for your goal, division, and the week ahead.',
  'Weekly check-in': 'Run a weekly check-in so your plan and targets adjust to how the week actually went.',
  'Coaching decision': 'See the weekly decision, what changed, what held, and the signals behind it.',
  'Coaching reminders': 'Set reminders for your check-ins so the weekly coaching loop never slips.',
  'Pro goal setup': 'Set a division-specific goal so your plan and targets are built around it.',
  'Adjust training': 'Change your schedule, equipment and training details while keeping Precision Coaching in sync.',
};

// Sensible default for any unmapped feature: the coaching-layer pitch the lock
// used to show everyone. Used by both the inline sheet and the full-screen lock.
const DEFAULT_BENEFIT =
  'Pro gives you weekly check-ins, nutrition targets, the food diary, and body metrics.';

function benefitFor(feature) {
  return FEATURE_BENEFIT[feature] ?? DEFAULT_BENEFIT;
}

/**
 * ProGate wraps any content that requires a Pro tier.
 * Free users see the content with a lock overlay, tapping it opens an
 * upgrade sheet that routes to ProUpgrade, which starts the trial or
 * subscribes depending on whether the user has used their trial.
 *
 * Usage:
 *   <ProGate feature="Weekly coaching">
 *     <WeeklyCheckInButton />
 *   </ProGate>
 */
export default function ProGate({ children, feature = 'This feature', style }) {
  // CP-10 theming batch (component sweep, 2026-07-10): live theme.
  const t = useTheme();
  const live = buildLiveStyles(t);
  // Only subscribe to tier, the unselected destructure re-rendered every
  // ProGated subtree on every store mutation (including each rest-timer
  // tick).
  const tier = useAppStore(s => s.tier);
  const navigation = useNavigation();
  const [modalVisible, setModalVisible] = useState(false);

  // Pro users see the content. Free users must sign up and go through the
  // upgrade flow, going Pro is never a silent one-tap switch.
  if (tier === 'pro') return <>{children}</>;

  function upgrade() {
    setModalVisible(false);
    navigation.navigate('ProUpgrade', { source: 'pro_gate' });
  }

  return (
    <>
      <View style={[styles.wrapper, style]} pointerEvents="box-none">
        <View style={styles.contentDim} pointerEvents="none">
          {children}
        </View>
        <TouchableOpacity
          style={styles.lockOverlay}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Upgrade to Pro"
        >
          <View style={[styles.lockChip, live.lockChip]}>
            <Ionicons name="lock-closed" size={13} color={t.colors.onPrimary} />
            <Text style={[styles.lockChipText, live.lockChipText]}>Pro</Text>
          </View>
        </TouchableOpacity>
      </View>

      <BottomSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        accessibilityLabel={`${feature} Pro upgrade`}
      >
        <View style={styles.sheetContent}>
          <View style={[styles.sheetIconWrap, live.sheetIconWrap]} accessibilityElementsHidden importantForAccessibility="no">
            <Ionicons name="lock-closed-outline" size={28} color={t.colors.primary} />
          </View>

          <Text style={[styles.sheetTitle, live.sheetTitle]}>{feature}</Text>
          {/* COMP-CLARITY: per-feature line so the inline sheet matches what
              the user tapped, falling back to the coaching-layer pitch. */}
          <Text style={[styles.sheetBody, live.sheetBody]}>{benefitFor(feature)}</Text>

          <Button
            title="Upgrade to Pro"
            icon="barbell-outline"
            onPress={upgrade}
            accessibilityLabel="Upgrade to Pro"
            style={styles.upgradeBtn}
          />

          <Button
            title="Maybe later"
            variant="tertiary"
            fullWidth={false}
            onPress={() => setModalVisible(false)}
            accessibilityLabel="Maybe later"
          />
        </View>
      </BottomSheet>
    </>
  );
}

/**
 * Full-screen locked state shown when a free user lands on a Pro route.
 * The route guard renders this instead of the screen.
 */
export function ProLocked({ feature = 'This' }) {
  // CP-10 theming batch (component sweep, 2026-07-10): live theme.
  const t = useTheme();
  const live = buildLiveStyles(t);
  const navigation = useNavigation();
  const userId = useAppStore(s => s.user?.id);
  const [restoring, setRestoring] = useState(false);
  // UI-12 (end-user-polish audit, 2026-07-12): the SafeAreaView below only
  // absorbs top/left/right, so the scroll content needs its own bottom
  // padding or the last control (Restore purchases) can finish under an
  // iPhone home indicator.
  const insets = useSafeAreaInsets();

  // Fire the lock impression once per feature key, not on every re-render. The
  // ref records the feature we last emitted for, so a re-render (or userId
  // resolving after mount) never re-sends the same view; a genuine feature
  // change would emit once for the new key. Payload carries the feature key
  // only, no PII.
  const viewedFeatureRef = useRef(null);
  useEffect(() => {
    if (!userId) return;
    if (viewedFeatureRef.current === feature) return;
    viewedFeatureRef.current = feature;
    trackEvent(userId, 'feature_locked_viewed', { feature }).catch(() => {});
  }, [userId, feature]);
  // Show-then-sell: on the food-diary lock, free users get a read-only
  // example day above the upgrade ask (founder decision #6). It exposes no
  // Pro action, only the value. Other Pro locks keep the plain held-seat.
  const showPlateTeaser = feature === 'Food diary' || feature === 'Nutrition';

  // Restore is a read of an existing entitlement, not a purchase: a paid user
  // on a reinstall or new device must recover Pro here without going through
  // the buy flow. Routes through the shared restore module
  // (lib/payments/restore); it re-reads the active subscription from the
  // store and never charges.
  async function handleRestore() {
    if (restoring) return;
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (!result.ok) {
        appAlert('Could not restore', 'Try again in a moment.');
      } else if (result.tier === 'pro') {
        appAlert('Pro restored', 'Your subscription is active again.');
      } else {
        appAlert('Nothing to restore', 'We could not find an active subscription for this store account.');
      }
    } catch {
      appAlert('Could not restore', 'Try again in a moment.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <SafeAreaView style={[styles.lockedSafe, live.lockedSafe]} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.lockedScroll, { paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.sm) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Founder 2026-07-02: the lock is a short gate, not a sales page.
            Identity first (lock + what this is), the example day as the one
            piece of show-don't-tell, then the CTA. The full sell (prices,
            comparison, FAQ, held-seat reassurance) lives on ProUpgrade, which
            the CTA opens, duplicating it here read as a mess. */}
        <View style={[styles.lockedIcon, live.lockedIcon]}>
          <Ionicons name="lock-closed" size={28} color={t.colors.primary} />
        </View>
        <Text style={[styles.lockedTitle, live.lockedTitle]}>{feature} is part of Pro</Text>
        {/* COMP-CLARITY: per-feature benefit line so each Pro route explains
            why it is Pro, instead of the same coaching pitch on every lock. */}
        <Text style={[styles.lockedBody, live.lockedBody]}>{benefitFor(feature)}</Text>
        {/* Show-then-sell (founder decision #6): the read-only example day,
            below the headline so it reads in context. Nutrition lock only.
            The teaser LOOKS tappable (four meal cards), so the whole block is
            one tap target routing to the same ProUpgrade the CTA below opens
            (founder defect pass 2026-07-03, issue 2), the cards themselves
            stay illustrative, no per-meal Pro function is exposed. */}
        {showPlateTeaser ? (
          <TouchableOpacity
            style={styles.lockedTeaser}
            onPress={() => navigation.navigate('ProUpgrade', { source: 'pro_gate_teaser' })}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="See the food diary in Pro"
          >
            <TodaysPlateTeaser />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity accessibilityRole="button"
          style={[styles.lockedBtn, live.lockedBtn]}
          onPress={() => navigation.navigate('ProUpgrade', { source: 'pro_gate' })}
          activeOpacity={0.88}
        >
          <Ionicons name="barbell-outline" size={16} color={t.colors.onPrimary} />
          <Text style={[styles.lockedBtnText, live.lockedBtnText]}>Upgrade to Pro</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button"
          style={styles.lockedBack}
          onPress={() => {
            // "Not now" must always lead somewhere. If the user deep-linked
            // straight onto a locked tab root there's no back entry, so fall
            // back to the Home tab rather than leaving them stranded.
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('HomeTab');
          }}
        >
          <Text style={[styles.lockedBackText, live.lockedBackText]}>Not now</Text>
        </TouchableOpacity>
        {/* COMP-CLARITY: Play-required restore, so a reinstalled paid user can
            recover Pro from the lock without buying again. Same read-only
            entitlement path as the sheet above (lib/payments/restore); no
            purchase is made here. */}
        <TouchableOpacity
          style={[styles.lockedRestore, live.lockedRestore]}
          onPress={handleRestore}
          disabled={restoring}
          accessibilityRole="button"
          accessibilityLabel="Restore purchases"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          {/* CP-10 theming batch, guard-test pin extended (ProGate.featureCopy.
              guard.test.js "restore purchase action is contained chrome"): the
              literal now reads t.colors.textSecondary, same token, live read. */}
          <Ionicons name="refresh-outline" size={14} color={t.colors.textSecondary} />
          <Text style={[styles.lockedRestoreText, live.lockedRestoreText]}>
            {restoring ? 'Restoring...' : 'Restore purchases'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Route guard: wraps a Pro-only screen component. Free users see ProLocked
 * instead of the screen, so a Pro route is enforced no matter how it is
 * reached (deep link, stale nav state, etc.). Pro users pass through.
 */
export function withProGuard(Component, feature) {
  return function GuardedScreen(props) {
    const tier = useAppStore(s => s.tier);
    if (tier !== 'pro') return <ProLocked feature={feature} />;
    return <Component {...props} />;
  };
}

/**
 * Route guard with a view-only branch for a user's own history (E10 trial-lapse
 * findings F1b/F2/F5, founder decision 2026-07-02: "view yes, log no"). A lapsed
 * or free user who HAS data in the screen's domain sees the screen, which
 * renders itself read-only (each guarded screen derives `tier !== 'pro'`
 * internally and hides every write affordance); a free user with NO data keeps
 * the ProLocked gate, so the show-then-sell lock is unchanged for never-Pro
 * users. Pro users pass straight through with no data check.
 *
 * `hasHistory(userId)` must be a cheap read resolving to a boolean. The check
 * fails CLOSED: a thrown or rejected read renders ProLocked, never the screen,
 * so a transient DB failure can never soften the tier posture.
 */
export function withReadOnlyProGuard(Component, feature, hasHistory) {
  return function GuardedScreen(props) {
    // CP-10 theming batch (component sweep, 2026-07-10): live theme.
    const t = useTheme();
    const live = buildLiveStyles(t);
    const tier = useAppStore(s => s.tier);
    const userId = useAppStore(s => s.user?.id);
    const isFree = tier !== 'pro';
    const [hasData, setHasData] = useState(null); // null = checking
    useEffect(() => {
      if (!isFree) return undefined;
      let active = true;
      setHasData(null);
      // Hostile review #5: a hung read must not strand the user on the blank
      // "checking" render (ProgressPhotos has no header to escape from). Race
      // it against a short timeout that fails CLOSED to the lock, which has
      // its own "Not now" way out.
      const timer = setTimeout(() => { if (active) setHasData(false); }, 4000);
      Promise.resolve()
        .then(() => hasHistory(userId))
        .then((v) => { if (active) setHasData(!!v); })
        .catch(() => { if (active) setHasData(false); }); // fail closed
      return () => { active = false; clearTimeout(timer); };
    }, [isFree, userId]);
    if (!isFree) return <Component {...props} />;
    // Plain background while the existence read settles, so a user with
    // history never sees the lock flash before their data appears.
    if (hasData === null) return <View style={[styles.lockedSafe, live.lockedSafe]} />;
    if (!hasData) return <ProLocked feature={feature} />;
    return <Component {...props} />;
  };
}

/**
 * ProBadge, inline badge to show next to Pro-only labels/headings.
 */
export function ProBadge({ size = 'sm' }) {
  // CP-10 theming batch (component sweep, 2026-07-10): live theme.
  const t = useTheme();
  const live = buildLiveStyles(t);
  const isSmall = size === 'sm';
  return (
    <View style={[styles.badge, live.badge, isSmall ? styles.badgeSm : styles.badgeMd]}>
      <Ionicons name="barbell" size={isSmall ? 8 : 10} color={t.colors.onPrimary} />
      <Text style={[styles.badgeText, live.badgeText, isSmall ? styles.badgeTextSm : styles.badgeTextMd]}>PRO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  contentDim: { opacity: 0.35 },
  lockOverlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  lockChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primaryFill, borderRadius: radius.sm,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  lockChipText: { ...type.captionStrong, color: colors.onPrimary },

  sheetContent: { alignItems: 'center', gap: spacing.md },
  sheetIconWrap: {
    width: 60, height: 60, borderRadius: circle(60),
    backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: fontSize.xl, fontFamily: fontFamily.heavy, fontWeight: fontWeight.black, color: colors.textPrimary,
    textAlign: 'center',
  },
  sheetBody: {
    fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 21,
  },
  upgradeBtn: { marginTop: spacing.sm },

  lockedSafe: { flex: 1, backgroundColor: colors.background },
  lockedScroll: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl, gap: spacing.md,
  },
  lockedIcon: {
    width: 64, height: 64, borderRadius: circle(64),
    backgroundColor: colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  lockedTitle: {
    fontSize: fontSize.xl, fontFamily: fontFamily.heavy, fontWeight: fontWeight.black,
    color: colors.textPrimary, textAlign: 'center',
  },
  lockedBody: {
    fontSize: fontSize.sm, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 21,
    marginBottom: spacing.sm,
  },
  // The example-day card sits between the benefit line and the CTA; it owns
  // no horizontal margin, so stretch it to the scroll's padded width.
  lockedTeaser: { alignSelf: 'stretch', marginBottom: spacing.sm },
  lockedBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.primaryFill,
    borderRadius: radius.lg, paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xxl, alignSelf: 'stretch',
  },
  lockedBtnText: { fontSize: fontSize.md, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.onPrimary },
  lockedBack: { paddingVertical: spacing.sm },
  lockedBackText: { fontSize: fontSize.sm, color: colors.textMuted },
  lockedRestore: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.md,
  },
  lockedRestoreText: { ...type.caption, color: colors.textSecondary },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.primaryFill, borderRadius: 4,
  },
  badgeSm: { paddingHorizontal: 5, paddingVertical: spacing.xxs },
  badgeMd: { paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontFamily: fontFamily.heavy, fontWeight: fontWeight.black, color: colors.onPrimary },
  badgeTextSm: { fontSize: fontSize.micro },
  badgeTextMd: { fontSize: fontSize.micro },
});

// CP-10 theming batch (component sweep, 2026-07-10): live override for the
// frozen `styles` block above, same "frozen base + live override" pattern as
// BottomSheet.js's buildLiveStyles. wrapper/contentDim/lockOverlay/
// sheetContent/upgradeBtn/lockedScroll/lockedTeaser/lockedBack/badgeSm/
// badgeMd have no colour tokens.
function buildLiveStyles(t) {
  return {
    lockChip: { backgroundColor: t.colors.primaryFill },
    lockChipText: { ...t.type.captionStrong, color: t.colors.onPrimary },
    sheetIconWrap: { backgroundColor: t.colors.primaryBg },
    sheetTitle: { color: t.colors.textPrimary },
    sheetBody: { color: t.colors.textSecondary },
    lockedSafe: { backgroundColor: t.colors.background },
    lockedIcon: { backgroundColor: t.colors.primaryBg },
    lockedTitle: { color: t.colors.textPrimary },
    lockedBody: { color: t.colors.textSecondary },
    lockedBtn: { backgroundColor: t.colors.primaryFill },
    lockedBtnText: { color: t.colors.onPrimary },
    lockedBackText: { color: t.colors.textMuted },
    lockedRestore: { borderColor: t.colors.border, backgroundColor: t.colors.surface2 },
    lockedRestoreText: { ...t.type.caption, color: t.colors.textSecondary },
    badge: { backgroundColor: t.colors.primaryFill },
    badgeText: { color: t.colors.onPrimary },
  };
}
