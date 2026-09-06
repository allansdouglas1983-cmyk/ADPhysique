/**
 * ShareCardScreen: build and share a workout / PR / milestone card.
 *
 * The card is drawn by ONE renderer (src/lib/shareCard/drawShareCard, Skia) for
 * BOTH the on-screen preview and the exported PNG, so what you see is exactly
 * what you share. This replaced the old split where the preview (RN views) and
 * the export (a hand-coded WebView canvas) were two renderers that drifted,
 * which is why the export didn't match the preview and the toggles did little.
 *
 * The "Save as PDF" path is a separate, clean one-page HTML→PDF summary and is
 * unrelated to the image card.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, Image, Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fontSize, fontWeight, spacing, radius, withAlpha, alpha, type, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import BackHeader from '../components/BackHeader';
import Button from '../components/Button';
import SectionLabel from '../components/SectionLabel';
import { useToast } from '../components/Toast';
import { logError } from '../lib/errorLog';
import { drawShareCard, cardHeight, drawSticker, stickerHeight } from '../lib/shareCard/drawShareCard';
import { buildWeeklyRecapParams } from '../lib/shareCard/greatWeek';
import { loadWordmarkImage } from '../lib/shareCard/wordmarkImage';
import usePhotoSuppression from '../hooks/usePhotoSuppression';

// Optional native modules, guarded so the screen still mounts (e.g. in tests
// or before a rebuild) without them; the card just can't render/share until the
// real build provides Skia + the sharing packages.
let FileSystem; let Sharing; let Skia; let matchFont; let ImagePicker; let MediaLibrary;
try { FileSystem = require('expo-file-system/legacy'); } catch (_) { /* optional */ }
try { Sharing = require('expo-sharing'); } catch (_) { /* optional */ }
try { ImagePicker = require('expo-image-picker'); } catch (_) { /* optional */ }
try { MediaLibrary = require('expo-media-library'); } catch (_) { /* optional */ }
try { const S = require('@shopify/react-native-skia'); Skia = S.Skia; matchFont = S.matchFont; } catch (_) { /* optional */ }

// "Share to Stories" goes straight to the OS share sheet. The Instagram
// Stories deep link (instagram-stories://share) cannot carry the rendered
// image via a bare Linking.openURL, the full background+sticker handoff needs
// the pasteboard (iOS) / intent extras (Android) per Instagram's Stories API,
// so a deep link would open an EMPTY composer. The share sheet reliably hands
// the PNG to Instagram (or any target the user picks), which is what we want.

const WORDMARK = require('../../assets/volyume-wordmark.png');
// System typeface family per platform; the card measures text with the active
// font so layout is correct whatever this resolves to.
const FONT_FAMILY = Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'sans-serif' });
const PREVIEW_RENDER_W = 640; // render crisp, display scaled down
const PREVIEW_DISPLAY_W = 300;

