-- Distinguishes *why* Ava logged a knowledge gap, and the real confidence
-- score behind a low-confidence gap — required so /teach and the Today
-- dashboard can show the caller-facing reason honestly (design handoff's
-- "Data Honesty Rules": gap reasons must reflect real retrieval state).
-- 'no_match'          — no knowledge_chunks matched at all.
-- 'low_confidence'     — chunks matched, but the model wasn't confident
--                        they answered the question (confidence_score is
--                        the top chunk's real cosine-similarity score).
-- 'transfer_requested' — the assistant escalated via transfer_call because
--                        it was missing information (not a plain "let me
--                        speak to a person" request, which is filtered out
--                        before it ever reaches knowledge_gaps).

alter table knowledge_gaps add column if not exists reason text
  check (reason in ('no_match', 'low_confidence', 'transfer_requested'));
alter table knowledge_gaps add column if not exists confidence_score numeric(4,3);

-- Existing rows predate this column — they were all logged from the two
-- pre-existing code paths (no chunks, or an unconfident answer with
-- chunks); backfill as 'no_match' since that's the safer of the two
-- unknowns (no fabricated confidence score attached).
update knowledge_gaps set reason = 'no_match' where reason is null;
