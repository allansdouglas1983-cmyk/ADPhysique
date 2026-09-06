-- migrate_161_community_connections.sql
--
-- Purpose:           Community connections, messaging, the shared training
--                    profile and the discovery surfaces (Discovery campaign,
--                    authority docs/social-discovery-2026-09-06/
--                    70-DISCOVERY-BLUEPRINT.md section 11; rulings SD-20 to
--                    SD-32 in 40-DECISIONS.md). It EXTENDS migrate_160 and
--                    changes nothing it does not name:
--
--                      * `community_profiles` gains the connection control
--                        (`connect_from`), the training partner flag and its
--                        preferences, `show_programmes`, `connection_count`
--                        and the eight `tp_*` training-profile band columns.
--                      * three new tables: `community_connections` (the
--                        mutual, accepted tie), `community_conversations` and
--                        `community_messages` (one-to-one text between
--                        connected people only).
--                      * eighteen new SECURITY DEFINER RPCs, the same shape
--                        as 160's: connect / respond / withdraw / remove /
--                        list, the four profile settings writes, the four
--                        discovery reads, and the five messaging calls.
--                      * `_community_profile_card`, `community_get_me`,
--                        `community_upsert_profile`, `community_block`,
--                        `community_unfollow`, `community_leave` and
--                        `delete_user_data` are re-issued IN FULL (the latest
--                        definition of a function wins, so a partial
--                        re-declaration would silently drop what 160 covers).
--
--                    SD-14 still describes every line of this file: the three
--                    new tables have RLS ENABLED with NO policy and ALL
--                    privileges REVOKEd from anon and authenticated, so there
--                    is no PostgREST ingress or egress at all; the RPCs below
--                    are the only way in or out, each pinned to
--                    `search_path = public, pg_temp`, each deriving its user
--                    from auth.uid(), each revoked from PUBLIC and anon and
--                    granted to `authenticated` only. `_community_*` helpers
--                    are revoked from authenticated too.
--
--                    Error codes: 160's closed list plus `not_connected`,
--                    `connect_not_allowed`, `minor_restricted` and
--                    `rules_outdated`. Nothing else is raised deliberately.
--
--                    Push:  none. Messaging is online-first like the rest of
--                           Community (SD-13): no local SQLite table, no sync
--                           registry entry, no watermark, no realtime
--                           subscription. Conversations are re-read on focus
--                           and on a push tap.
--                    Pull:  none, for the same reason.
--
-- Applied locally:   N/A - no local table. Nothing in `src/lib/database.js`
--                    changes; `PRAGMA user_version` is untouched.
--
-- Applied remotely:  NO - WRITTEN, NOT APPLIED. This file waits for the
--                    founder's exact phrase "run against production" for the
--                    batch that contains it (supabase/README.md status block,
--                    CLAUDE.md section 2 "Database schema"). It also depends
--                    on migrate_160, which is itself not applied: 161 must
--                    never run before 160.
--
-- Safe to re-run:    YES. CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
--                    EXISTS, CREATE INDEX IF NOT EXISTS, every named CHECK on
--                    a NEW table added inside a `do $$ ... exception when
--                    duplicate_object then null; end $$;` block, the three
--                    CHECK WIDENINGS on existing tables added with the
--                    drop-then-add form inside a `do $$` block (the widened
--                    list re-states every existing value), CREATE OR REPLACE
--                    FUNCTION throughout, and DROP TRIGGER IF EXISTS before
--                    every CREATE TRIGGER. Re-running changes nothing.
--
-- Rollback:          drop table if exists public.community_messages,
--                      public.community_conversations,
--                      public.community_connections cascade;
--                    alter table public.community_profiles
--                      drop column if exists connect_from, open_to_partner,
--                      partner_prefs, show_programmes, connection_count,
--                      tp_days, tp_time_bands, tp_sessions_band,
--                      tp_staple_lifts, tp_experience_band, tp_programme_key,
--                      tp_age_band, tp_updated_at;
--                    drop function if exists every public.community_* and
--                      public._community_* function created below (the
--                      privilege loops in Part 13 list them all by signature);
--                    re-apply migrate_160 to restore _community_profile_card,
--                      community_get_me, community_upsert_profile,
--                      community_block, community_unfollow, community_leave
--                      and delete_user_data to their 160 bodies;
--                    re-narrow the community_activity.kind,
--                      community_reports.target_kind and
--                      notification_preferences.category CHECKs to their
--                      pre-161 lists (all three are re-added by name below,
--                      so each is a one-line edit).
--                    Nothing existing is dropped or rewritten by this file, so
--                    a rollback loses only connections and messaging.
--
-- GDPR note:         This adds NO new data category. Everything here is the
--                    same voluntary, user-authored Community content 160
--                    created (Article 6(1)(a) consent on the consent_log rail
--                    as `community_visibility`), extended with:
--                      * message bodies, which are user-authored text between
--                        two people who both consented to the tie;
--                      * the `tp_*` bands, which are COARSE bands the person
--                        looked at and chose to share (SD-22). The device
--                        derives them; only the opted-in bands are sent; the
--                        server NULLs anything absent from a payload. Nothing
--                        finer than a band is ever stored: no date, no time,
--                        no "last trained", no count of anything.
--                      * `tp_age_band`, derived HERE from the caller's OWN
--                        `user_body_profile.date_of_birth` and only when the
--                        payload opts in. The date itself never leaves the
--                        user's own row and is never stored on the profile;
--                        a minor never gets a band at all (SD-32).
--                    It carries NO Article 9 health data: bodyweight, body
--                    composition, Progress Scan, nutrition, injuries and
--                    limitations, coaching output and check-ins are neither
--                    read nor stored by anything in this file (SD-30), and
--                    `_community_forbidden_keys()` still rejects them on
--                    every jsonb payload. Erasure: `community_leave` and
--                    `delete_user_data` are re-issued below covering the
--                    three new tables two-sided, so a connection, a
--                    conversation and every message in it go with the person
--                    who leaves.
--
-- Rules version:     The Community rules moved to version 2 (messages,
--                    meeting a training partner in person, and what the
--                    training profile does and does not share:
--                    docs/community-safety/COMMUNITY-RULES.md).
--                    `_community_rules_version()` is the single definition;
--                    `community_upsert_profile` requires
--                    `accept_rules_version = 2` on CREATE and accepts it
--                    alone as a re-consent on UPDATE, appending a consent_log
--                    row with notice_version 2; `community_connect`,
--                    `community_send_message` and
--                    `community_update_training_profile` raise
--                    `rules_outdated` for a profile still on version 1.
--                    Reads are unaffected: an old profile keeps working
--                    everywhere else.
--
-- Transaction:       no explicit BEGIN/COMMIT; the runner supplies one.