export default function ShareCardScreen({ navigation, route }) {
  const toast = useToast();
  // CP-10 batch G (2026-07-11): live theme (src/hooks/useTheme.js). Chrome
  // only (segmented controls, toggles, preview placeholder) -- the card
  // CONTENT (drawShareCard/buildParams) is GDPR-locked and untouched.
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  const {
    sessionData = null,
    // Community entry point 7 (social-discovery blueprint section 1): the id
    // of the session this card was built from, passed through by
    // WorkoutSummaryScreen so "Post to Community" can hand the story builder
    // the same workout. Nothing on the CARD reads it.
    workoutId = null,
    prData = null,
    // Optional list of PRs from the same session so the user can pick WHICH one
    // to feature on the card (a session can set several). Falls back to the
    // single prData when a caller only has one.
    prList = null,
    milestoneData = null,
    weeklyRecapData = null,
    // The week's standout lift (src/lib/bestLift.js), or null. Featured on the
    // recap card.
    bestLift = null,
    // Gym/body weight unit label ('kg'|'lbs') for the weekly progress hero.
    units = 'kg',
    // Set by CoachOutputScreen when an ED-pattern flag is open OR calm mode is
    // active: all weight/progress language is stripped from the recap card.
    // Read `suppressParam` rather than `suppress` -- the effective value is
    // computed below and must never be taken from the route alone.
    suppress: suppressParam = false,
  } = route.params || {};

  // ED-safety gate, fail closed. A route param defaulting to false meant any
  // caller that forgot to pass it -- or a lost param on a remount -- exported
  // the weekly card's progress hero with no gate at all. An ED-safety gate must
  // not depend on a caller remembering something. This hook reads the open
  // ED-pattern flag and calm mode at source, starts SUPPRESSED before the async
  // read resolves, and suppresses on a read failure of either input, matching
  // the sibling Pro surface (BeforeAfterShareSheet). OR-ed with the param so a
  // caller can still force suppression, never clear it.
  const suppressedLive = usePhotoSuppression();
  const suppress = suppressParam || suppressedLive;

  // Session leads whenever session data is present (a workout share opens as the
  // session card even when it also carries a PR). A standalone "Share this PR"
  // passes prData only and opens as a PR card. The weekly recap is its own
  // entry point (the "great week" CTA on the coach screen).
  const [cardType, setCardType] = useState(
    sessionData ? 'session' : prData ? 'pr' : milestoneData ? 'milestone' : weeklyRecapData ? 'weekly' : 'session',
  );
  // Story-first default (D109-1, Campaign 30): the story composition is now a
  // first-class layout on every card type (safe zones, balanced content), and
  // stories are where these cards actually get posted. Square 1:1 and
  // portrait 4:5 stay one tap away; 'sticker' is the transparent stat-panel
  // export (ELITE-SHARE-SPEC pillar 3) for pasting onto the user's own story.
  const [format, setFormat] = useState('story');
  const [savingToGallery, setSavingToGallery] = useState(false);
  const [sharingToStories, setSharingToStories] = useState(false);

  const [showVolume, setShowVolume] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [showPlanName, setShowPlanName] = useState(true);
  const [showExercises, setShowExercises] = useState(true);
  const [showPRWeight, setShowPRWeight] = useState(true);
  const [showPrevBest, setShowPrevBest] = useState(true);
  // Weekly recap: the real weight-progress hero is opt-in. It is force-stripped
  // (and the toggle hidden) under `suppress` so no progress number can leak.
  const [showProgress, setShowProgress] = useState(true);
  // The best-lift feature is opt-in too (also force-stripped under suppress).
  const [showBestLift, setShowBestLift] = useState(true);
  // Optional gym photo background (SkImage), available on every card type.
  const [bgPhoto, setBgPhoto] = useState(null);

  // The PRs available to feature on a PR card. A caller can pass a whole
  // session's PRs (prList) so the user picks which one; otherwise it is just the
  // single prData. selectedPrIndex drives which PR the card renders.
  const prs = useMemo(() => {
    const list = Array.isArray(prList) ? prList.filter(Boolean) : [];
    if (list.length) return list;
    return prData ? [prData] : [];
  }, [prList, prData]);
  const [selectedPrIndex, setSelectedPrIndex] = useState(0);

  const isSession = cardType === 'session';
  const isWeekly = cardType === 'weekly';

  // Community entry point 7: which story kind (if any) this card can also be
  // posted as, and the params to hand over. A session needs the workout id
  // the payload builder reads on the other side, so a caller that did not
  // pass one simply does not offer the action rather than offering a dead
  // one. `weekly` and `beforeAfter` are never offered (SD-04).
  const communityKind = (cardType === 'pr' && prs.length) ? 'pr'
    : (cardType === 'milestone' && milestoneData) ? 'milestone'
      : (isSession && workoutId) ? 'session' : null;
  const communityComposeParams = communityKind === 'pr'
    ? { kind: 'pr', pr: prs[Math.min(selectedPrIndex, Math.max(0, prs.length - 1))] ?? prData }
    : communityKind === 'milestone'
      ? { kind: 'milestone', milestone: milestoneData }
      : communityKind === 'session'
        ? { kind: 'session', workoutId }
        : null;
  const isSticker = format === 'sticker';
  // Campaign 30: the weekly recap's old square-only restriction is lifted -
  // the rebuilt renderer composes every type against the tall canvas (story
  // safe zones, content balance) instead of leaving it mostly empty. The
  // card aspect ('square'|'portrait'|'story') now drives the renderer via
  // params.aspect; isSquare stays derived for the legacy readers (PDF path,
  // filenames, preview sizing fallbacks).
  const cardAspect = isSticker ? 'square' : format;
  const isSquare = cardAspect !== 'story';

  // System typefaces (regular + bold) for the Skia renderer. getTypeface() gives
  // a typeface we can resize at any point in the draw.
  const typefaces = useMemo(() => {
    if (!Skia || !matchFont) return null;
    try {
      const bold = matchFont({ fontFamily: FONT_FAMILY, fontWeight: 'bold' }).getTypeface();
      const regular = matchFont({ fontFamily: FONT_FAMILY, fontWeight: 'normal' }).getTypeface();
      return (bold && regular) ? { bold, regular } : null;
    } catch (_) { return null; }
  }, []);

  // Load the wordmark once as an SkImage for the card footer.
  const [wordmark, setWordmark] = useState(null);
  // VOLYUME-2V (founder device, 2026-08-18 - the "can't build the preview
  // AND the share buttons don't work" report): the Sentry event named the
  // cause as `renderer inputs missing`, and the ONLY asynchronously-loaded
  // input is this wordmark image. Its loader swallowed every failure
  // silently, so one unavailable decorative asset took the ENTIRE feature
  // down - render refused, and cardReady disabled both buttons.
  //
  // Two corrections. First, readiness no longer waits on the mark IMAGE:
  // the footer already lays out without it and still carries "volyume.app",
  // so the card is branded either way - the R1 rule this replaces existed
  // to stop an off-brand card looking deliberate, never to make the brand
  // asset a single point of failure for sharing at all. Second, the loader
  // below now reports why it failed instead of swallowing it.
  const cardReady = !!(Skia && typefaces);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // VOLYUME-2X: the hand-rolled resolve-then-file-read loader that used
      // to live here could not work in a release build (the bundled asset
      // resolves to an Android resource name, which expo-file-system
      // rejects). loadWordmarkImage uses Skia's own loader first and keeps
      // the old paths as fallbacks; it never throws, and a null mark is a
      // cosmetic loss only - readiness above does not depend on it.
      const img = await loadWordmarkImage(Skia, WORDMARK);
      if (!cancelled && img) setWordmark(img);
    })();
    return () => { cancelled = true; };
  }, []);

  function formatLongDate(ts) {
    const d = ts ? new Date(ts) : new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  // Campaign 30 (pillar 5): parameterised by TYPE so the template strip can
  // render a live thumbnail of every card available for this moment, not
  // just the selected one. `buildParams()` (below) stays the single source
  // for the preview/export path, now via buildParamsFor(cardType).
  const buildParamsFor = useCallback((forType) => {
    const isWeekly = forType === 'weekly';
    const isMilestone = forType === 'milestone';
    const isSession = forType === 'session';
    if (isWeekly) {
      const o = weeklyRecapData || {};
      // The hero is the real weight progress (greatWeek.js); it + all progress
      // language are dropped when suppressed (ED flag / calm mode) OR toggled off.
      // The recap is shared straight after the check-in, so the date stamp is
      // simply today's share date. (The coach output carries no own timestamp.)
      const recap = buildWeeklyRecapParams(o, {
        suppress,
        includeProgress: showProgress,
        units,
        isSquare,
        weekLabel: o.weekLabel || '',
        dateFormatted: showDate ? formatLongDate() : '',
        // The lift hero is independently toggleable; suppress strips it regardless.
        bestLift: showBestLift ? bestLift : null,
      });
      // `date` mirrors dateFormatted so the PDF summary (which reads p.date) works.
      return { ...recap, showDate, date: recap.dateFormatted };
    }
    if (isMilestone) {
      const m = milestoneData || {};
      return {
        cardType: 'milestone', isSquare, showDate,
        // R11/M4 (share-card audit 2026-07-27): the extra `&& m.date` check
        // made the Date toggle dead on any milestone whose caller doesn't
        // carry its own timestamp (the streak/perfect-month/tonnage/training-
        // load milestones, and every Recaps card from buildRecapMilestoneData).
        // formatLongDate() already defaults to today when its argument is
        // falsy -- matching the session/PR branches below, which never guard
        // on the source field being present, only on the toggle.
        date: showDate ? formatLongDate(m.date) : '',
        eyebrow: m.eyebrow || '',
        title: m.title || '',
        heroValue: m.heroValue != null ? m.heroValue : '',
        heroUnit: m.heroUnit || '',
        caption: m.caption || '',
        stats: Array.isArray(m.stats) ? m.stats.slice(0, 3) : [],
      };
    }
    if (isSession) {
      const s = sessionData || {};
      return {
        cardType: 'session', isSquare, showVolume, showDate, showPlanName, showExercises,
        date: showDate ? formatLongDate(s.date) : '',
        planName: showPlanName ? (s.planName || '') : '',
        sessionName: s.sessionName || 'Workout complete',
        workingSets: s.workingSets || 0,
        duration: s.duration || 0,
        tonnage: s.tonnage || 0,
        exerciseCount: s.exerciseCount || 0,
        exercises: s.exercises || [],
        prCount: s.prCount || 0,
        topSet: s.topSet || null,
        intensityTier: s.intensityTier || 'solid',
        // R8/M5 (share-card audit 2026-07-27): the session card hard-coded
        // 'kg' for the tonnage hero/stat/top-lift line. `sessionData.units`
        // (set at the WorkoutSummaryScreen call site) wins; the route-level
        // `units` (already used by the weekly recap) is the fallback for any
        // other caller.
        units: s.units || units || 'kg',
      };
    }
    const p = prs[Math.min(selectedPrIndex, Math.max(0, prs.length - 1))] || prData || {};
    return {
      cardType: 'pr', isSquare, showDate, showPRWeight, showPrevBest,
      date: showDate ? formatLongDate(p.date) : '',
      exerciseName: p.exerciseName || 'Exercise',
      weight: p.weight || '',
      reps: p.reps || '',
      units: p.units || 'kg',
      previousBest: p.previousBest || '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSquare, showDate, showVolume, showPlanName, showExercises, showPRWeight, showPrevBest, showProgress, showBestLift, suppress, units, sessionData, prData, prs, selectedPrIndex, milestoneData, weeklyRecapData, bestLift]);

  // The selected card's params: the per-type build plus the chosen aspect
  // preset (the renderer's cardHeight/draw both key off params.aspect).
  const buildParams = useCallback(
    () => ({ ...buildParamsFor(cardType), aspect: cardAspect }),
    [buildParamsFor, cardType, cardAspect],
  );

  // ── ONE renderer for preview + export ──────────────────────────────────────
  const renderCardBase64 = useCallback((width) => {
    // R1 (share-card audit 2026-07-27): `wordmark` is loaded asynchronously,
    // so the first render always ran with it null and drawShareCard silently
    // fell back to plain system-font text instead of the brand mark. That is
    // the reported "some don't have the logo". A card that cannot be branded
    // must not render at all, let alone export.
    // Founder device report 2026-08-18 ("can't build preview and the share
    // buttons don't work"): every failure exit here now says WHY through
    // logError, because a silent null gives a device walk nothing to act
    // on - the calm error UI is right for the user but useless for the
    // diagnosis. A renderer THROW is caught to the same calm null instead
    // of taking the screen down.
    // VOLYUME-2V: the wordmark IMAGE is no longer required to draw - the
    // renderer lays the footer out without it and still prints volyume.app.
    // Skia and the typefaces genuinely are required (there is no text
    // without them).
    if (!Skia || !typefaces) {
      logError('ShareCardScreen.renderCard', new Error('renderer inputs missing'), {
        hasSkia: !!Skia, hasTypefaces: !!typefaces, hasWordmark: !!wordmark,
      });
      return null;
    }
    try {
      const params = buildParams();
      // Sticker: the transparent stat panel (ELITE-SHARE-SPEC pillar 3). Same
      // params object the full card would draw from, so every upstream gate
      // (suppress, toggles) applies identically - suppressed content has NO
      // export path here either.
      const H = isSticker ? stickerHeight(width) : cardHeight(width, params.isSquare, params.aspect);
      const surface = Skia.Surface.MakeOffscreen(width, H);
      if (!surface) {
        logError('ShareCardScreen.renderCard', new Error('MakeOffscreen returned null'), { width, H });
        return null;
      }
      if (isSticker) {
        drawSticker(surface.getCanvas(), { Skia, width, params, typefaces, wordmark });
      } else {
        drawShareCard(surface.getCanvas(), { Skia, width, params, typefaces, wordmark, bgPhoto });
      }
      surface.flush();
      const image = surface.makeImageSnapshot();
      if (!image) {
        logError('ShareCardScreen.renderCard', new Error('makeImageSnapshot returned null'), { width, H });
        return null;
      }
      const b64 = image.encodeToBase64();
      if (!b64) logError('ShareCardScreen.renderCard', new Error('encodeToBase64 returned null'), { width, H });
      return b64 || null;
    } catch (e) {
      logError('ShareCardScreen.renderCard', e, { cardType, format, hasPhoto: !!bgPhoto });
      return null;
    }
  }, [typefaces, wordmark, buildParams, bgPhoto, isSticker, cardType, format]);

  // Template-strip thumbnails (pillar 5, the Hevy pattern): one LIVE render
  // per card type this moment offers, drawn by the same renderer at a small
  // width so the picker shows the actual designs, not blind labels. Square
  // preset for a uniform strip; the chosen format still drives the preview
  // and export above. Re-renders when the underlying data/toggles change.
  const availableTypes = useMemo(() => [
    sessionData && { type: 'session', label: 'Session' },
    (prData || prs.length) && { type: 'pr', label: 'New PR' },
    milestoneData && { type: 'milestone', label: 'Milestone' },
    weeklyRecapData && { type: 'weekly', label: 'Weekly' },
  ].filter(Boolean), [sessionData, prData, prs.length, milestoneData, weeklyRecapData]);
  const thumbs = useMemo(() => {
    if (!Skia || !typefaces || availableTypes.length < 2) return {};
    const out = {};
    for (const { type: thumbType } of availableTypes) {
      try {
        const w = 220; // small but crisp at ~96dp display width
        const params = { ...buildParamsFor(thumbType), aspect: 'square' };
        const surface = Skia.Surface.MakeOffscreen(w, cardHeight(w, true, 'square'));
        if (!surface) continue;
        drawShareCard(surface.getCanvas(), { Skia, width: w, params, typefaces, wordmark, bgPhoto });
        surface.flush();
        const image = surface.makeImageSnapshot();
        if (image) out[thumbType] = image.encodeToBase64();
      } catch (_) { /* a failed thumb falls back to the labelled tile */ }
    }
    return out;
  }, [typefaces, wordmark, buildParamsFor, bgPhoto, availableTypes]);

  // VOLYUME-2T (founder device SIGSEGV, 2026-08-18): a modern phone's
  // gallery photo can be 50MP - decoded that is a ~200MB native bitmap,
  // and feeding it to Skia raw first exhausted native memory (offscreen
  // surfaces started returning null: the "Couldn't build the preview"
  // dead-end) and then segfaulted outright on a retry. Every photo is now
  // bounded to what the canvas can ever need (2048px longest edge, above
  // the 1080px export with cover-crop headroom) by one Skia-side resample
  // BEFORE it becomes the background; the full-size image is released
  // immediately. Pure Skia, no new dependency; a resample failure falls
  // back to the original image rather than losing the feature.
  const MAX_BG_EDGE = 2048;
  const boundPhotoForCanvas = useCallback((img) => {
    try {
      const w = img.width();
      const h = img.height();
      const scale = Math.min(1, MAX_BG_EDGE / Math.max(w, h));
      if (scale >= 1) return img;
      const dw = Math.max(1, Math.round(w * scale));
      const dh = Math.max(1, Math.round(h * scale));
      const surf = Skia.Surface.MakeOffscreen(dw, dh);
      if (!surf) return img;
      surf.getCanvas().drawImageRect(
        img,
        Skia.XYWHRect(0, 0, w, h),
        Skia.XYWHRect(0, 0, dw, dh),
        Skia.Paint(),
      );
      surf.flush();
      const snap = surf.makeImageSnapshot();
      if (snap) {
        try { img.dispose?.(); } catch (_) { /* release best-effort */ }
        return snap;
      }
      return img;
    } catch (e) {
      logError('ShareCardScreen.boundPhoto', e);
      return img;
    }
  }, []);

  // Take a gym photo with the camera to use as the card background (all cards).
  // Camera capture only: uses the CAMERA permission (same as barcode scanning),
  // so no photo-library permission is needed.
  const takeGymPhoto = useCallback(async () => {
    if (!ImagePicker || !Skia || !FileSystem) {
      // P-16: a missing native module reads as "this device can't do this",
      // never as "you're on an incomplete build".
      toast.show("Photo backgrounds aren't available on your device.", { variant: 'error', duration: 5000 });
      return;
    }
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { toast.show('Camera access is needed to add a background', { variant: 'warning' }); return; }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const b64 = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(b64));
      if (img) setBgPhoto(boundPhotoForCanvas(img));
      else toast.show("Couldn't load that photo, try again", { variant: 'error' });
    } catch (_) {
      toast.show("Couldn't take that photo, try again", { variant: 'error' });
    }
  }, [toast, boundPhotoForCanvas]);

  // Choose an existing photo from the gallery (ELITE-SHARE-SPEC pillar 1:
  // the photo becomes the canvas, and most gym photos already exist). Uses
  // the system photo picker; on Android 13+/iOS 14+ launchImageLibraryAsync
  // presents the OS picker without a broad media permission, and the
  // permission request below covers older platforms.
  const pickGymPhoto = useCallback(async () => {
    if (!ImagePicker || !Skia || !FileSystem) {
      toast.show("Photo backgrounds aren't available on your device.", { variant: 'error', duration: 5000 });
      return;
    }
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { toast.show('Photo access is needed to choose a background', { variant: 'warning' }); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const b64 = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(b64));
      if (img) setBgPhoto(boundPhotoForCanvas(img));
      else toast.show("Couldn't load that photo, try again", { variant: 'error' });
    } catch (_) {
      toast.show("Couldn't open your photos, try again", { variant: 'error' });
    }
  }, [toast, boundPhotoForCanvas]);

  // Live preview: re-render whenever anything that changes the card changes.
  const [previewB64, setPreviewB64] = useState(null);
  // EP-17/UI-05 (Codex end-user-polish audit): `previewB64 === null` used to
  // mean BOTH "still rendering" and "permanently failed" (missing Skia/
  // typeface, or the offscreen surface/encode failing), so a real render
  // failure left the ActivityIndicator spinning forever with no way out.
  // Explicit states let the render layer tell the two apart and offer Retry.
  const [previewStatus, setPreviewStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const renderPreview = useCallback(() => {
    setPreviewStatus('loading');
    const b64 = renderCardBase64(PREVIEW_RENDER_W);
    if (b64) {
      setPreviewB64(b64);
      setPreviewStatus('ready');
    } else {
      setPreviewB64(null);
      setPreviewStatus('error');
    }
  }, [renderCardBase64]);
  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  // Render the export-resolution PNG and write it to a cache file, returning the
  // file URI. Shared by the OS share sheet, Save to gallery and Instagram
  // Stories so all three export exactly the same image. Returns null if the
  // card can't be generated.
  const renderCardToFile = useCallback(async () => {
    const b64 = renderCardBase64(1080);
    if (!b64) return null;
    // R11/L4 (share-card audit 2026-07-27): a fixed filename meant a second
    // export in the same session (e.g. toggling a switch, then sharing again)
    // overwrote the first file in the cache dir before the OS share sheet/
    // gallery save had necessarily finished reading it. The timestamp makes
    // every export its own file.
    const filename = `volyume-${cardType}-${format}-${Date.now()}.png`;
    const uri = (FileSystem.cacheDirectory || '') + filename;
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  }, [renderCardBase64, cardType, format]);

  // Save the rendered card straight to the device gallery (expo-media-library).
  // Asks for the add-photos permission; a denial is handled with a calm message,
  // never a crash.
  async function handleSaveToGallery() {
    if (!Skia || !FileSystem || !MediaLibrary) {
      // P-16: device-specific, not "incomplete build".
      toast.show("Saving to your gallery isn't available on your device.", { variant: 'error', duration: 5000 });
      return;
    }
    if (!typefaces) {
      toast.show('Not ready yet, wait a moment and try again', { variant: 'info' });
      return;
    }
    setSavingToGallery(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        toast.show('Gallery access is needed to save the image. You can still use Share.', { variant: 'warning', duration: 5000 });
        return;
      }
      const uri = await renderCardToFile();
      if (!uri) { toast.show("Couldn't generate the image, try again", { variant: 'error' }); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
      toast.show('Saved to your gallery', { variant: 'success' });
    } catch (_e) {
      toast.show("Couldn't save the image, try again", { variant: 'error' });
    } finally {
      setSavingToGallery(false);
    }
  }

  // Share to Story (Instagram / Facebook). Renders the PNG and opens the OS share
  // sheet, which carries the image to Instagram or Facebook (or any target the
  // user picks) where they can post it to a Story. Founder decision 2026-06-30:
  // a direct-composer intent (com.instagram.share.ADD_TO_STORY /
  // com.facebook.stories.ADD_TO_STORY with setPackage) would need a new native
  // dependency AND a registered Facebook App ID (mandatory since Jan 2023), so we
  // deliberately keep the zero-dependency share-sheet route and just present it
  // as a Story share with both app icons.
  async function handleShareToStories() {
    if (!Skia || !FileSystem || !Sharing) {
      // P-16: device-specific, not "incomplete build".
      toast.show("Story sharing isn't available on your device.", { variant: 'error', duration: 5000 });
      return;
    }
    if (!typefaces) {
      toast.show('Not ready yet, wait a moment and try again', { variant: 'info' });
      return;
    }
    setSharingToStories(true);
    try {
      const uri = await renderCardToFile();
      if (!uri) { toast.show("Couldn't generate the image, try again", { variant: 'error' }); return; }
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) { toast.show('Sharing is not available on this device', { variant: 'warning', duration: 5000 }); return; }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share to Stories',
      });
    } catch (_e) {
      toast.show("Couldn't open the share sheet, try again", { variant: 'error' });
    } finally {
      setSharingToStories(false);
    }
  }

  // EP-11/UI-03: the preview used to hard-code a 300dp width inside the
  // screen's 16dp horizontal padding, overflowing a 320dp phone (300 + 2*16
  // > 320). Cap at the design width but never exceed what this screen's own
  // padding leaves available; height is derived from that so the card's
  // aspect ratio is preserved.
  const { width: windowWidth } = useWindowDimensions();
  const previewW = Math.min(PREVIEW_DISPLAY_W, windowWidth - 2 * spacing.lg);
  const previewH = isSticker ? stickerHeight(previewW) : cardHeight(previewW, isSquare, cardAspect);

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top', 'bottom']}>
      <BackHeader title="Share image" />
      <ScrollView contentContainerStyle={styles.content}>

        {/* Card type (pillar 5): live template thumbnails when more than one
            card is available for this moment - the picker shows the actual
            designs, not blind labels. A single-type open needs no picker.
            Where a thumbnail can't render (Skia unavailable, e.g. tests or a
            pre-rebuild session), the tile falls back to its label so the
            selection contract and accessibility stay intact. */}
        {availableTypes.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.templateStrip}
          >
            {availableTypes.map(({ type: tType, label }) => {
              const active = cardType === tType;
              return (
                <TouchableOpacity
                  key={tType}
                  style={[styles.templateTile, live.templateTile, active && [styles.templateTileActive, live.templateTileActive]]}
                  onPress={() => setCardType(tType)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                >
                  {thumbs[tType] ? (
                    <Image
                      source={{ uri: `data:image/png;base64,${thumbs[tType]}` }}
                      style={styles.templateThumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.templateThumb, styles.templateThumbEmpty, live.templateThumbEmpty]}>
                      <Ionicons name="image-outline" size={18} color={t.colors.textMuted} />
                    </View>
                  )}
                  <Text style={[styles.templateLabel, live.templateLabel, active && [styles.templateLabelActive, live.templateLabelActive]]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Format: story 9:16 first (D109-1), square 1:1, portrait 4:5, and
            the transparent sticker export - all four for every card type. */}
        <View style={styles.section}>
          <SectionLabel>Format</SectionLabel>
          <View style={[styles.segmentRow, live.segmentRow]}>
            <SegmentBtn
              label="Story"
              active={format === 'story'}
              onPress={() => setFormat('story')}
              icon={<Ionicons name="phone-portrait-outline" size={15} color={format === 'story' ? t.colors.primary : t.colors.textMuted} />}
            />
            <SegmentBtn
              label="Square"
              active={format === 'square'}
              onPress={() => setFormat('square')}
              icon={<Ionicons name="square-outline" size={15} color={format === 'square' ? t.colors.primary : t.colors.textMuted} />}
            />
            <SegmentBtn
              label="4:5"
              active={format === 'portrait'}
              onPress={() => setFormat('portrait')}
              icon={<Ionicons name="tablet-portrait-outline" size={15} color={format === 'portrait' ? t.colors.primary : t.colors.textMuted} />}
            />
            <SegmentBtn
              label="Sticker"
              active={isSticker}
              onPress={() => setFormat('sticker')}
              icon={<Ionicons name="pricetag-outline" size={15} color={isSticker ? t.colors.primary : t.colors.textMuted} />}
            />
          </View>
          {isSticker ? (
            <Text style={[styles.formatHint, live.formatHint]}>
              A small transparent panel to place on your own story photo.
            </Text>
          ) : null}
        </View>

        {/* Background: the user's own photo as the canvas (gallery pick OR
            camera capture; tone-sampled scrim keeps it legible in the
            renderer), or the per-type crafted dark background. Hidden for the
            sticker, which is transparent by design. Only shown when the
            native image picker is available in the build. */}
        {ImagePicker && !isSticker ? (
        <View style={styles.section}>
          <SectionLabel>Background</SectionLabel>
          <View style={[styles.segmentRow, live.segmentRow]}>
            <SegmentBtn
              label="My photo"
              active={!!bgPhoto}
              onPress={pickGymPhoto}
              icon={<Ionicons name="images-outline" size={15} color={bgPhoto ? t.colors.primary : t.colors.textMuted} />}
            />
            <SegmentBtn
              label="Camera"
              active={false}
              onPress={takeGymPhoto}
              icon={<Ionicons name="camera-outline" size={15} color={t.colors.textMuted} />}
            />
            <SegmentBtn
              label="Dark"
              active={!bgPhoto}
              onPress={() => setBgPhoto(null)}
              icon={<Ionicons name="moon-outline" size={15} color={!bgPhoto ? t.colors.primary : t.colors.textMuted} />}
            />
          </View>
        </View>
        ) : null}

        {/* Preview: the exact image that gets shared, scaled down */}
        <View style={styles.section}>
          <SectionLabel>Preview</SectionLabel>
          <View style={styles.previewOuter}>
            {previewStatus === 'ready' && previewB64 ? (
              <Image
                source={{ uri: `data:image/png;base64,${previewB64}` }}
                style={{ width: previewW, height: previewH, borderRadius: radius.lg }}
                resizeMode="contain"
              />
            ) : previewStatus === 'error' ? (
              <View style={[styles.previewPlaceholder, live.previewPlaceholder, styles.previewErrorBox, { width: previewW, height: previewH }]}>
                <Ionicons name="alert-circle-outline" size={24} color={t.colors.textMuted} />
                <Text style={[styles.previewErrorText, live.previewErrorText]}>Couldn't build the preview.</Text>
                <Button
                  title="Retry"
                  onPress={renderPreview}
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  accessibilityLabel="Retry building the preview"
                />
              </View>
            ) : (
              <View style={[styles.previewPlaceholder, live.previewPlaceholder, { width: previewW, height: previewH }]}>
                <ActivityIndicator color={t.colors.primary} />
              </View>
            )}
          </View>
        </View>

        {/* What to include */}
        <View style={styles.section}>
          {cardType === 'pr' && prs.length > 1 ? (
            <>
              <SectionLabel>Which PR</SectionLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.prPickerRow}
              >
                {prs.map((pr, i) => {
                  const active = i === selectedPrIndex;
                  const name = pr.exerciseName || pr.exercise || 'Exercise';
                  const detail = pr.weight
                    ? `${pr.weight}${pr.units || 'kg'}${pr.reps ? ` × ${pr.reps}` : ''}`
                    : '';
                  return (
                    <TouchableOpacity
                      key={`${name}-${i}`}
                      style={[styles.prChip, live.prChip, active && [styles.prChipActive, live.prChipActive]]}
                      onPress={() => setSelectedPrIndex(i)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Feature ${name}`}
                    >
                      <Text style={[styles.prChipText, live.prChipText, active && [styles.prChipTextActive, live.prChipTextActive]]} numberOfLines={1}>{name}</Text>
                      {detail ? <Text style={[styles.prChipSub, live.prChipSub, active && [styles.prChipSubActive, live.prChipSubActive]]}>{detail}</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          ) : null}
          <SectionLabel>What to include</SectionLabel>
          <View style={[styles.togglesCard, live.togglesCard]}>
            <ToggleRow label="Date" value={showDate} onChange={setShowDate} />
            {isSession && (
              <>
                <ToggleRow label="Plan name" value={showPlanName} onChange={setShowPlanName} />
                <ToggleRow label="Total weight lifted" value={showVolume} onChange={setShowVolume} />
                <ToggleRow label="Exercise names" value={showExercises} onChange={setShowExercises} last />
              </>
            )}
            {cardType === 'pr' && (
              <>
                <ToggleRow label="PR weight" value={showPRWeight} onChange={setShowPRWeight} />
                <ToggleRow label="Previous best" value={showPrevBest} onChange={setShowPrevBest} last />
              </>
            )}
            {isWeekly && !suppress && (
              <>
                <ToggleRow label="Weight progress" value={showProgress} onChange={setShowProgress} />
                {bestLift ? (
                  <ToggleRow label="Best lift of the week" value={showBestLift} onChange={setShowBestLift} last />
                ) : null}
              </>
            )}
          </View>
          <Text style={[styles.privacyNote, live.privacyNote]}>
            {isWeekly
              ? "Only this week's progress, lifts and sessions are shown. Your measurements and private notes are never included."
              : 'Name, bodyweight, measurements and private notes are never included.'}
          </Text>
        </View>

        {/* Share to Story: Instagram + Facebook icons, opens the system share
            sheet with the rendered PNG (founder 2026-06-30: present it as a Story
            share for Instagram/Facebook, but route through the normal share
            screen rather than a direct-composer intent, so no extra dependency or
            Facebook App ID is needed). The user picks Instagram or Facebook from
            the sheet; both let you post the image to a Story. R9/M9 (share-card
            audit 2026-07-27): the visible label standardises on "Share image"
            with every other action button in the family; the Instagram/Facebook
            framing still comes through the icons and the pinned accessibility
            label below, so the 2026-06-30 decision (OS share sheet, not a
            direct-composer intent) is unaffected. */}
        <Button
          title="Share image"
          icon="logo-instagram"
          trailingIcon="logo-facebook"
          onPress={handleShareToStories}
          disabled={sharingToStories || !cardReady}
          loading={sharingToStories}
          accessibilityLabel="Share to Instagram or Facebook Story"
          variant="outline"
          size="lg"
          style={styles.secondaryAction}
        />

        {/* Community entry point 7 (social-discovery blueprint section 1):
            the same moment, a different destination. PR, milestone and
            session only: the weekly recap carries progress content and the
            before/after card is photo content, neither of which enters
            Community (SD-04). The params handed on are the ones this card
            was built from, so the story and the image can never disagree. */}
        {communityKind ? (
          <Button
            title="Post to Community"
            icon="people-outline"
            onPress={() => navigation.navigate('CommunityCompose', communityComposeParams)}
            accessibilityLabel="Post this to Community"
            variant="outline"
            size="lg"
            style={styles.secondaryAction}
          />
        ) : null}

        {/* Save to gallery: writes the rendered card straight to the device
            gallery. Only shown when the media-library package is in the build. */}
        {MediaLibrary ? (
        <Button
          title="Save to gallery"
          icon="download-outline"
          onPress={handleSaveToGallery}
          disabled={savingToGallery || !cardReady}
          loading={savingToGallery}
          accessibilityLabel="Save to gallery"
          variant="outline"
          size="lg"
          style={styles.secondaryAction}
        />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// CP-10 batch G (2026-07-11): sibling function-component scope (not
// prop-drilled `live`/`t` from ShareCardScreen, matching NutritionTargetsScreen's
// MacroCard/WhySection precedent from batch E), own useTheme() call and the
// shared buildLiveStyles(t) (same `styles` block this component reads).
function SegmentBtn({ label, active, onPress, icon }) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  return (
    <TouchableOpacity accessibilityRole="button"
      style={[styles.segment, active && [styles.segmentActive, live.segmentActive]]}
      onPress={onPress}
      // AY-6: the segmented control (card type / format / background) never
      // announced which segment was selected to a screen reader. Mirrors the
      // in-repo pattern already used for the "which PR" chips above
      // (accessibilityState={{ selected }}) and the Settings body-weight-unit
      // segmented control (SettingsWorkoutScreen.js).
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      {icon}
      <Text style={[styles.segmentText, live.segmentText, active && [styles.segmentTextActive, live.segmentTextActive]]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ToggleRow({ label, value, onChange, last }) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  return (
    <View style={[styles.toggleRow, live.toggleRow, last && styles.toggleRowLast]}>
      <Text style={[styles.toggleLabel, live.toggleLabel]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: t.colors.surface2, true: withAlpha(t.colors.primary, alpha.strong) }}
        thumbColor={value ? t.colors.primary : t.colors.textMuted}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  section: { gap: spacing.md },
  // Template strip (Campaign 30 pillar 5): live card thumbnails as the
  // type picker. Tiles are quiet cards; the active tile carries the accent
  // border the segmented control used to express with a fill.
  templateStrip: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  templateTile: {
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface, padding: spacing.xs, gap: spacing.xs,
    alignItems: 'center',
  },
  templateTileActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  templateThumb: { width: 96, height: 96, borderRadius: radius.sm },
  templateThumbEmpty: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  templateLabel: { ...type.caption, color: colors.textMuted },
  templateLabelActive: { color: colors.primary, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },
  formatHint: { ...type.captionTight, color: colors.textMuted },
  segmentRow: {
    flexDirection: 'row', gap: spacing.xs,
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  segment: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.sm,
  },
  segmentActive: { backgroundColor: colors.surface3 },
  segmentText: { fontSize: fontSize.sm, color: colors.textMuted, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },
  segmentTextActive: { color: colors.textPrimary },
  previewOuter: { alignSelf: 'center' },
  previewPlaceholder: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  // EP-17/UI-05: the compact error card shown in place of an endlessly
  // spinning preview when the card can't be rendered.
  previewErrorBox: { gap: spacing.sm, padding: spacing.md },
  previewErrorText: { ...type.bodySm, color: colors.textSecondary, textAlign: 'center' },
  togglesCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  toggleRowLast: { borderBottomWidth: 0 },
  toggleLabel: { fontSize: fontSize.sm, color: colors.textPrimary },
  privacyNote: { ...type.captionTight, color: colors.textMuted },
  // "Which PR" selector chips (shown only when a session set more than one PR).
  prPickerRow: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  prChip: {
    minWidth: 92, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, gap: 2,
  },
  prChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  prChipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },
  prChipTextActive: { color: colors.primary },
  prChipSub: { fontSize: fontSize.xs, color: colors.textMuted },
  prChipSubActive: { color: colors.primary },
  secondaryAction: { marginTop: spacing.md },
});

// CP-10 batch G (2026-07-11): the frozen `styles` block above stays byte-
// identical. This mirrors ONLY the colour/fontSize/type-bearing sub-
// properties of the matching frozen style, at identical rest values, so the
// screen carries no static island under a live theme toggle. Pure layout
// keys (flex/gap/padding/width/overflow, no token) are correctly omitted --
// there is nothing to unfreeze for them. Screen chrome only (this file
// never composes share-card CONTENT, which stays untouched in
// src/lib/shareCard/drawShareCard.js). Same pattern as
// AddCustomFoodScreen.js's buildLiveStyles (batch D).
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    templateTile: { borderColor: t.colors.border, backgroundColor: t.colors.surface },
    templateTileActive: { borderColor: t.colors.primary, backgroundColor: t.colors.primaryBg },
    templateThumbEmpty: { backgroundColor: t.colors.surface2 },
    templateLabel: { ...t.type.caption, color: t.colors.textMuted },
    templateLabelActive: { color: t.colors.primary },
    formatHint: { ...t.type.captionTight, color: t.colors.textMuted },
    segmentRow: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    segmentActive: { backgroundColor: t.colors.surface3 },
    segmentText: { fontSize: t.fontSize.sm, color: t.colors.textMuted },
    segmentTextActive: { color: t.colors.textPrimary },
    previewPlaceholder: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    previewErrorText: { ...t.type.bodySm, color: t.colors.textSecondary },
    togglesCard: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    toggleRow: { borderBottomColor: t.colors.borderSubtle },
    toggleLabel: { fontSize: t.fontSize.sm, color: t.colors.textPrimary },
    privacyNote: { ...t.type.captionTight, color: t.colors.textMuted },
    prChip: { borderColor: t.colors.border, backgroundColor: t.colors.surface },
    prChipActive: { borderColor: t.colors.primary, backgroundColor: t.colors.primaryBg },
    prChipText: { fontSize: t.fontSize.sm, color: t.colors.textSecondary },
    prChipTextActive: { color: t.colors.primary },
    prChipSub: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
    prChipSubActive: { color: t.colors.primary },
  };
}
