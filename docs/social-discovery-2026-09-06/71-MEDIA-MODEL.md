# 71 — Media in Community: the Volyume-native model (decision record for the founder)

Status: DESIGNED, NOT BUILT. SD-29 records why: image upload needs an
image-moderation processor (a new dependency and a new data category with
an EU residency check and a data-processing agreement), and the founder
holds the dependency gate. This file exists so the decision is informed.

## Does Volyume need media to compete?
Yes, eventually, and no, not to be useful. Hevy's feed is photo-led and
users expect a photo on a PR or a session. But the evidence in `10`-`13`
is also clear about the cost: photo-led feeds drift towards body content,
which is the one category Volyume's safety posture (calm mode, ED flags,
Beat guidance) exists to keep out. Community's card-based stories are
honest and useful without photos; what they lack is warmth and proof. The
right model adds media where it carries training meaning and keeps it
out where it would become appearance content.

## The model
- **Where media may attach:** a training story (one photo or one video
  clip up to 30 seconds), a profile avatar (photo, square, face or not).
  Never a comment, never a message, never a programme.
- **What it may show:** the training. The rules screen names it: a lift, a
  gym, a set-up, a finished session. Not progress photos: the Progress
  photos feature stays private and its images can never be attached
  (enforced by construction: the picker never reaches that directory).
- **Before it is visible:** every image passes an automated first line
  (Google Cloud Vision SafeSearch or Sightengine, EU endpoint confirmed in
  writing before selection; nudity, violence, minors) and lands hidden if
  the check fails or errors (fail closed). Then the same report, auto-hide
  and moderator path as text.
- **Storage:** one private Supabase Storage bucket in Dublin, object path
  `community/<user_id>/<post_id>/<uuid>`, EXIF stripped on device before
  upload (the avatar pipeline already does this), served through signed
  URLs minted by an RPC that applies the post's visibility, block and
  suspension rules; the public link page gets a signed URL with a short
  expiry only for public posts.
- **Deletion:** deleting the post, leaving Community and account deletion
  remove the objects (edge function with the service role, listed in the
  moderation runbook); a moderator's delete removes the object too.
- **ED safety:** media stories are excluded from the Discover chronological
  stream under calm mode and while the viewer has an open wellbeing flag
  (the viewer's own state, checked on device; fail closed), so a person in
  a hard week can keep the feed text-only. No engagement ranking anywhere.
- **Minors:** no media from or to under-18 accounts.
- **Cost and load:** at Volyume's size the moderation API cost is
  negligible; the real load is the moderator queue, which is why the
  automated line and fail-closed hiding come first.

## What the founder is deciding
1. Whether to add the processor dependency at all (SafeSearch or
   Sightengine; both are processors under GDPR and need a DPA and an EU
   endpoint).
2. Photo avatars only (smallest step, same pipeline), or avatars plus story
   media.
3. Whether video is in the first step (it multiplies storage and moderation
   cost; photos alone are the sensible first step).
Nothing in Community's current design blocks any of these; the post payload
allow-list would gain one `media` key, and the rest is the pipeline above.
