-- P2-50b: UIMessage[] snapshot for chat history restoration + card replay
-- Overwritten each turn via AI SDK onFinish callback.
-- Rollback: ALTER TABLE conversations DROP COLUMN ui_messages;

ALTER TABLE conversations ADD COLUMN ui_messages jsonb;
COMMENT ON COLUMN conversations.ui_messages IS 'AI SDK UIMessage[] snapshot. Overwritten each turn via onFinish. Client restoration + card replay.';
