// Edge Function: community-notify
//
// The push half of Community activity (blueprint section 4,
// docs/social-discovery-2026-09-06/30-BLUEPRINT.md; SD-15). The client calls
// it with its own JWT right after a Community action it just performed; this
// function decides whether that action becomes a push or stays in-app, and
// never trusts the caller about anything except who they are.
//
//   1. Verifies the caller's JWT and derives the actor from it.
//   2. PROVES the action really happened, by finding the row the caller says
//      they just wrote (a follow edge, a reaction, a comment, a programme
//      use) with the caller as its actor and a created_at inside the last ten
//      minutes. Without this, any signed-in user could ask us to push
//      arbitrary text at any other user.
//   3. Stops if the recipient blocks the actor (either direction).
//   4. Reads the recipient's notification_preferences row for the category
//      (community_follow for the three follow kinds, community_activity for
//      the rest) and stops if it is switched off. A FAILED read holds the
//      push, the same way partner-cheer does: we cannot show the user opted
//      in, so we decline to push. The activity row is already written, so the
//      recipient still sees it in-app next time they open Community.
//   5. Checks the recipient's open ED/wellbeing flag EXACTLY as partner-cheer
//      does and fails closed: any flag, or any read error, downgrades to
//      in-app only. Pushing at a flagged user is the harm pattern.
//   6. Otherwise invokes send-push (service role) with the Community payload.
//
// Request body:
//   { "kind": "follow" | "follow_request" | "follow_accepted" | "reaction"
//             | "comment" | "programme_used",
//     "target_user_id": "<uuid>",
//     "ref_id": "<uuid>" }
//
// Response:
//   { ok: true, delivered: 'push' | 'in_app' } on success
//   { ok: false, error } on bad input / auth failure
//
// Founder deployment: `supabase functions deploy community-notify`. Needs the
// auto-populated SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY.
// Note that migrate_160 must be applied first: without it the community_*
// tables do not exist and every call returns not_verified.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { readBoundedJson, RequestBodyError } from '../_shared/boundedJson.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface NotifyBody {
  kind?: string
  target_user_id?: string
  ref_id?: string
}

type Kind =
  | 'follow' | 'follow_request' | 'follow_accepted'
  | 'reaction' | 'comment' | 'programme_used'

const FOLLOW_KINDS: Kind[] = ['follow', 'follow_request', 'follow_accepted']
const ALL_KINDS: Kind[] = [...FOLLOW_KINDS, 'reaction', 'comment', 'programme_used']

// British English, calm voice, no clipped commands, no em dash (CLAUDE.md
// section 3). The handle is the only identity in a Community push: never a
// first name, never a display name pulled from anywhere else.
function pushCopy(kind: Kind, handle: string): { title: string; body: string } {
  switch (kind) {
    case 'follow':
      return { title: 'Community', body: `@${handle} followed you` }
    case 'follow_request':
      return { title: 'Community', body: `@${handle} asked to follow you` }
    case 'follow_accepted':
      return { title: 'Community', body: `@${handle} accepted your follow` }
    case 'reaction':
      return { title: 'Community', body: `@${handle} reacted to your post` }
    case 'comment':
      return { title: 'Community', body: `@${handle} commented on your post` }
    case 'programme_used':
    default:
      return { title: 'Community', body: `@${handle} is using your programme` }
  }
}

