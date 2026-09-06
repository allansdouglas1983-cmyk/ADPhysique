-- migrate_160_community.sql
--
-- Purpose:           The complete Community cloud schema (Social / Community /
--                    Discovery campaign, authority
--                    docs/social-discovery-2026-09-06/30-BLUEPRINT.md section 3;
--                    rulings SD-04, SD-05, SD-09, SD-11, SD-14 in
--                    40-DECISIONS.md). Community is Volyume's first
--                    cross-user surface and its first user-generated content:
--                    chosen profiles (handle, display name, avatar preset, bio,
--                    up to three training styles, goal, setting, area and gym
--                    labels), follows with requests, blocks, mutes, shared
--                    programme snapshots (structure only, never load), training
--                    stories (PR / session / block / milestone / programme),
--                    reactions, comments, an activity inbox, reports, a
--                    moderator queue and an audit log.
--
--                    SD-14 is the security shape of this whole file: every
--                    community_* table has RLS ENABLED with NO policy for
--                    anon or authenticated, and ALL privileges are REVOKEd
--                    from both roles. There is therefore no direct PostgREST
--                    ingress or egress at all. The ONLY way in or out is the
--                    SECURITY DEFINER RPCs below, each pinned to
--                    `search_path = public, pg_temp`, each revoked from PUBLIC
--                    and anon and granted to `authenticated` only, and each
--                    applying visibility, block, minor, status and rate rules
--                    in one place. Helper functions prefixed `_community_` are
--                    internal: they are revoked from PUBLIC, anon AND
--                    authenticated and are reachable only from the definer
--                    bodies above them.
--
--                    Push:  none. Community is online-first (SD-13): no local
--                           SQLite table, no sync registry entry, no
--                           watermark. `src/lib/community/transport.js` calls
--                           these RPCs directly under the same three gates as
--                           the sync layer (sign-out wiping, Article 9
--                           consent, live session).
--                    Pull:  none, for the same reason. The client caches only
--                           the last hub payload and the caller's own profile
--                           card in AsyncStorage.
--
-- Applied locally:   N/A - no local table. Nothing in `src/lib/database.js`
--                    changes; `PRAGMA user_version` is untouched.
--
-- Applied remotely:  NO - WRITTEN, NOT APPLIED. This file waits for the
--                    founder's exact phrase "run against production" for the
--                    batch that contains it (supabase/README.md status block,
--                    CLAUDE.md section 2 "Database schema"). Nothing here has
--                    reached EU-Dublin.
--
-- Safe to re-run:    YES. CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
--                    EXISTS, CREATE INDEX IF NOT EXISTS, every named CHECK
--                    added inside a `do $$ ... exception when duplicate_object
--                    then null; end $$;` block, CREATE OR REPLACE FUNCTION
--                    throughout, DROP TRIGGER IF EXISTS before every CREATE
--                    TRIGGER, and INSERT ... ON CONFLICT DO NOTHING for the
--                    moderator seed. Re-running changes nothing.
--
-- Rollback:          drop table if exists public.community_moderation_log,
--                      public.community_reports, public.community_activity,
--                      public.community_rate_events, public.community_comments,
--                      public.community_reactions, public.community_posts,
--                      public.community_programme_uses,
--                      public.community_programmes, public.community_mutes,
--                      public.community_blocks, public.community_follows,
--                      public.community_profiles, public.community_moderators
--                      cascade;
--                    drop function if exists every public.community_* and
--                      public._community_* function created below;
--                    re-apply migrate_154 to restore delete_user_data();
--                    re-narrow the consent_log and notification_preferences
--                    CHECKs to their pre-160 lists (both re-added by name
--                    below, so the previous list is a one-line edit).
--                    Nothing existing is dropped or rewritten by this file, so
--                    a rollback loses only Community itself.
--
-- GDPR note:         This creates a NEW user data category: voluntary,
--                    user-authored public content (Article 6(1)(a) consent,
--                    recorded on the existing consent_log rail as
--                    `community_visibility` with notice_version =
--                    COMMUNITY_RULES_VERSION). It carries NO Article 9 health
--                    data: bodyweight, body composition, Progress Scan,
--                    nutrition, injuries and limitations, coaching output,
--                    check-ins, progress photos, first name, date of birth,
--                    email, height and age are rejected server-side by
--                    _community_forbidden_keys() on every payload, and none of
--                    them is a column here. Date of birth is READ (the
--                    caller's own row only) to derive a single boolean,
--                    `is_minor`, which is stored instead of the date. All rows
--                    live in EU-Dublin like every other table. Erasure:
--                    delete_user_data() is re-issued in full below covering
--                    every community_* table, with two-sided deletes for
--                    follows, blocks, mutes and activity, and
--                    community_moderation_log.moderator_id set to NULL rather
--                    than deleted so the moderation audit trail survives
--                    without naming a deleted person. Leaving Community
--                    (community_leave) is a separate, narrower erasure that
--                    appends a granted=false consent row first.
--
-- Transaction:       no explicit BEGIN/COMMIT; the runner supplies one.

-- ─── Part 1: tables ──────────────────────────────────────────────────────
--
-- Every table is created WITHOUT a policy on purpose (SD-14). RLS is enabled
-- so that even a future accidental GRANT cannot expose rows, and the grants
-- are revoked so PostgREST refuses the request before RLS is consulted.

CREATE TABLE IF NOT EXISTS public.community_profiles (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle            text NOT NULL UNIQUE,
  display_name      text NOT NULL,
  avatar_preset     text,
  bio               text,
  styles            text[] NOT NULL DEFAULT '{}',
  goal              text,
  setting           text,
  area_label        text,
  area_key          text,
  gym_label         text,
  gym_key           text,
  visibility        text NOT NULL DEFAULT 'public',
  is_minor          boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'active',
  rules_version     int NOT NULL DEFAULT 1,
  follower_count    int NOT NULL DEFAULT 0,
  following_count   int NOT NULL DEFAULT 0,
  handle_changed_at timestamptz,
  last_active_at    timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ADD COLUMN IF NOT EXISTS for every column, so a partially-created table from
-- an interrupted run converges to the full shape on the next run.
ALTER TABLE public.community_profiles
  ADD COLUMN IF NOT EXISTS avatar_preset     text,
  ADD COLUMN IF NOT EXISTS bio               text,
  ADD COLUMN IF NOT EXISTS styles            text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS goal              text,
  ADD COLUMN IF NOT EXISTS setting           text,
  ADD COLUMN IF NOT EXISTS area_label        text,
  ADD COLUMN IF NOT EXISTS area_key          text,
  ADD COLUMN IF NOT EXISTS gym_label         text,
  ADD COLUMN IF NOT EXISTS gym_key           text,
  ADD COLUMN IF NOT EXISTS handle_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_active_at    timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.community_profiles
    ADD CONSTRAINT community_profiles_visibility_check
    CHECK (visibility IN ('public', 'followers'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.community_profiles
    ADD CONSTRAINT community_profiles_status_check
    CHECK (status IN ('active', 'restricted', 'suspended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS community_profiles_discoverable_idx
  ON public.community_profiles (visibility, status, is_minor, last_active_at DESC);
CREATE INDEX IF NOT EXISTS community_profiles_area_key_idx
  ON public.community_profiles (area_key) WHERE area_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS community_profiles_gym_key_idx
  ON public.community_profiles (gym_key) WHERE gym_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS community_profiles_styles_idx
  ON public.community_profiles USING gin (styles);

CREATE TABLE IF NOT EXISTS public.community_follows (
  follower_id uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  state       text NOT NULL DEFAULT 'accepted',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id)
);

DO $$ BEGIN
  ALTER TABLE public.community_follows
    ADD CONSTRAINT community_follows_state_check
    CHECK (state IN ('requested', 'accepted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.community_follows
    ADD CONSTRAINT community_follows_not_self_check
    CHECK (follower_id <> followee_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS community_follows_followee_idx
  ON public.community_follows (followee_id, state, created_at DESC, follower_id DESC);
CREATE INDEX IF NOT EXISTS community_follows_follower_idx
  ON public.community_follows (follower_id, state, created_at DESC, followee_id DESC);

-- Blocks and mutes reference auth.users, NOT community_profiles: a block must
-- survive the other person leaving Community and rejoining, and a user must be
-- able to block someone whose profile is already gone.
CREATE TABLE IF NOT EXISTS public.community_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS community_blocks_blocked_idx
  ON public.community_blocks (blocked_id);

CREATE TABLE IF NOT EXISTS public.community_mutes (
  muter_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id)
);

CREATE TABLE IF NOT EXISTS public.community_programmes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  source_plan_id text NOT NULL,
  title          text NOT NULL,
  description    text,
  style_key      text,
  split_type     text,
  difficulty     text,
  days_per_week  int NOT NULL,
  exercise_count int NOT NULL,
  has_circuits   boolean NOT NULL DEFAULT false,
  snapshot       jsonb NOT NULL,
  version        int NOT NULL DEFAULT 1,
  visibility     text NOT NULL DEFAULT 'public',
  status         text NOT NULL DEFAULT 'visible',
  use_count      int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, source_plan_id)
);

DO $$ BEGIN
  ALTER TABLE public.community_programmes
    ADD CONSTRAINT community_programmes_visibility_check
    CHECK (visibility IN ('public', 'followers', 'link'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.community_programmes
    ADD CONSTRAINT community_programmes_status_check
    CHECK (status IN ('visible', 'hidden'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS community_programmes_owner_idx
  ON public.community_programmes (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS community_programmes_discover_idx
  ON public.community_programmes (visibility, status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_programmes_style_idx
  ON public.community_programmes (style_key) WHERE style_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.community_programme_uses (
  programme_id uuid NOT NULL REFERENCES public.community_programmes(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode         text NOT NULL DEFAULT 'use',
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (programme_id, user_id)
);

DO $$ BEGIN
  ALTER TABLE public.community_programme_uses
    ADD CONSTRAINT community_programme_uses_mode_check
    CHECK (mode IN ('use', 'adapt'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS community_programme_uses_user_idx
  ON public.community_programme_uses (user_id);

CREATE TABLE IF NOT EXISTS public.community_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  kind           text NOT NULL,
  payload        jsonb NOT NULL,
  caption        text,
  programme_id   uuid REFERENCES public.community_programmes(id) ON DELETE SET NULL,
  visibility     text NOT NULL DEFAULT 'public',
  status         text NOT NULL DEFAULT 'visible',
  reaction_count int NOT NULL DEFAULT 0,
  comment_count  int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.community_posts
    ADD CONSTRAINT community_posts_kind_check
    CHECK (kind IN ('pr', 'session', 'block', 'milestone', 'programme'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.community_posts
    ADD CONSTRAINT community_posts_visibility_check
    CHECK (visibility IN ('public', 'followers'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.community_posts
    ADD CONSTRAINT community_posts_status_check
    CHECK (status IN ('visible', 'hidden'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS community_posts_author_idx
  ON public.community_posts (author_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_posts_discover_idx
  ON public.community_posts (visibility, status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.community_reactions (
  post_id    uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS community_reactions_user_idx
  ON public.community_reactions (user_id);

CREATE TABLE IF NOT EXISTS public.community_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind text NOT NULL,
  target_id   uuid NOT NULL,
  author_id   uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  body        text NOT NULL,
  status      text NOT NULL DEFAULT 'visible',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.community_comments
    ADD CONSTRAINT community_comments_target_kind_check
    CHECK (target_kind IN ('post', 'programme'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.community_comments
    ADD CONSTRAINT community_comments_status_check
    CHECK (status IN ('visible', 'hidden'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS community_comments_target_idx
  ON public.community_comments (target_kind, target_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_comments_author_idx
  ON public.community_comments (author_id);

CREATE TABLE IF NOT EXISTS public.community_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_kind     text NOT NULL,
  target_id       uuid NOT NULL,
  target_owner_id uuid,
  reason          text NOT NULL,
  detail          text,
  status          text NOT NULL DEFAULT 'open',
  priority        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     uuid,
  resolution      text
);

DO $$ BEGIN
  ALTER TABLE public.community_reports
    ADD CONSTRAINT community_reports_target_kind_check
    CHECK (target_kind IN ('profile', 'post', 'comment', 'programme'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.community_reports
    ADD CONSTRAINT community_reports_reason_check
    CHECK (reason IN ('spam', 'harassment', 'impersonation',
                      'harmful_body_or_eating_content', 'inappropriate', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.community_reports
    ADD CONSTRAINT community_reports_status_check
    CHECK (status IN ('open', 'actioned', 'dismissed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS community_reports_queue_idx
  ON public.community_reports (status, priority DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_reports_target_idx
  ON public.community_reports (target_kind, target_id, status);

-- Allow-list of moderator emails, seeded exactly like marketing_admins
-- (migrate_121): service_role manages it, no client can read who is on it.
CREATE TABLE IF NOT EXISTS public.community_moderators (
  email    text PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_moderation_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid,
  action       text NOT NULL,
  target_kind  text,
  target_id    uuid,
  report_id    uuid,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_moderation_log_created_idx
  ON public.community_moderation_log (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.community_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  actor_id    uuid,
  kind        text NOT NULL,
  target_kind text,
  target_id   uuid,
  seen_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.community_activity
    ADD CONSTRAINT community_activity_kind_check
    CHECK (kind IN ('follow', 'follow_request', 'follow_accepted',
                    'reaction', 'comment', 'programme_used'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS community_activity_user_idx
  ON public.community_activity (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_activity_unseen_idx
  ON public.community_activity (user_id) WHERE seen_at IS NULL;
CREATE INDEX IF NOT EXISTS community_activity_actor_idx
  ON public.community_activity (actor_id) WHERE actor_id IS NOT NULL;

-- The rate rail. Rows older than seven days are deleted opportunistically
-- inside _community_rate_check, so this table stays small without a cron job
-- (migration 157 retired the only pg_cron job this project had).
CREATE TABLE IF NOT EXISTS public.community_rate_events (
  user_id    uuid NOT NULL,
  action     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_rate_events_lookup_idx
  ON public.community_rate_events (user_id, action, created_at DESC);

-- ─── Part 2: RLS on, grants off (SD-14) ──────────────────────────────────
--
-- RLS ENABLE with NO policy means "deny everything" for anon and
-- authenticated even if a grant is ever restored by accident; the REVOKE
-- means PostgREST refuses before RLS is consulted. Both belts are deliberate.
-- SECURITY DEFINER functions run as the owner and are unaffected by either.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'community_profiles', 'community_follows', 'community_blocks',
    'community_mutes', 'community_programmes', 'community_programme_uses',
    'community_posts', 'community_reactions', 'community_comments',
    'community_reports', 'community_moderators', 'community_moderation_log',
    'community_activity', 'community_rate_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- ─── Part 3: consent_log CHECK widening (same shape as migrate_102) ──────
--
-- The re-added list is the CURRENT live list - migration 019's three values,
-- 102's 'partner_sharing' and 147's 'capability_data' - with
-- 'community_visibility' appended. Omitting any existing value would make ADD
-- CONSTRAINT fail against rows that already carry it.
ALTER TABLE public.consent_log
  DROP CONSTRAINT IF EXISTS consent_log_consent_type_check;
ALTER TABLE public.consent_log
  ADD CONSTRAINT consent_log_consent_type_check
  CHECK (consent_type IN ('health_data', 'marketing', 'analytics',
                          'partner_sharing', 'capability_data',
                          'community_visibility'));

-- ─── Part 4: notification_preferences CHECK widening ─────────────────────
--
-- Blueprint section 7 adds two notification categories, `community_follow`
-- and `community_activity`, and section 4 has community-notify READ
-- notification_preferences for exactly those category names before it pushes.
-- The category CHECK (migrate_085, current list migrate_125) would reject both
-- on the client's preference push, which would leave the two new toggles
-- unable to reach the server and the server-side opt-out permanently
-- unreadable. The re-added list is migrate_125's 23 values with the two
-- Community categories appended; nothing is removed.
ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_category_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_category_check CHECK (category IN (
    'daily_checkin_reminder',
    'weekly_checkin_reminder',
    'cascade_gate',
    'subscription_payment_failure',
    'subscription_expiring',
    'sync_error',
    'ed_pattern_lockout',
    'ffm_floor_hold',
    'weekly_coach_ready',
    'coach_trial_ending',
    'morning_weight',
    'evening_weight',
    'training_reminder',
    'year_of_lifts_unlock',
    'checkin_missed',
    'monthly_recap',
    'trial_day3',
    'winback',
    'partner_cheer',
    'planned_meal_confirm',
    'rest_timer',
    'meal_log_reminder',
    'activation_nudge',
    'community_follow',
    'community_activity'
  ));

-- ─── Part 5: moderator seed ──────────────────────────────────────────────
--
-- Same address and same shape as the marketing_admins seed (migrate_121:80).
-- ON CONFLICT DO NOTHING so a re-run is a no-op and a later hand-added
-- moderator is never removed.
INSERT INTO public.community_moderators (email)
VALUES ('allansdouglas1983@gmail.com')
ON CONFLICT DO NOTHING;

-- ─── Part 6: the three shared constant arrays ────────────────────────────
--
-- These three functions are the SINGLE definition of each list in SQL. The
-- client mirrors them in src/lib/community/keywordFilter.js
-- (BLOCKED_TERMS), src/lib/community/validation.js
-- (SENSITIVE_COMMUNITY_KEYS) and src/lib/community/posts.js
-- (POST_PAYLOAD_KEYS); a Jest guard compares the arrays here to those
-- constants character for character, so the two halves cannot drift.

CREATE OR REPLACE FUNCTION public._community_forbidden_keys_list()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    'weight_kg', 'bodyweight', 'body_weight', 'bodyWeight',
    'body_fat', 'bf_pct', 'ffm', 'fm_kg',
    'height', 'height_cm', 'age',
    'date_of_birth', 'dateOfBirth', 'dob',
    'kcal', 'calories', 'protein', 'carbs', 'fat_g', 'fibre',
    'first_name', 'firstName', 'last_name', 'email', 'phone',
    'scan', 'progress_scan', 'volyume_score',
    'capability', 'constraint', 'limitation', 'injury',
    'ed_pattern', 'scoff',
    'starting_weight', 'startingWeight',
    'selection_reason', 'selectionReason',
    'user_id', 'userId'
  ]::text[];
$$;

-- Deliberately NOT in the list above: 'weight'. A PR story is training
-- performance the user chose to post (SD-04), so payload.weight and
-- payload.topSet.weight must pass; it is 'weight_kg', 'bodyweight' and
-- 'body_weight' - the body-data spellings - that are rejected.

CREATE OR REPLACE FUNCTION public._community_blocked_terms()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Lowercase, matched as WHOLE WORDS (or whole phrases) after folding, in
  -- _community_clean_text. This array is the SAME list, term for term and in
  -- the same order, as BLOCKED_TERMS in src/lib/community/keywordFilter.js;
  -- community.privacy.guard.test.js fails if the client ever carries a term
  -- this array does not. The client check is the courtesy, this one is the
  -- rule.
  --
  -- Scope is deliberately narrow: unambiguous slurs and abuse, self-harm
  -- instructions, and pro-eating-disorder vocabulary. Ordinary swearing is
  -- NOT here. A gym is a place people swear, and a filter that refuses
  -- "bloody hell" trains people around it while catching nothing that
  -- matters.
  SELECT ARRAY[
    -- Self-harm instruction. The reason this filter is not optional.
    'kys',
    'kill yourself',
    'kill your self',
    'go kill yourself',
    'neck yourself',

    -- Pro-eating-disorder vocabulary (SD-11; ED-safety is inviolable).
    'thinspo',
    'thinspiration',
    'bonespo',
    'meanspo',
    'pro ana',
    'proana',
    'pro mia',
    'promia',
    'ana buddy',
    'ana coach',

    -- Racial and ethnic slurs.
    'nigger',
    'niggers',
    'nigga',
    'niggas',
    'chink',
    'chinks',
    'spic',
    'spics',
    'wetback',
    'wetbacks',
    'kike',
    'kikes',
    'gook',
    'gooks',
    'paki',
    'pakis',
    'coon',
    'coons',
    'towelhead',
    'towelheads',
    'raghead',
    'ragheads',

    -- Homophobic and transphobic slurs.
    'faggot',
    'faggots',
    'dyke',
    'dykes',
    'tranny',
    'trannies',
    'shemale',
    'shemales',

    -- Ableist slurs.
    'retard',
    'retards',
    'retarded',
    'mongoloid',
    'spastic',
    'spastics'

  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public._community_payload_keys(_kind text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE _kind
    WHEN 'pr' THEN ARRAY[
      'exerciseName', 'weight', 'reps', 'units', 'previousBest', 'date']
    WHEN 'session' THEN ARRAY[
      'sessionName', 'workingSets', 'duration', 'tonnage', 'exerciseCount',
      'exercises', 'prCount', 'topSet', 'intensityTier', 'units', 'planName',
      'date']
    WHEN 'block' THEN ARRAY[
      'planName', 'weeks', 'sessions', 'sessionsPerWeek', 'completedAt',
      'lifts']
    WHEN 'milestone' THEN ARRAY[
      'eyebrow', 'title', 'heroValue', 'heroUnit', 'caption', 'stats']
    WHEN 'programme' THEN ARRAY[
      'id', 'title', 'style_key', 'days_per_week', 'exercise_count']
    ELSE NULL
  END::text[];
$$;

-- ─── Part 7: internal helpers ────────────────────────────────────────────
--
-- Everything in this part is prefixed `_community_` and is INTERNAL: EXECUTE
-- is revoked from PUBLIC, anon AND authenticated at the end of this part, so
-- these are reachable only from the SECURITY DEFINER RPC bodies in Part 9.

-- Fold: lowercase, strip the common Latin accents, drop punctuation, collapse
-- whitespace, trim. Used for area/gym keys, search terms and blocked-word
-- matching, so the same text always folds the same way on every path.
CREATE OR REPLACE FUNCTION public._community_fold(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- The same fold as foldText() in src/lib/community/keywordFilter.js: the
  -- three multi-character folds first (ae / oe / ss), then the 1:1 Latin
  -- table, character for character in the same order as that file's
  -- ACCENT_FROM/ACCENT_TO. A deliberately fixed table rather than a Unicode
  -- normalisation call, so both halves fold identically on every runtime.
  --
  -- One deliberate difference: this fold also turns punctuation into a space,
  -- which the client's does not. That makes the SERVER strictly more likely
  -- to catch a blocked phrase ("pro-ana" folds to "pro ana" here), which is
  -- the safe direction: the server is the rule.
  SELECT btrim(regexp_replace(
    regexp_replace(
      translate(
        replace(replace(replace(lower(coalesce(_t, '')), 'æ', 'ae'), 'œ', 'oe'), 'ß', 'ss'),
        'àáâãäåāăąçćĉċčďđèéêëēĕėęěĝğġģĥħìíîïĩīĭįıĵķĺļľŀłñńņňòóôõöøōŏőŕŗřśŝşšţťŧùúûüũūŭůűųŵýÿŷźżž',
        'aaaaaaaaacccccddeeeeeeeeegggghhiiiiiiiiijklllllnnnnooooooooorrrsssstttuuuuuuuuuuwyyyzzz'
      ),
      '[^a-z0-9]+', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

-- Blocked either direction. A block is symmetrical invisibility (SD-11), so
-- every read and write path asks this one question.
CREATE OR REPLACE FUNCTION public._community_is_blocked(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_blocks b
    WHERE (b.blocker_id = _a AND b.blocked_id = _b)
       OR (b.blocker_id = _b AND b.blocked_id = _a)
  );
$$;

-- Can _viewer see _owner's content? Owner must be active, the two must not be
-- blocked either way, and the owner must be public, the viewer themselves, or
-- following with an accepted edge.
CREATE OR REPLACE FUNCTION public._community_can_view(_viewer uuid, _owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_profiles p
    WHERE p.user_id = _owner
      -- Security review 2026-09-06 (finding 13): a RESTRICTED account can
      -- still read, including its own content; only SUSPENDED is invisible.
      AND (_viewer = _owner OR p.status <> 'suspended')
      AND NOT public._community_is_blocked(_viewer, _owner)
      AND (
        _viewer = _owner
        OR (p.status = 'active' AND p.visibility = 'public')
        OR EXISTS (
          SELECT 1 FROM public.community_follows f
          WHERE f.follower_id = _viewer AND f.followee_id = _owner
            AND f.state = 'accepted'
        )
      )
  );
$$;

-- "May I see THIS post?" - the person predicate above answers "may I see
-- this person?", which is not the same question (security review
-- 2026-09-06, findings 1-3: a removed follower holding a post id could read
-- and write on a followers-only post). Every egress and every write that
-- touches a post goes through here.
CREATE OR REPLACE FUNCTION public._community_can_view_post(_viewer uuid, _post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_posts r
    WHERE r.id = _post_id
      AND (
        r.author_id = _viewer
        OR (
          r.status = 'visible'
          AND public._community_can_view(_viewer, r.author_id)
          AND (
            r.visibility = 'public'
            OR EXISTS (
              SELECT 1 FROM public.community_follows f
              WHERE f.follower_id = _viewer AND f.followee_id = r.author_id
                AND f.state = 'accepted')
          )
        )
      )
  );
$$;

-- "May I see THIS programme?" 'link' means anyone signed in who holds the
-- id and is not blocked; 'followers' needs an accepted follow; 'public'
-- needs the creator to be viewable. Mirrors community_get_programme.
CREATE OR REPLACE FUNCTION public._community_can_view_programme(_viewer uuid, _prog_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_programmes g
    WHERE g.id = _prog_id
      AND (
        g.owner_id = _viewer
        OR (
          g.status = 'visible'
          AND NOT public._community_is_blocked(_viewer, g.owner_id)
          AND EXISTS (SELECT 1 FROM public.community_profiles op
                      WHERE op.user_id = g.owner_id AND op.status <> 'suspended')
          AND (
            g.visibility = 'link'
            OR (g.visibility = 'public' AND public._community_can_view(_viewer, g.owner_id))
            OR (g.visibility = 'followers' AND EXISTS (
                  SELECT 1 FROM public.community_follows f
                  WHERE f.follower_id = _viewer AND f.followee_id = g.owner_id
                    AND f.state = 'accepted'))
          )
        )
      )
  );
$$;

-- Under 18, derived from the caller's OWN user_body_profile.date_of_birth
-- (TEXT, ISO). Null, blank or unparseable = not a minor, matching the
-- blueprint: the app already collects age at onboarding, so an absent value is
-- a data gap rather than evidence of a child. Only a boolean is ever stored.
CREATE OR REPLACE FUNCTION public._community_minor(_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw text;
  v_dob date;
BEGIN
  SELECT date_of_birth INTO v_raw
  FROM public.user_body_profile
  WHERE user_id = _uid
  LIMIT 1;

  IF v_raw IS NULL OR btrim(v_raw) = '' THEN
    RETURN false;
  END IF;

  BEGIN
    v_dob := substring(btrim(v_raw) FROM 1 FOR 10)::date;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  IF v_dob IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_dob > (current_date - interval '18 years');
END $$;

-- The rate rail. `new` means the caller's profile is under seven days old (or
-- they have no profile yet); everyone else gets the established limit. The
-- window defaults to 24 hours and is passed explicitly for the per-hour
-- comment limits. The clock is the DATABASE clock, never a client value -
-- migration 155's lesson: a rate key that comes from the caller is not a rate
-- limit.
CREATE OR REPLACE FUNCTION public._community_rate_check(
  _uid                uuid,
  _action             text,
  _limit_new          int,
  _limit_established  int,
  _window             interval DEFAULT interval '24 hours'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_created timestamptz;
  v_limit   int;
  v_count   int;
BEGIN
  -- Opportunistic prune, so the rail never needs a cron job.
  DELETE FROM public.community_rate_events
  WHERE user_id = _uid AND created_at < now() - interval '7 days';

  SELECT created_at INTO v_created
  FROM public.community_profiles WHERE user_id = _uid;

  v_limit := CASE
    WHEN v_created IS NOT NULL AND v_created <= now() - interval '7 days'
      THEN _limit_established
    ELSE _limit_new
  END;

  SELECT count(*) INTO v_count
  FROM public.community_rate_events
  WHERE user_id = _uid AND action = _action AND created_at > now() - _window;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION USING message = 'rate_limited';
  END IF;

  INSERT INTO public.community_rate_events (user_id, action) VALUES (_uid, _action);
END $$;

-- Free-text gate. Raises content_not_allowed when the folded text contains a
-- blocked term as a whole word; otherwise returns the trimmed original, so the
-- user's own punctuation, capitals and accents survive intact.
CREATE OR REPLACE FUNCTION public._community_clean_text(_t text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_folded text;
  v_term   text;
BEGIN
  IF _t IS NULL THEN RETURN NULL; END IF;
  v_folded := ' ' || public._community_fold(_t) || ' ';
  FOREACH v_term IN ARRAY public._community_blocked_terms() LOOP
    IF position(' ' || v_term || ' ' IN v_folded) > 0 THEN
      RAISE EXCEPTION USING message = 'content_not_allowed';
    END IF;
  END LOOP;
  RETURN btrim(_t);
END $$;

-- Recursive forbidden-key scan. ANY key at ANY depth that matches the shared
-- list (exactly, or case-insensitively, so a capitalised spelling cannot slip
-- through) raises forbidden_field. This is the server half of SD-04: body
-- data, nutrition, capability rules and identity can never reach Community
-- even if a future client builds a payload wrongly.
CREATE OR REPLACE FUNCTION public._community_forbidden_keys(_p jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key  text;
  v_val  jsonb;
  v_item jsonb;
BEGIN
  IF _p IS NULL THEN RETURN; END IF;

  IF jsonb_typeof(_p) = 'object' THEN
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(_p) LOOP
      -- Security review 2026-09-06 (finding 10): compare on the folded key
      -- (lower, trimmed, NFKC) so "bodyWeight " and width variants match.
      IF EXISTS (
        SELECT 1 FROM unnest(public._community_forbidden_keys_list()) AS t(k)
        WHERE lower(btrim(t.k)) = lower(btrim(normalize(v_key, NFKC)))
           OR lower(replace(btrim(t.k), '_', '')) = lower(replace(btrim(normalize(v_key, NFKC)), '_', ''))
      ) THEN
        RAISE EXCEPTION USING message = 'forbidden_field';
      END IF;
      PERFORM public._community_forbidden_keys(v_val);
    END LOOP;
  ELSIF jsonb_typeof(_p) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(_p) LOOP
      PERFORM public._community_forbidden_keys(v_item);
    END LOOP;
  END IF;
END $$;

-- Cursor helper. A cursor is the text 'created_at ISO|row uuid'; an absent or
-- empty cursor returns NO rows, which leaves the caller's local variables
-- NULL and means "start at the newest". A malformed cursor is invalid_input
-- rather than a silent full-list read.
CREATE OR REPLACE FUNCTION public._community_cursor_parts(_cursor text)
RETURNS TABLE (c_ts timestamptz, c_id uuid)
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF _cursor IS NULL OR btrim(_cursor) = '' THEN RETURN; END IF;
  BEGIN
    c_ts := split_part(_cursor, '|', 1)::timestamptz;
    c_id := split_part(_cursor, '|', 2)::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END;
  RETURN NEXT;
END $$;

-- Page size clamp: 1..50, default 20. A caller cannot ask for the whole table.
CREATE OR REPLACE FUNCTION public._community_limit(_limit int)
RETURNS int
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT least(greatest(coalesce(_limit, 20), 1), 50);
$$;

-- Build the opaque cursor for the row a page ended on: 'created_at ISO|uuid'.
CREATE OR REPLACE FUNCTION public._community_cursor_of(_ts timestamptz, _id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _ts IS NULL OR _id IS NULL THEN NULL
    ELSE to_char(_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USOF') || '|' || _id::text
  END;
$$;

-- A style key rendered for a human sentence ("kettlebell_foundations" ->
-- "Kettlebell Foundations"). The reason strings in community_suggested_people
-- need a label and the server holds keys only; deriving it here keeps the
-- reason text identical for every caller.
CREATE OR REPLACE FUNCTION public._community_style_label(_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT initcap(replace(coalesce(_key, ''), '_', ' '));
$$;

-- The profile card. This is the ONLY shape in which one user ever sees
-- another: chosen facts plus counts plus the viewer's own relationship to
-- them. No email, no first name, no date of birth, no body data - none of
-- which is a column on this table in the first place.
CREATE OR REPLACE FUNCTION public._community_profile_card(_uid uuid, _viewer uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.community_profiles%ROWTYPE;
  v_following text;
  v_viewable boolean;
BEGIN
  SELECT * INTO p FROM public.community_profiles WHERE user_id = _uid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Security review 2026-09-06 (finding 12): a suspended profile has no
  -- card for anyone but itself.
  IF p.status = 'suspended' AND _viewer <> _uid THEN RETURN NULL; END IF;
  v_viewable := public._community_can_view(_viewer, _uid);

  SELECT f.state INTO v_following
  FROM public.community_follows f
  WHERE f.follower_id = _viewer AND f.followee_id = _uid;

  RETURN jsonb_build_object(
    'user_id',         p.user_id,
    'handle',          p.handle,
    'display_name',    p.display_name,
    'avatar_preset',   p.avatar_preset,
    'bio',             p.bio,
    -- Security review 2026-09-06 (finding 5): the chosen facts travel only
    -- to someone who may view the profile (self, public, or accepted
    -- follower). A followers-only card, and so every minor's card, is
    -- handle, name, avatar, bio and counts. Nothing about where they train.
    'styles',          CASE WHEN v_viewable THEN to_jsonb(p.styles) ELSE '[]'::jsonb END,
    'goal',            CASE WHEN v_viewable THEN p.goal END,
    'setting',         CASE WHEN v_viewable THEN p.setting END,
    'area_label',      CASE WHEN v_viewable THEN p.area_label END,
    'gym_label',       CASE WHEN v_viewable THEN p.gym_label END,
    'visibility',      p.visibility,
    'follower_count',  p.follower_count,
    'following_count', p.following_count,
    'relationship',    jsonb_build_object(
      'following',   coalesce(v_following, 'none'),
      'followed_by', EXISTS (
        SELECT 1 FROM public.community_follows f2
        WHERE f2.follower_id = _uid AND f2.followee_id = _viewer
          AND f2.state = 'accepted'),
      'muted',       EXISTS (
        SELECT 1 FROM public.community_mutes m
        WHERE m.muter_id = _viewer AND m.muted_id = _uid),
      'blocked',     EXISTS (
        SELECT 1 FROM public.community_blocks b
        WHERE b.blocker_id = _viewer AND b.blocked_id = _uid)
    )
  );
END $$;

-- The signed-in caller, or not_signed_in. Every RPC starts here.
CREATE OR REPLACE FUNCTION public._community_caller()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v uuid := auth.uid();
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION USING message = 'not_signed_in'; END IF;
  RETURN v;
END $$;

-- The caller's profile, with the status rules applied. `_require_active`
-- separates "you must have a profile to read" from "you must be in good
-- standing to write": a restricted account can still read, a suspended one
-- cannot do either.
CREATE OR REPLACE FUNCTION public._community_require_profile(_uid uuid, _require_active boolean)
RETURNS public.community_profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.community_profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.community_profiles WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION USING message = 'no_profile'; END IF;
  IF p.status = 'suspended' THEN RAISE EXCEPTION USING message = 'profile_suspended'; END IF;
  IF _require_active AND p.status <> 'active' THEN
    RAISE EXCEPTION USING message = 'profile_restricted';
  END IF;
  RETURN p;
END $$;

-- Write one activity row for the target, unless the actor is the target.
CREATE OR REPLACE FUNCTION public._community_add_activity(
  _user_id uuid, _actor_id uuid, _kind text, _target_kind text, _target_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF _user_id IS NULL OR _user_id = _actor_id THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_profiles WHERE user_id = _user_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.community_activity (user_id, actor_id, kind, target_kind, target_id)
  VALUES (_user_id, _actor_id, _kind, _target_kind, _target_id);
END $$;

-- Auto-hide first line (SD-11): three DISTINCT open reports hide a post,
-- comment or programme immediately and write an audit row with a NULL
-- moderator, so the queue shows what the system did as well as what a person
-- did. A profile is never auto-hidden; suspension is always a human decision.
CREATE OR REPLACE FUNCTION public._community_auto_hide(_target_kind text, _target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reporters int;
BEGIN
  IF _target_kind NOT IN ('post', 'comment', 'programme') THEN RETURN; END IF;

  SELECT count(DISTINCT reporter_id) INTO v_reporters
  FROM public.community_reports
  WHERE target_kind = _target_kind AND target_id = _target_id AND status = 'open'
    AND reporter_id IS NOT NULL;

  IF v_reporters < 3 THEN RETURN; END IF;

  IF _target_kind = 'post' THEN
    UPDATE public.community_posts SET status = 'hidden'
    WHERE id = _target_id AND status <> 'hidden';
  ELSIF _target_kind = 'comment' THEN
    UPDATE public.community_comments SET status = 'hidden'
    WHERE id = _target_id AND status <> 'hidden';
  ELSE
    UPDATE public.community_programmes SET status = 'hidden'
    WHERE id = _target_id AND status <> 'hidden';
  END IF;

  IF FOUND THEN
    INSERT INTO public.community_moderation_log
      (moderator_id, action, target_kind, target_id, note)
    VALUES (NULL, 'auto_hide', _target_kind, _target_id,
            'Automatically hidden after three distinct open reports.');
  END IF;
END $$;

-- Partnerships to mutual follows (SD-03). Called on every profile upsert, for
-- the joiner AND for each partner who is already here, so the conversion
-- happens whichever member joins second. Both edges are accepted: an active
-- partnership was already a two-way, consented relationship.
CREATE OR REPLACE FUNCTION public._community_convert_partnerships(_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_other uuid;
BEGIN
  BEGIN
    FOR v_other IN
      SELECT CASE WHEN p.member_a = _uid THEN p.member_b ELSE p.member_a END
      FROM public.partnerships p
      WHERE p.status = 'active' AND (p.member_a = _uid OR p.member_b = _uid)
    LOOP
      IF v_other IS NULL OR v_other = _uid THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.community_profiles WHERE user_id = v_other) THEN
        CONTINUE;
      END IF;
      IF public._community_is_blocked(_uid, v_other) THEN CONTINUE; END IF;

      INSERT INTO public.community_follows (follower_id, followee_id, state)
      VALUES (_uid, v_other, 'accepted')
      ON CONFLICT DO NOTHING;
      INSERT INTO public.community_follows (follower_id, followee_id, state)
      VALUES (v_other, _uid, 'accepted')
      ON CONFLICT DO NOTHING;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    -- Partners is retired (SD-03); the tables are retained for wipe
    -- completeness. If they are ever dropped, joining Community must still
    -- work.
    NULL;
  END;
END $$;

-- ─── Part 8: counters and touch triggers ─────────────────────────────────
--
-- Counters are maintained by triggers rather than by the RPCs so that any
-- path which changes a row - an RPC, a cascade delete, a moderator action,
-- delete_user_data - keeps them true.

CREATE OR REPLACE FUNCTION public._community_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS community_profiles_touch ON public.community_profiles;
CREATE TRIGGER community_profiles_touch
  BEFORE UPDATE ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION public._community_touch_updated_at();

DROP TRIGGER IF EXISTS community_programmes_touch ON public.community_programmes;
CREATE TRIGGER community_programmes_touch
  BEFORE UPDATE ON public.community_programmes
  FOR EACH ROW EXECUTE FUNCTION public._community_touch_updated_at();

DROP TRIGGER IF EXISTS community_posts_touch ON public.community_posts;
CREATE TRIGGER community_posts_touch
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public._community_touch_updated_at();

DROP TRIGGER IF EXISTS community_comments_touch ON public.community_comments;
CREATE TRIGGER community_comments_touch
  BEFORE UPDATE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public._community_touch_updated_at();

-- Follower / following counts, accepted edges only. A requested edge is not a
-- follower yet, so it must never appear in either count.
CREATE OR REPLACE FUNCTION public._community_follow_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
  v_id  uuid;
BEGIN
  v_ids := ARRAY[]::uuid[];
  IF TG_OP <> 'INSERT' THEN
    v_ids := v_ids || OLD.follower_id || OLD.followee_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_ids := v_ids || NEW.follower_id || NEW.followee_id;
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    UPDATE public.community_profiles p SET
      follower_count = (
        SELECT count(*) FROM public.community_follows f
        WHERE f.followee_id = v_id AND f.state = 'accepted'),
      following_count = (
        SELECT count(*) FROM public.community_follows f
        WHERE f.follower_id = v_id AND f.state = 'accepted')
    WHERE p.user_id = v_id;
  END LOOP;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS community_follows_counts ON public.community_follows;
CREATE TRIGGER community_follows_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.community_follows
  FOR EACH ROW EXECUTE FUNCTION public._community_follow_counts();

CREATE OR REPLACE FUNCTION public._community_reaction_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_post uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.post_id ELSE NEW.post_id END;
BEGIN
  UPDATE public.community_posts p
  SET reaction_count = (
    SELECT count(*) FROM public.community_reactions r WHERE r.post_id = v_post)
  WHERE p.id = v_post;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS community_reactions_count ON public.community_reactions;
CREATE TRIGGER community_reactions_count
  AFTER INSERT OR DELETE ON public.community_reactions
  FOR EACH ROW EXECUTE FUNCTION public._community_reaction_count();

-- Visible comments only: a hidden comment must not keep inflating the count a
-- reader sees under a post.
CREATE OR REPLACE FUNCTION public._community_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id  uuid;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.target_kind = 'post' THEN v_ids := v_ids || OLD.target_id; END IF;
  IF TG_OP <> 'DELETE' AND NEW.target_kind = 'post' THEN v_ids := v_ids || NEW.target_id; END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    UPDATE public.community_posts p
    SET comment_count = (
      SELECT count(*) FROM public.community_comments c
      WHERE c.target_kind = 'post' AND c.target_id = v_id AND c.status = 'visible')
    WHERE p.id = v_id;
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS community_comments_count ON public.community_comments;
CREATE TRIGGER community_comments_count
  AFTER INSERT OR UPDATE OR DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public._community_comment_count();

CREATE OR REPLACE FUNCTION public._community_use_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prog uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.programme_id ELSE NEW.programme_id END;
BEGIN
  UPDATE public.community_programmes p
  SET use_count = (
    SELECT count(*) FROM public.community_programme_uses u WHERE u.programme_id = v_prog)
  WHERE p.id = v_prog;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS community_programme_uses_count ON public.community_programme_uses;
CREATE TRIGGER community_programme_uses_count
  AFTER INSERT OR DELETE ON public.community_programme_uses
  FOR EACH ROW EXECUTE FUNCTION public._community_use_count();

-- ─── Part 9: the RPCs ────────────────────────────────────────────────────
--
-- Every RPC below is SECURITY DEFINER with `SET search_path = public,
-- pg_temp`, derives its user from auth.uid() (never from an argument), and
-- raises one of the closed error codes: not_signed_in, no_profile,
-- profile_restricted, profile_suspended, handle_taken, handle_invalid,
-- invalid_input, content_not_allowed, forbidden_field, rate_limited, blocked,
-- not_found, not_allowed, already_reported, not_moderator. The client maps
-- those codes to calm copy; nothing else is ever raised deliberately.
--
-- Rate limits (blueprint section 3): profile upsert 5/day; follow 30/day new,
-- 100/day established, 2,000 following cap; programme publish 10/day; post
-- 3/day new, 10/day established; comment 10/hour new, 30/hour established;
-- report 20/day.

-- Handle policy. Reserved words are the blueprint's list; the app's own route
-- words are additionally reserved client-side, which is belt and braces on top
-- of this, not a substitute for it.
CREATE OR REPLACE FUNCTION public._community_handle_reserved()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    'volyume', 'admin', 'support', 'help', 'moderator', 'official', 'staff',
    'team', 'community', 'coach', 'beat', 'nhs'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public._community_handle_valid(_h text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _h IS NOT NULL
     AND _h ~ '^[a-z0-9_]{3,20}$'
     AND _h !~ '^_'
     AND _h !~ '_$'
     AND NOT (_h = ANY (public._community_handle_reserved()));
$$;

CREATE OR REPLACE FUNCTION public.community_check_handle(_h text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
  v_h   text := lower(btrim(coalesce(_h, '')));
BEGIN
  IF NOT public._community_handle_valid(v_h) THEN RETURN false; END IF;
  -- Security review 2026-09-06 (finding 5): an existence oracle on the rate
  -- rail; 120 checks an hour is a person typing, not a dictionary.
  PERFORM public._community_rate_check(v_uid, 'check_handle', 120, 120, interval '1 hour');
  RETURN NOT EXISTS (
    SELECT 1 FROM public.community_profiles
    WHERE handle = v_h AND user_id <> v_uid
  );
END $$;

CREATE OR REPLACE FUNCTION public.community_is_moderator()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
BEGIN
  PERFORM public._community_caller();
  IF v_email = '' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.community_moderators m WHERE lower(m.email) = v_email
  );
END $$;

CREATE OR REPLACE FUNCTION public.community_get_me()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := public._community_caller();
  v_card    jsonb;
  v_pending int := 0;
  v_unseen  int := 0;
BEGIN
  v_card := public._community_profile_card(v_uid, v_uid);

  IF v_card IS NOT NULL THEN
    SELECT count(*) INTO v_pending
    FROM public.community_follows
    WHERE followee_id = v_uid AND state = 'requested';

    SELECT count(*) INTO v_unseen
    FROM public.community_activity
    WHERE user_id = v_uid AND seen_at IS NULL;

    UPDATE public.community_profiles SET last_active_at = now() WHERE user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'profile',           v_card,
    'pending_requests',  v_pending,
    'unseen_activity',   v_unseen,
    'is_moderator',      public.community_is_moderator(),
    'is_minor',          public._community_minor(v_uid),
    'rules_version',     1
  );
END $$;

CREATE OR REPLACE FUNCTION public.community_upsert_profile(_p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := public._community_caller();
  v_existing   public.community_profiles%ROWTYPE;
  v_is_new     boolean;
  v_handle     text;
  v_display    text;
  v_bio        text;
  v_avatar     text;
  v_styles     text[];
  v_goal       text;
  v_setting    text;
  v_area_label text;
  v_area_key   text;
  v_gym_label  text;
  v_gym_key    text;
  v_visibility text;
  v_minor      boolean;
  v_accept     int;
  v_style      text;
BEGIN
  IF _p IS NULL OR jsonb_typeof(_p) <> 'object' THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  SELECT * INTO v_existing FROM public.community_profiles WHERE user_id = v_uid;
  v_is_new := NOT FOUND;
  -- Product review 2026-09-06 (findings 1-2): on an UPDATE, a key that is
  -- absent from the payload keeps its current value; a key sent as null
  -- clears it. Edit profile and the privacy screen send only the fields
  -- they own, and a full-replace contract made every such save fail on
  -- handle_invalid.
  IF NOT v_is_new THEN
    _p := jsonb_build_object(
      'handle',        v_existing.handle,
      'display_name',  v_existing.display_name,
      'avatar_preset', v_existing.avatar_preset,
      'bio',           v_existing.bio,
      'styles',        to_jsonb(v_existing.styles),
      'goal',          v_existing.goal,
      'setting',       v_existing.setting,
      'area_label',    v_existing.area_label,
      'gym_label',     v_existing.gym_label,
      'visibility',    v_existing.visibility
    ) || coalesce(_p, '{}'::jsonb);
  END IF;

  IF NOT v_is_new AND v_existing.status = 'suspended' THEN
    RAISE EXCEPTION USING message = 'profile_suspended';
  END IF;

  -- Handle.
  v_handle := lower(btrim(coalesce(_p ->> 'handle', '')));
  IF NOT public._community_handle_valid(v_handle) THEN
    RAISE EXCEPTION USING message = 'handle_invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.community_profiles
    WHERE handle = v_handle AND user_id <> v_uid
  ) THEN
    RAISE EXCEPTION USING message = 'handle_taken';
  END IF;
  IF NOT v_is_new AND v_handle <> v_existing.handle THEN
    IF v_existing.handle_changed_at IS NOT NULL
       AND v_existing.handle_changed_at > now() - interval '30 days' THEN
      RAISE EXCEPTION USING message = 'not_allowed';
    END IF;
  END IF;

  -- Display name, bio, avatar. Free text goes through the keyword filter.
  v_display := public._community_clean_text(btrim(coalesce(_p ->> 'display_name', '')));
  IF v_display IS NULL OR length(v_display) < 1 OR length(v_display) > 40 THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  v_bio := nullif(btrim(coalesce(_p ->> 'bio', '')), '');
  IF v_bio IS NOT NULL THEN
    v_bio := public._community_clean_text(v_bio);
    IF length(v_bio) > 160 THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  END IF;

  v_avatar := nullif(btrim(coalesce(_p ->> 'avatar_preset', '')), '');
  IF v_avatar IS NOT NULL AND v_avatar !~ '^[a-z0-9_]{1,32}$' THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  -- Styles: at most three chosen keys. The key SHAPE is enforced here; the
  -- list of offered styles is the app's (SD-05, "chosen, not inferred"), and a
  -- key that is not offered simply never appears in any dimension.
  v_styles := ARRAY[]::text[];
  IF _p ? 'styles' AND jsonb_typeof(_p -> 'styles') = 'array' THEN
    FOR v_style IN SELECT jsonb_array_elements_text(_p -> 'styles') LOOP
      v_style := lower(btrim(coalesce(v_style, '')));
      IF v_style = '' THEN CONTINUE; END IF;
      IF v_style !~ '^[a-z0-9_]{2,32}$' THEN
        RAISE EXCEPTION USING message = 'invalid_input';
      END IF;
      IF NOT (v_style = ANY (v_styles)) THEN v_styles := v_styles || v_style; END IF;
    END LOOP;
  END IF;
  IF array_length(v_styles, 1) > 3 THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;

  v_goal := nullif(btrim(coalesce(_p ->> 'goal', '')), '');
  IF v_goal IS NOT NULL
     AND v_goal NOT IN ('build_muscle', 'get_stronger', 'general_fitness', 'returning') THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  v_setting := nullif(btrim(coalesce(_p ->> 'setting', '')), '');
  IF v_setting IS NOT NULL
     AND v_setting NOT IN ('commercial_gym', 'home_gym', 'minimal_kit') THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  v_area_label := nullif(btrim(coalesce(_p ->> 'area_label', '')), '');
  IF v_area_label IS NOT NULL THEN
    v_area_label := public._community_clean_text(v_area_label);
    IF length(v_area_label) > 40 THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
    v_area_key := nullif(public._community_fold(v_area_label), '');
  END IF;

  v_gym_label := nullif(btrim(coalesce(_p ->> 'gym_label', '')), '');
  IF v_gym_label IS NOT NULL THEN
    v_gym_label := public._community_clean_text(v_gym_label);
    IF length(v_gym_label) > 60 THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
    -- A gym key is scoped by area, so two "PureGym" rows in different towns
    -- are different gyms and never merge into one dimension.
    v_gym_key := nullif(coalesce(v_area_key, '') || ':' || public._community_fold(v_gym_label), ':');
  END IF;

  v_visibility := coalesce(nullif(btrim(coalesce(_p ->> 'visibility', '')), ''), 'public');
  IF v_visibility NOT IN ('public', 'followers') THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  -- The minor rule runs on EVERY call, not only on create, so a birthday or a
  -- corrected date of birth is honoured the next time the profile is saved.
  v_minor := public._community_minor(v_uid);
  IF v_minor THEN v_visibility := 'followers'; END IF;

  -- The rate check runs LAST, after every validation, so a rejected save
  -- (a taken handle, a name that fails the filter) does not spend one of the
  -- day's five.
  PERFORM public._community_rate_check(v_uid, 'profile_upsert', 5, 5);

  IF v_is_new THEN
    IF coalesce(_p ->> 'accept_rules_version', '') !~ '^[0-9]{1,6}$' THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;
    v_accept := (_p ->> 'accept_rules_version')::int;
    IF v_accept IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;

    INSERT INTO public.community_profiles (
      user_id, handle, display_name, avatar_preset, bio, styles, goal, setting,
      area_label, area_key, gym_label, gym_key, visibility, is_minor, status,
      rules_version, last_active_at)
    VALUES (
      v_uid, v_handle, v_display, v_avatar, v_bio, v_styles, v_goal, v_setting,
      v_area_label, v_area_key, v_gym_label, v_gym_key, v_visibility, v_minor,
      'active', 1, now());

    -- Article 6(1)(a) record on the existing append-only rail.
    INSERT INTO public.consent_log
      (user_id, consent_type, granted, granted_at, notice_version)
    VALUES (v_uid, 'community_visibility', true, now(), '1');

    PERFORM public._community_convert_partnerships(v_uid);
  ELSE
    UPDATE public.community_profiles SET
      handle            = v_handle,
      handle_changed_at = CASE WHEN v_handle <> v_existing.handle THEN now()
                               ELSE v_existing.handle_changed_at END,
      display_name      = v_display,
      avatar_preset     = v_avatar,
      bio               = v_bio,
      styles            = v_styles,
      goal              = v_goal,
      setting           = v_setting,
      area_label        = v_area_label,
      area_key          = v_area_key,
      gym_label         = v_gym_label,
      gym_key           = v_gym_key,
      visibility        = v_visibility,
      is_minor          = v_minor,
      last_active_at    = now()
    WHERE user_id = v_uid;

    -- Also runs on update: a partner who joined AFTER this user did becomes a
    -- mutual follow the next time either of them saves a profile.
    PERFORM public._community_convert_partnerships(v_uid);
  END IF;

  RETURN public._community_profile_card(v_uid, v_uid);
END $$;

CREATE OR REPLACE FUNCTION public.community_leave()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.community_profiles WHERE user_id = v_uid) THEN
    RAISE EXCEPTION USING message = 'no_profile';
  END IF;

  -- Withdrawal is recorded BEFORE the delete, so the audit rail always shows
  -- the grant and the withdrawal even if the delete fails.
  INSERT INTO public.consent_log
    (user_id, consent_type, granted, granted_at, notice_version)
  VALUES (v_uid, 'community_visibility', false, now(), '1');

  -- Activity this user CAUSED for other people goes too; the rows they
  -- RECEIVED cascade with their profile.
  DELETE FROM public.community_activity WHERE actor_id = v_uid;
  -- Blueprint section 2: reports they filed keep their reporter as NULL
  -- (security review 2026-09-06, finding 11).
  UPDATE public.community_reports SET reporter_id = NULL WHERE reporter_id = v_uid;

  -- Deleting the profile cascades to follows (both directions), posts,
  -- reactions, comments, programmes (and their uses) and received activity.
  -- Deliberately NOT deleted: community_blocks (a safety record must survive
  -- the blocker leaving and rejoining), community_mutes (private to the muter,
  -- and never visible to anyone else) and community_programme_uses (an
  -- anonymous count on someone else's programme, keyed to the account rather
  -- than to Community membership). Blueprint section 2 enumerates what leaving
  -- deletes and none of these three is in that list.
  DELETE FROM public.community_profiles WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Follows ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_follow(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := public._community_caller();
  v_me     public.community_profiles%ROWTYPE;
  v_them   public.community_profiles%ROWTYPE;
  v_state  text;
  v_count  int;
BEGIN
  IF _target IS NULL OR _target = v_uid THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  v_me := public._community_require_profile(v_uid, true);

  SELECT * INTO v_them FROM public.community_profiles WHERE user_id = _target;
  IF NOT FOUND OR v_them.status <> 'active' THEN
    RAISE EXCEPTION USING message = 'not_found';
  END IF;
  IF public._community_is_blocked(v_uid, _target) THEN
    RAISE EXCEPTION USING message = 'blocked';
  END IF;

  PERFORM public._community_rate_check(v_uid, 'follow', 30, 100);

  SELECT count(*) INTO v_count
  FROM public.community_follows WHERE follower_id = v_uid;
  IF v_count >= 2000 THEN RAISE EXCEPTION USING message = 'rate_limited'; END IF;

  -- A public profile is followed instantly; a followers-only profile receives
  -- a request it can accept or leave alone (SD-05).
  v_state := CASE WHEN v_them.visibility = 'public' THEN 'accepted' ELSE 'requested' END;

  INSERT INTO public.community_follows (follower_id, followee_id, state)
  VALUES (v_uid, _target, v_state)
  ON CONFLICT (follower_id, followee_id) DO NOTHING;

  SELECT state INTO v_state
  FROM public.community_follows WHERE follower_id = v_uid AND followee_id = _target;

  PERFORM public._community_add_activity(
    _target, v_uid,
    CASE WHEN v_state = 'accepted' THEN 'follow' ELSE 'follow_request' END,
    'profile', v_uid);

  RETURN jsonb_build_object('state', v_state);
END $$;

CREATE OR REPLACE FUNCTION public.community_unfollow(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  IF _target IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  DELETE FROM public.community_follows
  WHERE follower_id = v_uid AND followee_id = _target;
  RETURN jsonb_build_object('state', 'none');
END $$;

CREATE OR REPLACE FUNCTION public.community_respond_follow(_requester uuid, _accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  IF _requester IS NULL OR _accept IS NULL THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  PERFORM public._community_require_profile(v_uid, true);

  IF NOT EXISTS (
    SELECT 1 FROM public.community_follows
    WHERE follower_id = _requester AND followee_id = v_uid AND state = 'requested'
  ) THEN
    RAISE EXCEPTION USING message = 'not_found';
  END IF;

  IF _accept THEN
    UPDATE public.community_follows SET state = 'accepted'
    WHERE follower_id = _requester AND followee_id = v_uid;
    PERFORM public._community_add_activity(_requester, v_uid, 'follow_accepted', 'profile', v_uid);
    RETURN jsonb_build_object('state', 'accepted');
  END IF;

  DELETE FROM public.community_follows
  WHERE follower_id = _requester AND followee_id = v_uid;
  RETURN jsonb_build_object('state', 'none');
END $$;

CREATE OR REPLACE FUNCTION public.community_remove_follower(_follower uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  IF _follower IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  DELETE FROM public.community_follows
  WHERE follower_id = _follower AND followee_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Followers / following for one profile. Requests are visible to the owner
-- only, so nobody can enumerate who has asked to follow someone else.
CREATE OR REPLACE FUNCTION public.community_list_follows(
  _uid uuid, _kind text, _cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := public._community_caller();
  v_target uuid := coalesce(_uid, v_uid);
  v_lim    int  := public._community_limit(_limit);
  v_ts     timestamptz;
  v_id     uuid;
  v_rows   jsonb;
  v_lts    timestamptz;
  v_lid    uuid;
BEGIN
  IF _kind NOT IN ('followers', 'following', 'requests') THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  -- Requests belong to the person who received them and to nobody else.
  IF _kind = 'requests' AND v_target <> v_uid THEN
    RAISE EXCEPTION USING message = 'not_allowed';
  END IF;
  IF NOT public._community_can_view(v_uid, v_target) THEN
    RAISE EXCEPTION USING message = 'not_allowed';
  END IF;

  SELECT c_ts, c_id INTO v_ts, v_id FROM public._community_cursor_parts(_cursor);

  WITH page AS (
    SELECT
      CASE WHEN _kind = 'following' THEN f.followee_id ELSE f.follower_id END AS other_id,
      f.created_at AS created_at
    FROM public.community_follows f
    WHERE (
        (_kind = 'following' AND f.follower_id = v_target AND f.state = 'accepted')
     OR (_kind = 'followers' AND f.followee_id = v_target AND f.state = 'accepted')
     OR (_kind = 'requests'  AND f.followee_id = v_target AND f.state = 'requested')
      )
      AND NOT public._community_is_blocked(
        v_uid, CASE WHEN _kind = 'following' THEN f.followee_id ELSE f.follower_id END)
      -- Security review 2026-09-06 (finding 12): suspended profiles vanish
      -- from follower and following lists too.
      AND EXISTS (SELECT 1 FROM public.community_profiles sp
                  WHERE sp.user_id = CASE WHEN _kind = 'following' THEN f.followee_id ELSE f.follower_id END
                    AND sp.status <> 'suspended')
      AND (
        v_ts IS NULL
        OR (f.created_at, CASE WHEN _kind = 'following' THEN f.followee_id ELSE f.follower_id END)
           < (v_ts, v_id)
      )
    ORDER BY f.created_at DESC,
      CASE WHEN _kind = 'following' THEN f.followee_id ELSE f.follower_id END DESC
    LIMIT v_lim
  )
  SELECT
    coalesce(jsonb_agg(public._community_profile_card(page.other_id, v_uid)
             ORDER BY page.created_at DESC, page.other_id DESC), '[]'::jsonb),
    (array_agg(page.created_at ORDER BY page.created_at ASC, page.other_id ASC))[1],
    (array_agg(page.other_id  ORDER BY page.created_at ASC, page.other_id ASC))[1]
  INTO v_rows, v_lts, v_lid
  FROM page;

  RETURN jsonb_build_object(
    'people', coalesce(v_rows, '[]'::jsonb),
    'cursor', public._community_cursor_of(v_lts, v_lid));
END $$;

-- ── Blocks, mutes, relationships ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_block(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  IF _target IS NULL OR _target = v_uid THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  INSERT INTO public.community_blocks (blocker_id, blocked_id)
  VALUES (v_uid, _target) ON CONFLICT DO NOTHING;

  -- Both edges go, in both directions: a block is not a quieter unfollow.
  DELETE FROM public.community_follows
  WHERE (follower_id = v_uid AND followee_id = _target)
     OR (follower_id = _target AND followee_id = v_uid);

  -- Activity between the two people goes as well, so a blocked person's name
  -- cannot linger in the blocker's inbox.
  DELETE FROM public.community_activity
  WHERE (user_id = v_uid AND actor_id = _target)
     OR (user_id = _target AND actor_id = v_uid);

  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.community_unblock(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  IF _target IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  DELETE FROM public.community_blocks WHERE blocker_id = v_uid AND blocked_id = _target;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.community_mute(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  IF _target IS NULL OR _target = v_uid THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  INSERT INTO public.community_mutes (muter_id, muted_id)
  VALUES (v_uid, _target) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.community_unmute(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  IF _target IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  DELETE FROM public.community_mutes WHERE muter_id = v_uid AND muted_id = _target;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.community_relationships()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := public._community_caller();
  v_blocked jsonb;
  v_muted   jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(
    coalesce(public._community_profile_card(b.blocked_id, v_uid),
             jsonb_build_object('user_id', b.blocked_id, 'handle', NULL,
                                'display_name', NULL))
    ORDER BY b.created_at DESC), '[]'::jsonb)
  INTO v_blocked FROM public.community_blocks b WHERE b.blocker_id = v_uid;

  SELECT coalesce(jsonb_agg(
    coalesce(public._community_profile_card(m.muted_id, v_uid),
             jsonb_build_object('user_id', m.muted_id, 'handle', NULL,
                                'display_name', NULL))
    ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO v_muted FROM public.community_mutes m WHERE m.muter_id = v_uid;

  RETURN jsonb_build_object('blocked', v_blocked, 'muted', v_muted);
END $$;

-- ── Programmes ───────────────────────────────────────────────────────────
--
-- A shared programme is STRUCTURE ONLY (SD-07): days, exercises, sets, rep
-- ranges, rest, notes and circuit groups. starting_weight, selection_reason
-- and every personal column are rejected by the forbidden-key scan, so a
-- snapshot built wrongly by a future client is refused rather than stored.

CREATE OR REPLACE FUNCTION public._community_validate_snapshot(_s jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days  jsonb;
  v_day   jsonb;
  v_count int;
BEGIN
  IF _s IS NULL OR jsonb_typeof(_s) <> 'object' THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  IF octet_length(_s::text) > 65536 THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  PERFORM public._community_forbidden_keys(_s);

  v_days := _s -> 'days';
  IF v_days IS NULL OR jsonb_typeof(v_days) <> 'array' THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  IF jsonb_array_length(v_days) < 1 OR jsonb_array_length(v_days) > 8 THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  -- Security review 2026-09-06 (finding 10): the snapshot is structure only,
  -- so its shape is an ALLOW-list, not just a forbidden-list. The top level,
  -- each day and each exercise may carry exactly the blueprint section 5.2
  -- keys; anything else is invalid_input. community-public serves the
  -- snapshot verbatim to the anonymous web, so this is the wall.
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(_s) k
    WHERE k NOT IN ('v', 'title', 'description', 'style_key', 'split_type',
                    'difficulty', 'days_per_week', 'days', 'tags')
  ) THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  FOR v_day IN SELECT value FROM jsonb_array_elements(v_days) LOOP
    IF jsonb_typeof(v_day) <> 'object'
       OR jsonb_typeof(v_day -> 'exercises') <> 'array' THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;
    IF jsonb_array_length(v_day -> 'exercises') > 20 THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_day) k
      WHERE k NOT IN ('name', 'position', 'exercises')
    ) THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_day -> 'exercises') e
      CROSS JOIN LATERAL jsonb_object_keys(
        CASE WHEN jsonb_typeof(e.value) = 'object' THEN e.value ELSE '{}'::jsonb END) k
      WHERE k NOT IN ('exercise_id', 'exercise_name', 'order', 'sets', 'reps_min',
                      'reps_max', 'rest_seconds', 'notes', 'superset_group_id',
                      'group_kind', 'round_rest_seconds')
    ) THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.community_publish_programme(_p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := public._community_caller();
  v_snapshot jsonb;
  v_title    text;
  v_desc     text;
  v_source   text;
  v_style    text;
  v_split    text;
  v_diff     text;
  v_days     int;
  v_vis      text;
  v_ex       int := 0;
  v_circ     boolean := false;
  v_day      jsonb;
  v_exercise jsonb;
  v_id       uuid;
  v_version  int;
BEGIN
  PERFORM public._community_require_profile(v_uid, true);
  IF _p IS NULL OR jsonb_typeof(_p) <> 'object' THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  v_source := nullif(btrim(coalesce(_p ->> 'source_plan_id', '')), '');
  IF v_source IS NULL OR length(v_source) > 64 THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  v_title := public._community_clean_text(btrim(coalesce(_p ->> 'title', '')));
  IF v_title IS NULL OR length(v_title) < 1 OR length(v_title) > 80 THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  v_desc := nullif(btrim(coalesce(_p ->> 'description', '')), '');
  IF v_desc IS NOT NULL THEN
    v_desc := public._community_clean_text(v_desc);
    IF length(v_desc) > 500 THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  END IF;

  v_style := nullif(btrim(coalesce(_p ->> 'style_key', '')), '');
  v_split := nullif(btrim(coalesce(_p ->> 'split_type', '')), '');
  v_diff  := nullif(btrim(coalesce(_p ->> 'difficulty', '')), '');
  IF v_style IS NOT NULL AND v_style !~ '^[a-z0-9_]{2,32}$' THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  v_vis := coalesce(nullif(btrim(coalesce(_p ->> 'visibility', '')), ''), 'public');
  IF v_vis NOT IN ('public', 'followers', 'link') THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  v_snapshot := _p -> 'snapshot';
  PERFORM public._community_validate_snapshot(v_snapshot);

  -- Exercise count and circuit presence are DERIVED from the snapshot, never
  -- taken from the caller: they are what the discover tiles show.
  FOR v_day IN SELECT value FROM jsonb_array_elements(v_snapshot -> 'days') LOOP
    v_ex := v_ex + jsonb_array_length(v_day -> 'exercises');
    FOR v_exercise IN SELECT value FROM jsonb_array_elements(v_day -> 'exercises') LOOP
      IF (v_exercise ->> 'group_kind') = 'circuit' THEN v_circ := true; END IF;
      IF (v_exercise ->> 'notes') IS NOT NULL AND length(v_exercise ->> 'notes') > 200 THEN
        RAISE EXCEPTION USING message = 'invalid_input';
      END IF;
      PERFORM public._community_clean_text(v_exercise ->> 'notes');
    END LOOP;
  END LOOP;

  IF coalesce(_p ->> 'days_per_week', '') ~ '^[0-9]{1,2}$' THEN
    v_days := (_p ->> 'days_per_week')::int;
  ELSE
    v_days := jsonb_array_length(v_snapshot -> 'days');
  END IF;
  IF v_days < 1 OR v_days > 8 THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;

  -- The rate check runs LAST, after every validation.
  PERFORM public._community_rate_check(v_uid, 'programme_publish', 10, 10);

  INSERT INTO public.community_programmes (
    owner_id, source_plan_id, title, description, style_key, split_type,
    difficulty, days_per_week, exercise_count, has_circuits, snapshot,
    version, visibility, status)
  VALUES (
    v_uid, v_source, v_title, v_desc, v_style, v_split, v_diff, v_days, v_ex,
    v_circ, v_snapshot, 1, v_vis, 'visible')
  ON CONFLICT (owner_id, source_plan_id) DO UPDATE SET
    title          = EXCLUDED.title,
    description    = EXCLUDED.description,
    style_key      = EXCLUDED.style_key,
    split_type     = EXCLUDED.split_type,
    difficulty     = EXCLUDED.difficulty,
    days_per_week  = EXCLUDED.days_per_week,
    exercise_count = EXCLUDED.exercise_count,
    has_circuits   = EXCLUDED.has_circuits,
    snapshot       = EXCLUDED.snapshot,
    visibility     = EXCLUDED.visibility,
    version        = public.community_programmes.version + 1
  RETURNING id, version INTO v_id, v_version;

  RETURN jsonb_build_object('id', v_id, 'version', v_version);
END $$;

CREATE OR REPLACE FUNCTION public.community_unpublish_programme(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  IF _id IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  DELETE FROM public.community_programmes WHERE id = _id AND owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION USING message = 'not_found'; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public._community_programme_json(_r public.community_programmes)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id',             _r.id,
    'owner_id',       _r.owner_id,
    'title',          _r.title,
    'description',    _r.description,
    'style_key',      _r.style_key,
    'split_type',     _r.split_type,
    'difficulty',     _r.difficulty,
    'days_per_week',  _r.days_per_week,
    'exercise_count', _r.exercise_count,
    'has_circuits',   _r.has_circuits,
    'snapshot',       _r.snapshot,
    'version',        _r.version,
    'visibility',     _r.visibility,
    'status',         _r.status,
    'use_count',      _r.use_count,
    'created_at',     _r.created_at,
    'updated_at',     _r.updated_at
  );
$$;

-- Programme card without the snapshot, for lists.
CREATE OR REPLACE FUNCTION public._community_programme_tile(_r public.community_programmes)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id',             _r.id,
    'owner_id',       _r.owner_id,
    'title',          _r.title,
    'description',    _r.description,
    'style_key',      _r.style_key,
    'split_type',     _r.split_type,
    'difficulty',     _r.difficulty,
    'days_per_week',  _r.days_per_week,
    'exercise_count', _r.exercise_count,
    'has_circuits',   _r.has_circuits,
    'visibility',     _r.visibility,
    'use_count',      _r.use_count,
    'updated_at',     _r.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION public.community_get_programme(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := public._community_caller();
  v_r     public.community_programmes%ROWTYPE;
  v_mode  text;
  v_comm  int;
BEGIN
  SELECT * INTO v_r FROM public.community_programmes WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION USING message = 'not_found'; END IF;

  IF v_r.owner_id <> v_uid THEN
    IF v_r.status <> 'visible' THEN RAISE EXCEPTION USING message = 'not_found'; END IF;
    IF public._community_is_blocked(v_uid, v_r.owner_id) THEN
      RAISE EXCEPTION USING message = 'not_found';
    END IF;
    -- 'link' means anyone signed in who holds the id; it is unlisted, not
    -- private, and it does not require the creator to be public.
    IF v_r.visibility <> 'link' AND NOT public._community_can_view(v_uid, v_r.owner_id) THEN
      RAISE EXCEPTION USING message = 'not_allowed';
    END IF;
    IF v_r.visibility = 'followers'
       AND NOT EXISTS (
         SELECT 1 FROM public.community_follows f
         WHERE f.follower_id = v_uid AND f.followee_id = v_r.owner_id
           AND f.state = 'accepted') THEN
      RAISE EXCEPTION USING message = 'not_allowed';
    END IF;
  END IF;

  SELECT mode INTO v_mode FROM public.community_programme_uses
  WHERE programme_id = _id AND user_id = v_uid;

  SELECT count(*) INTO v_comm FROM public.community_comments
  WHERE target_kind = 'programme' AND target_id = _id AND status = 'visible';

  RETURN jsonb_build_object(
    'programme',      public._community_programme_json(v_r),
    'creator',        public._community_profile_card(v_r.owner_id, v_uid),
    'my_use',         v_mode,
    'comments_count', v_comm);
END $$;

CREATE OR REPLACE FUNCTION public.community_record_programme_use(_id uuid, _mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := public._community_caller();
  v_owner uuid;
BEGIN
  IF _mode NOT IN ('use', 'adapt') THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  SELECT owner_id INTO v_owner FROM public.community_programmes
  WHERE id = _id AND status = 'visible';
  IF NOT FOUND THEN RAISE EXCEPTION USING message = 'not_found'; END IF;
  IF public._community_is_blocked(v_uid, v_owner) THEN
    RAISE EXCEPTION USING message = 'blocked';
  END IF;
  -- Security review 2026-09-06 (finding 14): a use is only recorded by
  -- someone who may see the programme.
  IF NOT public._community_can_view_programme(v_uid, _id) THEN
    RAISE EXCEPTION USING message = 'not_allowed';
  END IF;

  -- Once per user: the count is "how many people use this", never "how many
  -- times it was tapped". The trigger keeps use_count true.
  INSERT INTO public.community_programme_uses (programme_id, user_id, mode)
  VALUES (_id, v_uid, _mode)
  ON CONFLICT (programme_id, user_id) DO NOTHING;

  IF FOUND THEN
    PERFORM public._community_add_activity(v_owner, v_uid, 'programme_used', 'programme', _id);
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.community_my_programmes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
  v_out jsonb;
BEGIN
  -- The owner's own list also carries source_plan_id and version, so the
  -- publish screen can tell on a cold open whether THIS local plan is
  -- already published (lead review, 2026-09-06). Nobody else's list does:
  -- a local plan id is the owner's business.
  SELECT coalesce(jsonb_agg(
           public._community_programme_tile(r)
             || jsonb_build_object('source_plan_id', r.source_plan_id, 'version', r.version)
           ORDER BY r.updated_at DESC),
         '[]'::jsonb)
  INTO v_out
  FROM public.community_programmes r
  WHERE r.owner_id = v_uid;

  RETURN jsonb_build_object('programmes', v_out);
END $$;

-- Discover / search over programmes. Public + visible + creator public,
-- active and not a minor, minus anyone blocked either way. Search orders a
-- title prefix match first, then most recently updated; discover is
-- chronological (SD-06: no engagement ranking anywhere).
CREATE OR REPLACE FUNCTION public.community_search_programmes(
  _q text DEFAULT NULL, _style text DEFAULT NULL,
  _cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := public._community_caller();
  v_lim    int  := public._community_limit(_limit);
  v_q      text := nullif(public._community_fold(_q), '');
  v_ts     timestamptz;
  v_id     uuid;
  v_cprefix boolean := true;
  v_rows   jsonb;
  v_lts    timestamptz;
  v_lid    uuid;
BEGIN
  SELECT c_ts, c_id INTO v_ts, v_id FROM public._community_cursor_parts(_cursor);

  -- Ordering is (title prefix match first, then most recently updated). The
  -- cursor carries only 'updated_at|id', so the prefix class of the row the
  -- last page ended on is re-derived here from that row's own title. That
  -- keeps the three-part ordering EXACT across pages rather than sorting only
  -- within a page.
  IF v_id IS NOT NULL THEN
    SELECT (v_q IS NOT NULL AND public._community_fold(r.title) LIKE v_q || '%')
    INTO v_cprefix
    FROM public.community_programmes r WHERE r.id = v_id;
    v_cprefix := coalesce(v_cprefix, false);
  END IF;

  WITH page AS (
    SELECT
      r AS rec,
      r.updated_at AS updated_at,
      r.id AS id,
      (v_q IS NOT NULL AND public._community_fold(r.title) LIKE v_q || '%') AS prefix
    FROM public.community_programmes r
    JOIN public.community_profiles p ON p.user_id = r.owner_id
    WHERE r.status = 'visible'
      AND r.visibility = 'public'
      AND p.status = 'active'
      AND p.visibility = 'public'
      AND p.is_minor = false
      AND NOT public._community_is_blocked(v_uid, r.owner_id)
      AND (_style IS NULL OR r.style_key = _style)
      AND (
        v_q IS NULL
        OR public._community_fold(r.title) LIKE '%' || v_q || '%'
        OR (r.style_key IS NOT NULL AND public._community_fold(r.style_key) LIKE '%' || v_q || '%')
      )
      AND (
        v_ts IS NULL
        OR ((v_q IS NOT NULL AND public._community_fold(r.title) LIKE v_q || '%'),
            r.updated_at, r.id) < (v_cprefix, v_ts, v_id)
      )
    ORDER BY prefix DESC, r.updated_at DESC, r.id DESC
    LIMIT v_lim
  )
  SELECT
    coalesce(jsonb_agg(public._community_programme_tile(page.rec)
             ORDER BY page.prefix DESC, page.updated_at DESC, page.id DESC), '[]'::jsonb),
    (array_agg(page.updated_at ORDER BY page.prefix ASC, page.updated_at ASC, page.id ASC))[1],
    (array_agg(page.id         ORDER BY page.prefix ASC, page.updated_at ASC, page.id ASC))[1]
  INTO v_rows, v_lts, v_lid
  FROM page;

  RETURN jsonb_build_object(
    'programmes', coalesce(v_rows, '[]'::jsonb),
    'cursor', public._community_cursor_of(v_lts, v_lid));
END $$;

CREATE OR REPLACE FUNCTION public.community_discover_programmes(
  _style text DEFAULT NULL, _cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.community_search_programmes(NULL, _style, _cursor, _limit);
END $$;

-- ── Posts, reactions, comments ───────────────────────────────────────────
--
-- A post is a training story the user chose to publish (SD-06: nothing is
-- ever auto-posted). The payload is checked twice: its top-level keys must be
-- exactly within the allow-list for its kind, and its whole tree must contain
-- no forbidden key at any depth.

CREATE OR REPLACE FUNCTION public._community_post_json(_r public.community_posts)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id',             _r.id,
    'author_id',      _r.author_id,
    'kind',           _r.kind,
    'payload',        _r.payload,
    'caption',        _r.caption,
    'programme_id',   _r.programme_id,
    'visibility',     _r.visibility,
    'status',         _r.status,
    'reaction_count', _r.reaction_count,
    'comment_count',  _r.comment_count,
    'created_at',     _r.created_at
  );
$$;

CREATE OR REPLACE FUNCTION public.community_create_post(
  _kind text, _payload jsonb, _caption text DEFAULT NULL,
  _programme_id uuid DEFAULT NULL, _visibility text DEFAULT 'public')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := public._community_caller();
  v_allowed text[];
  v_key     text;
  v_caption text;
  v_vis     text;
  v_id      uuid;
BEGIN
  PERFORM public._community_require_profile(v_uid, true);

  v_allowed := public._community_payload_keys(_kind);
  IF v_allowed IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  IF octet_length(_payload::text) > 16384 THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  FOR v_key IN SELECT key FROM jsonb_each(_payload) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;
  END LOOP;
  PERFORM public._community_forbidden_keys(_payload);

  v_caption := nullif(btrim(coalesce(_caption, '')), '');
  IF v_caption IS NOT NULL THEN
    v_caption := public._community_clean_text(v_caption);
    IF length(v_caption) > 280 THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  END IF;

  v_vis := coalesce(nullif(btrim(coalesce(_visibility, '')), ''), 'public');
  IF v_vis NOT IN ('public', 'followers') THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  IF _programme_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.community_programmes WHERE id = _programme_id) THEN
    RAISE EXCEPTION USING message = 'not_found';
  END IF;

  -- The rate check runs LAST, after every validation: a rejected post must
  -- not spend one of the day's three.
  PERFORM public._community_rate_check(v_uid, 'post', 3, 10);

  INSERT INTO public.community_posts (author_id, kind, payload, caption, programme_id, visibility)
  VALUES (v_uid, _kind, _payload, v_caption, _programme_id, v_vis)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.community_delete_post(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  IF _id IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  DELETE FROM public.community_posts WHERE id = _id AND author_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION USING message = 'not_found'; END IF;
  DELETE FROM public.community_comments WHERE target_kind = 'post' AND target_id = _id;
  DELETE FROM public.community_activity WHERE target_kind = 'post' AND target_id = _id;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.community_get_post(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
  v_r   public.community_posts%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM public.community_posts WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION USING message = 'not_found'; END IF;

  IF v_r.author_id <> v_uid THEN
    IF v_r.status <> 'visible' THEN RAISE EXCEPTION USING message = 'not_found'; END IF;
    IF NOT public._community_can_view(v_uid, v_r.author_id) THEN
      RAISE EXCEPTION USING message = 'not_allowed';
    END IF;
    IF v_r.visibility = 'followers'
       AND NOT EXISTS (
         SELECT 1 FROM public.community_follows f
         WHERE f.follower_id = v_uid AND f.followee_id = v_r.author_id
           AND f.state = 'accepted') THEN
      RAISE EXCEPTION USING message = 'not_allowed';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'post',        public._community_post_json(v_r),
    'author',      public._community_profile_card(v_r.author_id, v_uid),
    'my_reaction', EXISTS (
      SELECT 1 FROM public.community_reactions r
      WHERE r.post_id = _id AND r.user_id = v_uid));
END $$;

-- Following: the caller's own posts plus those of everyone they follow with
-- an accepted edge, minus muted authors, newest first. Chronological by
-- design (SD-06).
CREATE OR REPLACE FUNCTION public.community_feed(_cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := public._community_caller();
  v_lim  int  := public._community_limit(_limit);
  v_ts   timestamptz;
  v_id   uuid;
  v_rows jsonb;
  v_lts  timestamptz;
  v_lid  uuid;
BEGIN
  PERFORM public._community_require_profile(v_uid, false);
  SELECT c_ts, c_id INTO v_ts, v_id FROM public._community_cursor_parts(_cursor);

  WITH page AS (
    SELECT r AS rec, r.created_at AS created_at, r.id AS id, r.author_id AS author_id
    FROM public.community_posts r
    WHERE r.status = 'visible'
      AND (
        r.author_id = v_uid
        OR EXISTS (
          SELECT 1 FROM public.community_follows f
          WHERE f.follower_id = v_uid AND f.followee_id = r.author_id
            AND f.state = 'accepted')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.community_mutes m
        WHERE m.muter_id = v_uid AND m.muted_id = r.author_id)
      AND NOT public._community_is_blocked(v_uid, r.author_id)
      -- SD-11: a suspended profile is invisible everywhere, including to
      -- the people who already followed it (lead review, 2026-09-06).
      AND EXISTS (
        SELECT 1 FROM public.community_profiles ap
        WHERE ap.user_id = r.author_id AND ap.status <> 'suspended')
      AND (v_ts IS NULL OR (r.created_at, r.id) < (v_ts, v_id))
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT v_lim
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
        'post',   public._community_post_json(page.rec),
        'author', public._community_profile_card(page.author_id, v_uid),
        'my_reaction', EXISTS (
          SELECT 1 FROM public.community_reactions rr
          WHERE rr.post_id = page.id AND rr.user_id = v_uid))
      ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb),
    (array_agg(page.created_at ORDER BY page.created_at ASC, page.id ASC))[1],
    (array_agg(page.id         ORDER BY page.created_at ASC, page.id ASC))[1]
  INTO v_rows, v_lts, v_lid
  FROM page;

  RETURN jsonb_build_object(
    'posts', coalesce(v_rows, '[]'::jsonb),
    'cursor', public._community_cursor_of(v_lts, v_lid));
END $$;

CREATE OR REPLACE FUNCTION public.community_discover_posts(
  _cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := public._community_caller();
  v_lim  int  := public._community_limit(_limit);
  v_ts   timestamptz;
  v_id   uuid;
  v_rows jsonb;
  v_lts  timestamptz;
  v_lid  uuid;
BEGIN
  SELECT c_ts, c_id INTO v_ts, v_id FROM public._community_cursor_parts(_cursor);

  WITH page AS (
    SELECT r AS rec, r.created_at AS created_at, r.id AS id, r.author_id AS author_id
    FROM public.community_posts r
    JOIN public.community_profiles p ON p.user_id = r.author_id
    WHERE r.status = 'visible'
      AND r.visibility = 'public'
      AND p.status = 'active'
      AND p.visibility = 'public'
      AND p.is_minor = false
      AND NOT public._community_is_blocked(v_uid, r.author_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.community_mutes m
        WHERE m.muter_id = v_uid AND m.muted_id = r.author_id)
      AND (v_ts IS NULL OR (r.created_at, r.id) < (v_ts, v_id))
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT v_lim
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
        'post',   public._community_post_json(page.rec),
        'author', public._community_profile_card(page.author_id, v_uid),
        'my_reaction', EXISTS (
          SELECT 1 FROM public.community_reactions rr
          WHERE rr.post_id = page.id AND rr.user_id = v_uid))
      ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb),
    (array_agg(page.created_at ORDER BY page.created_at ASC, page.id ASC))[1],
    (array_agg(page.id         ORDER BY page.created_at ASC, page.id ASC))[1]
  INTO v_rows, v_lts, v_lid
  FROM page;

  RETURN jsonb_build_object(
    'posts', coalesce(v_rows, '[]'::jsonb),
    'cursor', public._community_cursor_of(v_lts, v_lid));
END $$;

CREATE OR REPLACE FUNCTION public.community_react(_post_id uuid, _on boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := public._community_caller();
  v_author uuid;
  v_vis    text;
  v_count  int;
BEGIN
  PERFORM public._community_require_profile(v_uid, true);
  IF _post_id IS NULL OR _on IS NULL THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  SELECT author_id, visibility INTO v_author, v_vis
  FROM public.community_posts WHERE id = _post_id AND status = 'visible';
  IF NOT FOUND THEN RAISE EXCEPTION USING message = 'not_found'; END IF;
  IF public._community_is_blocked(v_uid, v_author) THEN
    RAISE EXCEPTION USING message = 'blocked';
  END IF;
  IF NOT public._community_can_view_post(v_uid, _post_id) THEN
    RAISE EXCEPTION USING message = 'not_allowed';
  END IF;

  IF _on THEN
    -- Security review 2026-09-06 (finding 8): reactions are a push and an
    -- activity row at the author, so they sit on the rate rail like every
    -- other write. 100 a day new, 300 established.
    PERFORM public._community_rate_check(v_uid, 'react', 100, 300);
    INSERT INTO public.community_reactions (post_id, user_id)
    VALUES (_post_id, v_uid) ON CONFLICT DO NOTHING;
    IF FOUND THEN
      PERFORM public._community_add_activity(v_author, v_uid, 'reaction', 'post', _post_id);
    END IF;
  ELSE
    DELETE FROM public.community_reactions WHERE post_id = _post_id AND user_id = v_uid;
  END IF;

  SELECT reaction_count INTO v_count FROM public.community_posts WHERE id = _post_id;
  RETURN jsonb_build_object('on', _on, 'reaction_count', v_count);
END $$;

CREATE OR REPLACE FUNCTION public.community_comment(
  _target_kind text, _target_id uuid, _body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := public._community_caller();
  v_owner uuid;
  v_body  text;
  v_id    uuid;
BEGIN
  PERFORM public._community_require_profile(v_uid, true);
  IF _target_kind NOT IN ('post', 'programme') OR _target_id IS NULL THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  v_body := public._community_clean_text(btrim(coalesce(_body, '')));
  IF v_body IS NULL OR length(v_body) < 1 OR length(v_body) > 500 THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  IF _target_kind = 'post' THEN
    SELECT author_id INTO v_owner FROM public.community_posts
    WHERE id = _target_id AND status = 'visible';
  ELSE
    SELECT owner_id INTO v_owner FROM public.community_programmes
    WHERE id = _target_id AND status = 'visible';
  END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION USING message = 'not_found'; END IF;
  IF public._community_is_blocked(v_uid, v_owner) THEN
    RAISE EXCEPTION USING message = 'blocked';
  END IF;
  -- Security review 2026-09-06 (findings 1-2): the TARGET's own visibility
  -- decides, not the owner's profile visibility.
  IF (_target_kind = 'post' AND NOT public._community_can_view_post(v_uid, _target_id))
     OR (_target_kind = 'programme' AND NOT public._community_can_view_programme(v_uid, _target_id)) THEN
    RAISE EXCEPTION USING message = 'not_allowed';
  END IF;

  -- Comments are the most abusable surface, so the window is an hour rather
  -- than a day.
  PERFORM public._community_rate_check(v_uid, 'comment', 10, 30, interval '1 hour');

  INSERT INTO public.community_comments (target_kind, target_id, author_id, body)
  VALUES (_target_kind, _target_id, v_uid, v_body)
  RETURNING id INTO v_id;

  PERFORM public._community_add_activity(v_owner, v_uid, 'comment', _target_kind, _target_id);

  RETURN jsonb_build_object('id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.community_delete_comment(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := public._community_caller();
  v_c     public.community_comments%ROWTYPE;
  v_owner uuid;
BEGIN
  SELECT * INTO v_c FROM public.community_comments WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION USING message = 'not_found'; END IF;

  IF v_c.target_kind = 'post' THEN
    SELECT author_id INTO v_owner FROM public.community_posts WHERE id = v_c.target_id;
  ELSE
    SELECT owner_id INTO v_owner FROM public.community_programmes WHERE id = v_c.target_id;
  END IF;

  -- The author of the comment, or the owner of the thing it sits under.
  IF v_c.author_id <> v_uid AND coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid) <> v_uid THEN
    RAISE EXCEPTION USING message = 'not_allowed';
  END IF;

  DELETE FROM public.community_comments WHERE id = _id;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.community_list_comments(
  _target_kind text, _target_id uuid,
  _cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := public._community_caller();
  v_lim   int  := public._community_limit(_limit);
  v_owner uuid;
  v_ts    timestamptz;
  v_id    uuid;
  v_rows  jsonb;
  v_lts   timestamptz;
  v_lid   uuid;
BEGIN
  IF _target_kind NOT IN ('post', 'programme') OR _target_id IS NULL THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  IF _target_kind = 'post' THEN
    SELECT author_id INTO v_owner FROM public.community_posts
    WHERE id = _target_id AND status = 'visible';
  ELSE
    SELECT owner_id INTO v_owner FROM public.community_programmes
    WHERE id = _target_id AND status = 'visible';
  END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION USING message = 'not_found'; END IF;
  -- Security review 2026-09-06 (finding 1): the TARGET's own visibility
  -- decides who may read its thread.
  IF (_target_kind = 'post' AND NOT public._community_can_view_post(v_uid, _target_id))
     OR (_target_kind = 'programme' AND NOT public._community_can_view_programme(v_uid, _target_id)) THEN
    RAISE EXCEPTION USING message = 'not_allowed';
  END IF;

  SELECT c_ts, c_id INTO v_ts, v_id FROM public._community_cursor_parts(_cursor);

  WITH page AS (
    SELECT c.id AS id, c.body AS body, c.created_at AS created_at, c.author_id AS author_id
    FROM public.community_comments c
    WHERE c.target_kind = _target_kind AND c.target_id = _target_id
      AND c.status = 'visible'
      AND NOT public._community_is_blocked(v_uid, c.author_id)
      -- SD-11: comments by a suspended profile vanish with the profile.
      AND EXISTS (
        SELECT 1 FROM public.community_profiles ap
        WHERE ap.user_id = c.author_id AND ap.status <> 'suspended')
      AND (v_ts IS NULL OR (c.created_at, c.id) < (v_ts, v_id))
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT v_lim
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
        'id',         page.id,
        'body',       page.body,
        'created_at', page.created_at,
        'author',     public._community_profile_card(page.author_id, v_uid),
        'mine',       page.author_id = v_uid)
      ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb),
    (array_agg(page.created_at ORDER BY page.created_at ASC, page.id ASC))[1],
    (array_agg(page.id         ORDER BY page.created_at ASC, page.id ASC))[1]
  INTO v_rows, v_lts, v_lid
  FROM page;

  RETURN jsonb_build_object(
    'comments', coalesce(v_rows, '[]'::jsonb),
    'cursor', public._community_cursor_of(v_lts, v_lid));
END $$;

-- ── People: search, suggestions, profile, dimensions ─────────────────────

CREATE OR REPLACE FUNCTION public.community_search_people(_q text, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
  v_lim int  := public._community_limit(_limit);
  v_q   text := nullif(public._community_fold(_q), '');
  v_out jsonb;
BEGIN
  IF v_q IS NULL OR length(v_q) < 2 THEN
    RETURN jsonb_build_object('people', '[]'::jsonb);
  END IF;

  SELECT coalesce(jsonb_agg(public._community_profile_card(p.user_id, v_uid)
           ORDER BY (p.handle LIKE v_q || '%') DESC, p.last_active_at DESC), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT pr.user_id, pr.handle, pr.last_active_at
    FROM public.community_profiles pr
    WHERE pr.status = 'active'
      AND pr.visibility = 'public'
      AND pr.is_minor = false
      AND pr.user_id <> v_uid
      AND NOT public._community_is_blocked(v_uid, pr.user_id)
      AND (
        pr.handle LIKE v_q || '%'
        -- display-name match is prefix-of-word, so "sam" finds "Big Sam" but
        -- not "Awesome".
        OR ' ' || public._community_fold(pr.display_name) LIKE '% ' || v_q || '%'
      )
    ORDER BY (pr.handle LIKE v_q || '%') DESC, pr.last_active_at DESC
    LIMIT v_lim
  ) p;

  RETURN jsonb_build_object('people', v_out);
END $$;

-- Suggestions are scored on CHOSEN facts only (SD-09): never on popularity,
-- never on anything the engine inferred, never on body data. Every suggestion
-- carries the reasons that produced it, in the exact wording the blueprint
-- fixes. Ties break on recent activity.
CREATE OR REPLACE FUNCTION public.community_suggested_people(_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := public._community_caller();
  v_lim   int  := public._community_limit(_limit);
  v_me    public.community_profiles%ROWTYPE;
  v_out   jsonb := '[]'::jsonb;
  v_row   record;
  v_score int;
  v_reasons text[];
  v_style text;
  v_mutual int;
  v_items jsonb[] := ARRAY[]::jsonb[];
BEGIN
  v_me := public._community_require_profile(v_uid, false);

  FOR v_row IN
    SELECT p.*
    FROM public.community_profiles p
    WHERE p.status = 'active'
      AND p.visibility = 'public'
      AND p.is_minor = false
      AND p.user_id <> v_uid
      AND NOT public._community_is_blocked(v_uid, p.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.community_follows f
        WHERE f.follower_id = v_uid AND f.followee_id = p.user_id)
    ORDER BY p.last_active_at DESC
    LIMIT 200
  LOOP
    v_score := 0;
    v_reasons := ARRAY[]::text[];

    -- A programme both people use (or one published and the other uses).
    IF EXISTS (
      SELECT 1
      FROM public.community_programme_uses a
      JOIN public.community_programme_uses b ON b.programme_id = a.programme_id
      WHERE a.user_id = v_uid AND b.user_id = v_row.user_id
      UNION ALL
      SELECT 1
      FROM public.community_programmes g
      JOIN public.community_programme_uses u ON u.programme_id = g.id
      WHERE (g.owner_id = v_uid AND u.user_id = v_row.user_id)
         OR (g.owner_id = v_row.user_id AND u.user_id = v_uid)
    ) THEN
      v_score := v_score + 3;
      v_reasons := v_reasons || 'Uses a programme you use';
    END IF;

    IF v_me.gym_key IS NOT NULL AND v_row.gym_key = v_me.gym_key THEN
      v_score := v_score + 3;
      v_reasons := v_reasons || ('Trains at ' || coalesce(v_row.gym_label, v_me.gym_label));
    END IF;

    SELECT s INTO v_style
    FROM unnest(v_me.styles) AS s
    WHERE s = ANY (v_row.styles)
    LIMIT 1;
    IF v_style IS NOT NULL THEN
      v_score := v_score + 2;
      v_reasons := v_reasons || ('Also trains ' || public._community_style_label(v_style));
    END IF;

    IF v_me.area_key IS NOT NULL AND v_row.area_key = v_me.area_key THEN
      v_score := v_score + 2;
      v_reasons := v_reasons || ('Lists ' || coalesce(v_row.area_label, v_me.area_label));
    END IF;

    IF v_me.goal IS NOT NULL AND v_row.goal = v_me.goal THEN
      v_score := v_score + 1;
      v_reasons := v_reasons || 'Same goal';
    END IF;

    SELECT count(*) INTO v_mutual
    FROM public.community_follows mine
    JOIN public.community_follows theirs ON theirs.follower_id = mine.followee_id
    WHERE mine.follower_id = v_uid AND mine.state = 'accepted'
      AND theirs.followee_id = v_row.user_id AND theirs.state = 'accepted';
    IF v_mutual > 0 THEN
      v_score := v_score + 2;
      v_reasons := v_reasons || ('Followed by ' || v_mutual::text || ' you follow');
    END IF;

    IF v_score >= 1 THEN
      v_items := v_items || jsonb_build_object(
        'card',    public._community_profile_card(v_row.user_id, v_uid),
        'reasons', to_jsonb(v_reasons),
        'score',   v_score,
        'last_active_at', v_row.last_active_at);
    END IF;
  END LOOP;

  SELECT coalesce(jsonb_agg(z.x ORDER BY (z.x ->> 'score')::int DESC,
                            (z.x ->> 'last_active_at')::timestamptz DESC), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT t.x
    FROM (SELECT unnest(v_items) AS x) t
    ORDER BY (t.x ->> 'score')::int DESC, (t.x ->> 'last_active_at')::timestamptz DESC
    LIMIT v_lim
  ) z;

  RETURN jsonb_build_object('people', v_out);
END $$;

CREATE OR REPLACE FUNCTION public.community_get_profile(
  _handle text DEFAULT NULL, _uid uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := public._community_caller();
  v_target   uuid;
  v_viewable boolean;
  v_posts    jsonb := '[]'::jsonb;
  v_progs    jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NOT NULL THEN
    v_target := _uid;
  ELSIF _handle IS NOT NULL THEN
    SELECT user_id INTO v_target FROM public.community_profiles
    WHERE handle = lower(btrim(_handle));
  END IF;
  IF v_target IS NULL THEN RAISE EXCEPTION USING message = 'not_found'; END IF;

  -- A blocked person is not told they are blocked; the profile simply is not
  -- there (SD-11, two-way invisibility).
  IF public._community_is_blocked(v_uid, v_target) THEN
    RAISE EXCEPTION USING message = 'not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_profiles
    WHERE user_id = v_target AND (status <> 'suspended' OR user_id = v_uid)
  ) THEN
    RAISE EXCEPTION USING message = 'not_found';
  END IF;

  v_viewable := public._community_can_view(v_uid, v_target);

  IF v_viewable THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'post',   public._community_post_json(r),
             'author', public._community_profile_card(r.author_id, v_uid),
             'my_reaction', EXISTS (
               SELECT 1 FROM public.community_reactions rr
               WHERE rr.post_id = r.id AND rr.user_id = v_uid))
           ORDER BY r.created_at DESC, r.id DESC), '[]'::jsonb)
    INTO v_posts
    FROM (
      SELECT * FROM public.community_posts p
      WHERE p.author_id = v_target AND p.status = 'visible'
        AND (p.visibility = 'public' OR v_target = v_uid
             OR EXISTS (SELECT 1 FROM public.community_follows f
                        WHERE f.follower_id = v_uid AND f.followee_id = v_target
                          AND f.state = 'accepted'))
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 20
    ) r;

    SELECT coalesce(jsonb_agg(public._community_programme_tile(g)
           ORDER BY g.updated_at DESC), '[]'::jsonb)
    INTO v_progs
    FROM (
      SELECT * FROM public.community_programmes gg
      WHERE gg.owner_id = v_target AND gg.status = 'visible'
        AND (gg.visibility = 'public' OR v_target = v_uid
             OR (gg.visibility = 'followers'
                 AND EXISTS (SELECT 1 FROM public.community_follows f
                             WHERE f.follower_id = v_uid AND f.followee_id = v_target
                               AND f.state = 'accepted')))
      ORDER BY gg.updated_at DESC
      LIMIT 50
    ) g;
  END IF;

  RETURN jsonb_build_object(
    'card',       public._community_profile_card(v_target, v_uid),
    'viewable',   v_viewable,
    'posts',      v_posts,
    'programmes', v_progs);
END $$;

-- Dimensions are not rooms (SD-10). A dimension exists when at least one
-- OTHER public, active, non-minor person shares it; the client decides what
-- to surface on the hub at three or more.
CREATE OR REPLACE FUNCTION public.community_dimensions_me()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := public._community_caller();
  v_me   public.community_profiles%ROWTYPE;
  v_out  jsonb := '[]'::jsonb;
  v_items jsonb[] := ARRAY[]::jsonb[];
  v_style text;
  v_count int;
  v_prog  record;
BEGIN
  v_me := public._community_require_profile(v_uid, false);

  FOREACH v_style IN ARRAY v_me.styles LOOP
    SELECT count(*) INTO v_count
    FROM public.community_profiles p
    WHERE p.user_id <> v_uid AND p.status = 'active' AND p.visibility = 'public'
      AND p.is_minor = false AND v_style = ANY (p.styles)
      AND NOT public._community_is_blocked(v_uid, p.user_id);
    IF v_count >= 1 THEN
      v_items := v_items || jsonb_build_object(
        'kind', 'style', 'key', v_style,
        'label', public._community_style_label(v_style), 'count', v_count);
    END IF;
  END LOOP;

  IF v_me.gym_key IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.community_profiles p
    WHERE p.user_id <> v_uid AND p.status = 'active' AND p.visibility = 'public'
      AND p.is_minor = false AND p.gym_key = v_me.gym_key
      AND NOT public._community_is_blocked(v_uid, p.user_id);
    IF v_count >= 1 THEN
      v_items := v_items || jsonb_build_object(
        'kind', 'gym', 'key', v_me.gym_key, 'label', v_me.gym_label, 'count', v_count);
    END IF;
  END IF;

  IF v_me.area_key IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.community_profiles p
    WHERE p.user_id <> v_uid AND p.status = 'active' AND p.visibility = 'public'
      AND p.is_minor = false AND p.area_key = v_me.area_key
      AND NOT public._community_is_blocked(v_uid, p.user_id);
    IF v_count >= 1 THEN
      v_items := v_items || jsonb_build_object(
        'kind', 'area', 'key', v_me.area_key, 'label', v_me.area_label, 'count', v_count);
    END IF;
  END IF;

  -- Programmes I published or use.
  FOR v_prog IN
    SELECT g.id, g.title
    FROM public.community_programmes g
    WHERE g.status = 'visible'
      AND (g.owner_id = v_uid
           OR EXISTS (SELECT 1 FROM public.community_programme_uses u
                      WHERE u.programme_id = g.id AND u.user_id = v_uid))
  LOOP
    SELECT count(*) INTO v_count
    FROM public.community_programme_uses u
    JOIN public.community_profiles p ON p.user_id = u.user_id
    WHERE u.programme_id = v_prog.id AND u.user_id <> v_uid
      AND p.status = 'active' AND p.visibility = 'public' AND p.is_minor = false
      AND NOT public._community_is_blocked(v_uid, p.user_id);
    IF v_count >= 1 THEN
      v_items := v_items || jsonb_build_object(
        'kind', 'programme', 'key', v_prog.id::text, 'label', v_prog.title, 'count', v_count);
    END IF;
  END LOOP;

  SELECT coalesce(jsonb_agg(x ORDER BY (x ->> 'count')::int DESC), '[]'::jsonb)
  INTO v_out FROM (SELECT unnest(v_items) AS x) t;

  RETURN jsonb_build_object('dimensions', v_out);
END $$;

CREATE OR REPLACE FUNCTION public.community_dimension(
  _kind text, _key text, _cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := public._community_caller();
  v_lim   int  := public._community_limit(_limit);
  v_ts    timestamptz;
  v_id    uuid;
  v_label text;
  v_count int := 0;
  v_people jsonb := '[]'::jsonb;
  v_progs  jsonb := '[]'::jsonb;
  v_lts   timestamptz;
  v_lid   uuid;
BEGIN
  IF _kind NOT IN ('style', 'programme', 'gym', 'area') OR _key IS NULL THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  -- A programme dimension is keyed by its uuid; anything else is bad input
  -- rather than an uncoded cast error the client cannot map to calm copy.
  IF _kind = 'programme'
     AND _key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  SELECT c_ts, c_id INTO v_ts, v_id FROM public._community_cursor_parts(_cursor);

  IF _kind = 'programme' THEN
    -- Security review 2026-09-06 (finding 4): the programme dimension is
    -- gated exactly like the programme itself.
    IF NOT public._community_can_view_programme(v_uid, _key::uuid) THEN
      RAISE EXCEPTION USING message = 'not_found';
    END IF;
    SELECT title INTO v_label FROM public.community_programmes
    WHERE id = _key::uuid AND status = 'visible';
    IF v_label IS NULL THEN RAISE EXCEPTION USING message = 'not_found'; END IF;
  ELSIF _kind = 'style' THEN
    v_label := public._community_style_label(_key);
  ELSE
    SELECT CASE WHEN _kind = 'gym' THEN gym_label ELSE area_label END INTO v_label
    FROM public.community_profiles
    WHERE (_kind = 'gym' AND gym_key = _key) OR (_kind = 'area' AND area_key = _key)
    LIMIT 1;
  END IF;

  WITH page AS (
    SELECT p.user_id AS user_id, p.created_at AS created_at
    FROM public.community_profiles p
    WHERE p.status = 'active' AND p.visibility = 'public' AND p.is_minor = false
      AND p.user_id <> v_uid
      AND NOT public._community_is_blocked(v_uid, p.user_id)
      AND (
        (_kind = 'style' AND _key = ANY (p.styles))
     OR (_kind = 'gym'   AND p.gym_key = _key)
     OR (_kind = 'area'  AND p.area_key = _key)
     OR (_kind = 'programme' AND EXISTS (
           SELECT 1 FROM public.community_programme_uses u
           WHERE u.user_id = p.user_id AND u.programme_id = _key::uuid))
      )
      AND (v_ts IS NULL OR (p.created_at, p.user_id) < (v_ts, v_id))
    ORDER BY p.created_at DESC, p.user_id DESC
    LIMIT v_lim
  )
  SELECT
    coalesce(jsonb_agg(public._community_profile_card(page.user_id, v_uid)
             ORDER BY page.created_at DESC, page.user_id DESC), '[]'::jsonb),
    (array_agg(page.created_at ORDER BY page.created_at ASC, page.user_id ASC))[1],
    (array_agg(page.user_id    ORDER BY page.created_at ASC, page.user_id ASC))[1]
  INTO v_people, v_lts, v_lid
  FROM page;

  SELECT count(*) INTO v_count
  FROM public.community_profiles p
  WHERE p.status = 'active' AND p.visibility = 'public' AND p.is_minor = false
    AND p.user_id <> v_uid
    AND NOT public._community_is_blocked(v_uid, p.user_id)
    AND (
      (_kind = 'style' AND _key = ANY (p.styles))
   OR (_kind = 'gym'   AND p.gym_key = _key)
   OR (_kind = 'area'  AND p.area_key = _key)
   OR (_kind = 'programme' AND EXISTS (
         SELECT 1 FROM public.community_programme_uses u
         WHERE u.user_id = p.user_id AND u.programme_id = _key::uuid))
    );

  IF _kind = 'style' THEN
    SELECT coalesce(jsonb_agg(public._community_programme_tile(g)
           ORDER BY g.updated_at DESC), '[]'::jsonb)
    INTO v_progs
    FROM (
      SELECT gg.* FROM public.community_programmes gg
      JOIN public.community_profiles pp ON pp.user_id = gg.owner_id
      WHERE gg.status = 'visible' AND gg.visibility = 'public'
        AND gg.style_key = _key
        AND pp.status = 'active' AND pp.visibility = 'public' AND pp.is_minor = false
        AND NOT public._community_is_blocked(v_uid, gg.owner_id)
      ORDER BY gg.updated_at DESC
      LIMIT 20
    ) g;
  ELSIF _kind = 'programme' THEN
    SELECT coalesce(jsonb_agg(public._community_programme_tile(g)), '[]'::jsonb)
    INTO v_progs
    FROM (SELECT * FROM public.community_programmes
          WHERE id = _key::uuid AND public._community_can_view_programme(v_uid, id)) g;
  END IF;

  RETURN jsonb_build_object(
    'label', v_label, 'count', v_count,
    'people', coalesce(v_people, '[]'::jsonb),
    'programmes', v_progs,
    'cursor', public._community_cursor_of(v_lts, v_lid));
END $$;

-- ── Activity inbox ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_activity(
  _cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := public._community_caller();
  v_lim  int  := public._community_limit(_limit);
  v_ts   timestamptz;
  v_id   uuid;
  v_rows jsonb;
  v_lts  timestamptz;
  v_lid  uuid;
BEGIN
  PERFORM public._community_require_profile(v_uid, false);
  SELECT c_ts, c_id INTO v_ts, v_id FROM public._community_cursor_parts(_cursor);

  WITH page AS (
    SELECT a.id AS id, a.kind AS kind, a.actor_id AS actor_id,
           a.target_kind AS target_kind, a.target_id AS target_id,
           a.seen_at AS seen_at, a.created_at AS created_at
    FROM public.community_activity a
    WHERE a.user_id = v_uid
      AND (a.actor_id IS NULL OR NOT public._community_is_blocked(v_uid, a.actor_id))
      AND (a.actor_id IS NULL OR EXISTS (
            SELECT 1 FROM public.community_profiles sp
            WHERE sp.user_id = a.actor_id AND sp.status <> 'suspended'))
      AND (v_ts IS NULL OR (a.created_at, a.id) < (v_ts, v_id))
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT v_lim
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
        'id',          page.id,
        'kind',        page.kind,
        'actor',       public._community_profile_card(page.actor_id, v_uid),
        'target_kind', page.target_kind,
        'target_id',   page.target_id,
        -- The preview is the post caption when there is one; never any part
        -- of the payload, which is where numbers live.
        'preview',     (SELECT p.caption FROM public.community_posts p
                        WHERE page.target_kind = 'post' AND p.id = page.target_id),
        'created_at',  page.created_at,
        'seen',        page.seen_at IS NOT NULL)
      ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb),
    (array_agg(page.created_at ORDER BY page.created_at ASC, page.id ASC))[1],
    (array_agg(page.id         ORDER BY page.created_at ASC, page.id ASC))[1]
  INTO v_rows, v_lts, v_lid
  FROM page;

  RETURN jsonb_build_object(
    'activity', coalesce(v_rows, '[]'::jsonb),
    'cursor', public._community_cursor_of(v_lts, v_lid));
END $$;

CREATE OR REPLACE FUNCTION public.community_mark_activity_seen()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  UPDATE public.community_activity SET seen_at = now()
  WHERE user_id = v_uid AND seen_at IS NULL;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Reports and moderation (SD-11: moderation ships first) ───────────────

CREATE OR REPLACE FUNCTION public.community_report(
  _target_kind text, _target_id uuid, _reason text, _detail text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := public._community_caller();
  v_owner  uuid;
  v_detail text;
  v_id     uuid;
BEGIN
  IF _target_kind NOT IN ('profile', 'post', 'comment', 'programme')
     OR _target_id IS NULL THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  IF _reason NOT IN ('spam', 'harassment', 'impersonation',
                     'harmful_body_or_eating_content', 'inappropriate', 'other') THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.community_reports
    WHERE reporter_id = v_uid AND target_kind = _target_kind
      AND target_id = _target_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION USING message = 'already_reported';
  END IF;

  PERFORM public._community_rate_check(v_uid, 'report', 20, 20);

  -- The detail box is free text a person writes while upset; it is length
  -- bounded but deliberately NOT keyword filtered, because a report about
  -- abuse must be able to quote the abuse.
  v_detail := nullif(btrim(coalesce(_detail, '')), '');
  IF v_detail IS NOT NULL AND length(v_detail) > 1000 THEN
    v_detail := left(v_detail, 1000);
  END IF;

  IF _target_kind = 'profile' THEN
    SELECT user_id  INTO v_owner FROM public.community_profiles   WHERE user_id = _target_id;
  ELSIF _target_kind = 'post' THEN
    SELECT author_id INTO v_owner FROM public.community_posts      WHERE id = _target_id;
  ELSIF _target_kind = 'comment' THEN
    SELECT author_id INTO v_owner FROM public.community_comments   WHERE id = _target_id;
  ELSE
    SELECT owner_id  INTO v_owner FROM public.community_programmes WHERE id = _target_id;
  END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION USING message = 'not_found'; END IF;

  INSERT INTO public.community_reports
    (reporter_id, target_kind, target_id, target_owner_id, reason, detail, priority)
  VALUES (v_uid, _target_kind, _target_id, v_owner, _reason, v_detail,
          _reason = 'harmful_body_or_eating_content')
  RETURNING id INTO v_id;

  PERFORM public._community_auto_hide(_target_kind, _target_id);

  RETURN jsonb_build_object('id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.community_moderation_queue(
  _status text DEFAULT 'open', _cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := public._community_caller();
  v_lim  int  := public._community_limit(_limit);
  v_ts   timestamptz;
  v_id   uuid;
  v_rows jsonb;
  v_lts  timestamptz;
  v_lid  uuid;
BEGIN
  IF NOT public.community_is_moderator() THEN
    RAISE EXCEPTION USING message = 'not_moderator';
  END IF;
  IF _status IS NOT NULL AND _status NOT IN ('open', 'actioned', 'dismissed') THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  SELECT c_ts, c_id INTO v_ts, v_id FROM public._community_cursor_parts(_cursor);

  WITH page AS (
    SELECT r.*
    FROM public.community_reports r
    WHERE (_status IS NULL OR r.status = _status)
      AND (v_ts IS NULL OR (r.created_at, r.id) < (v_ts, v_id))
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT v_lim
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
        'id',          page.id,
        'target_kind', page.target_kind,
        'target_id',   page.target_id,
        'target_owner_id', page.target_owner_id,
        'reason',      page.reason,
        'detail',      page.detail,
        'status',      page.status,
        'priority',    page.priority,
        'created_at',  page.created_at,
        'content',     CASE
          WHEN page.target_kind = 'post' THEN
            (SELECT jsonb_build_object('kind', p.kind, 'caption', p.caption,
                                       'status', p.status)
             FROM public.community_posts p WHERE p.id = page.target_id)
          WHEN page.target_kind = 'comment' THEN
            (SELECT jsonb_build_object('body', c.body, 'status', c.status)
             FROM public.community_comments c WHERE c.id = page.target_id)
          WHEN page.target_kind = 'programme' THEN
            (SELECT jsonb_build_object('title', g.title, 'description', g.description,
                                       'status', g.status)
             FROM public.community_programmes g WHERE g.id = page.target_id)
          ELSE
            (SELECT jsonb_build_object('handle', pr.handle, 'display_name', pr.display_name,
                                       'bio', pr.bio, 'status', pr.status)
             FROM public.community_profiles pr WHERE pr.user_id = page.target_id)
        END)
      ORDER BY page.priority DESC, page.created_at DESC, page.id DESC), '[]'::jsonb),
    (array_agg(page.created_at ORDER BY page.created_at ASC, page.id ASC))[1],
    (array_agg(page.id         ORDER BY page.created_at ASC, page.id ASC))[1]
  INTO v_rows, v_lts, v_lid
  FROM page;

  RETURN jsonb_build_object(
    'reports', coalesce(v_rows, '[]'::jsonb),
    'cursor', public._community_cursor_of(v_lts, v_lid));
END $$;

CREATE OR REPLACE FUNCTION public.community_moderate(
  _report_id uuid, _action text, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
  v_r   public.community_reports%ROWTYPE;
  v_new text;
BEGIN
  IF NOT public.community_is_moderator() THEN
    RAISE EXCEPTION USING message = 'not_moderator';
  END IF;
  IF _action NOT IN ('dismiss', 'hide_content', 'unhide_content', 'delete_content',
                     'restrict_account', 'unrestrict_account',
                     'suspend_account', 'unsuspend_account') THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  SELECT * INTO v_r FROM public.community_reports WHERE id = _report_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING message = 'not_found'; END IF;

  IF _action IN ('hide_content', 'unhide_content', 'delete_content') THEN
    v_new := CASE WHEN _action = 'unhide_content' THEN 'visible' ELSE 'hidden' END;
    IF v_r.target_kind = 'post' THEN
      IF _action = 'delete_content' THEN
        DELETE FROM public.community_posts WHERE id = v_r.target_id;
      ELSE
        UPDATE public.community_posts SET status = v_new WHERE id = v_r.target_id;
      END IF;
    ELSIF v_r.target_kind = 'comment' THEN
      IF _action = 'delete_content' THEN
        DELETE FROM public.community_comments WHERE id = v_r.target_id;
      ELSE
        UPDATE public.community_comments SET status = v_new WHERE id = v_r.target_id;
      END IF;
    ELSIF v_r.target_kind = 'programme' THEN
      IF _action = 'delete_content' THEN
        DELETE FROM public.community_programmes WHERE id = v_r.target_id;
      ELSE
        UPDATE public.community_programmes SET status = v_new WHERE id = v_r.target_id;
      END IF;
    ELSE
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;
  ELSIF _action IN ('restrict_account', 'unrestrict_account',
                    'suspend_account', 'unsuspend_account') THEN
    IF v_r.target_owner_id IS NULL THEN RAISE EXCEPTION USING message = 'not_found'; END IF;
    UPDATE public.community_profiles SET status = CASE _action
        WHEN 'restrict_account'   THEN 'restricted'
        WHEN 'suspend_account'    THEN 'suspended'
        ELSE 'active' END
    WHERE user_id = v_r.target_owner_id;
  END IF;

  UPDATE public.community_reports SET
    status      = CASE WHEN _action = 'dismiss' THEN 'dismissed' ELSE 'actioned' END,
    resolved_at = now(),
    resolved_by = v_uid,
    resolution  = _action
  WHERE id = _report_id;

  -- Every moderator action is auditable, always (SD-11).
  INSERT INTO public.community_moderation_log
    (moderator_id, action, target_kind, target_id, report_id, note)
  VALUES (v_uid, _action, v_r.target_kind, v_r.target_id, _report_id,
          nullif(btrim(coalesce(_note, '')), ''));

  RETURN jsonb_build_object('ok', true);
END $$;

-- ─── Part 10: privileges ─────────────────────────────────────────────────
--
-- Internal helpers: revoked from PUBLIC, anon AND authenticated. Client RPCs:
-- revoked from PUBLIC and anon, granted to authenticated only. Note that
-- migrate_153 already revokes EXECUTE on new functions by default; these
-- statements are explicit so the intent is readable in one place and so this
-- file is correct on a fresh project that lacks those default privileges.
--
-- service_role is deliberately untouched on the TABLES: the Supabase table
-- default privileges grant it, the REVOKE above names only anon and
-- authenticated, and the community-notify / community-public edge functions
-- read those tables with the service role.

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    '_community_forbidden_keys_list()',
    '_community_blocked_terms()',
    '_community_payload_keys(text)',
    '_community_fold(text)',
    '_community_is_blocked(uuid, uuid)',
    '_community_can_view(uuid, uuid)',
    '_community_can_view_post(uuid, uuid)',
    '_community_can_view_programme(uuid, uuid)',
    '_community_minor(uuid)',
    '_community_rate_check(uuid, text, int, int, interval)',
    '_community_clean_text(text)',
    '_community_forbidden_keys(jsonb)',
    '_community_cursor_parts(text)',
    '_community_cursor_of(timestamptz, uuid)',
    '_community_limit(int)',
    '_community_style_label(text)',
    '_community_profile_card(uuid, uuid)',
    '_community_caller()',
    '_community_require_profile(uuid, boolean)',
    '_community_add_activity(uuid, uuid, text, text, uuid)',
    '_community_auto_hide(text, uuid)',
    '_community_convert_partnerships(uuid)',
    '_community_touch_updated_at()',
    '_community_follow_counts()',
    '_community_reaction_count()',
    '_community_comment_count()',
    '_community_use_count()',
    '_community_handle_reserved()',
    '_community_handle_valid(text)',
    '_community_validate_snapshot(jsonb)',
    '_community_programme_json(public.community_programmes)',
    '_community_programme_tile(public.community_programmes)',
    '_community_post_json(public.community_posts)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', sig);
  END LOOP;

  FOREACH sig IN ARRAY ARRAY[
    'community_check_handle(text)',
    'community_is_moderator()',
    'community_get_me()',
    'community_upsert_profile(jsonb)',
    'community_leave()',
    'community_follow(uuid)',
    'community_unfollow(uuid)',
    'community_respond_follow(uuid, boolean)',
    'community_remove_follower(uuid)',
    'community_list_follows(uuid, text, text, int)',
    'community_block(uuid)',
    'community_unblock(uuid)',
    'community_mute(uuid)',
    'community_unmute(uuid)',
    'community_relationships()',
    'community_publish_programme(jsonb)',
    'community_unpublish_programme(uuid)',
    'community_get_programme(uuid)',
    'community_record_programme_use(uuid, text)',
    'community_my_programmes()',
    'community_search_programmes(text, text, text, int)',
    'community_discover_programmes(text, text, int)',
    'community_create_post(text, jsonb, text, uuid, text)',
    'community_delete_post(uuid)',
    'community_get_post(uuid)',
    'community_feed(text, int)',
    'community_discover_posts(text, int)',
    'community_react(uuid, boolean)',
    'community_comment(text, uuid, text)',
    'community_delete_comment(uuid)',
    'community_list_comments(text, uuid, text, int)',
    'community_search_people(text, int)',
    'community_suggested_people(int)',
    'community_get_profile(text, uuid)',
    'community_dimensions_me()',
    'community_dimension(text, text, text, int)',
    'community_activity(text, int)',
    'community_mark_activity_seen()',
    'community_report(text, uuid, text, text)',
    'community_moderation_queue(text, text, int)',
    'community_moderate(uuid, text, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', sig);
  END LOOP;
END $$;

-- ─── Part 11: delete_user_data() re-issued IN FULL ───────────────────────
--
-- The body below is migrate_154's, verbatim, with the Community block added
-- immediately before the final users_profile delete. It is re-issued in FULL
-- rather than patched because this function has one definition and the latest
-- one wins: a partial re-declaration would silently drop every table 154
-- covers. CREATE OR REPLACE preserves the existing ACL (measured, see
-- supabase/README.md 2026-08-12 note on migrate_130), so migrate_130's
-- revoke of anon/PUBLIC survives this file.

CREATE OR REPLACE FUNCTION public.delete_user_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  BEGIN DELETE FROM engine_telemetry            WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM engine_overrides            WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM ed_pattern_flags            WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN DELETE FROM consent_log                 WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN DELETE FROM recipe_ingredients          WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM recipes                     WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM saved_meals                 WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM food_favourites             WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM daily_water                 WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM daily_intake_rollups        WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM food_entries                WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM custom_foods                WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  -- 154: foods_custom is a separate relation from custom_foods, not a typo
  -- for it; both exist in this database and only the latter was named.
  BEGIN DELETE FROM foods_custom                WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM food_swaps                  WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM diary_entries               WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN DELETE FROM workout_sets                WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  -- 154: the real table. workout_notes_v2 below is retained deliberately --
  -- it does not exist here, but the undefined_table guard makes naming it
  -- free, and removing it would silently stop wiping any project that has it.
  BEGIN DELETE FROM workout_notes               WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM workout_notes_v2            WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM workouts                    WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM routine_exercises           WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM routines                    WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM session_resolutions         WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM mesocycle_weeks             WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM mesocycles                  WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM planned_muscle_volume       WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM adaptation_events           WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM programmes                  WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM peak_week_plans             WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM exercise_user_notes         WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM exercise_goals              WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM custom_exercises            WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM volume_landmarks            WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM weekly_volumes              WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM personal_records            WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN DELETE FROM weekly_checkins_v2          WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM weekly_checkins             WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM morning_weights             WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM body_metrics                WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM progress_photos             WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM achievements                WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN DELETE FROM coach_outputs               WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM nutrition_targets           WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM effective_maintenance_memos WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM perday_target_offsets       WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM user_insights               WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM autoregulation_suggestions  WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN DELETE FROM user_body_profile           WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM user_feedback               WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM debug_log_uploads           WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  -- 154: preferences. The largest omission by row count, and the reason the
  -- fallback path left a user's settings behind while their workouts were
  -- already gone.
  BEGIN DELETE FROM user_prefs                  WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN DELETE FROM tier_history                WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM notification_preferences    WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM food_frequents              WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM device_push_tokens          WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM daily_steps                 WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN DELETE FROM cardio_log                  WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM meal_plans                  WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM plan_folders                WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- 154: coaching links, both directions.
  BEGIN DELETE FROM coach_assignments
    WHERE client_user_id = uid OR coach_user_id = uid;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Partner surface. partnerships is ENDED rather than deleted (below), so no
  -- cascade reaches its children: each pair-scoped child is deleted for both
  -- members explicitly, or the other member keeps their copy of shared content.
  BEGIN
    DELETE FROM partner_week_signals
    WHERE user_id = uid
       OR pair_id IN (SELECT id FROM partnerships WHERE member_a = uid OR member_b = uid);
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    DELETE FROM partner_cheers
    WHERE sender_id = uid
       OR pair_id IN (SELECT id FROM partnerships WHERE member_a = uid OR member_b = uid);
  EXCEPTION WHEN undefined_table THEN NULL; END;
  -- 154: win cards carry user-written title, summary and detail, so leaving
  -- the partner's copy is the most consequential of the omissions here.
  BEGIN
    DELETE FROM partner_win_cards
    WHERE sender_id = uid
       OR pair_id IN (SELECT id FROM partnerships WHERE member_a = uid OR member_b = uid);
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    DELETE FROM partner_shared_blocks
    WHERE proposed_by = uid
       OR pair_id IN (SELECT id FROM partnerships WHERE member_a = uid OR member_b = uid);
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    DELETE FROM partner_weekly_intentions
    WHERE user_id = uid
       OR pair_id IN (SELECT id FROM partnerships WHERE member_a = uid OR member_b = uid);
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM partner_weekly_signal       WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM partner_blocks WHERE blocker_id = uid OR blocked_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  -- 154: circles. Members, invites and nudges all cascade from partner_circles,
  -- so the circles this user created go first and take their children with
  -- them; the two deletes after it clear this user's rows in circles created
  -- by someone else.
  BEGIN DELETE FROM partner_nudges WHERE from_user = uid OR to_user = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM partner_invites             WHERE created_by = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM partner_circles             WHERE created_by = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM partner_members             WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    UPDATE partnerships
    SET member_a = NULL, status = 'ended',
        ended_at = COALESCE(ended_at, now()), invite_code_hash = NULL
    WHERE member_a = uid;
    UPDATE partnerships
    SET member_b = NULL, status = 'ended',
        ended_at = COALESCE(ended_at, now()), invite_code_hash = NULL
    WHERE member_b = uid;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN DELETE FROM exercises                   WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN DELETE FROM exercise_slot_defaults      WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM exercise_swaps              WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM exercise_intent             WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN DELETE FROM session_constraint_effects  WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM capability_constraints      WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- 160: Community. Two-sided wherever a row names two people, so nothing of
  -- this user survives in someone else's view of the product. Deleting the
  -- profile cascades to follows (both directions), posts, reactions,
  -- comments, programmes, programme uses and received activity; the explicit
  -- deletes below cover the rows that do NOT hang off the profile.
  BEGIN DELETE FROM community_rate_events WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    DELETE FROM community_activity WHERE user_id = uid OR actor_id = uid;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    DELETE FROM community_blocks WHERE blocker_id = uid OR blocked_id = uid;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    DELETE FROM community_mutes WHERE muter_id = uid OR muted_id = uid;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    DELETE FROM community_follows WHERE follower_id = uid OR followee_id = uid;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM community_reactions          WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM community_comments           WHERE author_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM community_programme_uses     WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM community_posts              WHERE author_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM community_programmes         WHERE owner_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  -- Reports this user FILED keep their content (another person's safety
  -- record) but lose the reporter: the FK is ON DELETE SET NULL and this makes
  -- it explicit for the RPC-fallback path too. Reports ABOUT this user go with
  -- them, since the content they concern is being deleted here.
  BEGIN
    UPDATE community_reports SET reporter_id = NULL WHERE reporter_id = uid;
    DELETE FROM community_reports WHERE target_owner_id = uid;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  -- The moderation audit trail survives, without naming a deleted person.
  BEGIN
    UPDATE community_moderation_log SET moderator_id = NULL WHERE moderator_id = uid;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM community_profiles           WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  -- The moderator allow-list is keyed by EMAIL, which is personal data: a
  -- moderator who deletes their account must leave it too. Nothing else reads
  -- this table, so removing the row simply ends their moderator rights.
  BEGIN
    DELETE FROM community_moderators
    WHERE email = (SELECT u.email FROM auth.users u WHERE u.id = uid);
  EXCEPTION WHEN undefined_table THEN NULL; END;

  DELETE FROM users_profile WHERE id = uid;
END;
$$;

-- Belt-and-braces only: CREATE OR REPLACE preserves the existing ACL.
-- Re-running this changes nothing.
GRANT EXECUTE ON FUNCTION public.delete_user_data() TO authenticated;

-- ─── Part 12: acceptance check ───────────────────────────────────────────
--
-- Read-only. Every community table must be present, RLS-enabled and carry NO
-- policy at all; every community function must exist. Run this after the
-- apply and read the output before declaring the migration landed.

SELECT t.table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'community_profiles', 'community_follows', 'community_blocks',
    'community_mutes', 'community_programmes', 'community_programme_uses',
    'community_posts', 'community_reactions', 'community_comments',
    'community_reports', 'community_moderators', 'community_moderation_log',
    'community_activity', 'community_rate_events')
ORDER BY t.table_name;

SELECT p.proname,
       p.prosecdef AS security_definer,
       p.proconfig AS settings,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE 'community\_%' OR p.proname LIKE '\_community\_%')
ORDER BY p.proname;
