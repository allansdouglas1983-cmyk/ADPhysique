import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { appAlert } from '../components/AppAlert';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import BackHeader from '../components/BackHeader';
import Card from '../components/Card';
import { SkeletonCard } from '../components/Skeleton';
import { colors, spacing, radius, fontWeight, type, iconSize, motion, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import { useToast } from '../components/Toast';
import useAppStore from '../store/useAppStore';
import { logError } from '../lib/errorLog';
import { isCalm, WELLBEING_KEY } from '../lib/wellbeing';
import {
  listProgressPhotos, saveProgressPhoto, deleteProgressPhoto, markPhotosOwner,
} from '../lib/progressPhotos';
import { getPhotoMetaMap, deletePhotoMeta, upsertPhotoMeta } from '../lib/progressPhotoMeta';
import {
  addProgressScanAsset,
  createProgressScanSession,
  detachProgressScanPhoto,
  deleteProgressScanSession,
  finishProgressScanSession,
  getProgressScanCalibrationJson,
  listProgressScanEntries,
} from '../lib/progressScanStore';
import { isProgressScanCalibrationExportAllowed } from '../lib/progressScanCalibrationAccess';
import { getUserBodyProfile } from '../lib/database';
import {
  getProgressScanCapturePreferences,
} from '../lib/progressScanPreferences';
import {
  analyseProgressScanPhoto,
  assetFieldsFromVisionResult,
  retakeCopyForVisionResult,
} from '../lib/progressScanVision';
import {
  buildScanPhotoNameSet,
  cleanupRetakenScanPose,
  cleanupUnattachedSavedScanPhoto,
  deleteViewerProgressPhoto,
  deleteViewerProgressPhotoSet,
  findScanForPhotoName,
  buildCheckInCompletenessModel,
  buildProgressScanFinishPayload,
  enrichProgressPhotos,
  isFirstPoseCapture,
  localDayKeyForScanMatch,
  resolveScanForCheckIn,
  scanShareItemsFromEntries,
  shouldGateProgressScanStart,
  visibleCompletedScans,
  visibleScoredScans,
} from '../lib/progressPhotosController';
import {
  buildCheckInTimeline,
  filterAndSort,
} from '../lib/progressPhotoTimeline';
import {
  BASELINE_FIRST_POSE_SENTENCE,
  buildProgressStudioCaptureRoutes,
  buildScanCaptureSubtitle,
  firstPoseRetakeCopy,
} from '../lib/progressCaptureGuide';
import { formatProgressPhotoDay, formatProgressPhotoShortDay } from '../lib/progressPhotoDates';
import { formatBodyWeight } from '../lib/units';
import usePhotoSuppression from '../hooks/usePhotoSuppression';
import ProgressPhotoViewer from '../components/ProgressPhotoViewer';
import ProgressPhotoCompare from '../components/ProgressPhotoCompare';
import ProgressScanCompare from '../components/ProgressScanCompare';
import ProgressScanTrend from '../components/ProgressScanTrend';
import ProgressScanMeaningMoment from '../components/ProgressScanMeaningMoment';
import ProgressGhostCapture from '../components/ProgressGhostCapture';
import BeforeAfterShareSheet from '../components/BeforeAfterShareSheet';
import PhotoDetailsSheet from '../components/PhotoDetailsSheet';
import HintCaption from '../components/HintCaption';
import PhotoDateRangeSheet from '../components/PhotoDateRangeSheet';
import PhotoDatePicker from '../components/PhotoDatePicker';
import InfoTooltip from '../components/InfoTooltip';
import { GLOSSARY } from '../lib/coachGlossary';
import {
  formatVolyumeScore,
  progressScanAssessmentForDisplay,
  progressScanScoreForDisplay,
} from '../lib/progressScanDisplay';
import {
  buildScanReceipt,
  buildScoreTierContract,
  isRecalibratedAssessment,
  RECALIBRATION_NOTE_TEXT,
} from '../lib/progressScanResultsContract';
import {
  getProgressScanMeaningMomentSeen,
  getSeenRecalibrationScanIds,
  markRecalibrationNoteSeen,
  setProgressScanMeaningMomentSeen,
} from '../lib/progressScanPreferences';

// expo-image-picker is a native module; lazy-require so the screen imports in
// the node test env (mirrors ShareCardScreen).
let ImagePicker;
try { ImagePicker = require('expo-image-picker'); } catch (_) { ImagePicker = null; }
let FileSystem;
let Sharing;
try { FileSystem = require('expo-file-system/legacy'); } catch (_) { FileSystem = null; }
try { Sharing = require('expo-sharing'); } catch (_) { Sharing = null; }

// Pose filter chips. 'all' shows every photo; the others narrow to a pose so
// like compares with like (spec §3.3). Function-neutral labels.
const POSES = [
  { key: 'all', label: 'All', a11y: 'Show all photo sets' },
  { key: 'front', label: 'Front', a11y: 'Show front photos' },
  { key: 'back', label: 'Back', a11y: 'Show back photos' },
  { key: 'side', label: 'Side', a11y: 'Show side photos' },
];
const POSE_LABEL = { front: 'Front', side: 'Side', back: 'Back' };
const SCORE_POSES = ['front', 'back'];
const PHOTO_LIBRARY_POSES = ['front', 'back', 'side'];
const BASELINE_HINT_KEY = '@volyume_seen_scan_baseline_receipt';
const PROGRESS_SCAN_MIN_INTERVAL_MS = 7 * 86400000;
const PROGRESS_SCAN_LIBRARY_LIMIT = 100;
const PROGRESS_SCAN_IMAGE_QUALITY = 0.92;

// Timeline sort. Newest-first is the unchanged default; oldest-first lets
// someone read forwards from their first photo. Neutral temporal wording only,
// never "before/after" or any transformation framing (spec PART 2).
const SORTS = [
  { key: 'newest', label: 'Newest', a11y: 'Sort newest first' },
  { key: 'oldest', label: 'Oldest', a11y: 'Sort oldest first' },
];

export { buildCheckInTimeline, filterAndSort, scanShareItemsFromEntries };

export default function ProgressPhotosScreen({ navigation }) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const reduceMotion = useAppStore((s) => s.accessibility?.reduceMotion);
  // CP-10 batch G lane 1 (2026-07-11): live theme (src/hooks/useTheme.js).
  // Memoised: this screen renders a FlashList timeline. renderCheckInCard/
  // renderStudioHeader/renderTimelineEmpty are nested closures (not sibling
  // components), so this single hook call covers every render path below --
  // no per-closure useTheme() needed. Colours only: every ED-safety
  // suppression gate (photoSuppressed, calm, the fail-closed reads below)
  // and every scan/photo write path are untouched.
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  // WAVE-D-FINDINGS.md UNIT_DEFECT (:1263): the check-in card's own weight
  // readout hard-coded 'kg' regardless of the user's chosen body-weight
  // unit, unlike the already-correct sibling BeforeAfterShareSheet.js:148.
  const bodyWeightUnits = useAppStore((s) => s.bodyWeightUnits);
  const userId = useAppStore((s) => s.user?.id);
  const user = useAppStore((s) => s.user);
  const userSex = useAppStore((s) => s.userProfile?.sex ?? null);

  // Shared ED-safety gate (spec §3.2, PART 2). Fail-closed calm-OR-open-ED read
  // that withholds the NEW high-risk surfaces (comparison entry, the share
  // card). Additive to, and never a replacement for, the screen's own raw
  // wellbeing read below (which the wellbeingFailClosed guard pins byte-exact).
  const photoSuppressed = usePhotoSuppression(userId);

  // Owner marker: stamp whose photos these are, so a photos-ownership check
  // can later refuse the gallery to a DIFFERENT account on the same device.
  // Best-effort and idempotent.
  useEffect(() => {
    if (userId) markPhotosOwner(userId);
  }, [userId]);

  const [photos, setPhotos] = useState([]);
  const [metaMap, setMetaMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [, setBusy] = useState(false);
  const [calm, setCalm] = useState(false);
  const suppressed = photoSuppressed || calm;
  const [poseFilter, setPoseFilter] = useState('all');
  // Timeline navigation (neutral, spec PART 2): a newest/oldest sort and an
  // optional date-range filter. Both compose with the pose filter; both are
  // pure viewing of the user's own photos and never touch the suppression,
  // compare/share, or weight rules.
  const [sortOrder, setSortOrder] = useState('newest');
  const [rangeFrom, setRangeFrom] = useState(null);
  const [rangeTo, setRangeTo] = useState(null);
  const [rangeOpen, setRangeOpen] = useState(false);

  // Overlay surfaces (all device-local; rendered as Modals over the timeline).
  const [viewerName, setViewerName] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  // Measured rect of the tapped thumbnail (window coords) for the grid ->
  // viewer hero morph (D31). Null falls the viewer back to its instant/fade
  // open; Reduce Motion also flattens it inside ProgressPhotoViewer.
  const [viewerOrigin, setViewerOrigin] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareInitialName, setCompareInitialName] = useState(null);
  const [scanCompareOpen, setScanCompareOpen] = useState(false);
  const [trendOpen, setTrendOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Wave 3 results contract: the Low-tier "Show score anyway" affordance is
  // per-scan and resets on refresh (a reveal is a viewing choice, never
  // persisted).
  const [revealedLowScoreIds, setRevealedLowScoreIds] = useState(() => new Set());
  // The recalibration note and the meaning moment each render at most once
  // ever (device-local, progressScanPreferences.js). `meaningMomentSeen` is
  // null until the persisted flag is read, so the moment never flashes open
  // before that read resolves.
  const [seenRecalibrationIds, setSeenRecalibrationIds] = useState([]);
  const [meaningMomentSeen, setMeaningMomentSeen] = useState(null);
  // Founder walk (2026-07-13): the baseline "Your starting set is saved..."
  // receipt bloated the day block (date + photos + score). It now renders as
  // one dismissible HintCaption line instead of the receipt block, once ever
  // (null until the persisted flag resolves, so it never flashes). Scored
  // receipts (score + Why?) are unchanged.
  const [baselineHintDismissed, setBaselineHintDismissed] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(BASELINE_HINT_KEY)
      .then((v) => setBaselineHintDismissed(v === 'true'))
      .catch(() => setBaselineHintDismissed(false));
  }, []);
  const dismissBaselineHint = useCallback(() => {
    setBaselineHintDismissed(true);
    AsyncStorage.setItem(BASELINE_HINT_KEY, 'true').catch(() => {});
  }, []);
  const [captureRouteOpen, setCaptureRouteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureReference, setCaptureReference] = useState(null);
  const [capturePose, setCapturePose] = useState(null);
  const [scanFlow, setScanFlow] = useState(null);
  const [scans, setScans] = useState([]);
  const [scanDateOpen, setScanDateOpen] = useState(false);
  const [scanDatePickerOpen, setScanDatePickerOpen] = useState(false);
  const [scanDateMs, setScanDateMs] = useState(Date.now());
  const [scanReview, setScanReview] = useState(null);

  // The "Photo details" step (date + pose) shown after an image is obtained and
  // BEFORE it is finalised. A picked camera/library image carries `pendingUri`
  // (saved on confirm); a guided capture is already saved so it carries
  // `pendingName` instead (confirm only refines its date + pose). `pendingDate`
  // is captured once when the sheet opens so the draft never resets mid-edit.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pendingUri, setPendingUri] = useState(null);
  const [pendingName, setPendingName] = useState(null);
  const [pendingPose, setPendingPose] = useState(null);
  const [pendingDate, setPendingDate] = useState(null);
  // The ghost-overlay reference the viewer's "set as reference" remembers; the
  // next guided capture seeds against it.
  const [referenceName, setReferenceName] = useState(null);
  const refreshRequestRef = useRef(0);
  const captureRouteActionRef = useRef(false);
  const progressScanOpeningRef = useRef(false);
  const scanSaveInFlightRef = useRef(new Set());
  // finishScan re-entrancy guard (progress-photos wave 2): reached from both
  // "Finish without side" and the final continueScanAfterPose pose, so a
  // rapid double-tap on either must produce exactly one session mutation.
  const finishScanInFlightRef = useRef(new Set());

  const refresh = useCallback(async () => {
    const requestId = refreshRequestRef.current + 1;
    refreshRequestRef.current = requestId;
    const isCurrentRefresh = () => refreshRequestRef.current === requestId;
    setLoading(true);
    try {
      // Fail CLOSED: read the raw wellbeing flag rather than getWellbeingMode()
      // (which swallows a storage read error down to 'unspecified'). A genuine
      // read failure must be treated as calm/suppressed.
      const [rows, scanRows, mode] = await Promise.all([
        listProgressPhotos(userId),
        userId ? listProgressScanEntries(userId, PROGRESS_SCAN_LIBRARY_LIMIT).catch(() => []) : Promise.resolve([]),
        AsyncStorage.getItem(WELLBEING_KEY).then(v => v || 'unspecified').catch(() => 'read_failed'),
      ]);
      // Load the per-photo metadata (taken_at, pose) for the dated, pose-typed
      // timeline. Missing rows resolve to filename-derived defaults, so this
      // never requires a row to exist.
      let map = null;
      try {
        map = await getPhotoMetaMap(rows.map((r) => r.name), userId);
      } catch (e) {
        if (isCurrentRefresh()) logError('ProgressPhotos.loadMeta', e, { count: rows.length });
      }
      if (!isCurrentRefresh()) return;
      setPhotos(rows);
      setScans(scanRows || []);
      setCalm(isCalm(mode) || mode === 'read_failed');
      setLoadError(false);
      if (map) setMetaMap(map);
      // A dangling reference must never point at a photo that no longer exists.
      setReferenceName((prev) => (prev && rows.some((r) => r.name === prev) ? prev : null));
    } catch (e) {
      if (isCurrentRefresh()) {
        setLoadError(true);
        logError('ProgressPhotos.refresh', e, { userId });
      }
    }
    finally { if (isCurrentRefresh()) setLoading(false); }
  }, [userId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // Wave 3 one-time-render state: read once on mount, device-local, never
  // blocks the rest of the screen (both reads are best-effort; a failure
  // resolves to the safe "not yet seen" default from progressScanPreferences).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [ids, seenMeaningMoment] = await Promise.all([
        getSeenRecalibrationScanIds(),
        getProgressScanMeaningMomentSeen(),
      ]);
      if (!alive) return;
      setSeenRecalibrationIds(ids);
      setMeaningMomentSeen(seenMeaningMoment);
    })();
    return () => { alive = false; };
  }, []);

  async function pickFrom(source) {
    setScanFlow(null);
    setCapturePose(null);
    if (!ImagePicker) { toast.show("Photo library isn't available on this device.", { variant: 'warning' }); return; }
    setBusy(true);
    try {
      const opts = { mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? 'Images', quality: 0.7 };
      let perm; let result;
      if (source === 'camera') {
        perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm?.granted) { toast.show('Camera permission is needed to take a photo.', { variant: 'warning' }); return; }
        result = await ImagePicker.launchCameraAsync(opts);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(opts);
      }
      if (result?.canceled) return;
      const uri = result?.assets?.[0]?.uri;
      if (!uri) return;
      // Don't finalise yet: collect the date (and pose) first, then save on
      // confirm so the weigh-in snapshot lands on the chosen day.
      openDetailsForNew(uri);
    } catch (_) {
      toast.show('Could not add the photo. Try again.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function pickScanPoseFromLibrary(flow = scanFlow, pose = capturePose) {
    if (!flow?.scanId || !pose) {
      pickFrom('library');
      return;
    }
    if (!ImagePicker) {
      await abandonLapsedScanFlow(flow);
      toast.show("Photo library isn't available on this device.", { variant: 'warning' });
      return;
    }
    setBusy(true);
    let savedPhoto = null;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? 'Images',
        quality: PROGRESS_SCAN_IMAGE_QUALITY,
      });
      if (result?.canceled) {
        await abandonLapsedScanFlow(flow);
        return;
      }
      const uri = result?.assets?.[0]?.uri;
      if (!uri) {
        await abandonLapsedScanFlow(flow);
        return;
      }
      const uid = useAppStore.getState().user?.id ?? userId;
      const saved = await saveProgressPhoto(uri, undefined, uid);
      savedPhoto = saved;
      if (!saved?.name || !saved?.uri) throw new Error('progress_scan_library_save_failed');
      const scanTakenAt = Number.isFinite(flow?.capturedAt) ? flow.capturedAt : (saved.ts ?? Date.now());
      try {
        await upsertPhotoMeta(uid, saved.name, { takenAt: scanTakenAt, pose }, { throwOnError: true });
      } catch (e) {
        await cleanupUnattachedSavedScanPhoto({
          userId: uid,
          name: saved.name,
          saved,
          deleteProgressPhoto,
          deletePhotoMeta,
        });
        throw e;
      }
      setBusy(false);
      setScanReview({
        name: saved.name,
        saved,
        flow,
        pose,
      });
    } catch (e) {
      logError('ProgressPhotos.scanLibraryPose', e, { userId, pose });
      if (flow?.scanId) await abandonLapsedScanFlow(flow, savedPhoto?.name, savedPhoto);
      toast.show('Could not add that photo. Please try again.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // A picked image needs the details step before it is saved (save happens on
  // confirm, dated to the chosen day). Snapshot today as the default date once,
  // so the draft never resets while the sheet is open.
  function openDetailsForNew(uri) {
    setPendingUri(uri);
    setPendingName(null);
    setPendingPose(null);
    setPendingDate(Date.now());
    setDetailsOpen(true);
  }

  // A guided capture has already saved the file (with its pose + today's
  // weigh-in). The details step only refines its date and pose; confirm writes
  // through upsertPhotoMeta, which re-snapshots the weigh-in if the date moved.
  function openDetailsForCaptured(name, pose) {
    setPendingUri(null);
    setPendingName(name);
    setPendingPose(pose ?? null);
    setPendingDate(Date.now());
    setDetailsOpen(true);
  }

  function resetPending() {
    setDetailsOpen(false);
    setPendingUri(null);
    setPendingName(null);
    setPendingPose(null);
    setPendingDate(null);
  }

  async function onDetailsConfirm({ takenAt, pose }) {
    const uid = useAppStore.getState().user?.id;
    setBusy(true);
    let savedPhoto = null;
    const savedFromPendingUri = !!pendingUri;
    // Read BEFORE this save lands, so a photo cannot count itself as its own
    // history (progress-photos wave 2, founder gate F3 baseline framing).
    const isFirstPose = isFirstPoseCapture(enriched, pose);
    try {
      let name = pendingName;
      if (pendingUri) {
        savedPhoto = await saveProgressPhoto(pendingUri, undefined, uid);
        name = savedPhoto?.name || null;
      }
      if (name) {
        // Creates the metadata row and snapshots the weigh-in nearest takenAt
        // (or re-snapshots for a captured photo whose date the user moved).
        // onDetailsConfirm is reached from exactly two routes: the quick
        // camera/library pick (openDetailsForNew -> pendingUri) and a guided
        // single capture (openDetailsForCaptured -> pendingName only, either
        // the non-scan ghost-overlay route or a scan session that broke
        // before it had a valid flow/pose/uri and fell back to a plain
        // single). Neither route can ever produce a scored scan asset (those
        // are written directly by createProgressScanSession/
        // addProgressScanAsset/finishProgressScanSession, never through this
        // sheet), so the permanent unscored fence (founder gate F2, tag
        // route; widened to guided singles per founder decision 2026-07-09)
        // applies unconditionally here: once true it can never be cleared by
        // a later edit.
        await upsertPhotoMeta(uid, name, {
          takenAt,
          pose,
          unscored: true,
        }, { throwOnError: true });
      }
      resetPending();
      await refresh();
      if (isFirstPose) {
        toast.show(`Saved. ${BASELINE_FIRST_POSE_SENTENCE}`, { variant: 'success' });
      }
    } catch (e) {
      if (savedFromPendingUri && savedPhoto?.uri) {
        await cleanupUnattachedSavedScanPhoto({
          userId: uid,
          name: savedPhoto.name,
          saved: savedPhoto,
          deleteProgressPhoto,
          deletePhotoMeta,
        });
      }
      logError('ProgressPhotos.addDetails', e, {});
      toast.show('Could not save those photo details. Please try again.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function onDetailsCancel() {
    // A picked image was never saved, so cancel simply discards it. A guided
    // capture is already on disk with sensible defaults, so refresh keeps it.
    resetPending();
    refresh();
  }

  // Enrich each photo with its effective taken_at (meta, else the filename ts)
  // and pose. A missing meta map resolves to the same values as before.
  const enriched = useMemo(() => enrichProgressPhotos(photos, metaMap), [photos, metaMap]);

  // The current scope: pose filter, then date-range filter, then sort. Defaults
  // (all poses, no range, newest-first) reproduce the previous behaviour exactly.
  const filtered = useMemo(
    () => filterAndSort(enriched, {
      poseFilter, sortOrder, rangeFrom, rangeTo,
    }),
    [enriched, poseFilter, sortOrder, rangeFrom, rangeTo],
  );

  const timeline = useMemo(() => buildCheckInTimeline(filtered), [filtered]);
  const allCheckIns = useMemo(
    () => buildCheckInTimeline(filterAndSort(enriched, { sortOrder: 'newest' }))
      .filter((item) => item.type === 'checkin'),
    [enriched],
  );
  const checkInByPhotoName = useMemo(() => {
    const map = new Map();
    for (const item of allCheckIns) {
      for (const photo of item.photos || []) {
        if (photo?.name) map.set(photo.name, item);
      }
    }
    return map;
  }, [allCheckIns]);
  const latestPartialCapture = useMemo(() => {
    const latest = allCheckIns[0] || null;
    if (!latest) return null;
    const completeness = buildCheckInCompletenessModel(latest);
    if (completeness.complete || !completeness.nextPose) return null;
    return {
      checkIn: latest,
      label: latest.label,
      nextPose: completeness.nextPose,
      nextPoseLabel: completeness.nextPoseLabel,
    };
  }, [allCheckIns]);
  // buildProgressStudioCaptureRoutes's readOnly option is a lib API outside
  // this screen's lane; Volyume is fully free, so it is always false.
  const captureRoutes = useMemo(() => buildProgressStudioCaptureRoutes({
    latestPartial: latestPartialCapture,
    canScan: !!userId,
    readOnly: false,
    includeScan: true,
  }), [latestPartialCapture, userId]);

  const hasRange = Number.isFinite(rangeFrom) || Number.isFinite(rangeTo);
  // Plain label for the date-range pill; "to" reads calmer than a dash and
  // sidesteps the em-dash lint entirely.
  const rangeLabel = hasRange
    ? `${Number.isFinite(rangeFrom) ? formatProgressPhotoShortDay(rangeFrom) : 'Any'} to ${Number.isFinite(rangeTo) ? formatProgressPhotoShortDay(rangeTo) : 'Any'}`
    : 'Any dates';

  function openGhostCapture() {
    setScanFlow(null);
    // Seed the overlay against the remembered reference when set, else the
    // latest photo of the pose in view (or the latest overall). Carry that
    // pose onto the new photo's meta row.
    let ref = referenceName ? enriched.find((p) => p.name === referenceName) : null;
    let seedPose = ref ? ref.pose : (poseFilter !== 'all' ? poseFilter : null);
    if (!ref) {
      const pool = seedPose ? enriched.filter((p) => p.pose === seedPose) : enriched;
      ref = [...(pool.length ? pool : enriched)].sort((a, b) => b.takenAt - a.takenAt)[0] || null;
    }
    setCaptureReference(ref ? {
      uri: ref.uri,
      label: formatProgressPhotoDay(ref.takenAt),
      poseLabel: ref.pose ? POSE_LABEL[ref.pose] : 'Photo',
    } : null);
    setCapturePose(seedPose ?? null);
    setCaptureOpen(true);
  }

  function openScanImportDateStep() {
    if (scanDateOpen || scanDatePickerOpen || scanFlow || progressScanOpeningRef.current) return;
    setScanDateMs(Date.now());
    setScanDatePickerOpen(false);
    setScanDateOpen(true);
  }

  function closeScanImportDateStep() {
    setScanDateOpen(false);
    setScanDatePickerOpen(false);
  }

  async function confirmScanImportDate() {
    const capturedAt = scanDateMs;
    closeScanImportDateStep();
    await openProgressScan('library', { capturedAt });
  }

  async function openProgressScan(mode = 'guided', opts = {}) {
    if (!userId) return;
    const capturedAt = Number.isFinite(opts.capturedAt) ? opts.capturedAt : Date.now();
    const cadence = shouldGateProgressScanStart(scans, capturedAt, PROGRESS_SCAN_MIN_INTERVAL_MS);
    if (cadence.gated && !opts.skipCadence) {
      appAlert('Best about a week apart', 'Volyume reads change best when photo sets are about a week apart. You can still save photos today, and retake sooner if you are fixing photo quality, but the score may be less useful.', [
        { text: 'Save photos anyway', onPress: () => openProgressScan(mode, { ...opts, skipCadence: true }) },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }
    if (progressScanOpeningRef.current) return;
    progressScanOpeningRef.current = true;
    try {
      const capturePrefs = await getProgressScanCapturePreferences();
      const session = await createProgressScanSession(userId, { ...capturePrefs, capturedAt });
      if (!session?.id) throw new Error('No scan session');
      const flow = { scanId: session.id, pose: 'front', mode, capturedAt };
      setScanFlow(flow);
      setCaptureReference(null);
      setCapturePose('front');
      if (mode === 'library') {
        await pickScanPoseFromLibrary(flow, 'front');
      } else {
        setCaptureOpen(true);
      }
    } catch (e) {
      logError('ProgressPhotos.startScan', e, { userId });
      toast.show('Could not start that photo set. Please try again.', { variant: 'error' });
    } finally {
      progressScanOpeningRef.current = false;
    }
  }

  async function abandonLapsedScanFlow(flow, name = null, saved = null) {
    const uid = useAppStore.getState().user?.id ?? userId;
    setCaptureOpen(false);
    setCapturePose(null);
    setScanFlow(null);
    await cleanupUnattachedSavedScanPhoto({
      userId: uid,
      name,
      saved,
      deleteProgressPhoto,
      deletePhotoMeta,
    });
    if (uid && flow?.scanId) await deleteProgressScanSession(uid, flow.scanId, { deleteFiles: true }).catch(() => false);
    await refresh();
  }

  async function finishScan(scanId) {
    if (!userId || !scanId) return;
    // Re-entrancy guard: a second invocation for the same scanId while one is
    // already in flight (rapid double-tap on "Finish without side" or the
    // side-photo continue path) is a no-op, not a second mutation.
    if (finishScanInFlightRef.current.has(scanId)) return;
    finishScanInFlightRef.current.add(scanId);
    try {
      let finished = false;
      try {
        const profile = useAppStore.getState().userProfile || {};
        const bodyProfile = await getUserBodyProfile(userId).catch(() => null);
        await finishProgressScanSession(userId, scanId, buildProgressScanFinishPayload(profile, bodyProfile, userSex));
        finished = true;
      } catch (e) {
        logError('ProgressPhotos.finishScan', e, { userId, scanId });
        toast.show('The photo set was saved, but the Volyume Score could not be created.', { variant: 'warning' });
      }
      try {
        setScans(await listProgressScanEntries(userId, PROGRESS_SCAN_LIBRARY_LIMIT));
      } catch (e) {
        logError('ProgressPhotos.finishScan.refreshScans', e, { userId, scanId, finished });
      }
      try {
        await refresh();
      } catch (e) {
        logError('ProgressPhotos.finishScan.refreshPhotos', e, { userId, scanId, finished });
      }
    } finally {
      finishScanInFlightRef.current.delete(scanId);
    }
  }

  async function continueScanAfterPose(flow, pose, isFirstPose = false) {
    if (pose === 'front') {
      const nextFlow = { ...flow, pose: 'back' };
      setScanFlow(nextFlow);
      setCapturePose('back');
      const frontSavedBody = isFirstPose
        ? `Turn around for the back photo. Use the timer if you need to step into position. ${BASELINE_FIRST_POSE_SENTENCE}`
        : 'Turn around for the back photo. Use the timer if you need to step into position.';
      appAlert('Front saved', frontSavedBody, [
        {
          text: 'Continue',
          onPress: () => {
            if (flow?.mode === 'library') pickScanPoseFromLibrary(nextFlow, 'back');
            else setCaptureOpen(true);
          },
        },
      ], { cancelable: false });
      return;
    }
    if (pose === 'back') {
      const nextFlow = { ...flow, pose: 'side' };
      const continueToSide = () => {
        setScanFlow(nextFlow);
        setCapturePose('side');
        if (flow?.mode === 'library') pickScanPoseFromLibrary(nextFlow, 'side');
        else setCaptureOpen(true);
      };
      const backSavedBody = isFirstPose
        ? `Now add the side photo to complete the set. ${BASELINE_FIRST_POSE_SENTENCE}`
        : 'Now add the side photo to complete the set.';
      appAlert('Back saved', backSavedBody, [
        {
          text: flow?.mode === 'library' ? 'Import side' : 'Take side',
          onPress: continueToSide,
        },
        { text: 'Finish without side', onPress: () => { setScanFlow(null); finishScan(flow.scanId); } },
      ], { cancelable: false });
      return;
    }
    if (isFirstPose) toast.show(`Saved. ${BASELINE_FIRST_POSE_SENTENCE}`, { variant: 'success' });
    setScanFlow(null);
    await finishScan(flow.scanId);
  }

  async function saveScanAssetAndContinue(flow, pose, name, saved, vision, isFirstPose = false) {
    const saveKey = [flow?.scanId, pose, name].filter(Boolean).join(':');
    if (saveKey && scanSaveInFlightRef.current.has(saveKey)) return;
    if (saveKey) scanSaveInFlightRef.current.add(saveKey);
    let committed = false;
    try {
      const assetFields = assetFieldsFromVisionResult(vision);
      const inserted = await addProgressScanAsset(userId, flow.scanId, {
        pose,
        photoName: name,
        uri: saved.uri,
        takenAt: flow?.mode === 'library' && Number.isFinite(flow?.capturedAt) ? flow.capturedAt : (saved.ts ?? Date.now()),
        ...assetFields,
      });
      if (!inserted) {
        await cleanupUnattachedSavedScanPhoto({
          userId,
          name,
          saved,
          deleteProgressPhoto,
          deletePhotoMeta,
        });
        throw new Error('progress_scan_asset_save_failed');
      }
      committed = true;
      await continueScanAfterPose(flow, pose, isFirstPose);
    } finally {
      if (saveKey && !committed) scanSaveInFlightRef.current.delete(saveKey);
    }
  }

  async function retakeScanPose(flow, pose, name, saved) {
    try {
      await cleanupRetakenScanPose({
        userId,
        name,
        saved,
        deleteProgressPhoto,
        deletePhotoMeta,
      });
      const nextFlow = { ...flow, pose };
      setScanFlow(nextFlow);
      setCapturePose(pose);
      if (flow?.mode === 'library') await pickScanPoseFromLibrary(nextFlow, pose);
      else setCaptureOpen(true);
    } catch (e) {
      logError('ProgressPhotos.scanRetakeDelete', e, { userId, pose });
      toast.show('Could not remove that photo. Please try again.', { variant: 'error' });
    }
  }

  async function approveScanReview() {
    const review = scanReview;
    if (!review) return;
    setScanReview(null);
    await onScanCaptured(
      review.name,
      { ...review.saved, previewApproved: true },
      review.flow,
      review.pose,
    );
  }

  async function retakeScanReview() {
    const review = scanReview;
    if (!review) return;
    setScanReview(null);
    await retakeScanPose(review.flow, review.pose, review.name, review.saved);
  }

  async function discardScanDraft(flow = scanFlow) {
    const scanId = flow?.scanId;
    setCapturePose(null);
    if (!userId || !scanId) {
      setScanFlow(null);
      return;
    }
    try {
      const deleted = await deleteProgressScanSession(userId, scanId, { deleteFiles: true });
      if (!deleted) throw new Error('progress_scan_discard_failed');
      setScanFlow(null);
      setScans(await listProgressScanEntries(userId, PROGRESS_SCAN_LIBRARY_LIMIT));
      await refresh();
    } catch (e) {
      logError('ProgressPhotos.discardScan', e, { userId, scanId });
      setScanFlow(flow);
      toast.show('Could not remove that draft photo set. Please try again.', { variant: 'error' });
    }
  }

  async function onScanCaptured(name, saved, flowOverride = null, poseOverride = null) {
    const flow = flowOverride || scanFlow;
    const pose = poseOverride || capturePose;
    setCaptureOpen(false);
    if (!flow?.scanId || !pose || !saved?.uri) {
      openDetailsForCaptured(name, pose);
      return;
    }
    if (!saved?.previewApproved) {
      setScanReview({
        name,
        saved,
        flow,
        pose,
      });
      return;
    }
    // Read BEFORE this pose's asset is saved, so the photo in flight cannot
    // count itself (progress-photos wave 2, founder gate F3 baseline framing;
    // the firmer retake nudge only applies here, where analysis actually runs).
    const isFirstPose = isFirstPoseCapture(enriched, pose);
    try {
      setBusy(true);
      const vision = await analyseProgressScanPhoto({ uri: saved.uri, pose });
      setBusy(false);
      const retakeCopy = retakeCopyForVisionResult(vision);
      if (retakeCopy) {
        appAlert('Retake this photo?', isFirstPose ? firstPoseRetakeCopy(retakeCopy) : retakeCopy, [
          { text: 'Retake', onPress: () => retakeScanPose(flow, pose, name, saved) },
          {
            text: 'Save without score',
            onPress: () => {
              setBusy(true);
              saveScanAssetAndContinue(flow, pose, name, saved, vision, isFirstPose).catch((e) => {
                logError('ProgressPhotos.scanSaveAfterRetakePrompt', e, { userId, pose });
                toast.show('Could not save that photo. Please try again.', { variant: 'error' });
              }).finally(() => {
                setBusy(false);
              });
            },
          },
        ], { cancelable: false });
        return;
      }
      if (saved?.previewApproved) {
        await saveScanAssetAndContinue(flow, pose, name, saved, vision, isFirstPose);
        return;
      }
    } catch (e) {
      logError('ProgressPhotos.scanCaptured', e, { userId, pose });
      toast.show('Could not save that photo. Please try again.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function onAdd() {
    setCaptureRouteOpen(true);
  }

  function openViewer(name, originRect) {
    setViewerOrigin(originRect || null);
    setViewerName(name);
    setViewerOpen(true);
  }

  function openCheckInPoseCapture(item, pose) {
    if (!item?.cover?.uri || !pose) return;
    setScanFlow(null);
    setCaptureReference({
      uri: item.cover.uri,
      label: item.label || formatProgressPhotoDay(item.takenAt),
      poseLabel: item.cover.pose ? POSE_LABEL[item.cover.pose] : 'Current photo set',
    });
    setCapturePose(pose);
    setCaptureOpen(true);
  }

  async function onCaptureRoutePress(route) {
    if (!route || route.disabled || captureRouteActionRef.current) return;
    captureRouteActionRef.current = true;
    setCaptureRouteOpen(false);
    try {
      if (route.key === 'complete_latest') {
        openCheckInPoseCapture(latestPartialCapture?.checkIn, latestPartialCapture?.nextPose);
        return;
      }
      if (route.key === 'scan') {
        await openProgressScan('guided');
        return;
      }
      if (route.key === 'scan_library') {
        openScanImportDateStep();
        return;
      }
      if (route.key === 'guided') {
        openGhostCapture();
        return;
      }
      if (route.key === 'camera') {
        await pickFrom('camera');
        return;
      }
      if (route.key === 'library') {
        await pickFrom('library');
      }
    } finally {
      captureRouteActionRef.current = false;
    }
  }

  const visibleScans = useMemo(
    () => visibleCompletedScans(scans),
    [scans],
  );

  // Real delete wiring: remove the file AND its metadata row, then refresh.
  const onViewerDelete = useCallback(async (name) => {
    const uid = useAppStore.getState().user?.id ?? userId;
    const owningScan = findScanForPhotoName(visibleScans, name);
    let deletingSet = false;
    try {
      if (owningScan?.id) {
        deletingSet = true;
        const deleted = await deleteProgressScanSession(uid, owningScan.id, { deleteFiles: true });
        if (!deleted) throw new Error('progress_scan_delete_failed');
        const setNames = new Set((owningScan.assets || []).map((asset) => asset?.photoName).filter(Boolean));
        setReferenceName((prev) => (setNames.has(prev) ? null : prev));
        setViewerOpen(false);
        setViewerName(null);
        await refresh();
        return;
      }
      const checkIn = checkInByPhotoName.get(name);
      const setNames = (checkIn?.photos || []).map((photo) => photo?.name).filter(Boolean);
      if (setNames.length > 1) {
        deletingSet = true;
        await deleteViewerProgressPhotoSet({
          userId: uid,
          names: setNames,
          photos,
          detachProgressScanPhoto,
          deletePhotoMeta,
          deleteProgressPhoto,
        });
        setReferenceName((prev) => (setNames.includes(prev) ? null : prev));
      } else {
        await deleteViewerProgressPhoto({
          userId: uid,
          name,
          photos,
          detachProgressScanPhoto,
          deletePhotoMeta,
          deleteProgressPhoto,
        });
        setReferenceName((prev) => (prev === name ? null : prev));
      }
    } catch (e) {
      logError('ProgressPhotos.delete', e, { name });
      toast.show(deletingSet
        ? 'Could not delete that photo set. Please try again.'
        : 'Could not delete that photo. Please try again.', { variant: 'error' });
      return;
    }
    setViewerOpen(false);
    await refresh();
  }, [checkInByPhotoName, photos, refresh, toast, userId, visibleScans]);

  const viewerDeleteModeForPhoto = useCallback(
    (name) => {
      if (findScanForPhotoName(visibleScans, name)) return 'scan-set';
      const checkIn = checkInByPhotoName.get(name);
      return (checkIn?.photos || []).length > 1 ? 'photo-set' : 'photo';
    },
    [checkInByPhotoName, visibleScans],
  );

  function openCompare(initialName = null) {
    setCompareInitialName(initialName || null);
    setCompareOpen(true);
  }
  function openScanCompare() { setScanCompareOpen(true); }
  function openTrend() { setTrendOpen(true); }
  function openShare() { setShareOpen(true); }

  // Low-tier "Show score anyway" (results-ui-and-copy-blueprint.md §1): a
  // per-scan viewing toggle, never persisted, never affects the engine's own
  // tier decision.
  function toggleRevealLowScore(scanId) {
    setRevealedLowScoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(scanId)) next.delete(scanId); else next.add(scanId);
      return next;
    });
  }

  // NEW high-risk surfaces are withheld under the shared suppression gate
  // (fail-closed): the comparison entry and the share card. Viewing the dated
  // timeline and delete stay available. Share is additionally Pro-gated.
  const scanPhotoNames = useMemo(() => buildScanPhotoNameSet(visibleScans), [visibleScans]);
  const scanByPhotoName = useMemo(() => {
    const map = new Map();
    for (const scan of visibleScans || []) {
      for (const asset of scan?.assets || []) {
        if (asset?.photoName && !map.has(asset.photoName)) map.set(asset.photoName, scan);
      }
    }
    return map;
  }, [visibleScans]);
  const scanShareItems = scanShareItemsFromEntries(visibleScans);
  const scoredScans = useMemo(() => visibleScoredScans(visibleScans), [visibleScans]);
  // Chronological order for the Why? receipt's setup-drift lines (results-ui-
  // and-copy-blueprint.md §2): the engine's own scanSetupStability compares a
  // scan against the ONE immediately before it, never a more distant one.
  const scansAscending = useMemo(
    () => [...(visibleScans || [])].sort(
      (a, b) => (Number(a?.capturedAt) || 0) - (Number(b?.capturedAt) || 0),
    ),
    [visibleScans],
  );
  function previousScanFor(scan) {
    const idx = scansAscending.findIndex((s) => s.id === scan?.id);
    return idx > 0 ? scansAscending[idx - 1] : null;
  }
  const viewerPhotos = scanPhotoNames.has(viewerName) ? enriched : filtered;
  const canCompareScans = !loading && scoredScans.length >= 2 && !suppressed;
  const canCompare = !loading && photos.length >= 2 && !suppressed;
  const canShare = !loading && (scanShareItems.length >= 2 || photos.length >= 2) && !suppressed;
  const showShareAction = canShare;
  // Trend entry (results-ui-and-copy-blueprint.md §4): withheld under
  // suppression like every other score surface (fail-closed double guard,
  // matching the Compare entry above); the component self-suppresses too.
  const canShowTrend = !loading && visibleScans.length > 0 && !suppressed;

  // Meaning moment (results-ui-and-copy-blueprint.md §1): shown once, before
  // the first time this device ever renders a score. `meaningMomentSeen` is
  // null until the persisted flag is read; the moment is never shown to a
  // suppressed session (nothing score-shaped is on screen to explain yet).
  const meaningMomentOpen = meaningMomentSeen === false && scoredScans.length > 0 && !suppressed;
  function dismissMeaningMoment() {
    setMeaningMomentSeen(true);
    setProgressScanMeaningMomentSeen().catch(() => {});
  }

  // Recalibration note (results-ui-and-copy-blueprint.md §1): renders for the
  // whole of this first encounter (this mount/session), then is persisted as
  // seen so a FUTURE mount never renders it again for that scan id. Marking
  // seen deliberately does not update `seenRecalibrationIds` mid-session: the
  // note must stay put for the remainder of the session the user first saw
  // it in, not vanish a frame after appearing.
  useEffect(() => {
    const unseenMigratedIds = (visibleScans || [])
      .filter((scan) => isRecalibratedAssessment(progressScanAssessmentForDisplay(scan))
        && !seenRecalibrationIds.includes(scan.id))
      .map((scan) => scan.id);
    if (unseenMigratedIds.length === 0) return;
    (async () => {
      for (const id of unseenMigratedIds) await markRecalibrationNoteSeen(id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleScans]);
  const latestScan = useMemo(() => {
    if (!Array.isArray(visibleScans) || visibleScans.length === 0) return null;
    return [...visibleScans].sort((a, b) => (Number(b.capturedAt) || Number(b.captured_at) || 0) - (Number(a.capturedAt) || Number(a.captured_at) || 0))[0] || null;
  }, [visibleScans]);
  const scansByDateKey = useMemo(() => {
    const map = new Map();
    for (const scan of visibleScans || []) {
      const key = localDayKeyForScanMatch(scan?.capturedAt ?? scan?.captured_at);
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(scan);
      map.set(key, list);
    }
    for (const [key, list] of map.entries()) {
      map.set(key, [...list].sort((a, b) => (
        (Number(b?.capturedAt ?? b?.captured_at) || 0) - (Number(a?.capturedAt ?? a?.captured_at) || 0)
      )));
    }
    return map;
  }, [visibleScans]);
  // The set-matching logic itself lives in progressPhotosController.js
  // (resolveScanForCheckIn) so the quick-add fence is unit-testable in
  // isolation; this stays a thin wire-up so every existing call site here is
  // untouched.
  function scanForCheckIn(item) {
    return resolveScanForCheckIn(item, scanByPhotoName, scansByDateKey);
  }
  const canExportCalibration = isProgressScanCalibrationExportAllowed(user);
  const exportLatestScanCalibration = useCallback(async () => {
    if (!canExportCalibration) return;
    if (!userId || !latestScan?.id) {
      toast.show('No completed scan to export yet.', { variant: 'info' });
      return;
    }
    if (!FileSystem?.cacheDirectory || !FileSystem?.writeAsStringAsync) {
      toast.show('Scan signal export is not available on this build.', { variant: 'warning' });
      return;
    }
    try {
      let json = await getProgressScanCalibrationJson(userId, latestScan.id, { sex: userSex ?? undefined });
      if (!json) throw new Error('progress_scan_calibration_export_empty');
      // D83: attach the in-memory model input + mask from the most recent
      // analysis run (founder-gated export only, user-initiated share). Lets
      // a cross-device divergence be diagnosed from the exact on-device
      // pipeline data. Empty if the app restarted since the scan.
      try {
        // eslint-disable-next-line global-require
        const { getLastVisionDebug } = require('../lib/progressScanVision');
        const visionDebug = getLastVisionDebug();
        if (visionDebug && Object.keys(visionDebug).length > 0) {
          const parsed = JSON.parse(json);
          if (Array.isArray(parsed) && parsed[0]) {
            parsed[0].visionDebug = visionDebug;
            json = JSON.stringify(parsed, null, 2);
          }
        }
      } catch (_) { /* export still valid without the debug block */ }
      const capturedAt = Number(latestScan.capturedAt ?? latestScan.captured_at) || Date.now();
      const stamp = new Date(capturedAt).toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
      const fileUri = `${FileSystem.cacheDirectory}volyume_progress_scan_signals_${stamp}.json`;
      await FileSystem.writeAsStringAsync(fileUri, json, {
        encoding: FileSystem.EncodingType?.UTF8 ?? 'utf8',
      });
      if (Sharing?.isAvailableAsync && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Volyume scan signals',
          UTI: 'public.json',
        });
        toast.show('Scan signals exported.', { variant: 'success' });
      } else {
        toast.show('Scan signal file created in app cache.', { variant: 'info' });
      }
    } catch (e) {
      logError('ProgressPhotos.exportScanCalibration', e, { userId, scanId: latestScan?.id });
      toast.show('Could not export scan signals. Please try again.', { variant: 'error' });
    }
  }, [canExportCalibration, latestScan, toast, userId, userSex]);
  function libraryScanSummary(scan) {
    if (!scan) return null;
    const assessment = progressScanAssessmentForDisplay(scan);
    const score = progressScanScoreForDisplay(scan);
    // Tier rendered contract (scoring-accuracy-and-validation-blueprint.md §5):
    // a Low-tier score sits behind a "Show score anyway" affordance; every
    // other tier shows the integer directly, same as before this wave.
    const tierContract = buildScoreTierContract(scan, {
      suppressed,
      revealed: revealedLowScoreIds.has(scan.id),
    });
    const scoreValue = suppressed ? 'Hidden' : (tierContract.requiresRevealAffordance && !tierContract.revealed
      ? 'Show anyway'
      : (score != null ? formatVolyumeScore(score) : 'Not scored'));
    const bandValue = assessment?.leannessBandLabel || (score == null ? 'Not scored' : 'Baseline');
    const signalValue = suppressed
      ? 'Hidden'
      : (assessment?.progressSignalLabel || scan?.deltaExplanation?.trendSummary || (score == null ? 'Not scored' : 'Baseline'));
    const confidenceValue = suppressed ? 'Hidden' : tierContract.chipLabel;
    return [
      {
        label: 'Score',
        value: scoreValue,
        // A score never renders without its tier, and the accessible label
        // always carries both together (results-ui-and-copy-blueprint.md §8).
        interactive: !suppressed && tierContract.requiresRevealAffordance && !tierContract.revealed,
        accessibilityLabel: tierContract.accessibilityLabel,
      },
      { label: 'Leanness', value: bandValue },
      { label: 'Change', value: signalValue },
      { label: 'Confidence', value: confidenceValue },
    ];
  }
  function renderCheckInCard(item) {
    const dateLabel = item.label || formatProgressPhotoDay(item.takenAt);
    const missingPoses = SCORE_POSES.filter((pose) => !item.poses.includes(pose));
    const nextMissingPose = missingPoses[0] || null;
    const hasSide = item.poses.includes('side');
    const scorePoseCount = SCORE_POSES.filter((pose) => item.poses.includes(pose)).length;
    const poseSummary = missingPoses.length === 0
      ? (hasSide ? 'Front, back + side' : 'Front + back')
      : `${scorePoseCount}/${SCORE_POSES.length} scoring photos`;
    // WAVE-D-FINDINGS.md UNIT_DEFECT (:1263): was a hard-coded 'kg' literal
    // regardless of bodyWeightUnits; matches BeforeAfterShareSheet.js:148's
    // already-correct read of the same store field.
    const weightText = Number.isFinite(item.weightKg) ? formatBodyWeight(item.weightKg, bodyWeightUnits) : null;
    const scanForDay = scanForCheckIn(item);
    const scanSummary = libraryScanSummary(scanForDay);
    // Receipts (results-ui-and-copy-blueprint.md §2/§9): one calm sentence +
    // an optional Why? expansion, built from the engine's own reason/setup-
    // finding codes. Withheld entirely under suppression, same as every
    // other score-adjacent surface.
    const receipt = (!suppressed && scanForDay)
      ? buildScanReceipt(scanForDay, { previousScan: previousScanFor(scanForDay) })
      : null;
    const showRecalibrationNote = !suppressed && !!scanForDay
      && isRecalibratedAssessment(progressScanAssessmentForDisplay(scanForDay))
      && !seenRecalibrationIds.includes(scanForDay.id);
    // Check-in value line (integration-plan.md §8): only on the most recent
    // scan's card, only when it is genuinely check-in-eligible (buildScanReceipt's
    // 'scored' outcome already means comparable + high/moderate confidence,
    // never 'scored_downgraded'/'baseline'/'not_comparable'/'withheld' -- see
    // progressScanResultsContract.js buildScanReceipt), Pro-gated (check-ins are
    // a Pro feature; this line must never advertise Pro to a free/read-only
    // viewer) and suppression fail-closed (receipt is already null when
    // suppressed, so this adds the tier + latest-scan checks on top).
    const isLatestScanCard = !!scanForDay && !!latestScan && scanForDay.id === latestScan.id;
    const showCheckInValueLine = isLatestScanCard && receipt?.outcome === 'scored';
    const metaText = [weightText, poseSummary].filter(Boolean).join(' - ');
    const cover = item.cover || item.photos[0];
    // Per-render node holder for the tapped thumbnail so the hero morph grows
    // the viewer from this exact cover's window rect (D31). FlashList recycles
    // cells, so we capture at press time from this render's own closure rather
    // than a shared ref; an unmeasurable handle simply opens with no origin.
    let coverNode = null;
    const openWithMorph = () => {
      if (coverNode && typeof coverNode.measureInWindow === 'function') {
        coverNode.measureInWindow((x, y, width, height) => openViewer(cover.name, { x, y, width, height }));
      } else {
        openViewer(cover.name, null);
      }
    };
    return (
      <TouchableOpacity
        key={item.key}
        onPress={openWithMorph}
        accessibilityRole="button"
        accessibilityLabel={`Photos from ${dateLabel}. Tap to open.`}
        style={[styles.checkInCard, live.checkInCard]}
      >
        <View ref={(n) => { coverNode = n; }} style={[styles.checkInCover, live.checkInCover]}>
          <Image
            source={{ uri: cover.uri }}
            style={styles.checkInCoverImage}
            contentFit="cover"
            // FlashList reuses this cell's underlying view for a DIFFERENT
            // check-in as the user scrolls; without a per-item recyclingKey
            // expo-image can blend from the recycled cell's previous photo
            // into the new one, so a stranger's frame (really: an unrelated
            // earlier photo) would flash for a moment. Keying on the cover
            // photo's own filename tells expo-image this is a logically new
            // image, so a reused cell renders it fresh instead of crossfading.
            recyclingKey={cover.name}
            transition={reduceMotion ? 0 : motion.state}
          />
          <View pointerEvents="none" style={[styles.checkInCoverBadge, live.checkInCoverBadge]}>
            <Ionicons name="images-outline" size={13} color={t.colors.textPrimary} />
            <Text style={[styles.checkInCoverBadgeText, live.checkInCoverBadgeText]}>{item.photos.length}</Text>
          </View>
        </View>
        <View style={styles.checkInBody}>
          <View style={styles.checkInTopRow}>
            <View style={styles.checkInTitleBlock}>
              <Text style={[styles.checkInDate, live.checkInDate]} numberOfLines={1}>{dateLabel}</Text>
              <Text style={[styles.checkInMeta, live.checkInMeta]} numberOfLines={1}>
                {metaText}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
          </View>
          {scanSummary ? (
            <View style={styles.libraryScoreRow}>
              {scanSummary.map((part) => (
                part.interactive ? (
                  <TouchableOpacity
                    key={part.label}
                    style={[styles.libraryScoreCell, live.libraryScoreCell]}
                    onPress={() => toggleRevealLowScore(scanForDay.id)}
                    accessibilityRole="button"
                    accessibilityLabel={part.accessibilityLabel}
                  >
                    <Text style={[styles.libraryScoreLabel, live.libraryScoreLabel]}>{part.label}</Text>
                    <Text style={[styles.libraryScoreValue, live.libraryScoreValue]} numberOfLines={2}>{part.value}</Text>
                  </TouchableOpacity>
                ) : (
                  <View
                    key={part.label}
                    style={[styles.libraryScoreCell, live.libraryScoreCell]}
                    accessible={!!part.accessibilityLabel}
                    accessibilityLabel={part.accessibilityLabel}
                  >
                    <Text style={[styles.libraryScoreLabel, live.libraryScoreLabel]}>{part.label}</Text>
                    <Text style={[styles.libraryScoreValue, live.libraryScoreValue]} numberOfLines={2}>{part.value}</Text>
                  </View>
                )
              ))}
            </View>
          ) : null}
          {receipt && receipt.outcome === 'baseline' ? (
            <>
              {baselineHintDismissed === false ? (
                <HintCaption
                  text={receipt.sentence}
                  onDismiss={dismissBaselineHint}
                />
              ) : null}
              {/* The one-ever recalibration note is independent of the
                  baseline caption swap and must survive it. */}
              {showRecalibrationNote ? (
                <View style={[styles.scanReceiptBlock, live.scanReceiptBlock]}>
                  <Text style={[styles.scanRecalibrationNote, live.scanRecalibrationNote]}>{RECALIBRATION_NOTE_TEXT}</Text>
                </View>
              ) : null}
            </>
          ) : receipt ? (
            <View style={[styles.scanReceiptBlock, live.scanReceiptBlock]}>
              <Text style={[styles.scanReceiptSentence, live.scanReceiptSentence]}>{receipt.sentence}</Text>
              {showRecalibrationNote ? (
                <Text style={[styles.scanRecalibrationNote, live.scanRecalibrationNote]}>{RECALIBRATION_NOTE_TEXT}</Text>
              ) : null}
              {/* The Why? expansion was removed on founder order (2026-07-13):
                  the receipt sentence already carries the primary reason, and
                  the extra box read as clutter on device. buildScanReceipt
                  still produces whyLines for the engine contract; this
                  surface simply no longer renders them. */}
              {showCheckInValueLine ? (
                <Text style={[styles.scanCheckInValueLine, live.scanCheckInValueLine]}>
                  If you check in this week, the coach can use this as context.
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.checkInPoseRow}>
            {PHOTO_LIBRARY_POSES.map((pose) => {
              const complete = item.poses.includes(pose);
              return (
                <View key={pose} style={[styles.checkInPoseChip, live.checkInPoseChip, complete && [styles.checkInPoseChipDone, live.checkInPoseChipDone]]}>
                  <Text style={[styles.checkInPoseText, live.checkInPoseText, complete && [styles.checkInPoseTextDone, live.checkInPoseTextDone]]}>
                    {POSE_LABEL[pose]}
                  </Text>
                </View>
              );
            })}
          </View>
          {item.note ? <Text style={[styles.checkInNote, live.checkInNote]} numberOfLines={2}>{item.note}</Text> : null}
          {missingPoses.length > 0 ? (
            <Text style={[styles.checkInHint, live.checkInHint]} numberOfLines={2}>
              Add {missingPoses.map((pose) => `${POSE_LABEL[pose].toLowerCase()} photo`).join(', ')} for this date to score it.
            </Text>
          ) : !hasSide ? (
            <Text style={[styles.checkInHint, live.checkInHint]} numberOfLines={2}>
              Front and back are saved. Add side next time for a complete set.
            </Text>
          ) : (
            <Text style={[styles.checkInHint, live.checkInHint]} numberOfLines={2}>
              Front, back and side photos are saved together.
            </Text>
          )}
          {nextMissingPose ? (
            <TouchableOpacity
              onPress={() => openCheckInPoseCapture(item, nextMissingPose)}
              style={[styles.completeCheckInButton, live.completeCheckInButton]}
              accessibilityRole="button"
              accessibilityLabel={`Add a ${POSE_LABEL[nextMissingPose]} photo for this date`}
            >
              <Ionicons name="camera-outline" size={iconSize.sm} color={t.colors.textSecondary} />
              <Text style={[styles.completeCheckInText, live.completeCheckInText]}>
                Add {POSE_LABEL[nextMissingPose]} photo
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }

  function renderStudioHeader() {
    return (
      <>
        <Card padding="none" style={styles.studioHero}>
          <View style={[styles.heroTextHeader, live.heroTextHeader]}>
            <View style={styles.heroTitleRow}>
              <View style={[styles.heroIcon, live.heroIcon]}>
                <Ionicons name="images-outline" size={iconSize.md} color={t.colors.primary} />
              </View>
              <View style={styles.heroTitleCopy}>
                <Text style={[styles.heroTextEyebrow, live.heroTextEyebrow]}>Progress photos</Text>
                <Text style={[styles.heroTextTitle, live.heroTextTitle]}>Physique progress</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.heroPrivacyPill, live.heroPrivacyPill]}
              onLongPress={canExportCalibration ? exportLatestScanCalibration : undefined}
              delayLongPress={700}
              activeOpacity={canExportCalibration ? 0.75 : 1}
              accessibilityLabel="Progress photos privacy note"
            >
              <Ionicons name="shield-checkmark-outline" size={iconSize.sm} color={t.colors.textSecondary} />
              <Text style={[styles.heroPrivacyText, live.heroPrivacyText]} numberOfLines={1}>
                Private on this device
              </Text>
            </TouchableOpacity>
            <Text style={[styles.heroTextSubtitle, live.heroTextSubtitle]}>
              Take clear front, back and side photos once a week. Volyume scores the set and saves it to your library.
            </Text>

            <View style={styles.heroActions}>
              <Button
                title="Add photos"
                icon="camera-outline"
                variant="outline"
                size="sm"
                onPress={onAdd}
                fullWidth={false}
                style={styles.heroActionButton}
                accessibilityLabel="Add photos"
              />
              {(canCompareScans || canCompare) ? (
                <Button
                  title="Compare"
                  icon="git-compare-outline"
                  variant="outline"
                  size="sm"
                  onPress={canCompareScans ? openScanCompare : openCompare}
                  fullWidth={false}
                  style={styles.heroActionButton}
                  accessibilityLabel="Compare two photo sets"
                />
              ) : null}
              {canShowTrend ? (
                <Button
                  title="Trend"
                  icon="trending-up-outline"
                  variant="outline"
                  size="sm"
                  onPress={openTrend}
                  fullWidth={false}
                  style={styles.heroActionButton}
                  accessibilityLabel="View score trend"
                />
              ) : null}
            </View>

          </View>
        </Card>

        {loadError && photos.length > 0 ? (
          <Card style={[styles.loadErrorCard, live.loadErrorCard]}>
            <View style={styles.loadErrorTop}>
              <Ionicons name="warning-outline" size={iconSize.sm} color={t.colors.warning} />
              <Text style={[styles.loadErrorTitle, live.loadErrorTitle]}>Couldn't refresh photos</Text>
            </View>
            <Text style={[styles.loadErrorBody, live.loadErrorBody]}>
              Your saved photos are still here. Try again to refresh the library and latest score.
            </Text>
            <Button
              title="Try again"
              size="sm"
              variant="secondary"
              fullWidth={false}
              onPress={refresh}
              style={styles.loadErrorButton}
              accessibilityLabel="Try loading progress photos again"
            />
          </Card>
        ) : null}

        {!loading && photos.length > 0 ? (
          <View style={[styles.libraryControls, live.libraryControls]}>
            <View style={styles.libraryHeader}>
              <Text style={[styles.libraryTitle, live.libraryTitle]}>Photo library</Text>
              {/* O2: persistent "how this works" explanation for the Volyume
                  Score shown on every card below (the one-time meaning moment
                  is never reachable again once dismissed). */}
              <InfoTooltip text={GLOSSARY.volyumeScore} size={13} />
            </View>
            <View
              style={[styles.segmentTrack, live.segmentTrack]}
              accessibilityRole="radiogroup"
              accessibilityLabel="Photo library view"
            >
              {POSES.map((p) => {
                const active = p.key === poseFilter;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[styles.segment, active && [styles.segmentActive, live.segmentActive]]}
                    onPress={() => setPoseFilter(p.key)}
                    hitSlop={8}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={p.a11y}
                  >
                    <Text style={[styles.segmentText, live.segmentText, active && [styles.segmentTextActive, live.segmentTextActive]]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.libraryToolsRow}>
              <View
                style={[styles.segmentTrack, live.segmentTrack, styles.sortTrack]}
                accessibilityRole="radiogroup"
                accessibilityLabel="Photo library sort order"
              >
                {SORTS.map((s) => {
                  const active = s.key === sortOrder;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.segment, styles.sortSegment, active && [styles.segmentActive, live.segmentActive]]}
                      onPress={() => setSortOrder(s.key)}
                      hitSlop={8}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      accessibilityLabel={s.a11y}
                    >
                      <Text style={[styles.segmentText, live.segmentText, active && [styles.segmentTextActive, live.segmentTextActive]]}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.dateGroup}>
                <TouchableOpacity
                  style={[styles.dateButton, live.dateButton, hasRange && [styles.dateButtonActive, live.dateButtonActive]]}
                  onPress={() => setRangeOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={hasRange ? `Filter by date, currently ${rangeLabel}. Tap to change.` : 'Filter by date'}
                >
                  <Ionicons name="calendar-outline" size={iconSize.sm} color={hasRange ? t.colors.textPrimary : t.colors.textMuted} />
                  <Text style={[styles.dateButtonText, live.dateButtonText, hasRange && [styles.dateButtonTextActive, live.dateButtonTextActive]]} numberOfLines={1}>{rangeLabel}</Text>
                </TouchableOpacity>

                {hasRange ? (
                  <TouchableOpacity
                    style={[styles.dateClearButton, live.dateClearButton]}
                    onPress={() => { setRangeFrom(null); setRangeTo(null); }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear the date filter"
                  >
                    <Ionicons name="close-circle" size={iconSize.sm} color={t.colors.textSecondary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {showShareAction ? (
          <View style={styles.actionRow}>
            <Button
              title={scanShareItems.length >= 2 ? 'Share comparison' : 'Share photos'}
              variant="outline"
              size="sm"
              fullWidth={false}
              icon="share-outline"
              style={styles.shareActionButton}
              onPress={openShare}
              accessibilityLabel={scanShareItems.length >= 2 ? 'Share comparison' : 'Share photos'}
            />
          </View>
        ) : null}
      </>
    );
  }

  function renderTimelineEmpty() {
    if (loading) {
      // Content-shaped first load (docs/rules/styling.md "Skeleton vs
      // spinner"): the timeline renders check-in cards, so the placeholder
      // mirrors that shape instead of a bare spinner (audit item 9).
      return (
        <View style={styles.loadingSkeletonList}>
          <SkeletonCard height={132} />
          <SkeletonCard height={132} />
          <SkeletonCard height={132} />
        </View>
      );
    }
    if (loadError && photos.length === 0) {
      return (
        <EmptyState
          icon="warning-outline"
          title="Couldn't load progress photos"
          text="Try again. Volyume has not deleted or changed your photo library."
          actionLabel="Try again"
          onAction={refresh}
          actionAccessibilityLabel="Try loading progress photos again"
        />
      );
    }
    if (photos.length === 0) {
      return (
        <EmptyState
          icon="camera-outline"
          title="No saved photos yet"
          text="Add front, back and side photos to start.\n\nThe scale can't tell muscle from water. Photos can."
        />
      );
    }
    return (
      <EmptyState
        icon="images-outline"
        text={poseFilter !== 'all' && hasRange
          ? 'No photos match this pose and date range.'
          : hasRange
            ? 'No photos in this date range.'
            : 'No photos with this pose yet.'}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top', 'bottom']}>
      {/* Standard pushed-screen scaffold (BackHeader), matching the
          rest of the app. The write actions live in the hero so capture and
          scoring are not duplicated in the header. */}
      <BackHeader
        title="Progress photos"
        onBack={() => navigation.goBack()}
      />

      <FlashList
        style={styles.timelineList}
        data={loading || photos.length === 0 || timeline.length === 0 ? [] : timeline}
        extraData={{
          loading,
          photosCount: photos.length,
          timelineCount: timeline.length,
          poseFilter,
          rangeFrom,
          rangeTo,
          sortOrder,
          suppressed,
        }}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        contentContainerStyle={styles.grid}
        ListHeaderComponent={<View style={styles.listHeaderBleed}>{renderStudioHeader()}</View>}
        ListEmptyComponent={renderTimelineEmpty}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return <Text style={[styles.monthHeader, live.monthHeader]}>{item.label}</Text>;
          }
          return renderCheckInCard(item);
        }}
      />

      {/* Full-size viewer (pose/date/note, weight gated by suppression). Own
          Modal; only mounted while open. */}
      {viewerOpen ? (
        <ProgressPhotoViewer
          photos={viewerPhotos}
          initialName={viewerName}
          originRect={viewerOrigin}
          onClose={() => setViewerOpen(false)}
          onDelete={onViewerDelete}
          deleteModeForPhoto={viewerDeleteModeForPhoto}
          onCompareFrom={(name) => { setViewerOpen(false); openCompare(name); }}
          onSetReference={(name) => setReferenceName(name)}
          hideWeight={false}
        />
      ) : null}

      {/* Volyume Score comparison. This is the scan-specific over-time view:
          dated entries, score/band context, measured deltas, and
          pose-matched photos. It self-suppresses through usePhotoSuppression
          too. */}
      <Modal
        visible={scanCompareOpen}
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setScanCompareOpen(false)}
      >
        <ProgressScanCompare
          scans={scoredScans}
          hideExact={false}
          onClose={() => setScanCompareOpen(false)}
        />
      </Modal>

      {/* Score trend (results-ui-and-copy-blueprint.md §4): comparable scans
          only, gaps shown honestly. Self-suppresses; the entry above is ALSO
          gated, the same double guard as Compare. */}
      <Modal
        visible={trendOpen}
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setTrendOpen(false)}
      >
        <ProgressScanTrend
          scans={visibleScans}
          onClose={() => setTrendOpen(false)}
        />
      </Modal>

      {/* One-time meaning moment (results-ui-and-copy-blueprint.md §1): shown
          before this device's first-ever score render, then never again.
          Blocks nothing else; the timeline behind it keeps working. */}
      <Modal
        visible={meaningMomentOpen}
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => {}}
      >
        <ProgressScanMeaningMoment onDismiss={dismissMeaningMoment} />
      </Modal>

      {/* Comparison. Self-contained selection + three modes; self-suppresses
          under calm/ED. The entry above is ALSO gated, a deliberate double
          guard. */}
      <Modal
        visible={compareOpen}
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => { setCompareOpen(false); setCompareInitialName(null); }}
      >
        <ProgressPhotoCompare
          photos={photos}
          initialName={compareInitialName}
          onClose={() => { setCompareOpen(false); setCompareInitialName(null); }}
        />
      </Modal>

      <Modal
        visible={scanDateOpen}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={closeScanImportDateStep}
      >
        <TouchableOpacity
          style={[styles.scanDateBackdrop, live.scanDateBackdrop]}
          activeOpacity={1}
          onPress={closeScanImportDateStep}
          accessibilityRole="button"
          accessibilityLabel="Close photo set date"
        >
          <View style={[styles.scanDateSheet, live.scanDateSheet]} onStartShouldSetResponder={() => true}>
            <ScrollView
              contentContainerStyle={styles.scanDateContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.scanDateTitle, live.scanDateTitle]}>Date for this photo set</Text>
              <Text style={[styles.scanDateIntro, live.scanDateIntro]}>
                Pick the day these photos were taken. Volyume uses that date for the library entry and the weight shown with the set.
              </Text>
              <TouchableOpacity
                style={[styles.scanDateField, live.scanDateField]}
                onPress={() => setScanDatePickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Change photo set date, currently ${formatProgressPhotoDay(scanDateMs)}`}
              >
                <Ionicons name="calendar-outline" size={iconSize.md} color={t.colors.primary} />
                <Text style={[styles.scanDateValue, live.scanDateValue]} numberOfLines={1} ellipsizeMode="tail">{formatProgressPhotoDay(scanDateMs)}</Text>
                <Ionicons name="chevron-down" size={iconSize.sm} color={t.colors.textMuted} />
              </TouchableOpacity>
              <View style={styles.scanDateActions}>
                <Button
                  title="Cancel"
                  variant="tertiary"
                  size="sm"
                  fullWidth={false}
                  onPress={closeScanImportDateStep}
                  accessibilityLabel="Cancel imported photo set"
                />
                <Button
                  title="Import photos"
                  size="sm"
                  fullWidth={false}
                  onPress={confirmScanImportDate}
                  accessibilityLabel="Import photos for this photo set"
                />
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
        <PhotoDatePicker
          visible={scanDatePickerOpen}
          valueMs={scanDateMs}
          maxMs={Date.now()}
          onChange={setScanDateMs}
          onClose={() => setScanDatePickerOpen(false)}
        />
      </Modal>

      <Modal
        visible={captureRouteOpen}
        transparent
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={() => setCaptureRouteOpen(false)}
      >
        {captureRouteOpen ? (
          <View style={[styles.captureRouteOverlay, live.captureRouteOverlay]}>
            <TouchableOpacity
              style={styles.captureRouteBackdrop}
              activeOpacity={1}
              onPress={() => setCaptureRouteOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close photo set options"
            />
            <SafeAreaView edges={['bottom']} style={styles.captureRouteSafe}>
              <View style={[styles.captureRouteSheet, live.captureRouteSheet]}>
                <View style={[styles.captureRouteHandle, live.captureRouteHandle]} />
                <View style={styles.captureRouteHeader}>
                  <Text style={[styles.captureRouteTitle, live.captureRouteTitle]}>
                    {latestPartialCapture ? 'Add missing angle' : 'Add photos'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setCaptureRouteOpen(false)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Close photo set options"
                  >
                    <Ionicons name="close" size={24} color={t.colors.textPrimary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.captureRouteIntro, live.captureRouteIntro]}>
                  {latestPartialCapture
                    ? `Your latest set is missing the ${latestPartialCapture.nextPoseLabel.toLowerCase()} photo. Add it there, or start a separate set if these photos are from another day.`
                    : 'Add a new set from the camera or your photo library. Use front, back and side photos. Keep the lighting, distance and photo quality the same each time, as differences make changes harder to assess.'}
                </Text>
                <ScrollView
                  style={styles.captureRouteScroll}
                  contentContainerStyle={[
                    styles.captureRouteList,
                    { paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.lg) },
                  ]}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {captureRoutes.map((route) => (
                    <TouchableOpacity
                      key={route.key}
                      style={[styles.captureRouteCard, live.captureRouteCard, route.disabled && styles.captureRouteCardDisabled]}
                      onPress={() => onCaptureRoutePress(route)}
                      disabled={route.disabled}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !!route.disabled }}
                      accessibilityLabel={route.actionLabel}
                    >
                      <View style={[styles.captureRouteIcon, live.captureRouteIcon]}>
                        <Ionicons name={route.icon} size={20} color={route.disabled ? t.colors.textMuted : t.colors.primary} />
                      </View>
                      <View style={styles.captureRouteCopy}>
                        <View style={styles.captureRouteTopLine}>
                          <Text style={[styles.captureRouteEyebrow, live.captureRouteEyebrow]}>{route.eyebrow}</Text>
                          {route.recommended ? (
                            <View style={[styles.captureRoutePill, live.captureRoutePill]}>
                              <Text style={[styles.captureRoutePillText, live.captureRoutePillText]}>{route.recommendationLabel || 'Recommended'}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={[styles.captureRouteName, live.captureRouteName]}>{route.title}</Text>
                        <Text style={[styles.captureRouteBody, live.captureRouteBody]}>{route.disabled ? route.disabledReason : route.body}</Text>
                        {route.steps?.length ? (
                          <View style={[styles.captureRouteSteps, live.captureRouteSteps]}>
                            {route.steps.map((step) => (
                              <View key={step} style={styles.captureRouteStep}>
                                <View style={[styles.captureRouteStepDot, live.captureRouteStepDot]} />
                                <Text style={[styles.captureRouteStepText, live.captureRouteStepText]}>{step}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </SafeAreaView>
          </View>
        ) : null}
      </Modal>

      {/* Guided (ghost-overlay) capture. Falls back to the existing library
          path when the camera is unavailable or declined. */}
      <Modal
        visible={captureOpen}
        animationType={reduceMotion ? 'none' : 'slide'}
        statusBarTranslucent={false}
        navigationBarTranslucent={false}
        onRequestClose={() => { setCaptureOpen(false); if (scanFlow) discardScanDraft(scanFlow); }}
      >
        <ProgressGhostCapture
          referencePhoto={captureReference}
          pose={capturePose}
          title={scanFlow ? (POSE_LABEL[capturePose] || 'Progress photo') : undefined}
          subtitle={scanFlow ? buildScanCaptureSubtitle(capturePose) : undefined}
          onCaptured={(name, saved) => {
            if (scanFlow) onScanCaptured(name, saved);
            else { setCaptureOpen(false); openDetailsForCaptured(name, capturePose); }
          }}
          onClose={() => { setCaptureOpen(false); if (scanFlow) discardScanDraft(scanFlow); }}
          onFallback={() => { setCaptureOpen(false); if (scanFlow) pickScanPoseFromLibrary(scanFlow, capturePose); else pickFrom('library'); }}
        />
      </Modal>

      {/* Before/after share card. Self-gates Pro + suppression; the entry above
          is gated too. */}
      <Modal
        visible={shareOpen}
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={() => setShareOpen(false)}
      >
        <BeforeAfterShareSheet
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          photos={scanShareItems.length >= 2 ? scanShareItems : photos}
          hideScanRange={false}
        />
      </Modal>

      <Modal
        visible={!!scanReview}
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={retakeScanReview}
      >
        <SafeAreaView style={[styles.scanReviewSafe, live.scanReviewSafe]}>
          <View style={[styles.scanReviewHeader, live.scanReviewHeader]}>
            <View style={styles.scanReviewTitleBlock}>
              <Text style={[styles.scanReviewEyebrow, live.scanReviewEyebrow]}>Photo review</Text>
              <Text style={[styles.scanReviewTitle, live.scanReviewTitle]}>
                Check {POSE_LABEL[scanReview?.pose]?.toLowerCase() || 'this'} photo
              </Text>
            </View>
          </View>
          <ScrollView
            style={styles.scanReviewScroll}
            contentContainerStyle={[
              styles.scanReviewContent,
              { paddingBottom: spacing.lg },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.scanReviewImageWrap, live.scanReviewImageWrap]}>
              {scanReview?.saved?.uri ? (
                <Image
                  source={{ uri: scanReview.saved.uri }}
                  style={styles.scanReviewImage}
                  contentFit="contain"
                  transition={reduceMotion ? 0 : motion.state}
                  accessibilityIgnoresInvertColors
                  accessibilityLabel={`${POSE_LABEL[scanReview?.pose] || 'Progress'} photo preview`}
                />
              ) : null}
            </View>
          </ScrollView>
          <View style={[styles.scanReviewFooter, live.scanReviewFooter, { paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.md) }]}>
            <Text style={[styles.scanReviewCopy, live.scanReviewCopy]}>
              Use it if your whole body is visible, the photo is sharp, and the picture is upright.
            </Text>
            <View style={styles.scanReviewActions}>
              <Button
                title="Retake"
                variant="secondary"
                onPress={retakeScanReview}
                fullWidth={false}
                style={styles.scanReviewButton}
              />
              <Button
                title="Use photo"
                onPress={approveScanReview}
                fullWidth={false}
                style={styles.scanReviewButton}
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Photo details (date + pose) shown after an image is obtained and before
          it is finalised. Its own Modal; only mounted while open. */}
      <PhotoDetailsSheet
        visible={detailsOpen}
        initialDateMs={pendingDate}
        initialPose={pendingPose}
        previewUri={pendingUri}
        onConfirm={onDetailsConfirm}
        onCancel={onDetailsCancel}
      />

      {/* Date-range filter for the timeline. Neutral navigation only; its own
          Modal, only mounted while open. */}
      <PhotoDateRangeSheet
        visible={rangeOpen}
        fromMs={rangeFrom}
        toMs={rangeTo}
        onApply={({ fromMs, toMs }) => { setRangeFrom(fromMs); setRangeTo(toMs); setRangeOpen(false); }}
        onCancel={() => setRangeOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scanReviewSafe: { flex: 1, backgroundColor: colors.background },
  scanReviewHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  scanReviewTitleBlock: { gap: spacing.xxs },
  scanReviewEyebrow: { ...type.caption, color: colors.primary },
  scanReviewTitle: { ...type.title, color: colors.textPrimary },
  scanReviewScroll: { flex: 1 },
  scanReviewContent: {
    flexGrow: 1,
    paddingBottom: spacing.lg,
  },
  scanReviewImageWrap: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    minHeight: 220,
    maxHeight: 460,
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.camera,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanReviewImage: { width: '100%', height: '100%' },
  scanReviewFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  scanReviewCopy: { ...type.bodySm, color: colors.textSecondary, lineHeight: 20 },
  scanReviewActions: { flexDirection: 'row', gap: spacing.sm },
  scanReviewButton: { flex: 1 },
  timelineList: { flex: 1 },
  listHeaderBleed: {
    marginHorizontal: -spacing.lg,
  },
  studioHero: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  heroTextHeader: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  heroIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    flexShrink: 0,
  },
  heroTitleCopy: { flex: 1, minWidth: 0 },
  heroTextEyebrow: { ...type.caption, color: colors.primary },
  heroTextTitle: { ...type.title, color: colors.textPrimary },
  heroPrivacyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    maxWidth: '100%',
  },
  heroPrivacyText: { ...type.caption, color: colors.textSecondary, lineHeight: 18, flexShrink: 1 },
  heroTextSubtitle: { ...type.bodySm, color: colors.textSecondary, lineHeight: 20 },
  heroActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  heroActionButton: { flex: 1, minWidth: 0 },
  loadErrorCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
    borderColor: colors.warning,
  },
  loadErrorTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  loadErrorTitle: { ...type.bodyStrong, color: colors.textPrimary },
  loadErrorBody: { ...type.bodySm, color: colors.textSecondary, lineHeight: 20 },
  loadErrorButton: { alignSelf: 'flex-start' },
  libraryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  libraryTitle: { ...type.bodyStrong, color: colors.textPrimary, flex: 1 },
  libraryControls: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  segmentTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    padding: spacing.xxs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.background,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.xs,
  },
  segmentActive: {
    backgroundColor: colors.surfaceElevated,
  },
  segmentText: { ...type.label, color: colors.textMuted },
  segmentTextActive: { color: colors.textPrimary, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },
  libraryToolsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  sortTrack: {
    flex: 1,
    minWidth: 0,
  },
  sortSegment: {
    minHeight: 38,
  },
  dateGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.xs,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.background,
  },
  dateButtonActive: { backgroundColor: colors.surfaceElevated },
  dateButtonText: { ...type.label, color: colors.textMuted, flex: 1, minWidth: 0 },
  dateButtonTextActive: { color: colors.textPrimary, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },
  dateClearButton: {
    width: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.background,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm,
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  shareActionButton: { flex: 1 },
  grid: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  loadingSkeletonList: { gap: spacing.md, paddingTop: spacing.md },
  monthHeader: { ...type.label, color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
  checkInCard: {
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  // Fixed height + flex-start, NOT minHeight: the card row's default
  // alignItems 'stretch' tied the cover to the tallest sibling, so opening
  // the Why? expansion stretched the photo into a tall distorted crop that
  // stuck after collapse (founder device report 2026-07-13). The thumbnail
  // keeps one portrait shape regardless of how tall the text column grows.
  checkInCover: {
    width: 104,
    height: 132,
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  checkInCoverImage: { width: '100%', height: '100%' },
  checkInCoverBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    backgroundColor: colors.scrim,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  checkInCoverBadgeText: { ...type.caption, color: colors.textPrimary },
  checkInBody: { flex: 1, minWidth: 0, gap: spacing.sm, paddingVertical: spacing.xs },
  checkInTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minWidth: 0,
  },
  checkInTitleBlock: { flex: 1, minWidth: 0 },
  checkInDate: { ...type.label, color: colors.textPrimary, flexShrink: 1 },
  checkInMeta: { ...type.caption, color: colors.textMuted, marginTop: spacing.xxs, flexShrink: 1 },
  libraryScoreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  libraryScoreCell: {
    // Two-column wrapping grid. The `flex` shorthand here would set flexBasis:0,
    // which inside a flexWrap row makes Yoga measure the row's height as a SINGLE
    // line, so the wrapped second row (Change/Confidence) overflowed the row's
    // reported height and the callout below it rendered overlapping the cells. An
    // explicit non-zero flexBasis makes the row measure both lines correctly;
    // flexGrow still lets the two cells on a line fill the width.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '47%',
    minWidth: 96,
    minHeight: 54,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
    gap: 2,
  },
  libraryScoreLabel: { ...type.caption, color: colors.textMuted },
  // Equal visual weight with the Score cell (results-ui-and-copy-blueprint.md
  // §1): every cell in this grid, including Confidence, shares this exact
  // style token, so the confidence chip is never demoted relative to the
  // score integer.
  libraryScoreValue: { ...type.label, color: colors.textPrimary, lineHeight: 18 },
  scanReceiptBlock: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  scanReceiptSentence: { ...type.bodySm, color: colors.textSecondary, lineHeight: 20 },
  scanRecalibrationNote: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  scanCheckInValueLine: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  checkInPoseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  checkInPoseChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    backgroundColor: colors.surface2,
  },
  checkInPoseChipDone: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  checkInPoseText: { ...type.caption, color: colors.textMuted },
  checkInPoseTextDone: { color: colors.primary },
  checkInNote: { ...type.bodySm, color: colors.textSecondary },
  checkInHint: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  completeCheckInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  completeCheckInText: { ...type.label, color: colors.textPrimary },
  captureRouteOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
  },
  captureRouteBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  // The height cap lives HERE, not on the sheet: this is the direct child of
  // the flex:1 overlay, so the percentage actually resolves. On the sheet
  // (whose parent is auto-height) Yoga could not resolve '76%', the sheet
  // grew past the screen and the top of the option list was cut off
  // (founder device report 2026-07-13).
  captureRouteSafe: {
    justifyContent: 'flex-end',
    paddingBottom: spacing.lg,
    maxHeight: '76%',
  },
  captureRouteSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
    flexShrink: 1,
    minHeight: 0,
  },
  captureRouteHandle: {
    width: 36,
    height: 4,
    borderRadius: radius.hair,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  captureRouteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  captureRouteTitle: { ...type.title, color: colors.textPrimary, flex: 1 },
  captureRouteIntro: { ...type.bodySm, color: colors.textMuted, lineHeight: 20 },
  captureRouteScroll: { flexShrink: 1, minHeight: 0 },
  captureRouteList: { gap: spacing.sm, paddingBottom: spacing.xl },
  captureRouteCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  captureRouteCardDisabled: { opacity: 0.55 },
  captureRouteIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryBg,
  },
  captureRouteCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  captureRouteTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  captureRouteEyebrow: {
    ...type.caption,
    color: colors.primary,
  },
  captureRoutePill: {
    borderRadius: radius.full,
    backgroundColor: colors.primaryBg,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  captureRoutePillText: { ...type.caption, color: colors.primary },
  captureRouteName: { ...type.label, color: colors.textPrimary },
  captureRouteBody: { ...type.captionTight, color: colors.textSecondary },
  captureRouteSteps: {
    gap: spacing.xxs,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  captureRouteStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  captureRouteStepDot: {
    width: 5,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.primaryFill,
    marginTop: 7,
    flexShrink: 0,
  },
  captureRouteStepText: { ...type.caption, color: colors.textSecondary, lineHeight: 18, flex: 1 },
  scanDateBackdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  scanDateSheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '86%',
    backgroundColor: colors.surfaceElevated ?? colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  scanDateContent: { gap: spacing.md },
  scanDateTitle: { ...type.bodyStrong, color: colors.textPrimary },
  scanDateIntro: { ...type.bodySm, color: colors.textSecondary, lineHeight: 20 },
  scanDateField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  scanDateValue: { ...type.bodyStrong, color: colors.textPrimary, flex: 1 },
  scanDateActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});

// CP-10 batch G lane 1 (2026-07-11): the frozen `styles` block above stays
// byte-identical. This mirrors ONLY the colour/type-bearing sub-properties
// of the matching frozen style, at identical rest values, so the screen
// carries no static island under a live theme toggle. Pure layout keys
// (flex/padding/gap/margin/borderRadius/borderWidth/width/height, no token)
// and fontWeight (not part of useTheme()'s shape) are correctly omitted.
// Every ED-safety suppression gate (photoSuppressed/calm, fail-closed on a
// read error), the scan-scoring pipeline and every write path are
// untouched -- colours only.
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    scanReviewSafe: { backgroundColor: t.colors.background },
    scanReviewHeader: { borderBottomColor: t.colors.border },
    scanReviewEyebrow: { ...t.type.caption, color: t.colors.primary },
    scanReviewTitle: { ...t.type.title, color: t.colors.textPrimary },
    scanReviewImageWrap: { backgroundColor: t.colors.camera },
    scanReviewFooter: { borderTopColor: t.colors.border, backgroundColor: t.colors.background },
    scanReviewCopy: { ...t.type.bodySm, color: t.colors.textSecondary },
    heroTextHeader: { backgroundColor: t.colors.surface },
    heroIcon: { backgroundColor: t.colors.surface2, borderColor: t.colors.borderSubtle },
    heroTextEyebrow: { ...t.type.caption, color: t.colors.primary },
    heroTextTitle: { ...t.type.title, color: t.colors.textPrimary },
    heroPrivacyPill: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    heroPrivacyText: { ...t.type.caption, color: t.colors.textSecondary },
    heroTextSubtitle: { ...t.type.bodySm, color: t.colors.textSecondary },
    loadErrorCard: { borderColor: t.colors.warning },
    loadErrorTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    loadErrorBody: { ...t.type.bodySm, color: t.colors.textSecondary },
    libraryTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    libraryControls: { borderColor: t.colors.borderSubtle, backgroundColor: t.colors.surface },
    segmentTrack: { borderColor: t.colors.borderSubtle, backgroundColor: t.colors.background },
    segmentActive: { backgroundColor: t.colors.surfaceElevated },
    segmentText: { ...t.type.label, color: t.colors.textMuted },
    segmentTextActive: { color: t.colors.textPrimary },
    dateButton: { borderColor: t.colors.borderSubtle, backgroundColor: t.colors.background },
    dateButtonActive: { backgroundColor: t.colors.surfaceElevated },
    dateButtonText: { ...t.type.label, color: t.colors.textMuted },
    dateButtonTextActive: { color: t.colors.textPrimary },
    dateClearButton: { borderColor: t.colors.borderSubtle, backgroundColor: t.colors.background },
    monthHeader: { ...t.type.label, color: t.colors.textMuted },
    checkInCard: { borderColor: t.colors.border, backgroundColor: t.colors.surface },
    checkInCover: { backgroundColor: t.colors.surface2 },
    checkInCoverBadge: { backgroundColor: t.colors.scrim },
    checkInCoverBadgeText: { ...t.type.caption, color: t.colors.textPrimary },
    checkInDate: { ...t.type.label, color: t.colors.textPrimary },
    checkInMeta: { ...t.type.caption, color: t.colors.textMuted },
    libraryScoreCell: { backgroundColor: t.colors.surface2 },
    libraryScoreLabel: { ...t.type.caption, color: t.colors.textMuted },
    libraryScoreValue: { ...t.type.label, color: t.colors.textPrimary },
    scanReceiptBlock: { backgroundColor: t.colors.surface2 },
    scanReceiptSentence: { ...t.type.bodySm, color: t.colors.textSecondary },
    scanRecalibrationNote: { ...t.type.caption, color: t.colors.textMuted },
    scanCheckInValueLine: { ...t.type.caption, color: t.colors.textMuted },
    checkInPoseChip: { borderColor: t.colors.border, backgroundColor: t.colors.surface2 },
    checkInPoseChipDone: { borderColor: t.colors.primary, backgroundColor: t.colors.primaryBg },
    checkInPoseText: { ...t.type.caption, color: t.colors.textMuted },
    checkInPoseTextDone: { color: t.colors.primary },
    checkInNote: { ...t.type.bodySm, color: t.colors.textSecondary },
    checkInHint: { ...t.type.caption, color: t.colors.textMuted },
    completeCheckInButton: { borderColor: t.colors.border, backgroundColor: t.colors.surface2 },
    completeCheckInText: { ...t.type.label, color: t.colors.textPrimary },
    captureRouteOverlay: { backgroundColor: t.colors.scrim },
    captureRouteSheet: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    captureRouteHandle: { backgroundColor: t.colors.border },
    captureRouteTitle: { ...t.type.title, color: t.colors.textPrimary },
    captureRouteIntro: { ...t.type.bodySm, color: t.colors.textMuted },
    captureRouteCard: { borderColor: t.colors.borderSubtle, backgroundColor: t.colors.surface },
    captureRouteIcon: { backgroundColor: t.colors.primaryBg },
    captureRouteEyebrow: { ...t.type.caption, color: t.colors.primary },
    captureRoutePill: { backgroundColor: t.colors.primaryBg },
    captureRoutePillText: { ...t.type.caption, color: t.colors.primary },
    captureRouteName: { ...t.type.label, color: t.colors.textPrimary },
    captureRouteBody: { ...t.type.captionTight, color: t.colors.textSecondary },
    captureRouteSteps: { borderTopColor: t.colors.border },
    captureRouteStepDot: { backgroundColor: t.colors.primaryFill },
    captureRouteStepText: { ...t.type.caption, color: t.colors.textSecondary },
    scanDateBackdrop: { backgroundColor: t.colors.scrim },
    scanDateSheet: { backgroundColor: t.colors.surfaceElevated ?? t.colors.surface, borderColor: t.colors.border },
    scanDateTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    scanDateIntro: { ...t.type.bodySm, color: t.colors.textSecondary },
    scanDateField: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    scanDateValue: { ...t.type.bodyStrong, color: t.colors.textPrimary },
  };
}

