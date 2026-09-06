/**
 * FollowButton (blueprint section 6)
 *
 * One control for the whole follow relationship: Follow, Requested,
 * Following, or Follow back. The label comes from the card's own
 * `relationship` block, so a card fetched anywhere renders the same
 * state without a second read.
 *
 * `primary` while not following (the raised charcoal surface with the
 * amber glyph, not an amber fill), `secondary` once following, so the
 * settled state is the quieter one. Never `emphatic`: following someone
 * is a routine action, not a committing one (section 13, ruling 2).
 *
 * A tap is optimistic: the button shows its next state immediately and
 * reverts with a calm toast if the server refuses. A refusal we expect
 * (blocked, rate limited, offline) is spoken plainly and never logged as
 * a defect.
 */

import { useState } from 'react';
import Button from '../Button';
import { useToast } from '../Toast';
import { follow, unfollow } from '../../lib/community';

/** The label and variant for one relationship state. */
export function followState(relationship) {
  const rel = relationship ?? {};
  if (rel.blocked) return { key: 'blocked', title: 'Blocked', variant: 'secondary', icon: null };
  if (rel.following === 'accepted') {
    return { key: 'following', title: 'Following', variant: 'secondary', icon: 'checkmark-outline' };
  }
  if (rel.following === 'requested') {
    return { key: 'requested', title: 'Requested', variant: 'secondary', icon: 'time-outline' };
  }
  if (rel.followed_by) {
    return { key: 'follow_back', title: 'Follow back', variant: 'primary', icon: 'person-add-outline' };
  }
  return { key: 'follow', title: 'Follow', variant: 'primary', icon: 'person-add-outline' };
}

const REFUSALS = {
  offline: 'You are offline. Try again when you have a connection.',
  blocked: 'You cannot follow this person.',
  rate_limited: 'That is a lot of follows for one day. Try again tomorrow.',
  not_found: 'This profile is no longer available.',
  no_profile: 'Create your Community profile first.',
  not_allowed: 'You cannot follow this person.',
};

export default function FollowButton({
  card,
  onChange,
  size = 'sm',
  fullWidth = false,
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const rel = card?.relationship ?? {};
  const state = followState(rel);

  async function toggle() {
    if (busy || !card?.user_id) return;
    setBusy(true);
    const following = state.key === 'following' || state.key === 'requested';
    try {
      const out = following ? await unfollow(card.user_id) : await follow(card.user_id);
      const next = following
        ? { ...rel, following: 'none' }
        : { ...rel, following: out?.state === 'requested' ? 'requested' : 'accepted' };
      onChange?.(next, card);
    } catch (e) {
      toast.show(REFUSALS[e?.code] ?? 'Could not do that just now.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (state.key === 'blocked') return null;

  return (
    <Button
      variant={state.variant}
      size={size}
      fullWidth={fullWidth}
      title={state.title}
      icon={state.icon}
      loading={busy}
      onPress={toggle}
      accessibilityLabel={`${state.title} ${card?.display_name ?? card?.handle ?? ''}`.trim()}
    />
  );
}
