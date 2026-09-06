/**
 * BeforeAfterShareSheet — the founder-approved two-photo progress share card
 * (progress-photos §3.8, S1 execution, S2 single-file mechanism).
 *
 * Picks two progress photos (default earliest vs latest), shows a one-time
 * confirm, then composites BOTH photos + their dates + optional weights + the
 * elapsed badge + the wordmark into ONE image via the existing Skia `drawShareCard`
 * pipeline and shares it as a SINGLE local file through `expo-sharing`
 * (`MediaLibrary` for save). Every surface and platform produces the same one
 * composited PNG — never a multi-attach, never a raw file (S2 §1).
 *
 * SAFETY (fail-closed, ahead of everything):
 *   - WITHHELD ENTIRELY when usePhotoSuppression() is true (open ED-pattern flag
 *     OR calm mode). The suppression check sits BEFORE compose/encode/share, so
 *     a suppressed user never reaches the two-photo export at all (§3.8, PART 2).
 *     The whole card is withheld, not merely weight-stripped.
 *   - Weight-on-card is a FOUNDER-APPROVED override of the locked "share cards
 *     never include bodyweight" rule (DECISIONS #2). It is an explicit opt-in
 *     toggle per export and is bounded by the suppression withhold above;
 *     name/measurements/private notes stay banned. The integrator records the
 *     decision and updates the locked-rule note + the screen's privacy line.
 *
 * The share is OFFERED, never pushed: no nag, no urgency, no streak, calm voice.
 */
import {
  useState, useEffect, useMemo, useCallback, useRef,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, Platform,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontSize, fontWeight, spacing, radius, withAlpha, alpha, type, motion, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import { useToast } from './Toast';
import { appAlert } from './AppAlert';
import Button from './Button';
import ModalHeader from './ModalHeader';
import SectionLabel from './SectionLabel';
import useAppStore from '../store/useAppStore';
import usePhotoSuppression from '../hooks/usePhotoSuppression';
import InfoTooltip from './InfoTooltip';
import { getPhotoMetaMap, upsertPhotoMeta } from '../lib/progressPhotoMeta';
import { logError } from '../lib/errorLog';
import { drawShareCard, cardHeight } from '../lib/shareCard/drawShareCard';
import { loadWordmarkImage } from '../lib/shareCard/wordmarkImage';
import {
  buildBeforeAfterParams,
  defaultPair,
  finiteNumber,
  formatCardDate,
  formatShareScanRange,
  orderPair,
} from '../lib/shareCard/beforeAfterParams';

export {
  buildBeforeAfterParams,
  defaultPair,
  elapsedLabel,
  formatCardDate,
  formatShareScanRange,
  orderPair,
} from '../lib/shareCard/beforeAfterParams';

// Optional native modules, guarded so the sheet still mounts (tests, or before a
// rebuild) without them; generation just can't run until a real build provides
// Skia + the sharing packages (mirrors ShareCardScreen).
let FileSystem; let Sharing; let Skia; let matchFont; let MediaLibrary;
try { FileSystem = require('expo-file-system/legacy'); } catch (_) { /* optional */ }
try { Sharing = require('expo-sharing'); } catch (_) { /* optional */ }
try { MediaLibrary = require('expo-media-library'); } catch (_) { /* optional */ }
try { const S = require('@shopify/react-native-skia'); Skia = S.Skia; matchFont = S.matchFont; } catch (_) { /* optional */ }

const WORDMARK = require('../../assets/volyume-wordmark.png');
const FONT_FAMILY = Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'sans-serif' });
const PREVIEW_RENDER_W = 640; // render crisp, display scaled down
const PREVIEW_DISPLAY_W = 300;
// One-time confirm flag: once the user has acknowledged that this makes a
// shareable image of their photos, we don't ask again.
const CONFIRM_KEY = 'progressShareConfirmed';

// ── pure helpers (exported for unit tests) ───────────────────────────────────