-- ─── Part 1: community_profiles gains the new columns ────────────────────
--
-- All additive and all defaulted, so an existing row converges without a
-- backfill: an existing profile is `anyone` for connection requests (or
-- `followers` if it is a followers-only profile, applied by the trigger in
-- Part 7 for NEW rows and left to the person's own choice for old ones),
-- not open to a training partner, showing which programmes it uses, and
-- sharing no training bands at all until the person chooses to.

ALTER TABLE public.community_profiles
  ADD COLUMN IF NOT EXISTS connect_from        text NOT NULL DEFAULT 'anyone',
  ADD COLUMN IF NOT EXISTS open_to_partner     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_prefs       jsonb,
  ADD COLUMN IF NOT EXISTS show_programmes     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS connection_count    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tp_days             text[],
  ADD COLUMN IF NOT EXISTS tp_time_bands       text[],
  ADD COLUMN IF NOT EXISTS tp_sessions_band    text,
  ADD COLUMN IF NOT EXISTS tp_staple_lifts     text[],
  ADD COLUMN IF NOT EXISTS tp_experience_band  text,
  ADD COLUMN IF NOT EXISTS tp_programme_key    text,
  ADD COLUMN IF NOT EXISTS tp_age_band         text,
  ADD COLUMN IF NOT EXISTS tp_updated_at       timestamptz;

DO $$ BEGIN
  ALTER TABLE public.community_profiles
    ADD CONSTRAINT community_profiles_connect_from_check
    CHECK (connect_from IN ('anyone', 'followers', 'nobody'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The tp_* columns deliberately carry NO CHECK: the closed sets live in the
-- five `_community_tp_*_list()` functions in Part 5, which are the single
-- definition compared against the client constants by a Jest guard, and
-- `community_update_training_profile` validates every value against them.
-- A second copy of each list inside a CHECK would be a copy that can drift.

CREATE INDEX IF NOT EXISTS community_profiles_partner_idx
  ON public.community_profiles (open_to_partner, last_active_at DESC)
  WHERE open_to_partner = true;
CREATE INDEX IF NOT EXISTS community_profiles_tp_programme_idx
  ON public.community_profiles (tp_programme_key) WHERE tp_programme_key IS NOT NULL;

-- ─── Part 2: the three new tables ────────────────────────────────────────
--
-- A connection is ONE row for a pair, keyed on the ordered pair
-- (user_a < user_b) so the tie cannot exist twice with the two people the
-- other way round. `requester_id` says who asked, which is the only
-- direction a mutual relationship has.
--
-- `state` is the blueprint's closed set. A withdrawal is not a fourth state:
-- it is a declined row carrying `withdrawn_at`, which is what separates the
-- SILENT decline (the requester keeps seeing "Requested", SD-20) from a
-- request the requester themselves took back (they see nothing pending).
-- `declined_at` is the clock for the 30-day re-request bar and is set by both
-- paths; `responded_at` is set only when the OTHER person answered.

CREATE TABLE IF NOT EXISTS public.community_connections (
  user_a       uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  user_b       uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  requester_id uuid NOT NULL,
  state        text NOT NULL DEFAULT 'requested',
  reasons      text[] NOT NULL DEFAULT '{}',
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  declined_at  timestamptz,
  withdrawn_at timestamptz,
  PRIMARY KEY (user_a, user_b)
);

ALTER TABLE public.community_connections
  ADD COLUMN IF NOT EXISTS declined_at  timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.community_connections
    ADD CONSTRAINT community_connections_state_check
    CHECK (state IN ('requested', 'connected', 'declined'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.community_connections
    ADD CONSTRAINT community_connections_pair_order_check
    CHECK (user_a < user_b);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS community_connections_a_idx
  ON public.community_connections (user_a, state, created_at DESC, user_b DESC);
CREATE INDEX IF NOT EXISTS community_connections_b_idx
  ON public.community_connections (user_b, state, created_at DESC, user_a DESC);
CREATE INDEX IF NOT EXISTS community_connections_requester_idx
  ON public.community_connections (requester_id, state);

-- One conversation per pair, created lazily by the first message. It is
-- keyed on the same ordered pair as the connection, so the two can never
-- disagree about who is talking to whom. `closed_at` is set when the
-- connection is removed or a block is placed: the row and its messages stay
-- (erasure is `community_leave` and `delete_user_data`, not a removal), but
-- the conversation leaves both lists and refuses new messages.
--
-- `a_last_push_at` / `b_last_push_at` are written ONLY by the
-- community-notify Edge Function with the service role, and are the 15-minute
-- push collapse (blueprint section 2): one push per conversation per fifteen
-- minutes while the recipient has not read it.
CREATE TABLE IF NOT EXISTS public.community_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a          uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  user_b          uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  closed_at       timestamptz,
  a_last_read_at  timestamptz,
  b_last_read_at  timestamptz,
  a_last_push_at  timestamptz,
  b_last_push_at  timestamptz,
  UNIQUE (user_a, user_b)
);

ALTER TABLE public.community_conversations
  ADD COLUMN IF NOT EXISTS a_last_push_at timestamptz,
  ADD COLUMN IF NOT EXISTS b_last_push_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.community_conversations
    ADD CONSTRAINT community_conversations_pair_order_check
    CHECK (user_a < user_b);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS community_conversations_a_idx
  ON public.community_conversations (user_a, closed_at, last_message_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_conversations_b_idx
  ON public.community_conversations (user_b, closed_at, last_message_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.community_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.community_conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  body            text NOT NULL,
  ref_kind        text,
  ref_id          uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.community_messages
    ADD CONSTRAINT community_messages_ref_kind_check
    CHECK (ref_kind IS NULL OR ref_kind IN ('programme', 'post'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS community_messages_conversation_idx
  ON public.community_messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_messages_sender_idx
  ON public.community_messages (sender_id);

-- ─── Part 3: RLS on, grants off (SD-14) ──────────────────────────────────
--
-- Identical to migrate_160 Part 2, for the three tables it adds. RLS with no
-- policy denies everything for anon and authenticated even if a grant is ever
-- restored by accident; the REVOKE means PostgREST refuses before RLS is
-- consulted. service_role is deliberately untouched: community-notify reads
-- and writes these tables with it.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'community_connections', 'community_conversations', 'community_messages'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- ─── Part 4: the three CHECK widenings ───────────────────────────────────
--
-- Each re-states the CURRENT live list with the new values appended;
-- omitting an existing value would make ADD CONSTRAINT fail against rows that
-- already carry it. The drop-then-add form (migrate_102 shape) is required
-- because these constraints already exist from 160; the `do $$` wrapper keeps
-- the pair atomic and re-runnable.

DO $$ BEGIN
  ALTER TABLE public.community_activity
    DROP CONSTRAINT IF EXISTS community_activity_kind_check;
  ALTER TABLE public.community_activity
    ADD CONSTRAINT community_activity_kind_check
    CHECK (kind IN ('follow', 'follow_request', 'follow_accepted',
                    'reaction', 'comment', 'programme_used',
                    'connect_request', 'connect_accepted'));
END $$;

DO $$ BEGIN
  ALTER TABLE public.community_reports
    DROP CONSTRAINT IF EXISTS community_reports_target_kind_check;
  ALTER TABLE public.community_reports
    ADD CONSTRAINT community_reports_target_kind_check
    CHECK (target_kind IN ('profile', 'post', 'comment', 'programme', 'message'));
END $$;

-- SD-14a again: without this the recipient's own opt-out for the message
-- category could not be STORED, so community-notify could never read it and
-- the toggle would be a promise the server cannot keep. The list is
-- migrate_160's 25 values with `community_message` appended.
DO $$ BEGIN
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
      'community_activity',
      'community_message'
    ));
END $$;

-- ─── Part 5: the closed sets, and the rules version ──────────────────────
--
-- These six functions are the SINGLE definition of each list in SQL, exactly
-- as migrate_160 Part 6 is for the forbidden keys, the blocked terms and the
-- post payload keys. The client mirrors them in
-- src/lib/community/trainingProfile.js (TP_DAYS, TP_TIME_BANDS,
-- TP_SESSIONS_BANDS, TP_EXPERIENCE_BANDS, TP_AGE_BANDS) and
-- src/lib/community/connections.js (CONNECT_REASONS); a Jest guard compares
-- the arrays here to those constants, so the two halves cannot drift.

CREATE OR REPLACE FUNCTION public._community_tp_days_list()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- UK weeks start Monday (dayKey.js), and the order is the order the
  -- "Both train Mon, Wed and Fri" reason renders in.
  SELECT ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[];
$$;

CREATE OR REPLACE FUNCTION public._community_tp_time_bands_list()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Local start bands: morning 05:00-09:00, midday 09:00-14:00, afternoon
  -- 14:00-17:00, evening 17:00-22:00, late 22:00-05:00. A band is the
  -- FINEST thing this product ever says about when a person trains (SD-31).
  SELECT ARRAY['morning', 'midday', 'afternoon', 'evening', 'late']::text[];
$$;

CREATE OR REPLACE FUNCTION public._community_tp_sessions_list()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['1_2', '3', '4_5', '6_plus']::text[];
$$;

CREATE OR REPLACE FUNCTION public._community_tp_experience_list()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['new', 'intermediate', 'experienced']::text[];
$$;

CREATE OR REPLACE FUNCTION public._community_tp_age_bands_list()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Server-derived only, from the caller's own date of birth, and never for
  -- a minor (SD-32). There is deliberately no band below 18.
  SELECT ARRAY['18_24', '25_34', '35_44', '45_54', '55_plus']::text[];
$$;

CREATE OR REPLACE FUNCTION public._community_connect_reasons_list()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['same_gym', 'same_programme', 'train_like_me', 'train_together']::text[];
$$;

-- The Community rules version a profile must have accepted. Bumped to 2 by
-- this campaign: the rules text at docs/community-safety/COMMUNITY-RULES.md
-- gained messages, meeting a training partner in person, and what the
-- training profile does and does not share. It is a CONSENT record, not a
-- build number: bump it only when the text changes, and only with a
-- re-consent path (community_upsert_profile, accept_rules_version alone).
CREATE OR REPLACE FUNCTION public._community_rules_version()
RETURNS int
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 2;
$$;

-- The three acts that need the CURRENT rules: sending a connection request,
-- sending a message, and sharing training bands. Reading is never gated, so
-- an older profile keeps working everywhere else until the person re-accepts.
CREATE OR REPLACE FUNCTION public._community_require_rules(_p public.community_profiles)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(_p.rules_version, 0) < public._community_rules_version() THEN
    RAISE EXCEPTION USING message = 'rules_outdated';
  END IF;
END $$;

-- ─── Part 6: label helpers for the reasons lines ─────────────────────────
--
-- Every reason string in this file is built HERE, so the wording is fixed in
-- one place (SD-24: reasons are the explanation, and a reason that reads
-- differently on two surfaces is two different claims).

CREATE OR REPLACE FUNCTION public._community_time_band_phrase(_band text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- The same words as TP_TIME_BANDS in src/lib/community/trainingProfile.js.
  -- "Both usually train " || this: evenings / mornings / in the afternoon /
  -- at midday / late.
  SELECT CASE _band
    WHEN 'morning'   THEN 'mornings'
    WHEN 'midday'    THEN 'at midday'
    WHEN 'afternoon' THEN 'in the afternoon'
    WHEN 'evening'   THEN 'evenings'
    WHEN 'late'      THEN 'late'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public._community_sessions_phrase(_band text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- "Both train " || this || " times a week".
  SELECT CASE _band
    WHEN '1_2'    THEN '1 to 2'
    WHEN '3'      THEN '3'
    WHEN '4_5'    THEN '4 to 5'
    WHEN '6_plus' THEN '6 or more'
    ELSE NULL
  END;
$$;

-- "Both train Mon, Wed and Fri": week order, commas, and "and" before the
-- last one. British list punctuation, no serial comma.
CREATE OR REPLACE FUNCTION public._community_day_list(_days text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_labels text[];
  v_n      int;
BEGIN
  IF _days IS NULL OR array_length(_days, 1) IS NULL THEN RETURN NULL; END IF;

  SELECT array_agg(initcap(d) ORDER BY array_position(public._community_tp_days_list(), d))
  INTO v_labels
  FROM (SELECT DISTINCT unnest(_days) AS d) s
  WHERE s.d = ANY (public._community_tp_days_list());

  IF v_labels IS NULL THEN RETURN NULL; END IF;
  v_n := array_length(v_labels, 1);
  IF v_n = 1 THEN RETURN v_labels[1]; END IF;
  IF v_n = 2 THEN RETURN v_labels[1] || ' and ' || v_labels[2]; END IF;
  RETURN array_to_string(v_labels[1:v_n - 1], ', ') || ' and ' || v_labels[v_n];
END $$;

-- ─── Part 7: counters and defaults ───────────────────────────────────────

-- connection_count, accepted ties only, maintained by trigger so that every
-- path which changes a row - an RPC, a cascade delete, delete_user_data -
-- keeps it true (migrate_160 Part 8 does the same for follower counts).
CREATE OR REPLACE FUNCTION public._community_connection_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id  uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_ids := v_ids || OLD.user_a || OLD.user_b; END IF;
  IF TG_OP <> 'DELETE' THEN v_ids := v_ids || NEW.user_a || NEW.user_b; END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    UPDATE public.community_profiles p SET
      connection_count = (
        SELECT count(*) FROM public.community_connections c
        WHERE c.state = 'connected' AND (c.user_a = v_id OR c.user_b = v_id))
    WHERE p.user_id = v_id;
  END LOOP;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS community_connections_counts ON public.community_connections;
CREATE TRIGGER community_connections_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.community_connections
  FOR EACH ROW EXECUTE FUNCTION public._community_connection_counts();

-- "Default `anyone` for public profiles and `followers` for followers-only
-- profiles" (blueprint section 1). No RPC writes connect_from on INSERT, so
-- at insert time the column always carries the column default and this
-- trigger is the whole rule; a later change of visibility never overrides
-- the person's own choice, which is what the privacy screen is for.
CREATE OR REPLACE FUNCTION public._community_connect_from_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.visibility = 'followers' AND NEW.connect_from = 'anyone' THEN
    NEW.connect_from := 'followers';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS community_profiles_connect_from ON public.community_profiles;
CREATE TRIGGER community_profiles_connect_from
  BEFORE INSERT ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION public._community_connect_from_default();

-- ─── Part 8: connection helpers ──────────────────────────────────────────

-- The viewer's relationship to one other person, in the four words the
-- Connect button renders (CONNECT_BUTTON_LABELS in
-- src/lib/community/connections.js).
--
-- A DECLINE IS SILENT (SD-20). The requester keeps seeing "Requested" for as
-- long as the 30-day bar lasts, and then the button offers Connect again -
-- they are never told they were refused. A WITHDRAWAL is not silent to the
-- person who made it, so it reads as `none` for them (they still cannot
-- re-send inside the 30 days; `community_connect` says so).
CREATE OR REPLACE FUNCTION public._community_connection_state(_viewer uuid, _other uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.community_connections%ROWTYPE;
BEGIN
  IF _viewer IS NULL OR _other IS NULL OR _viewer = _other THEN RETURN 'none'; END IF;

  SELECT * INTO r FROM public.community_connections
  WHERE user_a = least(_viewer, _other) AND user_b = greatest(_viewer, _other);
  IF NOT FOUND THEN RETURN 'none'; END IF;

  IF r.state = 'connected' THEN RETURN 'connected'; END IF;

  IF r.state = 'requested' THEN
    RETURN CASE WHEN r.requester_id = _viewer THEN 'requested_by_me' ELSE 'requested_by_them' END;
  END IF;

  IF r.state = 'declined'
     AND r.withdrawn_at IS NULL
     AND r.requester_id = _viewer
     AND r.declined_at IS NOT NULL
     AND r.declined_at > now() - interval '30 days' THEN
    RETURN 'requested_by_me';
  END IF;

  RETURN 'none';
END $$;

-- Are these two connected? The one question messaging asks.
CREATE OR REPLACE FUNCTION public._community_is_connected(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_connections c
    WHERE c.user_a = least(_a, _b) AND c.user_b = greatest(_a, _b)
      AND c.state = 'connected'
  );
$$;

-- Under-18, for the OTHER person: their stored boolean only. Their date of
-- birth is their own row and is never read from here (data minimisation);
-- `_community_minor` is used for the CALLER, whose record this is.
CREATE OR REPLACE FUNCTION public._community_other_is_minor(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT p.is_minor FROM public.community_profiles p
                   WHERE p.user_id = _uid), false);
$$;

-- The caller's own minor status: the stored boolean OR a fresh derivation, so
-- a birthday that has not yet been written back to the profile still refuses.
-- Fails towards refusing, which is the only safe direction (SD-32).
CREATE OR REPLACE FUNCTION public._community_caller_is_minor(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT p.is_minor FROM public.community_profiles p
                   WHERE p.user_id = _uid), false)
      OR public._community_minor(_uid);
$$;

-- The conversation between two people, or NULL. One row per ordered pair.
CREATE OR REPLACE FUNCTION public._community_conversation_id(_a uuid, _b uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id FROM public.community_conversations c
  WHERE c.user_a = least(_a, _b) AND c.user_b = greatest(_a, _b);
$$;

-- One message, in the shape the conversation screen renders. The context
-- reference is resolved to the existing tile ONLY when the VIEWER may see it
-- (SD-14b: "may I see this programme / post" is a different question from
-- "may I see this person"), so a programme that has since been hidden, or was
-- always followers-only to this reader, renders as text with no tile rather
-- than leaking a title.
CREATE OR REPLACE FUNCTION public._community_message_json(_r public.community_messages, _viewer uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref jsonb := NULL;
  v_g   public.community_programmes%ROWTYPE;
  v_p   public.community_posts%ROWTYPE;
BEGIN
  IF _r.ref_kind = 'programme' AND _r.ref_id IS NOT NULL
     AND public._community_can_view_programme(_viewer, _r.ref_id) THEN
    SELECT * INTO v_g FROM public.community_programmes WHERE id = _r.ref_id;
    IF FOUND THEN v_ref := public._community_programme_tile(v_g); END IF;
  ELSIF _r.ref_kind = 'post' AND _r.ref_id IS NOT NULL
     AND public._community_can_view_post(_viewer, _r.ref_id) THEN
    SELECT * INTO v_p FROM public.community_posts WHERE id = _r.ref_id;
    IF FOUND THEN v_ref := public._community_post_json(v_p); END IF;
  END IF;

  RETURN jsonb_build_object(
    'id',              _r.id,
    'conversation_id', _r.conversation_id,
    'sender_id',       _r.sender_id,
    'mine',            _r.sender_id = _viewer,
    'body',            _r.body,
    'ref_kind',        _r.ref_kind,
    'ref_id',          _r.ref_id,
    'ref',             v_ref,
    'created_at',      _r.created_at
  );
END $$;

-- ─── Part 9: the profile card and `me`, re-issued ────────────────────────
--
-- migrate_160's body, with the connection state, the connection count, the
-- partner flag and the shared training bands added. Everything the security
-- review fixed in 160 is kept verbatim: a suspended profile still has no card
-- for anyone but itself, and the CHOSEN FACTS still travel only to someone
-- who may view the profile (finding 5). The new fields join that rule: a
-- followers-only card, and so every minor's card, is handle, name, avatar,
-- bio, counts and the viewer's own relationship - nothing about when or
-- where the person trains.
--
-- `connection` is the ONE new field that is never gated, because it is a fact
-- about the VIEWER's own relationship: someone must be able to see, and
-- answer, a request from a profile they cannot otherwise read.
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
    -- Discovery campaign (blueprint section 11).
    'connection',      public._community_connection_state(_viewer, _uid),
    'connection_count', CASE WHEN v_viewable THEN p.connection_count END,
    'open_to_partner', CASE WHEN v_viewable THEN p.open_to_partner ELSE false END,
    'tp_days',           CASE WHEN v_viewable THEN to_jsonb(p.tp_days) END,
    'tp_time_bands',     CASE WHEN v_viewable THEN to_jsonb(p.tp_time_bands) END,
    'tp_sessions_band',  CASE WHEN v_viewable THEN p.tp_sessions_band END,
    'tp_staple_lifts',   CASE WHEN v_viewable THEN to_jsonb(p.tp_staple_lifts) END,
    'tp_experience_band', CASE WHEN v_viewable THEN p.tp_experience_band END,
    'tp_programme_key',  CASE WHEN v_viewable THEN p.tp_programme_key END,
    'tp_age_band',       CASE WHEN v_viewable THEN p.tp_age_band END,
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

-- migrate_160's body plus the four new counts and settings and the caller's
-- own bands. `rules_version` is the CURRENT version the client must have
-- accepted; `accepted_rules_version` is what this profile actually accepted,
-- so the client can show the rules again before the server has to refuse
-- anything.
CREATE OR REPLACE FUNCTION public.community_get_me()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := public._community_caller();
  v_p        public.community_profiles%ROWTYPE;
  v_card     jsonb;
  v_pending  int := 0;
  v_unseen   int := 0;
  v_connects int := 0;
  v_msgs     int := 0;
BEGIN
  v_card := public._community_profile_card(v_uid, v_uid);
  SELECT * INTO v_p FROM public.community_profiles WHERE user_id = v_uid;

  IF v_card IS NOT NULL THEN
    SELECT count(*) INTO v_pending
    FROM public.community_follows
    WHERE followee_id = v_uid AND state = 'requested';

    SELECT count(*) INTO v_unseen
    FROM public.community_activity
    WHERE user_id = v_uid AND seen_at IS NULL;

    SELECT count(*) INTO v_connects
    FROM public.community_connections c
    WHERE c.state = 'requested' AND c.requester_id <> v_uid
      AND (c.user_a = v_uid OR c.user_b = v_uid);

    -- Unread MESSAGES, in open conversations only, from the other person
    -- only, newer than this person's own read marker.
    SELECT count(*) INTO v_msgs
    FROM public.community_messages m
    JOIN public.community_conversations c ON c.id = m.conversation_id
    WHERE c.closed_at IS NULL
      AND (c.user_a = v_uid OR c.user_b = v_uid)
      AND m.sender_id <> v_uid
      AND m.created_at > coalesce(
        CASE WHEN c.user_a = v_uid THEN c.a_last_read_at ELSE c.b_last_read_at END,
        '-infinity'::timestamptz)
      AND NOT public._community_is_blocked(v_uid, m.sender_id);

    UPDATE public.community_profiles SET last_active_at = now() WHERE user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'profile',                 v_card,
    'pending_requests',        v_pending,
    'unseen_activity',         v_unseen,
    'is_moderator',            public.community_is_moderator(),
    'is_minor',                public._community_minor(v_uid),
    'rules_version',           public._community_rules_version(),
    'accepted_rules_version',  v_p.rules_version,
    'pending_connect_requests', v_connects,
    'unseen_messages',         v_msgs,
    'connect_from',            coalesce(v_p.connect_from, 'anyone'),
    'open_to_partner',         coalesce(v_p.open_to_partner, false),
    'partner_prefs',           v_p.partner_prefs,
    'show_programmes',         coalesce(v_p.show_programmes, true),
    'tp_days',                 to_jsonb(v_p.tp_days),
    'tp_time_bands',           to_jsonb(v_p.tp_time_bands),
    'tp_sessions_band',        v_p.tp_sessions_band,
    'tp_staple_lifts',         to_jsonb(v_p.tp_staple_lifts),
    'tp_experience_band',      v_p.tp_experience_band,
    'tp_programme_key',        v_p.tp_programme_key,
    'tp_age_band',             v_p.tp_age_band
  );
END $$;

-- migrate_160's body, re-issued IN FULL with ONE change: the accepted rules
-- version is `_community_rules_version()` rather than the literal 1, and an
-- EXISTING profile may re-accept by sending `accept_rules_version` alone
-- (src/lib/community/profile.js acceptRules), which writes the new version to
-- the row and appends a granted consent_log row at the new notice version.
-- Re-consent is a consent act, not a profile edit: the partial-update merge
-- above it means a payload carrying only the version cannot rewrite a handle,
-- a display name or a visibility setting on the way past.
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
    IF v_accept IS DISTINCT FROM public._community_rules_version() THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;

    INSERT INTO public.community_profiles (
      user_id, handle, display_name, avatar_preset, bio, styles, goal, setting,
      area_label, area_key, gym_label, gym_key, visibility, is_minor, status,
      rules_version, last_active_at)
    VALUES (
      v_uid, v_handle, v_display, v_avatar, v_bio, v_styles, v_goal, v_setting,
      v_area_label, v_area_key, v_gym_label, v_gym_key, v_visibility, v_minor,
      'active', public._community_rules_version(), now());

    -- Article 6(1)(a) record on the existing append-only rail.
    INSERT INTO public.consent_log
      (user_id, consent_type, granted, granted_at, notice_version)
    VALUES (v_uid, 'community_visibility', true, now(),
            public._community_rules_version()::text);

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

    -- Re-consent (rules version 2). An absent key changes nothing; a version
    -- that is not the current one is bad input rather than a silent no-op.
    IF _p ? 'accept_rules_version' THEN
      IF coalesce(_p ->> 'accept_rules_version', '') !~ '^[0-9]{1,6}$' THEN
        RAISE EXCEPTION USING message = 'invalid_input';
      END IF;
      v_accept := (_p ->> 'accept_rules_version')::int;
      IF v_accept IS DISTINCT FROM public._community_rules_version() THEN
        RAISE EXCEPTION USING message = 'invalid_input';
      END IF;
      IF coalesce(v_existing.rules_version, 0) < v_accept THEN
        UPDATE public.community_profiles SET rules_version = v_accept WHERE user_id = v_uid;
        INSERT INTO public.consent_log
          (user_id, consent_type, granted, granted_at, notice_version)
        VALUES (v_uid, 'community_visibility', true, now(), v_accept::text);
      END IF;
    END IF;

    -- Also runs on update: a partner who joined AFTER this user did becomes a
    -- mutual follow the next time either of them saves a profile.
    PERFORM public._community_convert_partnerships(v_uid);
  END IF;

  RETURN public._community_profile_card(v_uid, v_uid);
END $$;

-- ─── Part 10: connections ────────────────────────────────────────────────
--
-- Rate limits (blueprint sections 1, 2): connect 10/day new, 30/day
-- established; message 20/hour new, 60/hour established. Every RPC returns
-- the OTHER person's profile card, whose `connection` field is the button
-- state the client renders (CONNECT_BUTTON_LABELS).

CREATE OR REPLACE FUNCTION public.community_connect(
  _target uuid, _reasons text[] DEFAULT NULL, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := public._community_caller();
  v_me      public.community_profiles%ROWTYPE;
  v_them    public.community_profiles%ROWTYPE;
  v_row     public.community_connections%ROWTYPE;
  v_reasons text[] := ARRAY[]::text[];
  v_reason  text;
  v_note    text;
  v_a       uuid;
  v_b       uuid;
BEGIN
  IF _target IS NULL OR _target = v_uid THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  v_me := public._community_require_profile(v_uid, true);
  PERFORM public._community_require_rules(v_me);

  SELECT * INTO v_them FROM public.community_profiles WHERE user_id = _target;
  IF NOT FOUND OR v_them.status <> 'active' THEN
    RAISE EXCEPTION USING message = 'not_found';
  END IF;
  IF public._community_is_blocked(v_uid, _target) THEN
    RAISE EXCEPTION USING message = 'blocked';
  END IF;

  -- SD-32: an under-18 account never sends or receives a connection request,
  -- in either direction, whichever side it is on.
  IF public._community_caller_is_minor(v_uid) OR v_them.is_minor THEN
    RAISE EXCEPTION USING message = 'minor_restricted';
  END IF;

  -- The recipient's own control (blueprint section 1).
  IF v_them.connect_from = 'nobody' THEN
    RAISE EXCEPTION USING message = 'connect_not_allowed';
  END IF;
  IF v_them.connect_from = 'followers' AND NOT EXISTS (
    SELECT 1 FROM public.community_follows f
    WHERE f.follower_id = v_uid AND f.followee_id = _target AND f.state = 'accepted'
  ) THEN
    RAISE EXCEPTION USING message = 'connect_not_allowed';
  END IF;

  -- Up to two reasons from the fixed set, order preserved, duplicates dropped.
  IF _reasons IS NOT NULL THEN
    IF coalesce(array_length(_reasons, 1), 0) > 2 THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;
    FOREACH v_reason IN ARRAY _reasons LOOP
      IF v_reason IS NULL OR NOT (v_reason = ANY (public._community_connect_reasons_list())) THEN
        RAISE EXCEPTION USING message = 'invalid_input';
      END IF;
      IF NOT (v_reason = ANY (v_reasons)) THEN v_reasons := v_reasons || v_reason; END IF;
    END LOOP;
  END IF;

  v_note := nullif(btrim(coalesce(_note, '')), '');
  IF v_note IS NOT NULL THEN
    IF length(v_note) > 120 THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
    v_note := public._community_clean_text(v_note);
  END IF;

  v_a := least(v_uid, _target);
  v_b := greatest(v_uid, _target);
  SELECT * INTO v_row FROM public.community_connections WHERE user_a = v_a AND user_b = v_b;

  IF FOUND THEN
    -- Already settled or already asked: idempotent, and it never spends a
    -- request from the day's allowance.
    IF v_row.state = 'connected' OR v_row.state = 'requested' THEN
      RETURN public._community_profile_card(_target, v_uid);
    END IF;
    -- Declined or withdrawn: no re-send for 30 days (SD-20). `not_allowed` is
    -- the code the client maps for this case; `connect_not_allowed` is
    -- reserved for the recipient's connect_from setting.
    IF v_row.declined_at IS NOT NULL AND v_row.declined_at > now() - interval '30 days' THEN
      RAISE EXCEPTION USING message = 'not_allowed';
    END IF;
  END IF;

  PERFORM public._community_rate_check(v_uid, 'connect', 10, 30);

  INSERT INTO public.community_connections
    (user_a, user_b, requester_id, state, reasons, note, created_at)
  VALUES (v_a, v_b, v_uid, 'requested', v_reasons, v_note, now())
  ON CONFLICT (user_a, user_b) DO UPDATE SET
    requester_id = EXCLUDED.requester_id,
    state        = 'requested',
    reasons      = EXCLUDED.reasons,
    note         = EXCLUDED.note,
    created_at   = now(),
    responded_at = NULL,
    declined_at  = NULL,
    withdrawn_at = NULL;

  PERFORM public._community_add_activity(_target, v_uid, 'connect_request', 'profile', v_uid);

  RETURN public._community_profile_card(_target, v_uid);
END $$;

-- Accept or decline. Accepting makes both people follow each other with
-- ACCEPTED edges, even across followers-only profiles: the tie they just
-- agreed to is a stronger consent than a follow request. Declining is silent.
CREATE OR REPLACE FUNCTION public.community_respond_connect(_requester uuid, _accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
  v_row public.community_connections%ROWTYPE;
  v_a   uuid;
  v_b   uuid;
BEGIN
  IF _requester IS NULL OR _accept IS NULL OR _requester = v_uid THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  PERFORM public._community_require_profile(v_uid, true);

  v_a := least(v_uid, _requester);
  v_b := greatest(v_uid, _requester);
  SELECT * INTO v_row FROM public.community_connections
  WHERE user_a = v_a AND user_b = v_b AND state = 'requested' AND requester_id = _requester;
  IF NOT FOUND THEN RAISE EXCEPTION USING message = 'not_found'; END IF;

  IF NOT _accept THEN
    UPDATE public.community_connections
    SET state = 'declined', responded_at = now(), declined_at = now(), withdrawn_at = NULL
    WHERE user_a = v_a AND user_b = v_b;
    -- No activity row: a decline is silent to the requester (SD-20).
    RETURN public._community_profile_card(_requester, v_uid);
  END IF;

  IF public._community_is_blocked(v_uid, _requester) THEN
    RAISE EXCEPTION USING message = 'blocked';
  END IF;

  UPDATE public.community_connections
  SET state = 'connected', responded_at = now(), declined_at = NULL, withdrawn_at = NULL
  WHERE user_a = v_a AND user_b = v_b;

  INSERT INTO public.community_follows (follower_id, followee_id, state)
  VALUES (v_uid, _requester, 'accepted')
  ON CONFLICT (follower_id, followee_id) DO UPDATE SET state = 'accepted';
  INSERT INTO public.community_follows (follower_id, followee_id, state)
  VALUES (_requester, v_uid, 'accepted')
  ON CONFLICT (follower_id, followee_id) DO UPDATE SET state = 'accepted';

  -- A conversation closed by an earlier removal or block is DELETED here
  -- rather than reopened, so a new tie starts a new conversation. Both
  -- people were told the conversation had gone; bringing its history back
  -- because they connected again would contradict that.
  DELETE FROM public.community_conversations WHERE user_a = v_a AND user_b = v_b;

  PERFORM public._community_add_activity(_requester, v_uid, 'connect_accepted', 'profile', v_uid);

  RETURN public._community_profile_card(_requester, v_uid);
END $$;

-- Take back a request that has not been answered. The 30-day bar still
-- applies, so this cannot be used to knock on a door repeatedly.
CREATE OR REPLACE FUNCTION public.community_withdraw_connect(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
  v_a   uuid;
  v_b   uuid;
BEGIN
  IF _target IS NULL OR _target = v_uid THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  v_a := least(v_uid, _target);
  v_b := greatest(v_uid, _target);

  UPDATE public.community_connections
  SET state = 'declined', declined_at = now(), withdrawn_at = now()
  WHERE user_a = v_a AND user_b = v_b AND state = 'requested' AND requester_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION USING message = 'not_found'; END IF;

  -- The request row the recipient saw goes with it, so a withdrawn request
  -- does not sit in their inbox.
  DELETE FROM public.community_activity
  WHERE user_id = _target AND actor_id = v_uid AND kind = 'connect_request';

  RETURN public._community_profile_card(_target, v_uid);
END $$;

-- End a connection. Messaging ends with it (the conversation closes for both)
-- and the two follow edges STAY: removing a connection is not a block, and
-- the confirm on the screen says so (blueprint section 1).
CREATE OR REPLACE FUNCTION public.community_remove_connection(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
  v_a   uuid;
  v_b   uuid;
BEGIN
  IF _target IS NULL OR _target = v_uid THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  v_a := least(v_uid, _target);
  v_b := greatest(v_uid, _target);

  DELETE FROM public.community_connections
  WHERE user_a = v_a AND user_b = v_b AND state = 'connected';
  IF NOT FOUND THEN RAISE EXCEPTION USING message = 'not_found'; END IF;

  UPDATE public.community_conversations SET closed_at = now()
  WHERE user_a = v_a AND user_b = v_b AND closed_at IS NULL;

  RETURN public._community_profile_card(_target, v_uid);
END $$;

-- One page of a person's connections, plus (for the caller's OWN list) the
-- requests waiting for an answer, with the reasons and the note the requester
-- attached. Those two fields live on the connection row, so this is the only
-- place the Activity screen can read them from.
CREATE OR REPLACE FUNCTION public.community_list_connections(
  _uid uuid DEFAULT NULL, _cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := public._community_caller();
  v_lim      int  := public._community_limit(_limit);
  v_target   uuid;
  v_ts       timestamptz;
  v_id       uuid;
  v_people   jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
  v_count    int := 0;
  v_lts      timestamptz;
  v_lid      uuid;
BEGIN
  PERFORM public._community_require_profile(v_uid, false);
  v_target := coalesce(_uid, v_uid);

  IF v_target <> v_uid AND NOT public._community_can_view(v_uid, v_target) THEN
    RAISE EXCEPTION USING message = 'not_found';
  END IF;
  SELECT c_ts, c_id INTO v_ts, v_id FROM public._community_cursor_parts(_cursor);

  WITH page AS (
    SELECT CASE WHEN c.user_a = v_target THEN c.user_b ELSE c.user_a END AS other_id,
           c.created_at AS created_at
    FROM public.community_connections c
    WHERE c.state = 'connected'
      AND (c.user_a = v_target OR c.user_b = v_target)
      AND NOT public._community_is_blocked(
        v_uid, CASE WHEN c.user_a = v_target THEN c.user_b ELSE c.user_a END)
      AND EXISTS (
        SELECT 1 FROM public.community_profiles sp
        WHERE sp.user_id = CASE WHEN c.user_a = v_target THEN c.user_b ELSE c.user_a END
          AND sp.status <> 'suspended')
      AND (v_ts IS NULL OR (c.created_at,
            CASE WHEN c.user_a = v_target THEN c.user_b ELSE c.user_a END) < (v_ts, v_id))
    ORDER BY c.created_at DESC,
             CASE WHEN c.user_a = v_target THEN c.user_b ELSE c.user_a END DESC
    LIMIT v_lim
  )
  SELECT
    coalesce(jsonb_agg(public._community_profile_card(page.other_id, v_uid)
             ORDER BY page.created_at DESC, page.other_id DESC), '[]'::jsonb),
    (array_agg(page.created_at ORDER BY page.created_at ASC, page.other_id ASC))[1],
    (array_agg(page.other_id   ORDER BY page.created_at ASC, page.other_id ASC))[1]
  INTO v_people, v_lts, v_lid
  FROM page;

  SELECT count(*) INTO v_count
  FROM public.community_connections c
  WHERE c.state = 'connected'
    AND (c.user_a = v_target OR c.user_b = v_target)
    AND NOT public._community_is_blocked(
      v_uid, CASE WHEN c.user_a = v_target THEN c.user_b ELSE c.user_a END);

  IF v_target = v_uid THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'requester', public._community_profile_card(q.requester_id, v_uid),
             'reasons',   to_jsonb(q.reasons),
             'note',      q.note,
             'created_at', q.created_at)
           ORDER BY q.created_at DESC), '[]'::jsonb)
    INTO v_requests
    FROM (
      SELECT c.requester_id, c.reasons, c.note, c.created_at
      FROM public.community_connections c
      WHERE c.state = 'requested' AND c.requester_id <> v_uid
        AND (c.user_a = v_uid OR c.user_b = v_uid)
        AND NOT public._community_is_blocked(v_uid, c.requester_id)
      ORDER BY c.created_at DESC
      LIMIT 50
    ) q;
  END IF;

  RETURN jsonb_build_object(
    'people',   coalesce(v_people, '[]'::jsonb),
    'requests', v_requests,
    'count',    v_count,
    'cursor',   public._community_cursor_of(v_lts, v_lid));
END $$;

-- ─── Part 11: the training profile and the three settings ────────────────
--
-- SD-22: the device derives coarse bands from the last twelve weeks of
-- completed workouts; the person sees them before anything is shared; only
-- the bands whose toggle is ON are sent, and THIS FUNCTION NULLS ANYTHING
-- ABSENT. That is what makes switching a toggle off an erasure rather than a
-- stale row left behind. Every value is checked against the closed sets in
-- Part 5: a band this server does not know is invalid input, never a stored
-- string.
--
-- SD-30: nothing here reads nutrition, body metrics, Progress Scan, injuries
-- and limitations, coaching or check-ins. The ONE read outside
-- community_profiles is the caller's OWN date of birth, and only when the
-- payload opts into an age band, and only to derive one of five bands.
CREATE OR REPLACE FUNCTION public.community_update_training_profile(_p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := public._community_caller();
  v_me       public.community_profiles%ROWTYPE;
  v_days     text[];
  v_bands    text[];
  v_lifts    text[];
  v_sessions text;
  v_exp      text;
  v_prog     text;
  v_share    boolean := false;
  v_age      text;
  v_raw      text;
  v_dob      date;
  v_years    int;
  v_v        text;
BEGIN
  IF _p IS NULL OR jsonb_typeof(_p) <> 'object' THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  -- Belt and braces: a payload that somehow carried a body or nutrition key
  -- is refused before anything is written (migrate_160 Part 7).
  PERFORM public._community_forbidden_keys(_p);

  v_me := public._community_require_profile(v_uid, true);
  PERFORM public._community_require_rules(v_me);

  IF jsonb_typeof(_p -> 'tp_days') = 'array' THEN
    SELECT array_agg(s.d ORDER BY array_position(public._community_tp_days_list(), s.d))
    INTO v_days
    FROM (SELECT DISTINCT value AS d FROM jsonb_array_elements_text(_p -> 'tp_days')) s;
    IF v_days IS NOT NULL THEN
      IF array_length(v_days, 1) > 7 THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
      FOREACH v_v IN ARRAY v_days LOOP
        IF NOT (v_v = ANY (public._community_tp_days_list())) THEN
          RAISE EXCEPTION USING message = 'invalid_input';
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF jsonb_typeof(_p -> 'tp_time_bands') = 'array' THEN
    SELECT array_agg(s.b ORDER BY array_position(public._community_tp_time_bands_list(), s.b))
    INTO v_bands
    FROM (SELECT DISTINCT value AS b FROM jsonb_array_elements_text(_p -> 'tp_time_bands')) s;
    IF v_bands IS NOT NULL THEN
      -- At most two: a third band is not a pattern, it is a week.
      IF array_length(v_bands, 1) > 2 THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
      FOREACH v_v IN ARRAY v_bands LOOP
        IF NOT (v_v = ANY (public._community_tp_time_bands_list())) THEN
          RAISE EXCEPTION USING message = 'invalid_input';
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF jsonb_typeof(_p -> 'tp_staple_lifts') = 'array' THEN
    SELECT array_agg(s.l) INTO v_lifts
    FROM (SELECT DISTINCT value AS l FROM jsonb_array_elements_text(_p -> 'tp_staple_lifts')) s;
    IF v_lifts IS NOT NULL THEN
      IF array_length(v_lifts, 1) > 5 THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
      FOREACH v_v IN ARRAY v_lifts LOOP
        -- Canonical exercise ids only. A custom exercise is a name the person
        -- typed, so it is never in this list (SD-22) and the shape check is
        -- what keeps free text out of a column that is compared, not read.
        IF v_v !~ '^[a-z0-9_:-]{1,64}$' THEN
          RAISE EXCEPTION USING message = 'invalid_input';
        END IF;
      END LOOP;
    END IF;
  END IF;

  v_sessions := nullif(btrim(coalesce(_p ->> 'tp_sessions_band', '')), '');
  IF v_sessions IS NOT NULL
     AND NOT (v_sessions = ANY (public._community_tp_sessions_list())) THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  v_exp := nullif(btrim(coalesce(_p ->> 'tp_experience_band', '')), '');
  IF v_exp IS NOT NULL
     AND NOT (v_exp = ANY (public._community_tp_experience_list())) THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;

  -- A Community programme id, or `style:<key>`, and nothing else.
  v_prog := nullif(btrim(coalesce(_p ->> 'tp_programme_key', '')), '');
  IF v_prog IS NOT NULL THEN
    IF v_prog LIKE 'community:%' THEN v_prog := btrim(substring(v_prog FROM 11)); END IF;
    IF NOT (v_prog ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            OR v_prog ~ '^style:[a-z0-9_]{1,64}$') THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;
  END IF;

  -- The age band NEVER crosses the wire as a value: the payload carries a
  -- boolean, and the band is derived here from the caller's own record. A
  -- minor never gets one (SD-32), and an unreadable or absent date of birth
  -- simply means no band.
  IF jsonb_typeof(_p -> 'share_age_band') = 'boolean' THEN
    v_share := (_p ->> 'share_age_band')::boolean;
  END IF;
  IF v_share AND NOT public._community_caller_is_minor(v_uid) THEN
    SELECT date_of_birth INTO v_raw FROM public.user_body_profile
    WHERE user_id = v_uid LIMIT 1;
    IF v_raw IS NOT NULL AND btrim(v_raw) <> '' THEN
      BEGIN
        v_dob := substring(btrim(v_raw) FROM 1 FOR 10)::date;
      EXCEPTION WHEN others THEN
        v_dob := NULL;
      END;
    END IF;
    IF v_dob IS NOT NULL THEN
      v_years := date_part('year', age(current_date, v_dob))::int;
      v_age := CASE
        WHEN v_years < 18 THEN NULL
        WHEN v_years <= 24 THEN '18_24'
        WHEN v_years <= 34 THEN '25_34'
        WHEN v_years <= 44 THEN '35_44'
        WHEN v_years <= 54 THEN '45_54'
        ELSE '55_plus'
      END;
    END IF;
  END IF;

  UPDATE public.community_profiles SET
    tp_days            = v_days,
    tp_time_bands      = v_bands,
    tp_sessions_band   = v_sessions,
    tp_staple_lifts    = v_lifts,
    tp_experience_band = v_exp,
    tp_programme_key   = v_prog,
    tp_age_band        = v_age,
    tp_updated_at      = now()
  WHERE user_id = v_uid;

  RETURN public._community_profile_card(v_uid, v_uid);
END $$;

-- "Open to training together" (SD-25). Off means nothing anywhere says the
-- person was ever looking, so the preferences go with the flag.
CREATE OR REPLACE FUNCTION public.community_set_partner(_open boolean, _prefs jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := public._community_caller();
  v_me    public.community_profiles%ROWTYPE;
  v_days  text[];
  v_bands text[];
  v_same  boolean := false;
  v_out   jsonb := NULL;
  v_v     text;
BEGIN
  IF _open IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  v_me := public._community_require_profile(v_uid, true);

  -- SD-32: a minor never appears in a partner list and never connects, so
  -- being "open to training together" is not something this account can be.
  IF _open AND public._community_caller_is_minor(v_uid) THEN
    RAISE EXCEPTION USING message = 'minor_restricted';
  END IF;

  IF _open THEN
    IF _prefs IS NOT NULL AND jsonb_typeof(_prefs) <> 'object' THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;
    IF jsonb_typeof(_prefs -> 'days') = 'array' THEN
      SELECT array_agg(s.d ORDER BY array_position(public._community_tp_days_list(), s.d))
      INTO v_days
      FROM (SELECT DISTINCT value AS d FROM jsonb_array_elements_text(_prefs -> 'days')) s;
      FOREACH v_v IN ARRAY coalesce(v_days, ARRAY[]::text[]) LOOP
        IF NOT (v_v = ANY (public._community_tp_days_list())) THEN
          RAISE EXCEPTION USING message = 'invalid_input';
        END IF;
      END LOOP;
    END IF;
    IF jsonb_typeof(_prefs -> 'time_bands') = 'array' THEN
      SELECT array_agg(s.b ORDER BY array_position(public._community_tp_time_bands_list(), s.b))
      INTO v_bands
      FROM (SELECT DISTINCT value AS b FROM jsonb_array_elements_text(_prefs -> 'time_bands')) s;
      FOREACH v_v IN ARRAY coalesce(v_bands, ARRAY[]::text[]) LOOP
        IF NOT (v_v = ANY (public._community_tp_time_bands_list())) THEN
          RAISE EXCEPTION USING message = 'invalid_input';
        END IF;
      END LOOP;
    END IF;
    IF jsonb_typeof(_prefs -> 'same_gym_only') = 'boolean' THEN
      v_same := (_prefs ->> 'same_gym_only')::boolean;
    END IF;
    v_out := jsonb_build_object(
      'days',          to_jsonb(coalesce(v_days, ARRAY[]::text[])),
      'time_bands',    to_jsonb(coalesce(v_bands, ARRAY[]::text[])),
      'same_gym_only', v_same);
  END IF;

  UPDATE public.community_profiles
  SET open_to_partner = _open, partner_prefs = v_out
  WHERE user_id = v_uid;

  RETURN public._community_profile_card(v_uid, v_uid);
END $$;

-- Who may send me a connection request (blueprint section 1). One control,
-- three answers, and it is the ONLY thing standing between a stranger and a
-- request, so it is validated here and nowhere else matters.
CREATE OR REPLACE FUNCTION public.community_set_connect_from(_value text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  IF _value IS NULL OR _value NOT IN ('anyone', 'followers', 'nobody') THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  PERFORM public._community_require_profile(v_uid, true);

  UPDATE public.community_profiles SET connect_from = _value WHERE user_id = v_uid;
  RETURN public._community_profile_card(v_uid, v_uid);
END $$;

-- "Show which programmes I use" (SD-26). Off removes the person from every
-- "People on this programme" list and changes nothing else.
CREATE OR REPLACE FUNCTION public.community_set_show_programmes(_value boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
BEGIN
  IF _value IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  PERFORM public._community_require_profile(v_uid, true);

  UPDATE public.community_profiles SET show_programmes = _value WHERE user_id = v_uid;
  RETURN public._community_profile_card(v_uid, v_uid);
END $$;

-- ─── Part 12: discovery ──────────────────────────────────────────────────
--
-- SD-24: the score ORDERS the list and nothing else. Every row carries its
-- reasons in the fixed wording built by the helpers in Part 6, and no RPC
-- here returns a percentage: a percentage claims a precision coarse bands
-- cannot carry, and it invites ranking people against each other.
--
-- There is deliberately NO key parameter on community_find_people. The gym,
-- area and programme keys come from the CALLER's own profile, server-side: a
-- client-supplied key would let anyone list the members of any gym they can
-- name.
--
-- The cursor is an OFFSET into the scored list, as text, because the ordering
-- key (the score) is computed rather than stored and cannot be a keyset. The
-- candidate scan is bounded at 300 rows ordered by recent activity, which is
-- the same shape as migrate_160's community_suggested_people (200) and the
-- same trade: at this size the list is complete, and as Community grows the
-- bound is the thing to revisit (SD-28).
CREATE OR REPLACE FUNCTION public.community_find_people(
  _mode text DEFAULT 'like_me', _cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := public._community_caller();
  v_lim     int  := public._community_limit(_limit);
  v_off     int  := 0;
  v_me      public.community_profiles%ROWTYPE;
  v_key     text;
  v_label   text;
  v_count   int := 0;
  v_row     record;
  v_score   int;
  v_reasons text[];
  v_items   jsonb[] := ARRAY[]::jsonb[];
  v_out     jsonb := '[]'::jsonb;
  v_style   text;
  v_band    text;
  v_days    text[];
  v_mconn   int;
  v_mfoll   int;
  v_lifts   int;
  v_total   int;
BEGIN
  IF _mode IS NULL OR _mode NOT IN
     ('like_me', 'gym', 'area', 'programme', 'partners', 'might_know') THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  v_me := public._community_require_profile(v_uid, false);

  IF _cursor IS NOT NULL AND btrim(_cursor) <> '' THEN
    IF btrim(_cursor) !~ '^[0-9]{1,6}$' THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;
    v_off := btrim(_cursor)::int;
  END IF;

  IF _mode = 'gym' THEN
    v_key := v_me.gym_key; v_label := v_me.gym_label;
  ELSIF _mode = 'area' THEN
    v_key := v_me.area_key; v_label := v_me.area_label;
  ELSIF _mode = 'programme' THEN
    v_key := v_me.tp_programme_key;
    IF v_key LIKE 'style:%' THEN
      v_label := public._community_style_label(substring(v_key FROM 7));
    ELSIF v_key IS NOT NULL THEN
      SELECT g.title INTO v_label FROM public.community_programmes g
      WHERE g.id = v_key::uuid AND g.status = 'visible';
    END IF;
  END IF;

  -- An honest empty door rather than a pretend list: the row on the screen
  -- already says what would make it work (SD-28).
  IF (_mode IN ('gym', 'area', 'programme') AND v_key IS NULL)
     OR (_mode = 'partners' AND NOT coalesce(v_me.open_to_partner, false)) THEN
    RETURN jsonb_build_object(
      'mode', _mode, 'key', v_key, 'label', v_label,
      'count', 0, 'people', '[]'::jsonb, 'cursor', NULL);
  END IF;

  FOR v_row IN
    SELECT p.*
    FROM public.community_profiles p
    WHERE p.status = 'active'
      AND p.visibility = 'public'
      AND p.is_minor = false
      AND p.user_id <> v_uid
      AND NOT public._community_is_blocked(v_uid, p.user_id)
      AND NOT public._community_is_connected(v_uid, p.user_id)
      AND (_mode <> 'gym'       OR p.gym_key = v_key)
      AND (_mode <> 'area'      OR p.area_key = v_key)
      AND (_mode <> 'programme' OR p.tp_programme_key = v_key)
      AND (_mode <> 'partners'  OR p.open_to_partner = true)
    ORDER BY p.last_active_at DESC
    LIMIT 300
  LOOP
    v_score := 0;
    v_reasons := ARRAY[]::text[];

    IF v_me.gym_key IS NOT NULL AND v_row.gym_key = v_me.gym_key THEN
      v_score := v_score + 3;
      v_reasons := v_reasons || ('Trains at ' || coalesce(v_row.gym_label, v_me.gym_label));
    END IF;

    -- Every bare reason literal is cast to text: `text[] || 'literal'`
    -- resolves to array || array against an UNKNOWN-typed literal and fails
    -- at runtime with "malformed array literal". The concatenated reasons
    -- ('Trains at ' || ...) are already text, so only the bare ones need it.
    IF v_me.tp_programme_key IS NOT NULL
       AND v_row.tp_programme_key = v_me.tp_programme_key THEN
      v_score := v_score + 3;
      v_reasons := v_reasons || 'On the same programme'::text;
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

    -- Mutual connections: two points each, capped at three.
    SELECT count(*) INTO v_mconn FROM (
      SELECT CASE WHEN c.user_a = v_uid THEN c.user_b ELSE c.user_a END AS m
      FROM public.community_connections c
      WHERE c.state = 'connected' AND (c.user_a = v_uid OR c.user_b = v_uid)
      INTERSECT
      SELECT CASE WHEN d.user_a = v_row.user_id THEN d.user_b ELSE d.user_a END
      FROM public.community_connections d
      WHERE d.state = 'connected'
        AND (d.user_a = v_row.user_id OR d.user_b = v_row.user_id)
    ) q;
    IF v_mconn > 0 THEN
      v_score := v_score + least(v_mconn * 2, 3);
      v_reasons := v_reasons || ('Connected to ' || v_mconn::text || ' of your connections');
    END IF;

    -- Mutual follows: one point each, capped at three.
    SELECT count(*) INTO v_mfoll
    FROM public.community_follows mine
    JOIN public.community_follows theirs ON theirs.follower_id = mine.followee_id
    WHERE mine.follower_id = v_uid AND mine.state = 'accepted'
      AND theirs.followee_id = v_row.user_id AND theirs.state = 'accepted';
    IF v_mfoll > 0 THEN
      v_score := v_score + least(v_mfoll, 3);
      v_reasons := v_reasons || ('Followed by ' || v_mfoll::text || ' you follow');
    END IF;

    IF v_me.goal IS NOT NULL AND v_row.goal = v_me.goal THEN
      v_score := v_score + 1;
      v_reasons := v_reasons || 'Same goal'::text;
    END IF;

    -- Shared bands only ever compare what BOTH people chose to share.
    IF v_me.tp_time_bands IS NOT NULL AND v_row.tp_time_bands IS NOT NULL THEN
      SELECT b INTO v_band
      FROM unnest(v_me.tp_time_bands) AS b
      WHERE b = ANY (v_row.tp_time_bands)
      ORDER BY array_position(public._community_tp_time_bands_list(), b)
      LIMIT 1;
      IF v_band IS NOT NULL THEN
        v_score := v_score + 2;
        v_reasons := v_reasons
          || ('Both usually train ' || public._community_time_band_phrase(v_band));
      END IF;
    END IF;

    IF v_me.tp_days IS NOT NULL AND v_row.tp_days IS NOT NULL THEN
      SELECT array_agg(s.d ORDER BY array_position(public._community_tp_days_list(), s.d))
      INTO v_days
      FROM (SELECT unnest(v_me.tp_days) AS d
            INTERSECT
            SELECT unnest(v_row.tp_days)) s;
      IF v_days IS NOT NULL AND array_length(v_days, 1) >= 2 THEN
        v_score := v_score + 1;
        v_reasons := v_reasons || ('Both train ' || public._community_day_list(v_days));
      END IF;
    END IF;

    IF v_me.tp_sessions_band IS NOT NULL
       AND v_row.tp_sessions_band = v_me.tp_sessions_band THEN
      v_score := v_score + 1;
      v_reasons := v_reasons
        || ('Both train ' || public._community_sessions_phrase(v_me.tp_sessions_band)
            || ' times a week');
    END IF;

    IF v_me.tp_experience_band IS NOT NULL
       AND v_row.tp_experience_band = v_me.tp_experience_band THEN
      v_score := v_score + 1;
      v_reasons := v_reasons || 'Similar experience'::text;
    END IF;

    IF v_me.tp_staple_lifts IS NOT NULL AND v_row.tp_staple_lifts IS NOT NULL THEN
      SELECT count(*) INTO v_lifts FROM (
        SELECT unnest(v_me.tp_staple_lifts) AS l
        INTERSECT
        SELECT unnest(v_row.tp_staple_lifts)) s;
      IF v_lifts > 0 THEN
        v_score := v_score + least(v_lifts, 3);
        -- Singular when there is one. The blueprint fixes the wording as
        -- "<n> staple lifts in common"; "1 staple lifts in common" is not
        -- English, and calm plain copy is a standing rule (CLAUDE.md 3).
        v_reasons := v_reasons || (v_lifts::text ||
          CASE WHEN v_lifts = 1 THEN ' staple lift in common'
               ELSE ' staple lifts in common' END);
      END IF;
    END IF;

    IF coalesce(v_me.open_to_partner, false) AND coalesce(v_row.open_to_partner, false) THEN
      v_score := v_score + 2;
      v_reasons := v_reasons || 'Both open to training together'::text;
    END IF;

    -- Minimum score 1 for the two modes with no key of their own; a keyed
    -- door returns its matching rows even when nothing else is shared.
    IF v_score >= 1 OR _mode IN ('gym', 'area', 'programme', 'partners') THEN
      v_items := v_items || jsonb_build_object(
        'card',    public._community_profile_card(v_row.user_id, v_uid),
        'reasons', to_jsonb(v_reasons),
        'score',   v_score,
        'last_active_at', v_row.last_active_at);
    END IF;
  END LOOP;

  v_total := coalesce(array_length(v_items, 1), 0);

  SELECT coalesce(jsonb_agg(z.x ORDER BY (z.x ->> 'score')::int DESC,
                            (z.x ->> 'last_active_at')::timestamptz DESC), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT t.x
    FROM (SELECT unnest(v_items) AS x) t
    ORDER BY (t.x ->> 'score')::int DESC, (t.x ->> 'last_active_at')::timestamptz DESC
    OFFSET v_off
    LIMIT v_lim
  ) z;

  -- The door's live count: every candidate the mode matches, before scoring.
  SELECT count(*) INTO v_count
  FROM public.community_profiles p
  WHERE p.status = 'active'
    AND p.visibility = 'public'
    AND p.is_minor = false
    AND p.user_id <> v_uid
    AND NOT public._community_is_blocked(v_uid, p.user_id)
    AND NOT public._community_is_connected(v_uid, p.user_id)
    AND (_mode <> 'gym'       OR p.gym_key = v_key)
    AND (_mode <> 'area'      OR p.area_key = v_key)
    AND (_mode <> 'programme' OR p.tp_programme_key = v_key)
    AND (_mode <> 'partners'  OR p.open_to_partner = true);

  RETURN jsonb_build_object(
    'mode',   _mode,
    'key',    v_key,
    'label',  v_label,
    'count',  CASE WHEN _mode IN ('like_me', 'might_know') THEN v_total ELSE v_count END,
    'people', v_out,
    'cursor', CASE WHEN v_total > v_off + v_lim THEN (v_off + v_lim)::text END);
END $$;

-- "People on this programme" (SD-26). The programme itself is gated exactly
-- as community_get_programme gates it, and the "Show which programmes I use"
-- toggle is the whole consent story for appearing here.
CREATE OR REPLACE FUNCTION public.community_programme_people(
  _id uuid, _cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := public._community_caller();
  v_lim    int  := public._community_limit(_limit);
  v_ts     timestamptz;
  v_id     uuid;
  v_label  text;
  v_count  int := 0;
  v_people jsonb := '[]'::jsonb;
  v_lts    timestamptz;
  v_lid    uuid;
BEGIN
  IF _id IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  IF NOT public._community_can_view_programme(v_uid, _id) THEN
    RAISE EXCEPTION USING message = 'not_found';
  END IF;
  SELECT title INTO v_label FROM public.community_programmes WHERE id = _id;
  SELECT c_ts, c_id INTO v_ts, v_id FROM public._community_cursor_parts(_cursor);

  WITH page AS (
    SELECT p.user_id AS user_id, p.created_at AS created_at
    FROM public.community_profiles p
    WHERE p.status = 'active' AND p.visibility = 'public' AND p.is_minor = false
      AND p.show_programmes = true
      AND p.user_id <> v_uid
      AND NOT public._community_is_blocked(v_uid, p.user_id)
      AND (EXISTS (SELECT 1 FROM public.community_programme_uses u
                   WHERE u.user_id = p.user_id AND u.programme_id = _id)
           OR EXISTS (SELECT 1 FROM public.community_programmes g
                      WHERE g.id = _id AND g.owner_id = p.user_id))
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
    AND p.show_programmes = true
    AND p.user_id <> v_uid
    AND NOT public._community_is_blocked(v_uid, p.user_id)
    AND (EXISTS (SELECT 1 FROM public.community_programme_uses u
                 WHERE u.user_id = p.user_id AND u.programme_id = _id)
         OR EXISTS (SELECT 1 FROM public.community_programmes g
                    WHERE g.id = _id AND g.owner_id = p.user_id));

  RETURN jsonb_build_object(
    'label',  v_label,
    'count',  v_count,
    'people', coalesce(v_people, '[]'::jsonb),
    'cursor', public._community_cursor_of(v_lts, v_lid));
END $$;

-- The gym page's summary (SD-27). Counts, never a room: nothing live, nothing
-- precise, no verification, no leaderboard, and no "who is here now" (SD-31).
-- The time-band line is the coarsest true thing that can be said about when a
-- gym's members train: "6 usually train evenings".
CREATE OR REPLACE FUNCTION public.community_gym_summary(_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := public._community_caller();
  v_key     text := nullif(btrim(coalesce(_key, '')), '');
  v_label   text;
  v_members uuid[];
  v_count   int := 0;
  v_follow  int := 0;
  v_partner int := 0;
  v_styles  jsonb := '[]'::jsonb;
  v_bands   jsonb := '[]'::jsonb;
  v_people  jsonb := '[]'::jsonb;
  v_progs   jsonb := '[]'::jsonb;
  v_posts   jsonb := '[]'::jsonb;
BEGIN
  IF v_key IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;

  SELECT gym_label INTO v_label FROM public.community_profiles
  WHERE gym_key = v_key AND status = 'active' AND visibility = 'public'
  LIMIT 1;

  -- The members, once. Everything below counts over this array rather than
  -- re-deriving the predicate, so no section can quietly disagree with the
  -- headline count about who is a member.
  SELECT coalesce(array_agg(p.user_id), ARRAY[]::uuid[])
  INTO v_members
  FROM public.community_profiles p
  WHERE p.gym_key = v_key
    AND p.status = 'active' AND p.visibility = 'public' AND p.is_minor = false
    AND p.user_id <> v_uid
    AND NOT public._community_is_blocked(v_uid, p.user_id);

  v_count := coalesce(array_length(v_members, 1), 0);
  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'key', v_key, 'label', v_label, 'count', 0,
      'following_count', 0, 'open_to_partner_count', 0,
      'by_style', '[]'::jsonb, 'by_time_band', '[]'::jsonb,
      'people', '[]'::jsonb, 'programmes', '[]'::jsonb, 'posts', '[]'::jsonb);
  END IF;

  SELECT count(*) INTO v_follow
  FROM public.community_follows f
  WHERE f.follower_id = v_uid AND f.state = 'accepted'
    AND f.followee_id = ANY (v_members);

  SELECT count(*) INTO v_partner
  FROM public.community_profiles p
  WHERE p.user_id = ANY (v_members) AND p.open_to_partner = true;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'key', s.style_key, 'label', public._community_style_label(s.style_key),
           'count', s.n) ORDER BY s.n DESC, s.style_key ASC), '[]'::jsonb)
  INTO v_styles
  FROM (
    SELECT st AS style_key, count(*)::int AS n
    FROM public.community_profiles p
    CROSS JOIN LATERAL unnest(p.styles) AS st
    WHERE p.user_id = ANY (v_members)
    GROUP BY st
    ORDER BY count(*) DESC, st ASC
    LIMIT 8
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'band', b.band,
           -- The client renders `count || ' ' || label`: "6 usually train
           -- evenings". The phrase lives here so every surface says it the
           -- same way (SD-24).
           'label', 'usually train ' || public._community_time_band_phrase(b.band),
           'count', b.n)
         ORDER BY array_position(public._community_tp_time_bands_list(), b.band)), '[]'::jsonb)
  INTO v_bands
  FROM (
    SELECT tb AS band, count(*)::int AS n
    FROM public.community_profiles p
    CROSS JOIN LATERAL unnest(p.tp_time_bands) AS tb
    WHERE p.user_id = ANY (v_members) AND p.tp_time_bands IS NOT NULL
    GROUP BY tb
  ) b;

  SELECT coalesce(jsonb_agg(public._community_profile_card(z.user_id, v_uid)
           ORDER BY z.last_active_at DESC), '[]'::jsonb)
  INTO v_people
  FROM (
    SELECT p.user_id, p.last_active_at
    FROM public.community_profiles p
    WHERE p.user_id = ANY (v_members)
    ORDER BY p.last_active_at DESC
    LIMIT 20
  ) z;

  SELECT coalesce(jsonb_agg(public._community_programme_tile(g.row) ORDER BY g.updated_at DESC),
                  '[]'::jsonb)
  INTO v_progs
  FROM (
    SELECT gg AS row, gg.updated_at AS updated_at
    FROM public.community_programmes gg
    WHERE gg.owner_id = ANY (v_members)
      AND gg.status = 'visible' AND gg.visibility = 'public'
    ORDER BY gg.updated_at DESC
    LIMIT 20
  ) g;

  -- Public stories only, and each one re-checked with the POST predicate
  -- rather than the person predicate (SD-14b).
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'post',   public._community_post_json(r.row),
           'author', public._community_profile_card(r.author_id, v_uid))
         ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_posts
  FROM (
    SELECT pp AS row, pp.author_id AS author_id, pp.created_at AS created_at
    FROM public.community_posts pp
    WHERE pp.author_id = ANY (v_members)
      AND pp.status = 'visible' AND pp.visibility = 'public'
      AND public._community_can_view_post(v_uid, pp.id)
    ORDER BY pp.created_at DESC
    LIMIT 10
  ) r;

  RETURN jsonb_build_object(
    'key',                   v_key,
    'label',                 v_label,
    'count',                 v_count,
    'following_count',       v_follow,
    'open_to_partner_count', v_partner,
    'by_style',              v_styles,
    'by_time_band',          v_bands,
    'people',                v_people,
    'programmes',            v_progs,
    'posts',                 v_posts);
END $$;

-- The gym typeahead (SD-27): labels ALREADY used in the same area, most used
-- first, at most eight. Gym labels de-duplicate at entry because "PureGym
-- Leeds" is CHOSEN rather than retyped into four near-misses that never join
-- up into one page. Matching is on the folded key, so accents, punctuation
-- and capitals do not split a gym in two.
CREATE OR REPLACE FUNCTION public.community_gym_suggest(_area_key text, _prefix text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := public._community_caller();
  v_area text := nullif(btrim(coalesce(_area_key, '')), '');
  v_pre  text := coalesce(public._community_fold(_prefix), '');
  v_out  jsonb := '[]'::jsonb;
BEGIN
  IF v_area IS NULL THEN
    SELECT area_key INTO v_area FROM public.community_profiles WHERE user_id = v_uid;
  END IF;
  IF v_area IS NULL THEN
    RETURN jsonb_build_object('gyms', '[]'::jsonb);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'label', s.label, 'key', s.gym_key, 'count', s.total)
         ORDER BY s.total DESC, s.label ASC), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT g.gym_key,
           (array_agg(g.gym_label ORDER BY g.n DESC, g.gym_label ASC))[1] AS label,
           sum(g.n)::int AS total
    FROM (
      SELECT p.gym_key, p.gym_label, count(*)::int AS n
      FROM public.community_profiles p
      WHERE p.status = 'active' AND p.visibility = 'public' AND p.is_minor = false
        AND p.area_key = v_area
        AND p.gym_key IS NOT NULL AND p.gym_label IS NOT NULL
        -- The key is `<area fold>:<gym fold>`, so the prefix is matched
        -- against the gym half only.
        AND (v_pre = '' OR public._community_fold(p.gym_label) LIKE v_pre || '%')
      GROUP BY p.gym_key, p.gym_label
    ) g
    GROUP BY g.gym_key
    ORDER BY sum(g.n) DESC
    LIMIT 8
  ) s;

  RETURN jsonb_build_object('gyms', v_out);
END $$;

-- ─── Part 13: messaging ──────────────────────────────────────────────────
--
-- SD-21: messaging is a CONSEQUENCE of connection, not a feature. Every send
-- is refused unless the two people are connected (`not_connected`), under-18
-- accounts are refused on either side (`minor_restricted`, SD-32), and a
-- closed conversation refuses new messages until a fresh connection replaces
-- it. There are no groups, no media and no realtime subscriptions: the lists
-- are re-read on focus and on a push tap.

-- One page of conversations. Closed ones are not listed at all: when a
-- connection is removed or a block is placed the conversation goes from both
-- lists, which is what the confirm on the screen promised.
--
-- Ordered by most recent activity, which is what a conversation list means;
-- the cursor is a keyset on that same timestamp and the id.
CREATE OR REPLACE FUNCTION public.community_conversations(
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
  v_rows jsonb := '[]'::jsonb;
  v_lts  timestamptz;
  v_lid  uuid;
BEGIN
  PERFORM public._community_require_profile(v_uid, false);
  SELECT c_ts, c_id INTO v_ts, v_id FROM public._community_cursor_parts(_cursor);

  WITH page AS (
    SELECT c.id AS id,
           CASE WHEN c.user_a = v_uid THEN c.user_b ELSE c.user_a END AS other_id,
           coalesce(c.last_message_at, c.created_at) AS sort_at,
           c.created_at AS created_at,
           c.last_message_at AS last_message_at,
           CASE WHEN c.user_a = v_uid THEN c.a_last_read_at ELSE c.b_last_read_at END AS read_at
    FROM public.community_conversations c
    WHERE c.closed_at IS NULL
      AND (c.user_a = v_uid OR c.user_b = v_uid)
      AND NOT public._community_is_blocked(
        v_uid, CASE WHEN c.user_a = v_uid THEN c.user_b ELSE c.user_a END)
      AND (v_ts IS NULL OR (coalesce(c.last_message_at, c.created_at), c.id) < (v_ts, v_id))
    ORDER BY coalesce(c.last_message_at, c.created_at) DESC, c.id DESC
    LIMIT v_lim
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
        'id',              page.id,
        'other',           public._community_profile_card(page.other_id, v_uid),
        'created_at',      page.created_at,
        'last_message_at', page.last_message_at,
        'read_at',         page.read_at,
        'unread',          (SELECT count(*) FROM public.community_messages m
                            WHERE m.conversation_id = page.id
                              AND m.sender_id <> v_uid
                              AND m.created_at > coalesce(page.read_at, '-infinity'::timestamptz)),
        -- The last line, for the list row. It is this person's own
        -- conversation, so the preview is theirs to see; the PUSH never
        -- carries it (blueprint section 2).
        'preview',         (SELECT left(m.body, 140) FROM public.community_messages m
                            WHERE m.conversation_id = page.id
                            ORDER BY m.created_at DESC, m.id DESC LIMIT 1))
      ORDER BY page.sort_at DESC, page.id DESC), '[]'::jsonb),
    (array_agg(page.sort_at ORDER BY page.sort_at ASC, page.id ASC))[1],
    (array_agg(page.id      ORDER BY page.sort_at ASC, page.id ASC))[1]
  INTO v_rows, v_lts, v_lid
  FROM page;

  RETURN jsonb_build_object(
    'conversations', coalesce(v_rows, '[]'::jsonb),
    'cursor', public._community_cursor_of(v_lts, v_lid));
END $$;

-- One page of messages, newest first (created_at desc, id desc). A closed
-- conversation can still be READ by its participants if they hold the id;
-- what it cannot do is take a new message.
CREATE OR REPLACE FUNCTION public.community_messages(
  _conversation_id uuid, _cursor text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := public._community_caller();
  v_lim   int  := public._community_limit(_limit);
  v_c     public.community_conversations%ROWTYPE;
  v_other uuid;
  v_ts    timestamptz;
  v_id    uuid;
  v_rows  jsonb := '[]'::jsonb;
  v_lts   timestamptz;
  v_lid   uuid;
BEGIN
  IF _conversation_id IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  PERFORM public._community_require_profile(v_uid, false);

  SELECT * INTO v_c FROM public.community_conversations WHERE id = _conversation_id;
  IF NOT FOUND OR (v_c.user_a <> v_uid AND v_c.user_b <> v_uid) THEN
    RAISE EXCEPTION USING message = 'not_found';
  END IF;
  v_other := CASE WHEN v_c.user_a = v_uid THEN v_c.user_b ELSE v_c.user_a END;
  IF public._community_is_blocked(v_uid, v_other) THEN
    RAISE EXCEPTION USING message = 'not_found';
  END IF;

  SELECT c_ts, c_id INTO v_ts, v_id FROM public._community_cursor_parts(_cursor);

  WITH page AS (
    -- The whole row is carried as a TYPED column so it can be passed to
    -- _community_message_json as a public.community_messages value.
    SELECT m AS row, m.created_at AS created_at, m.id AS id
    FROM public.community_messages m
    WHERE m.conversation_id = _conversation_id
      AND (v_ts IS NULL OR (m.created_at, m.id) < (v_ts, v_id))
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_lim
  )
  SELECT
    coalesce(jsonb_agg(public._community_message_json(page.row, v_uid)
             ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb),
    (array_agg(page.created_at ORDER BY page.created_at ASC, page.id ASC))[1],
    (array_agg(page.id         ORDER BY page.created_at ASC, page.id ASC))[1]
  INTO v_rows, v_lts, v_lid
  FROM page;

  RETURN jsonb_build_object(
    'conversation', jsonb_build_object(
      'id',              v_c.id,
      'other',           public._community_profile_card(v_other, v_uid),
      'closed',          v_c.closed_at IS NOT NULL,
      'connected',       public._community_is_connected(v_uid, v_other),
      'created_at',      v_c.created_at,
      'last_message_at', v_c.last_message_at),
    'messages', coalesce(v_rows, '[]'::jsonb),
    'cursor', public._community_cursor_of(v_lts, v_lid));
END $$;

-- Send one message, creating the conversation on the first one. Rate 20/hour
-- while an account is new, 60/hour after seven days.
CREATE OR REPLACE FUNCTION public.community_send_message(
  _target uuid, _body text, _ref_kind text DEFAULT NULL, _ref_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := public._community_caller();
  v_me    public.community_profiles%ROWTYPE;
  v_them  public.community_profiles%ROWTYPE;
  v_body  text;
  v_kind  text;
  v_a     uuid;
  v_b     uuid;
  v_conv  public.community_conversations%ROWTYPE;
  v_msg   public.community_messages%ROWTYPE;
BEGIN
  IF _target IS NULL OR _target = v_uid THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  v_me := public._community_require_profile(v_uid, true);
  PERFORM public._community_require_rules(v_me);

  SELECT * INTO v_them FROM public.community_profiles WHERE user_id = _target;
  IF NOT FOUND OR v_them.status <> 'active' THEN
    RAISE EXCEPTION USING message = 'not_found';
  END IF;
  IF public._community_is_blocked(v_uid, _target) THEN
    RAISE EXCEPTION USING message = 'blocked';
  END IF;
  IF public._community_caller_is_minor(v_uid) OR v_them.is_minor THEN
    RAISE EXCEPTION USING message = 'minor_restricted';
  END IF;
  IF NOT public._community_is_connected(v_uid, _target) THEN
    RAISE EXCEPTION USING message = 'not_connected';
  END IF;

  v_body := nullif(btrim(coalesce(_body, '')), '');
  IF v_body IS NULL OR length(v_body) > 1000 THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  v_body := public._community_clean_text(v_body);

  -- One context reference, and only to something this sender may actually
  -- see: a message must never become a way to name a hidden programme or a
  -- followers-only story (SD-14b).
  v_kind := nullif(btrim(coalesce(_ref_kind, '')), '');
  IF v_kind IS NOT NULL THEN
    IF v_kind NOT IN ('programme', 'post') OR _ref_id IS NULL THEN
      RAISE EXCEPTION USING message = 'invalid_input';
    END IF;
    IF v_kind = 'programme' AND NOT public._community_can_view_programme(v_uid, _ref_id) THEN
      RAISE EXCEPTION USING message = 'not_found';
    END IF;
    IF v_kind = 'post' AND NOT public._community_can_view_post(v_uid, _ref_id) THEN
      RAISE EXCEPTION USING message = 'not_found';
    END IF;
  END IF;

  PERFORM public._community_rate_check(v_uid, 'message', 20, 60, interval '1 hour');

  v_a := least(v_uid, _target);
  v_b := greatest(v_uid, _target);
  SELECT * INTO v_conv FROM public.community_conversations WHERE user_a = v_a AND user_b = v_b;
  IF NOT FOUND THEN
    INSERT INTO public.community_conversations (user_a, user_b) VALUES (v_a, v_b)
    RETURNING * INTO v_conv;
  ELSIF v_conv.closed_at IS NOT NULL THEN
    -- Closed by a removal or a block. A new connection deletes the closed row
    -- and the next message starts a fresh conversation, so there is no path
    -- that quietly reopens one.
    RAISE EXCEPTION USING message = 'not_allowed';
  END IF;

  INSERT INTO public.community_messages
    (conversation_id, sender_id, body, ref_kind, ref_id)
  VALUES (v_conv.id, v_uid, v_body, v_kind, CASE WHEN v_kind IS NULL THEN NULL ELSE _ref_id END)
  RETURNING * INTO v_msg;

  UPDATE public.community_conversations SET
    last_message_at = now(),
    -- The sender has by definition read their own message.
    a_last_read_at = CASE WHEN v_a = v_uid THEN now() ELSE a_last_read_at END,
    b_last_read_at = CASE WHEN v_b = v_uid THEN now() ELSE b_last_read_at END
  WHERE id = v_conv.id;

  RETURN jsonb_build_object(
    'conversation_id', v_conv.id,
    'message',         public._community_message_json(v_msg, v_uid));
END $$;

CREATE OR REPLACE FUNCTION public.community_mark_conversation_read(_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
  v_c   public.community_conversations%ROWTYPE;
BEGIN
  IF _conversation_id IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;

  SELECT * INTO v_c FROM public.community_conversations WHERE id = _conversation_id;
  IF NOT FOUND OR (v_c.user_a <> v_uid AND v_c.user_b <> v_uid) THEN
    RAISE EXCEPTION USING message = 'not_found';
  END IF;

  UPDATE public.community_conversations SET
    a_last_read_at = CASE WHEN user_a = v_uid THEN now() ELSE a_last_read_at END,
    b_last_read_at = CASE WHEN user_b = v_uid THEN now() ELSE b_last_read_at END
  WHERE id = _conversation_id;

  RETURN jsonb_build_object('ok', true);
END $$;

-- A hard delete, by the sender only: a message you can still see after the
-- sender removed it is not a deletion. The conversation's last-message stamp
-- is recomputed so the list does not keep claiming activity that is gone.
CREATE OR REPLACE FUNCTION public.community_delete_message(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := public._community_caller();
  v_conv uuid;
BEGIN
  IF _id IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;

  SELECT conversation_id INTO v_conv FROM public.community_messages
  WHERE id = _id AND sender_id = v_uid;
  IF v_conv IS NULL THEN RAISE EXCEPTION USING message = 'not_found'; END IF;

  DELETE FROM public.community_messages WHERE id = _id AND sender_id = v_uid;

  UPDATE public.community_conversations c SET
    last_message_at = (SELECT max(m.created_at) FROM public.community_messages m
                       WHERE m.conversation_id = v_conv)
  WHERE c.id = v_conv;

  RETURN jsonb_build_object('ok', true);
END $$;

-- ─── Part 14: the 160 RPCs that must now cover three more tables ─────────
--
-- Each is migrate_160's body re-issued IN FULL with the new tables added.
-- Re-issuing rather than patching is deliberate: a function has ONE
-- definition and the latest wins, so a partial re-declaration would silently
-- drop what 160 does.

-- A block removes the follows, removes the connection, closes the
-- conversation and clears the activity between the two people. It is not a
-- quieter unfollow (blueprint section 1).
CREATE OR REPLACE FUNCTION public.community_block(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
  v_a   uuid;
  v_b   uuid;
BEGIN
  IF _target IS NULL OR _target = v_uid THEN
    RAISE EXCEPTION USING message = 'invalid_input';
  END IF;
  v_a := least(v_uid, _target);
  v_b := greatest(v_uid, _target);

  INSERT INTO public.community_blocks (blocker_id, blocked_id)
  VALUES (v_uid, _target) ON CONFLICT DO NOTHING;

  -- Both edges go, in both directions: a block is not a quieter unfollow.
  DELETE FROM public.community_follows
  WHERE (follower_id = v_uid AND followee_id = _target)
     OR (follower_id = _target AND followee_id = v_uid);

  -- The connection goes with them, in whichever state it was: a pending
  -- request from a blocked person must not survive the block.
  DELETE FROM public.community_connections WHERE user_a = v_a AND user_b = v_b;

  -- The conversation closes for both. The messages are not deleted here
  -- (erasure is community_leave and delete_user_data), but neither person
  -- sees the conversation again unless they connect afresh, which deletes it.
  UPDATE public.community_conversations SET closed_at = now()
  WHERE user_a = v_a AND user_b = v_b AND closed_at IS NULL;

  -- Activity between the two people goes as well, so a blocked person's name
  -- cannot linger in the blocker's inbox.
  DELETE FROM public.community_activity
  WHERE (user_id = v_uid AND actor_id = _target)
     OR (user_id = _target AND actor_id = v_uid);

  RETURN jsonb_build_object('ok', true);
END $$;

-- Unfollowing a CONNECTION also removes the connection and closes the
-- conversation (blueprint section 1; the confirm on the screen says so).
-- Unfollowing someone you are not connected to is unchanged from 160.
CREATE OR REPLACE FUNCTION public.community_unfollow(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public._community_caller();
  v_a   uuid;
  v_b   uuid;
BEGIN
  IF _target IS NULL THEN RAISE EXCEPTION USING message = 'invalid_input'; END IF;
  v_a := least(v_uid, _target);
  v_b := greatest(v_uid, _target);

  DELETE FROM public.community_follows
  WHERE follower_id = v_uid AND followee_id = _target;

  IF public._community_is_connected(v_uid, _target) THEN
    DELETE FROM public.community_connections
    WHERE user_a = v_a AND user_b = v_b AND state = 'connected';

    UPDATE public.community_conversations SET closed_at = now()
    WHERE user_a = v_a AND user_b = v_b AND closed_at IS NULL;
  END IF;

  RETURN jsonb_build_object('state', 'none');
END $$;

-- Leaving Community. 160's body, plus the three new tables two-sided: a
-- connection, a conversation and every message in it go with the person who
-- leaves, from BOTH sides, because a conversation is not one person's row.
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
  VALUES (v_uid, 'community_visibility', false, now(),
          public._community_rules_version()::text);

  -- Activity this user CAUSED for other people goes too; the rows they
  -- RECEIVED cascade with their profile.
  DELETE FROM public.community_activity WHERE actor_id = v_uid;
  -- Blueprint section 2: reports they filed keep their reporter as NULL
  -- (security review 2026-09-06, finding 11).
  UPDATE public.community_reports SET reporter_id = NULL WHERE reporter_id = v_uid;

  -- Messaging (161). The conversation delete cascades to its messages, so a
  -- message this person sent cannot survive in the other person's thread.
  DELETE FROM public.community_messages WHERE sender_id = v_uid;
  DELETE FROM public.community_conversations WHERE user_a = v_uid OR user_b = v_uid;
  DELETE FROM public.community_connections WHERE user_a = v_uid OR user_b = v_uid;

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

-- ─── Part 15: privileges ─────────────────────────────────────────────────
--
-- The same two loops as migrate_160 Part 10, over the functions THIS file
-- declares. Internal helpers: revoked from PUBLIC, anon AND authenticated.
-- Client RPCs: revoked from PUBLIC and anon, granted to authenticated only.
-- CREATE OR REPLACE preserves an existing ACL (measured, see
-- supabase/README.md 2026-08-12 note on migrate_130), so re-issuing a 160
-- function does not reopen it; these statements are explicit so the intent is
-- readable in one place.
--
-- service_role is deliberately untouched on the three new TABLES: the
-- community-notify Edge Function reads community_connections,
-- community_conversations and community_messages with it, and writes the
-- a_last_push_at / b_last_push_at collapse stamps.

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    '_community_tp_days_list()',
    '_community_tp_time_bands_list()',
    '_community_tp_sessions_list()',
    '_community_tp_experience_list()',
    '_community_tp_age_bands_list()',
    '_community_connect_reasons_list()',
    '_community_rules_version()',
    '_community_require_rules(public.community_profiles)',
    '_community_time_band_phrase(text)',
    '_community_sessions_phrase(text)',
    '_community_day_list(text[])',
    '_community_connection_counts()',
    '_community_connect_from_default()',
    '_community_connection_state(uuid, uuid)',
    '_community_is_connected(uuid, uuid)',
    '_community_other_is_minor(uuid)',
    '_community_caller_is_minor(uuid)',
    '_community_conversation_id(uuid, uuid)',
    '_community_message_json(public.community_messages, uuid)',
    '_community_profile_card(uuid, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', sig);
  END LOOP;

  FOREACH sig IN ARRAY ARRAY[
    'community_connect(uuid, text[], text)',
    'community_respond_connect(uuid, boolean)',
    'community_withdraw_connect(uuid)',
    'community_remove_connection(uuid)',
    'community_list_connections(uuid, text, int)',
    'community_update_training_profile(jsonb)',
    'community_set_partner(boolean, jsonb)',
    'community_set_connect_from(text)',
    'community_set_show_programmes(boolean)',
    'community_find_people(text, text, int)',
    'community_programme_people(uuid, text, int)',
    'community_gym_summary(text)',
    'community_gym_suggest(text, text)',
    'community_conversations(text, int)',
    'community_messages(uuid, text, int)',
    'community_send_message(uuid, text, text, uuid)',
    'community_mark_conversation_read(uuid)',
    'community_delete_message(uuid)',
    'community_get_me()',
    'community_upsert_profile(jsonb)',
    'community_block(uuid)',
    'community_unfollow(uuid)',
    'community_leave()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', sig);
  END LOOP;
END $$;

-- ─── Part 16: delete_user_data() re-issued IN FULL ───────────────────────
--
-- migrate_160's body, verbatim, with the three tables this migration adds
-- appended to its Community block. It is re-issued in FULL rather than
-- patched for the same reason 160 re-issued 154's: this function has one
-- definition and the latest one wins, so a partial re-declaration would
-- silently drop every table the earlier version covers. CREATE OR REPLACE
-- preserves the existing ACL, so migrate_130's revoke of anon/PUBLIC
-- survives this file too.

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
  -- 161: connections and messaging, two-sided. A conversation is not one
  -- person's row, so both sides go; deleting the conversation cascades to
  -- every message in it, and the sender delete first covers a message this
  -- user sent in a conversation that somehow outlives them.
  BEGIN DELETE FROM community_messages WHERE sender_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    DELETE FROM community_conversations WHERE user_a = uid OR user_b = uid;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    DELETE FROM community_connections WHERE user_a = uid OR user_b = uid;
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


-- ─── Part 17: acceptance check ───────────────────────────────────────────
--
-- Read-only. Every table this migration adds must be present, RLS-enabled and
-- carry NO policy at all; every function it declares must exist, be SECURITY
-- DEFINER with the search_path pinned, and be executable by `authenticated`
-- for exactly the community_* RPCs and for no `_community_*` helper. Run this
-- after the apply and read the output before declaring the migration landed.

SELECT t.table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'community_connections', 'community_conversations', 'community_messages')
ORDER BY t.table_name;

-- The thirteen new profile columns.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'community_profiles'
  AND column_name IN (
    'connect_from', 'open_to_partner', 'partner_prefs', 'show_programmes',
    'connection_count', 'tp_days', 'tp_time_bands', 'tp_sessions_band',
    'tp_staple_lifts', 'tp_experience_band', 'tp_programme_key',
    'tp_age_band', 'tp_updated_at')
ORDER BY column_name;

-- The three widened CHECKs must now carry the new values.
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace AND n.nspname = 'public'
WHERE con.conname IN ('community_activity_kind_check',
                      'community_reports_target_kind_check',
                      'notification_preferences_category_check')
ORDER BY con.conname;

SELECT p.proname,
       p.prosecdef AS security_definer,
       p.proconfig AS settings,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE 'community\_%' OR p.proname LIKE '\_community\_%')
ORDER BY p.proname;
