-- LOCAL ONLY. Install after the application schema, before enqueue/consumer use.
-- Tombstones intentionally persist: deleting/recreating a post ID must not reset its version.
CREATE TABLE prototype_draft_versions (
 post_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0 AND revision<=9007199254740991)
);
INSERT INTO prototype_draft_versions SELECT id,1 FROM social_posts;
CREATE TRIGGER prototype_post_insert AFTER INSERT ON social_posts BEGIN
 INSERT INTO prototype_draft_versions VALUES(NEW.id,1) ON CONFLICT(post_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER prototype_post_update AFTER UPDATE ON social_posts BEGIN
 UPDATE prototype_draft_versions SET revision=revision+1 WHERE post_id=OLD.id;
END;
CREATE TRIGGER prototype_post_delete AFTER DELETE ON social_posts BEGIN
 UPDATE prototype_draft_versions SET revision=revision+1 WHERE post_id=OLD.id;
END;
CREATE TRIGGER prototype_slide_insert AFTER INSERT ON social_post_media BEGIN
 UPDATE prototype_draft_versions SET revision=revision+1 WHERE post_id=NEW.post_id;
END;
CREATE TRIGGER prototype_slide_update AFTER UPDATE ON social_post_media BEGIN
 UPDATE prototype_draft_versions SET revision=revision+1 WHERE post_id=OLD.post_id OR post_id=NEW.post_id;
END;
CREATE TRIGGER prototype_slide_delete AFTER DELETE ON social_post_media BEGIN
 UPDATE prototype_draft_versions SET revision=revision+1 WHERE post_id=OLD.post_id;
END;