// Decode one photo file into an SkImage, or null. Bounded: the decoded image is
// only held for the render pass and drawn into the fixed 1080 design space.
async function decodePhoto(uri) {
  if (!Skia || !FileSystem || !uri) return null;
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(b64));
    return img || null;
  } catch (e) {
    logError('ProgressCard.decode', e, {});
    return null;
  }
}

// ── component ────────────────────────────────────────────────────────────────

/**
 * @param {boolean}  props.visible  whether the sheet is shown
 * @param {Function} props.onClose  called to dismiss the sheet
 * @param {Array}    props.photos   the device's progress photos, each
 *                                  `{ name, uri, ts }` (as from
 *                                  listProgressPhotos); the sheet defaults the
 *                                  pair to earliest vs latest and lets the user
 *                                  swap either.
 */
export default function BeforeAfterShareSheet({
  visible, onClose, photos = [], hideScanRange = false,
}) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  const toast = useToast();
  const suppressed = usePhotoSuppression();
  const userId = useAppStore((s) => s.user?.id);
  const bodyWeightUnits = useAppStore((s) => s.bodyWeightUnits) || 'kg';
  const reduceMotion = useAppStore((s) => s.accessibility?.reduceMotion);
  // EP-11/UI-03: hooks must run unconditionally (this component early-returns
  // null below), so the window width is read here alongside the other
  // top-level hooks rather than next to where it's used near the render.
  const { width: windowWidth } = useWindowDimensions();

  const sorted = useMemo(
    () => (Array.isArray(photos) ? photos : [])
      .filter((p) => p && p.name && Number.isFinite(p.ts))
      .sort((a, b) => a.ts - b.ts),
    [photos],
  );
  const usingScans = sorted.some((p) => p?.scan);

  const [selected, setSelected] = useState([]); // photo names, resolved older→newer by ts
  const [aspect, setAspect] = useState('square');
  const [showWeight, setShowWeight] = useState(false);
  const [metaMap, setMetaMap] = useState({});
  const [beforeImg, setBeforeImg] = useState(null);
  const [afterImg, setAfterImg] = useState(null);
  // EP-17/UI-05 (Codex end-user-polish audit): whether the pair of photos is
  // still being decoded. `beforeImg`/`afterImg` are null both while decoding
  // AND after a permanent decode failure (a deleted/corrupt photo), so this
  // flag is what lets the preview effect below tell "still working" apart
  // from "failed", instead of spinning forever on a real failure.
  const [decodingPhotos, setDecodingPhotos] = useState(false);
  // A manual bump forces the decode effect to re-run on Retry, even when
  // `older`/`newer` haven't changed (a transient read failure can succeed on
  // a second attempt with the exact same pair).
  const [decodeRetryToken, setDecodeRetryToken] = useState(0);
  const [wordmark, setWordmark] = useState(null);
  const [previewB64, setPreviewB64] = useState(null);
  // Explicit idle/loading/ready/error states: previously `previewB64 ===
  // null` meant "nothing to show yet" whether that was because no pair was
  // chosen, the photos were still decoding, or the card genuinely failed to
  // build (missing Skia/typeface, a decode failure, or a surface/encode
  // fault) -- so a real failure spun the ActivityIndicator forever.
  const [previewStatus, setPreviewStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [sharing, setSharing] = useState(false);
  const [savingToGallery, setSavingToGallery] = useState(false);

  const active = visible && !suppressed;

  // Default the pair to earliest vs latest each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setSelected(defaultPair(sorted));
  }, [visible, sorted]);

  // The chosen pair, ordered older→newer.
  const items = selected
    .map((name) => sorted.find((p) => p.name === name))
    .filter(Boolean);
  const [older, newer] = items.length === 2
    ? orderPair(items[0], items[1])
    : [items[0] || null, null];
  const pairReady = !!(older && newer);

  // System typefaces for the Skia renderer.
  const typefaces = useMemo(() => {
    if (!Skia || !matchFont) return null;
    try {
      // These 'bold'/'normal' are Skia matchFont() OS-typeface descriptors, not
      // RN style tokens, so the fontWeight-literal design guard does not apply
      // (matches ShareCardScreen's identical typeface lookup).
      // eslint-disable-next-line no-restricted-syntax
      const bold = matchFont({ fontFamily: FONT_FAMILY, fontWeight: 'bold' }).getTypeface();
      // eslint-disable-next-line no-restricted-syntax
      const regular = matchFont({ fontFamily: FONT_FAMILY, fontWeight: 'normal' }).getTypeface();
      return (bold && regular) ? { bold, regular } : null;
    } catch (_) { return null; }
  }, []);

  // Load the wordmark once as an SkImage for the footer.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // VOLYUME-2X: this carried the same release-broken loader the share
      // screen did (expo-file-system cannot read a bundled asset's resource
      // name). One shared, scheme-proof loader now serves both.
      const img = await loadWordmarkImage(Skia, WORDMARK);
      if (!cancelled && img) setWordmark(img);
    })();
    return () => { cancelled = true; };
  }, []);

  // Batch metadata (takenAt + weight snapshot) for the chosen pair. When a
  // chosen photo has no snapshotted weigh-in (added before the metadata layer
  // existed), lazily backfill it ONCE so the card can show its weight: guarded
  // to weightKg missing (never overwrites an existing snapshot), best-effort,
  // and it never blocks the preview/render path.
  const backfilledRef = useRef(new Set());
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const names = [older, newer].filter(Boolean).map((p) => p.name);
    if (names.length === 0) { setMetaMap({}); return undefined; }
    getPhotoMetaMap(names, userId).then((m) => {
      if (!alive) return;
      const map = m || {};
      setMetaMap(map);
      if (!userId) return;
      for (const name of names) {
        const meta = map[name];
        if (!meta || meta.weightKg != null) continue;
        if (backfilledRef.current.has(name)) continue;
        backfilledRef.current.add(name);
        upsertPhotoMeta(userId, name, { takenAt: meta.takenAt })
          .then((updated) => { if (alive && updated) setMetaMap((prev) => ({ ...prev, [name]: updated })); })
          .catch(() => {});
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [active, older, newer, userId]);

  // Decode the two chosen photos into SkImages (bounded: one pair at a time).
  useEffect(() => {
    if (!active || !pairReady) { setBeforeImg(null); setAfterImg(null); setDecodingPhotos(false); return undefined; }
    let alive = true;
    setDecodingPhotos(true);
    (async () => {
      const [bi, ai] = await Promise.all([decodePhoto(older.uri), decodePhoto(newer.uri)]);
      if (!alive) return;
      setBeforeImg(bi);
      setAfterImg(ai);
      setDecodingPhotos(false);
    })();
    return () => { alive = false; };
  }, [active, pairReady, older, newer, decodeRetryToken]);

  // EP-17/UI-05: re-attempt the decode for the SAME chosen pair (a transient
  // read failure can succeed on a second try); a genuinely deleted/corrupt
  // photo will fail again and the error card stays up.
  const retryDecode = useCallback(() => setDecodeRetryToken((n) => n + 1), []);

  const buildParams = useCallback(() => {
    const om = (older && metaMap[older.name]) || {};
    const nm = (newer && metaMap[newer.name]) || {};
    const olderScan = older?.scan || null;
    const newerScan = newer?.scan || null;
    const olderTakenAt = finiteNumber(olderScan?.capturedAt) ?? (Number.isFinite(om.takenAt) ? om.takenAt : (older && older.ts));
    const newerTakenAt = finiteNumber(newerScan?.capturedAt) ?? (Number.isFinite(nm.takenAt) ? nm.takenAt : (newer && newer.ts));
    const olderWeightKg = finiteNumber(olderScan?.stats?.weightKg) ?? om.weightKg;
    const newerWeightKg = finiteNumber(newerScan?.stats?.weightKg) ?? nm.weightKg;
    return buildBeforeAfterParams({
      olderTakenAt,
      newerTakenAt,
      olderWeightKg,
      newerWeightKg,
      olderScan,
      newerScan,
      showWeight,
      showScanRange: !hideScanRange,
      showScanWeight: !hideScanRange,
      aspect,
      bodyWeightUnits,
    });
  }, [older, newer, metaMap, showWeight, hideScanRange, aspect, bodyWeightUnits]);

  // ONE renderer for preview + export. Returns a base64 PNG, or null if the
  // card can't be generated (missing Skia/typefaces/images, or a surface fail).
  const renderCardBase64 = useCallback((width) => {
    if (!Skia || !typefaces || !beforeImg || !afterImg) return null;
    const params = buildParams();
    const H = cardHeight(width, params.isSquare, params.aspect);
    const surface = Skia.Surface.MakeOffscreen(width, H);
    if (!surface) return null;
    drawShareCard(surface.getCanvas(), {
      Skia, width, params, typefaces, wordmark, photos: { before: beforeImg, after: afterImg },
    });
    surface.flush();
    const image = surface.makeImageSnapshot();
    return image ? image.encodeToBase64() : null;
  }, [typefaces, wordmark, beforeImg, afterImg, buildParams]);

  // Live preview: re-render whenever anything that changes the card changes.
  // EP-17/UI-05: distinguishes idle (nothing chosen yet) / loading (photos
  // still decoding, or the render hasn't been attempted) / ready / error, so
  // a genuine failure (missing Skia/typeface, a decode failure on a
  // deleted/corrupt photo, or a surface/encode fault) never looks identical
  // to "still working" and spins the ActivityIndicator forever.
  useEffect(() => {
    if (!active || !pairReady) { setPreviewB64(null); setPreviewStatus('idle'); return; }
    if (decodingPhotos) { setPreviewB64(null); setPreviewStatus('loading'); return; }
    if (!beforeImg || !afterImg) {
      // A permanent decode failure (a photo that no longer opens).
      setPreviewB64(null);
      setPreviewStatus('error');
      return;
    }
    const b64 = renderCardBase64(PREVIEW_RENDER_W);
    if (b64) {
      setPreviewB64(b64);
      setPreviewStatus('ready');
    } else {
      setPreviewB64(null);
      setPreviewStatus('error');
    }
  }, [active, pairReady, decodingPhotos, beforeImg, afterImg, renderCardBase64]);

  // Render the export-resolution PNG to a cache file; the single-file artefact
  // every share/save uses (S2 single-file contract). Null if it can't generate.
  const renderCardToFile = useCallback(async () => {
    const b64 = renderCardBase64(1080);
    if (!b64) return null;
    // R11/L4 (share-card audit 2026-07-27): a fixed filename meant a second
    // export in the same session (e.g. toggling the weight switch, then
    // sharing again) overwrote the first file in the cache dir. The timestamp
    // makes every export its own file.
    const filename = `volyume-progress-${aspect}-${Date.now()}.png`;
    const uri = (FileSystem.cacheDirectory || '') + filename;
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  }, [renderCardBase64, aspect]);

  // One-time confirm ("You're creating a shareable image of your photos"); runs
  // `next` once acknowledged. Fails safe: an unreadable flag shows the confirm.
  const ensureConfirmed = useCallback(async (next) => {
    let confirmed = false;
    try { confirmed = (await AsyncStorage.getItem(CONFIRM_KEY)) === '1'; } catch (_) { confirmed = false; }
    if (confirmed) { next(); return; }
    appAlert(
      'Create an image to share',
      "You're making an image from your photos. It stays on your device until you choose to share or save it.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            try { await AsyncStorage.setItem(CONFIRM_KEY, '1'); } catch (_) { /* best-effort */ }
            next();
          },
        },
      ],
    );
  }, []);

  // Guarded generation: validate BOTH images are present before compositing,
  // and calm-abort (never open the share sheet) otherwise.
  const withGeneratedFile = useCallback(async (consume) => {
    if (suppressed) return;
    if (!Skia || !FileSystem || !typefaces) {
      // P-16: a missing native module reads as "this device can't do this",
      // never as "you're on an incomplete build".
      toast.show("Progress image sharing isn't available on your device.", { variant: 'error', duration: 5000 });
      return;
    }
    if (!pairReady) { toast.show('Choose two photos first', { variant: 'info' }); return; }
    if (!beforeImg || !afterImg) {
      // S2 guard 1: a deleted/corrupt/unreadable photo must not composite a
      // blank cell or throw into the share sheet.
      toast.show("That photo couldn't be opened. Try another.", { variant: 'error' });
      return;
    }
    let uri = null;
    try {
      uri = await renderCardToFile();
    } catch (e) {
      logError('ProgressCard.export', e, { aspect });
    }
    if (!uri) { toast.show("Couldn't generate the image, try again", { variant: 'error' }); return; }
    await consume(uri);
  }, [suppressed, typefaces, pairReady, beforeImg, afterImg, renderCardToFile, aspect, toast]);

  const onShare = useCallback(() => {
    ensureConfirmed(() => withGeneratedFile(async (uri) => {
      setSharing(true);
      try {
        if (!Sharing) { toast.show("Sharing isn't available on your device.", { variant: 'error', duration: 5000 }); return; }
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) { toast.show('Sharing is not available on this device', { variant: 'warning', duration: 5000 }); return; }
        // ONE composited file, never a multi-attach (S2 §1).
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share progress image' });
      } catch (_e) {
        toast.show("Couldn't open the share sheet, try again", { variant: 'error' });
      } finally {
        setSharing(false);
      }
    }));
  }, [ensureConfirmed, withGeneratedFile, toast]);

  const onSaveToGallery = useCallback(() => {
    ensureConfirmed(() => withGeneratedFile(async (uri) => {
      if (!MediaLibrary) { toast.show("Saving to your gallery isn't available on your device.", { variant: 'error', duration: 5000 }); return; }
      setSavingToGallery(true);
      try {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted) { toast.show("Gallery access is needed to save. You can still share it.", { variant: 'warning', duration: 5000 }); return; }
        await MediaLibrary.saveToLibraryAsync(uri);
        toast.show('Saved to your gallery', { variant: 'success' });
      } catch (_e) {
        toast.show("Couldn't save the image, try again", { variant: 'error' });
      } finally {
        setSavingToGallery(false);
      }
    }));
  }, [ensureConfirmed, withGeneratedFile, toast]);

  // Selection: tapping a chosen photo unchooses it; with two chosen, a tap on a
  // third replaces the earliest choice (matches the compare view's semantics).
  function toggleSelect(item) {
    setSelected((prev) => {
      if (prev.includes(item.name)) return prev.filter((n) => n !== item.name);
      if (prev.length < 2) return [...prev, item.name];
      return [prev[1], item.name];
    });
  }

  // WITHHELD ENTIRELY under suppression, and rendered only for Pro. The
  // suppression gate sits ahead of every compose/encode/share path above.
  if (!visible || suppressed) return null;

  const isSquare = aspect !== 'story';
  // EP-11/UI-03: the preview used to hard-code a 300dp width inside the
  // sheet's 16dp horizontal padding, overflowing a 320dp-wide phone (300 +
  // 2*16 = 332dp > 320dp available). Cap at the design width but never
  // exceed what this sheet's own padding leaves available; height is
  // derived from THAT width so the card's aspect ratio is preserved.
  const previewW = Math.min(PREVIEW_DISPLAY_W, windowWidth - 2 * spacing.lg);
  const previewH = cardHeight(previewW, isSquare, aspect);
  const busy = sharing || savingToGallery;

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top', 'bottom']}>
      <ModalHeader title="Private share image" onClose={onClose} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.subtitle, live.subtitle]}>One composed image. No raw photo files. You choose share or save.</Text>

        <View style={[styles.privacyReceipt, live.privacyReceipt]}>
          <View style={styles.receiptRow}>
            <Ionicons name="image-outline" size={16} color={t.colors.primary} />
            <Text style={[styles.receiptText, live.receiptText]}>Exports one composed PNG, not your raw photos.</Text>
          </View>
          <View style={styles.receiptRow}>
            <Ionicons name="lock-closed-outline" size={16} color={t.colors.primary} />
            <Text style={[styles.receiptText, live.receiptText]}>Nothing leaves the device until you tap Share or Save.</Text>
          </View>
          <View style={styles.receiptRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color={t.colors.primary} />
            <Text style={[styles.receiptText, live.receiptText]}>Names, notes, measurements and your photo library never appear.</Text>
          </View>
        </View>

        {/* Choose two photos (default earliest and latest). Older reads on the
            left, newer on the right, whatever the tap order was. */}
        <View style={styles.section}>
          <SectionLabel>{usingScans ? 'Choose Scans' : 'Choose Photos'}</SectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripRow}>
            {sorted.map((item) => {
              const on = selected.includes(item.name);
              const range = item.scan && !hideScanRange ? formatShareScanRange(item.scan) : '';
              return (
                <TouchableOpacity
                  key={item.name}
                  onPress={() => toggleSelect(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${usingScans ? 'Scan' : 'Photo'} from ${formatCardDate(item.ts)}${on ? ', chosen' : ''}`}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={[styles.thumb, live.thumb, on && [styles.thumbOn, live.thumbOn]]}
                    contentFit="cover"
                    recyclingKey={item.name}
                    transition={reduceMotion ? 0 : motion.state}
                  />
                  {on ? (
                    <View pointerEvents="none" style={[styles.thumbCheck, live.thumbCheck]}>
                      <Ionicons name="checkmark-circle" size={20} color={t.colors.primary} />
                    </View>
                  ) : null}
                  {range ? <Text style={[styles.thumbRange, live.thumbRange]} numberOfLines={1}>{range}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={[styles.hint, live.hint]}>
            {pairReady
              ? `Ready with two ${usingScans ? 'scans' : 'photos'}.`
              : `Choose two ${usingScans ? 'scans' : 'photos'} for the image.`}
          </Text>
        </View>

        {/* Format presets: square 1:1 (default), portrait 4:5, story 9:16. */}
        <View style={styles.section}>
          <SectionLabel>Format</SectionLabel>
          <View style={[styles.segmentRow, live.segmentRow]}>
            <SegmentBtn label="Square" active={aspect === 'square'} onPress={() => setAspect('square')} icon="square-outline" />
            <SegmentBtn label="Portrait" active={aspect === 'portrait'} onPress={() => setAspect('portrait')} icon="crop-outline" />
            <SegmentBtn label="Story" active={aspect === 'story'} onPress={() => setAspect('story')} icon="phone-portrait-outline" />
          </View>
        </View>

        {/* Preview: the exact image that gets shared, scaled down. */}
        <View style={styles.section}>
          <SectionLabel>Preview</SectionLabel>
          <View style={styles.previewOuter}>
            {previewStatus === 'ready' && previewB64 ? (
              <Image
                source={{ uri: `data:image/png;base64,${previewB64}` }}
                style={{ width: previewW, height: previewH, borderRadius: radius.lg }}
                contentFit="contain"
                transition={reduceMotion ? 0 : motion.state}
              />
            ) : previewStatus === 'error' ? (
              // EP-17/UI-05: a permanent failure (a deleted/corrupt photo
              // that won't decode, or a render/encode fault) gets a compact
              // error card with Retry, never an endless spinner.
              <View style={[styles.previewPlaceholder, live.previewPlaceholder, styles.previewErrorBox, { width: previewW, height: previewH }]}>
                <Ionicons name="alert-circle-outline" size={24} color={t.colors.textMuted} />
                <Text style={[styles.previewErrorText, live.previewErrorText]}>
                  Couldn't build the preview. Try again, or choose a different photo above.
                </Text>
                <Button
                  title="Retry"
                  onPress={retryDecode}
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  accessibilityLabel="Retry building the preview"
                />
              </View>
            ) : (
              <View style={[styles.previewPlaceholder, live.previewPlaceholder, { width: previewW, height: previewH }]}>
                {previewStatus === 'loading' ? <ActivityIndicator color={t.colors.primary} /> : <Text style={[styles.hint, live.hint]}>Choose two photos</Text>}
              </View>
            )}
          </View>
        </View>

        {/* Weight toggle: explicit opt-in per export, bounded by the suppression
            withhold above. */}
        <View style={styles.section}>
          <View style={[styles.togglesCard, live.togglesCard]}>
            <View style={[styles.toggleRow, live.toggleRow, styles.toggleRowLast]}>
              <Text style={[styles.toggleLabel, live.toggleLabel]}>Include weight on this export</Text>
              <Switch
                value={showWeight}
                onValueChange={setShowWeight}
                trackColor={{ false: t.colors.surface2, true: withAlpha(t.colors.primary, alpha.strong) }}
                thumbColor={showWeight ? t.colors.primary : t.colors.textMuted}
              />
            </View>
          </View>
          <View style={[styles.exportReceipt, live.exportReceipt]}>
            <View style={styles.exportReceiptCol}>
              <Text style={[styles.exportReceiptTitle, live.exportReceiptTitle]}>Included</Text>
              <Text style={[styles.exportReceiptLine, live.exportReceiptLine]}>Two selected photos</Text>
              <Text style={[styles.exportReceiptLine, live.exportReceiptLine]}>Dates and elapsed time</Text>
              {usingScans && !hideScanRange ? (
                // O36 (comprehension/trust audit 2026-08-06): the receipt
                // line named the score with no explanation of what it means
                // or where it comes from.
                <View style={styles.exportReceiptLineRow}>
                  <Text style={[styles.exportReceiptLine, live.exportReceiptLine]}>Visible Volyume Score</Text>
                  <InfoTooltip text="The progress score from your scans, shown on the export itself." size={12} />
                </View>
              ) : null}
              <Text style={[styles.exportReceiptLine, live.exportReceiptLine]}>Weight: {showWeight ? 'included' : 'off'}</Text>
            </View>
            <View style={styles.exportReceiptCol}>
              <Text style={[styles.exportReceiptTitle, live.exportReceiptTitle]}>Kept private</Text>
              <Text style={[styles.exportReceiptLine, live.exportReceiptLine]}>Raw photo files</Text>
              <Text style={[styles.exportReceiptLine, live.exportReceiptLine]}>Name, notes and measurements</Text>
              <Text style={[styles.exportReceiptLine, live.exportReceiptLine]}>Your photo library</Text>
            </View>
          </View>
          <Text style={[styles.privacyNote, live.privacyNote]}>
            The exported file is a single composed image. It includes only the two photos, dates, optional Volyume Score, weights only if you switch them on, and elapsed time. Your name, measurements and private notes are never included.
          </Text>
        </View>

        <Button
          title="Share image"
          icon="share-outline"
          onPress={onShare}
          disabled={busy || !pairReady}
          loading={sharing}
          accessibilityLabel="Share progress image"
          size="lg"
        />

        {MediaLibrary ? (
          <Button
            // R9/M9 (share-card audit 2026-07-27): action buttons standardise
            // on "Share image" / "Save to gallery" across the share family.
            title="Save to gallery"
            icon="download-outline"
            onPress={onSaveToGallery}
            disabled={busy || !pairReady}
            loading={savingToGallery}
            accessibilityLabel="Save progress image to gallery"
            variant="outline"
            size="lg"
            style={styles.galleryBtn}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SegmentBtn({ label, active, onPress, icon }) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  return (
    <TouchableOpacity
      style={[styles.segment, active && [styles.segmentActive, live.segmentActive]]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={15} color={active ? t.colors.primary : t.colors.textMuted} />
      <Text style={[styles.segmentText, live.segmentText, active && [styles.segmentTextActive, live.segmentTextActive]]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  subtitle: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  privacyReceipt: {
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  receiptText: { ...type.caption, color: colors.textPrimary, lineHeight: 18, flex: 1 },
  section: { gap: spacing.md },
  stripRow: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  thumb: {
    width: 72, height: 72, borderRadius: radius.md,
    borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.surface,
  },
  thumbOn: { borderColor: colors.primary },
  thumbCheck: {
    position: 'absolute', top: spacing.xxs, right: spacing.xxs,
    backgroundColor: colors.background, borderRadius: radius.full,
  },
  thumbRange: {
    width: 72,
    marginTop: spacing.xxs,
    ...type.captionTight,
    color: colors.textMuted,
    textAlign: 'center',
  },
  hint: { ...type.bodySm, color: colors.textMuted },
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
  // spinning preview when the two-photo card can't be built.
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
  exportReceipt: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  exportReceiptCol: { flexGrow: 1, flexBasis: '48%', minWidth: 136, gap: spacing.xxs },
  exportReceiptTitle: { ...type.caption, color: colors.primary },
  exportReceiptLine: { ...type.captionTight, color: colors.textPrimary, lineHeight: 17 },
  // O36: the one receipt line that carries an InfoTooltip (Visible Volyume
  // Score) needs a row wrapper; every other line stays a plain Text.
  exportReceiptLineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  privacyNote: { ...type.captionTight, color: colors.textMuted },
  galleryBtn: { marginTop: spacing.md },
});

// CP-10 stage 4 (theming, Skia/chart consumers, 2026-07-10): buildLiveStyles
// is the shared "frozen base + live override" map for this file's two
// function-component scopes (BeforeAfterShareSheet, SegmentBtn) -- each
// calls `const t = useTheme(); const live = useMemo(() => buildLiveStyles(t),
// [t]);` and appends `live.KEY` after `styles.KEY` in every style array,
// same pattern as WorkoutSummaryScreen.js's buildLiveStyles. This covers
// ONLY the sheet's own UI chrome (the visible RN controls: header, receipt
// cards, thumbnails, toggle, preview frame). The Skia `drawShareCard`
// composite pipeline this sheet drives (renderCardBase64/buildParams, both
// above) is explicitly OUT OF SCOPE per CP-10 plan section 2.2 -- the
// exported card renders in the brand's fixed dark palette regardless of the
// in-app theme (export/screenshot consistency), so none of its params are
// touched here. Every key below mirrors only the colour/fontSize sub-
// properties of the matching frozen style, at identical rest values;
// fontWeight is theme-invariant (not part of useTheme()'s returned `t`), so
// segmentText's/toggleLabel's fontWeight stays the static import, untouched.
// `content`, `receiptRow`, `section`, `stripRow`, `previewOuter`,
// `exportReceiptCol`, `galleryBtn` have no colour/fontSize
// tokens at all, so they stay untouched with no `live.*` entry. The header
// chrome itself is the shared ModalHeader component now (D1 sweep), not a
// local style pair.
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    subtitle: { ...t.type.caption, color: t.colors.textMuted },
    privacyReceipt: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    receiptText: { ...t.type.caption, color: t.colors.textPrimary },
    thumb: { backgroundColor: t.colors.surface },
    thumbOn: { borderColor: t.colors.primary },
    thumbCheck: { backgroundColor: t.colors.background },
    thumbRange: { ...t.type.captionTight, color: t.colors.textMuted },
    hint: { ...t.type.bodySm, color: t.colors.textMuted },
    segmentRow: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    segmentActive: { backgroundColor: t.colors.surface3 },
    segmentText: { fontSize: t.fontSize.sm, color: t.colors.textMuted },
    segmentTextActive: { color: t.colors.textPrimary },
    previewPlaceholder: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    previewErrorText: { ...t.type.bodySm, color: t.colors.textSecondary },
    togglesCard: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    toggleRow: { borderBottomColor: t.colors.borderSubtle },
    toggleLabel: { fontSize: t.fontSize.sm, color: t.colors.textPrimary },
    exportReceipt: { borderColor: t.colors.border, backgroundColor: t.colors.surface },
    exportReceiptTitle: { ...t.type.caption, color: t.colors.primary },
    exportReceiptLine: { ...t.type.captionTight, color: t.colors.textPrimary },
    privacyNote: { ...t.type.captionTight, color: t.colors.textMuted },
  };
}
