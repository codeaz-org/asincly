-- The cron tick asks "did this occurrence already fire window_open / digest_ready?"
-- on every pass. It used to answer that by loading every notification of that
-- type for the user (or team) and filtering in JS, which grows without bound
-- for the life of the account. This index makes it a point lookup.
CREATE INDEX IF NOT EXISTS notification_type_occurrence_idx
  ON notification (type, (data ->> 'occurrenceId'));
