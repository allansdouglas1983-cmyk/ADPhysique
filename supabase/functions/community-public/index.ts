// Edge Function: community-public
//
// The read-only public window onto Community (blueprint section 4; SD-16).
// The static pages at https://volyume.app/p/?id= (programme), /s/?id=
// (story) and /u/?h= (profile) fetch this so a link shared outside the app
// renders for someone who does not have Volyume.
//
// Auth model: anonymous GET, no JWT. It uses the service role internally
// because the community_* tables have RLS on with NO policy for anon, and it
// therefore returns ONLY an explicit field allow-list, built field by field
// below rather than by selecting a row and handing it over. Nothing that is
// not in one of those three literals can leave through this function.
//
// It returns 404, never a partial record, when ANY of these is true:
//   - the creator is a minor (SD-05: minors never appear in any public
//     surface, including this one)
//   - the creator's account is not active (restricted or suspended)
//   - the creator's profile is not public
//   - the content is hidden (a moderator action or the three-report auto-hide)
//   - the content's own visibility is not public (a programme may also be
//     'link', which is unlisted but shareable; a post must be public)
//
// Query:
//   ?kind=programme&id=<uuid>
//   ?kind=post&id=<uuid>
//   ?kind=profile&h=<handle>
//
// Response: { ok: true, kind, ... } or { ok: false, error: 'not_found' } 404.
// Headers: Cache-Control: public, max-age=300; CORS * for GET.
//
// Founder deployment: `supabase functions deploy community-public
// --no-verify-jwt` (it is deliberately anonymous). Needs the auto-populated
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HANDLE_RE = /^[a-z0-9_]{3,20}$/

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  })
}

function notFound(): Response {
  return jsonResponse({ ok: false, error: 'not_found' }, 404)
}

interface ProfileRow {
  user_id: string
  handle: string
  display_name: string
  avatar_preset: string | null
  bio: string | null
  styles: string[] | null
  goal: string | null
  setting: string | null
  area_label: string | null
  gym_label: string | null
  follower_count: number
  visibility: string
  status: string
  is_minor: boolean
}

// The ONLY shape a creator ever takes on a public page.
function creatorCard(p: ProfileRow) {
  return {
    handle: p.handle,
    display_name: p.display_name,
    avatar_preset: p.avatar_preset,
  }
}

function publiclyVisible(p: ProfileRow | null): p is ProfileRow {
  return !!p && p.status === 'active' && p.visibility === 'public' && p.is_minor === false
}

const PROFILE_COLUMNS =
  'user_id, handle, display_name, avatar_preset, bio, styles, goal, setting, '
  + 'area_label, gym_label, follower_count, visibility, status, is_minor'

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[community-public] missing env vars')
    return jsonResponse({ ok: false, error: 'Server misconfigured' }, 500)
  }

  const url = new URL(req.url)
  const kind = url.searchParams.get('kind') ?? ''
  const id = url.searchParams.get('id') ?? ''
  const handle = (url.searchParams.get('h') ?? '').toLowerCase()

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    if (kind === 'programme') {
      if (!UUID_RE.test(id)) return notFound()
      const { data: prog } = await admin
        .from('community_programmes')
        .select('id, owner_id, title, description, style_key, days_per_week, '
          + 'exercise_count, has_circuits, snapshot, use_count, visibility, status, updated_at')
        .eq('id', id)
        .maybeSingle()
      if (!prog) return notFound()
      const row = prog as Record<string, unknown>
      if (row.status !== 'visible') return notFound()
      if (row.visibility !== 'public' && row.visibility !== 'link') return notFound()

      const { data: owner } = await admin
        .from('community_profiles').select(PROFILE_COLUMNS)
        .eq('user_id', row.owner_id as string).maybeSingle()
      if (!publiclyVisible(owner as ProfileRow | null)) return notFound()

      return jsonResponse({
        ok: true,
        kind: 'programme',
        programme: {
          title: row.title,
          description: row.description,
          style_key: row.style_key,
          days_per_week: row.days_per_week,
          exercise_count: row.exercise_count,
          has_circuits: row.has_circuits,
          // Structure only, never load: starting_weight and every personal
          // column are rejected at publish time by migrate_160's
          // _community_forbidden_keys, so the snapshot cannot carry them.
          snapshot: row.snapshot,
          use_count: row.use_count,
          updated_at: row.updated_at,
          creator: creatorCard(owner as ProfileRow),
        },
      }, 200)
    }

    if (kind === 'post') {
      if (!UUID_RE.test(id)) return notFound()
      const { data: post } = await admin
        .from('community_posts')
        .select('id, author_id, kind, payload, caption, visibility, status, created_at')
        .eq('id', id)
        .maybeSingle()
      if (!post) return notFound()
      const row = post as Record<string, unknown>
      if (row.status !== 'visible' || row.visibility !== 'public') return notFound()

      const { data: author } = await admin
        .from('community_profiles').select(PROFILE_COLUMNS)
        .eq('user_id', row.author_id as string).maybeSingle()
      if (!publiclyVisible(author as ProfileRow | null)) return notFound()

      return jsonResponse({
        ok: true,
        kind: 'post',
        post: {
          kind: row.kind,
          payload: row.payload,
          caption: row.caption,
          created_at: row.created_at,
          author: creatorCard(author as ProfileRow),
        },
      }, 200)
    }

    if (kind === 'profile') {
      if (!HANDLE_RE.test(handle)) return notFound()
      const { data: profile } = await admin
        .from('community_profiles').select(PROFILE_COLUMNS)
        .eq('handle', handle).maybeSingle()
      if (!publiclyVisible(profile as ProfileRow | null)) return notFound()
      const p = profile as ProfileRow

      const { data: progs } = await admin
        .from('community_programmes')
        .select('id, title, style_key, days_per_week, exercise_count, has_circuits, use_count')
        .eq('owner_id', p.user_id)
        .eq('status', 'visible')
        .eq('visibility', 'public')
        .order('updated_at', { ascending: false })
        .limit(20)

      const { data: posts } = await admin
        .from('community_posts')
        .select('id, kind, payload, caption, created_at')
        .eq('author_id', p.user_id)
        .eq('status', 'visible')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(10)

      return jsonResponse({
        ok: true,
        kind: 'profile',
        profile: {
          handle: p.handle,
          display_name: p.display_name,
          avatar_preset: p.avatar_preset,
          bio: p.bio,
          styles: p.styles ?? [],
          goal: p.goal,
          setting: p.setting,
          area_label: p.area_label,
          gym_label: p.gym_label,
          follower_count: p.follower_count,
          programmes: (progs ?? []).map((g) => {
            const r = g as Record<string, unknown>
            return {
              id: r.id,
              title: r.title,
              style_key: r.style_key,
              days_per_week: r.days_per_week,
              exercise_count: r.exercise_count,
              has_circuits: r.has_circuits,
              use_count: r.use_count,
            }
          }),
          posts: (posts ?? []).map((s) => {
            const r = s as Record<string, unknown>
            return {
              id: r.id,
              kind: r.kind,
              payload: r.payload,
              caption: r.caption,
              created_at: r.created_at,
            }
          }),
        },
      }, 200)
    }
  } catch (e) {
    console.error('[community-public] read failed', e)
    return notFound()
  }

  return notFound()
})
