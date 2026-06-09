-- MessageFormat: optional AND rules on top of the primary
-- discriminator so one body field (e.g. flowName) isn't forced to
-- carry every distinction. Resolver matches a format only when the
-- discriminator AND every rule pass; null/empty keeps existing
-- single-discriminator behaviour.
ALTER TABLE "message_formats" ADD COLUMN "match_rules" JSONB;
