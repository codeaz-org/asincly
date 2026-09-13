-- Backfill reactions from the fixed kinds to emoji, and add integrity checks
-- for the video-first columns. The `kind` column is dropped in 0016.

UPDATE check_in_reaction SET emoji = CASE kind
  WHEN 'seen' THEN '👀'
  WHEN 'nice' THEN '🙌'
  WHEN 'thanks' THEN '🙏'
  WHEN 'help' THEN '🤝'
END
WHERE emoji IS NULL;
--> statement-breakpoint
ALTER TABLE check_in_reaction ADD CONSTRAINT check_in_reaction_emoji_len
  CHECK (emoji IS NULL OR char_length(emoji) BETWEEN 1 AND 32);
--> statement-breakpoint
ALTER TABLE check_in ADD CONSTRAINT check_in_video_skip_reason_chk
  CHECK (video_skip_reason IS NULL OR video_skip_reason IN ('no_mic', 'noisy', 'unwell', 'privacy', 'other'));
--> statement-breakpoint
ALTER TABLE check_in ADD CONSTRAINT check_in_video_skip_note_len
  CHECK (video_skip_note IS NULL OR char_length(video_skip_note) <= 140);
--> statement-breakpoint
-- A reaction on a reply must belong to a reply on the same check-in, so the
-- check_in_id-based RLS policies stay correct for comment reactions.
CREATE OR REPLACE FUNCTION comment_check_in_id(c uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT check_in_id FROM check_in_comment WHERE id = c
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION comment_check_in_id(uuid) TO asincly_app;
--> statement-breakpoint
DROP POLICY IF EXISTS check_in_reaction_insert ON check_in_reaction;
--> statement-breakpoint
CREATE POLICY check_in_reaction_insert ON check_in_reaction FOR INSERT
  WITH CHECK (
    user_id = current_user_id()
    AND is_team_member(check_in_team_id(check_in_id))
    AND (comment_id IS NULL OR comment_check_in_id(comment_id) = check_in_id)
  );