function categoryFor(kind: Kind): 'community_follow' | 'community_activity' {
  return (FOLLOW_KINDS as string[]).includes(kind) ? 'community_follow' : 'community_activity'
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error('[community-notify] missing env vars')
    return jsonResponse({ ok: false, error: 'Server misconfigured' }, 500)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return jsonResponse({ ok: false, error: 'Unauthorised' }, 401)

  let body: NotifyBody
  try {
    body = await readBoundedJson<NotifyBody>(req, 4096)
  } catch (error) {
    if (error instanceof RequestBodyError && error.status === 413) {
      return jsonResponse({ ok: false, error: 'Payload too large' }, 413)
    }
    return jsonResponse({ ok: false, error: 'Bad JSON' }, 400)
  }

  const kind = body.kind as Kind
  const targetUserId = body.target_user_id ?? ''
  const refId = body.ref_id ?? ''
  if (!ALL_KINDS.includes(kind)) {
    return jsonResponse({ ok: false, error: 'valid kind is required' }, 400)
  }
  if (!UUID_RE.test(targetUserId)) {
    return jsonResponse({ ok: false, error: 'valid target_user_id is required' }, 400)
  }
  if (!UUID_RE.test(refId)) {
    return jsonResponse({ ok: false, error: 'valid ref_id is required' }, 400)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return jsonResponse({ ok: false, error: 'Unauthorised' }, 401)
  const actorId = user.id
  if (actorId === targetUserId) {
    return jsonResponse({ ok: true, delivered: 'in_app' }, 200)
  }

  // Service-role admin: the community_* tables have RLS on with no policy for
  // authenticated, so the caller themselves can read none of this.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const sinceIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  // Step 2: prove the action. Each branch asserts BOTH that the caller is the
  // actor and that the recipient really is the other party.
  let verified = false
  try {
    if (kind === 'follow' || kind === 'follow_request') {
      const { data } = await admin
        .from('community_follows')
        .select('follower_id')
        .eq('follower_id', actorId)
        .eq('followee_id', targetUserId)
        .gte('created_at', sinceIso)
        .limit(1)
        .maybeSingle()
      verified = !!data
    } else if (kind === 'follow_accepted') {
      // The actor accepted; the recipient is the person who had asked.
      const { data } = await admin
        .from('community_follows')
        .select('follower_id')
        .eq('follower_id', targetUserId)
        .eq('followee_id', actorId)
        .eq('state', 'accepted')
        .limit(1)
        .maybeSingle()
      verified = !!data
    } else if (kind === 'reaction') {
      const { data } = await admin
        .from('community_reactions')
        .select('post_id, community_posts!inner(author_id)')
        .eq('post_id', refId)
        .eq('user_id', actorId)
        .gte('created_at', sinceIso)
        .limit(1)
        .maybeSingle()
      const author = (data as { community_posts?: { author_id?: string } } | null)?.community_posts
      verified = !!data && author?.author_id === targetUserId
    } else if (kind === 'comment') {
      const { data } = await admin
        .from('community_comments')
        .select('id, target_kind, target_id')
        .eq('id', refId)
        .eq('author_id', actorId)
        .gte('created_at', sinceIso)
        .limit(1)
        .maybeSingle()
      if (data) {
        const row = data as { target_kind: string; target_id: string }
        if (row.target_kind === 'post') {
          const { data: post } = await admin
            .from('community_posts').select('author_id').eq('id', row.target_id).maybeSingle()
          verified = (post as { author_id?: string } | null)?.author_id === targetUserId
        } else {
          const { data: prog } = await admin
            .from('community_programmes').select('owner_id').eq('id', row.target_id).maybeSingle()
          verified = (prog as { owner_id?: string } | null)?.owner_id === targetUserId
        }
      }
    } else {
      const { data } = await admin
        .from('community_programme_uses')
        .select('programme_id, community_programmes!inner(owner_id)')
        .eq('programme_id', refId)
        .eq('user_id', actorId)
        .gte('created_at', sinceIso)
        .limit(1)
        .maybeSingle()
      const owner = (data as { community_programmes?: { owner_id?: string } } | null)
        ?.community_programmes
      verified = !!data && owner?.owner_id === targetUserId
    }
  } catch (e) {
    console.error('[community-notify] verification failed', e)
    return jsonResponse({ ok: false, error: 'not_verified' }, 403)
  }
  if (!verified) return jsonResponse({ ok: false, error: 'not_verified' }, 403)

  // Step 3: a block in either direction ends it here.
  const { data: blocks, error: blockErr } = await admin
    .from('community_blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${targetUserId},blocked_id.eq.${actorId}),`
      + `and(blocker_id.eq.${actorId},blocked_id.eq.${targetUserId})`)
    .limit(1)
  if (blockErr) {
    console.error('[community-notify] block read failed, holding push', blockErr)
    return jsonResponse({ ok: true, delivered: 'in_app' }, 200)
  }
  if (blocks && blocks.length > 0) {
    return jsonResponse({ ok: true, delivered: 'in_app' }, 200)
  }

  // Step 4: the recipient's category toggle. Absent row means never touched,
  // which is consent by default for an opt-out control. A failed read holds.
  const { data: pref, error: prefErr } = await admin
    .from('notification_preferences')
    .select('enabled')
    .eq('user_id', targetUserId)
    .eq('category', categoryFor(kind))
    .maybeSingle()
  if (prefErr) {
    console.error('[community-notify] preference read failed, holding push', prefErr)
    return jsonResponse({ ok: true, delivered: 'in_app' }, 200)
  }
  if (pref && (pref as { enabled?: boolean }).enabled === false) {
    return jsonResponse({ ok: true, delivered: 'in_app' }, 200)
  }

  // Step 5: the recipient's open ED/wellbeing flag. Copied from partner-cheer
  // in shape and in posture: fail CLOSED, so any doubt means in-app only.
  const { data: openFlag, error: flagErr } = await admin
    .from('ed_pattern_flags')
    .select('id')
    .eq('user_id', targetUserId)
    .is('cleared_at', null)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (flagErr) {
    console.error('[community-notify] ED flag read failed, holding push', flagErr)
    return jsonResponse({ ok: true, delivered: 'in_app' }, 200)
  }
  if (openFlag) {
    return jsonResponse({ ok: true, delivered: 'in_app' }, 200)
  }

  // The actor's handle. No Community push ever carries a real name.
  const { data: actorProfile } = await admin
    .from('community_profiles')
    .select('handle')
    .eq('user_id', actorId)
    .maybeSingle()
  const handle = (actorProfile as { handle?: string } | null)?.handle
  if (!handle) {
    // No profile means nothing to name, and naming nobody is worse than
    // staying quiet.
    return jsonResponse({ ok: true, delivered: 'in_app' }, 200)
  }

  const copy = pushCopy(kind, handle)
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        user_id: targetUserId,
        title: copy.title,
        body: copy.body,
        data: {
          type: categoryFor(kind),
          ref_id: refId,
          actor_handle: handle,
        },
      }),
    })
  } catch (e) {
    // The activity row is already written; a failed push is not a failed
    // action.
    console.error('[community-notify] push fan-out failed', e)
    return jsonResponse({ ok: true, delivered: 'in_app' }, 200)
  }

  return jsonResponse({ ok: true, delivered: 'push' }, 200)
})
