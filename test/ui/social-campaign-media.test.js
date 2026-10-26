import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code = readFileSync(new URL('../../public/hub/owner/assets/social-campaigns.js', import.meta.url), 'utf8');
const ctx = {};
vm.runInNewContext(code.slice(code.indexOf('  function mediaRules('), code.indexOf('  function mountMediaEditors(')), ctx);
const file = (name, type, size) => ({ name, type, size });
test('picker enforces JPEG and exact five MiB photo boundary', () => {
  assert.equal(ctx.fileIssue({ channel: 'feed' }, [file('photo.jpg', 'image/jpeg', 5 * 1024 * 1024)]), '');
  assert.match(ctx.fileIssue({ channel: 'feed' }, [file('photo.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1)]), /5 MB/);
  assert.match(ctx.fileIssue({ channel: 'feed' }, [file('photo.png', 'image/png', 100)]), /JPEG/);
  assert.match(ctx.fileIssue({ channel: 'feed' }, [file('fake.jpg', 'image/png', 100)]), /JPEG/);
});
test('Story and Reel use a single file and MP4 has a twenty-five MiB boundary', () => {
  assert.equal(ctx.fileIssue({ channel: 'story' }, [file('photo.jpeg', 'image/jpeg', 100)]), '');
  assert.equal(ctx.fileIssue({ channel: 'story' }, [file('video.mp4', 'video/mp4', 25 * 1024 * 1024)]), '');
  assert.match(ctx.fileIssue({ channel: 'reel' }, [file('video.mp4', 'video/mp4', 25 * 1024 * 1024 + 1)]), /25 MB/);
  assert.match(ctx.fileIssue({ channel: 'reel' }, [file('photo.jpg', 'image/jpeg', 100)]), /MP4/);
  assert.match(ctx.fileIssue({ channel: 'story' }, [file('a.jpg', 'image/jpeg', 100), file('b.jpg', 'image/jpeg', 100)]), /one file/);
});
test('feed permits ten ordered JPEGs and rejects an eleventh or a video', () => {
  const ten = Array.from({ length: 10 }, (_, i) => file(i + '.jpg', 'image/jpeg', 100));
  assert.equal(ctx.fileIssue({ channel: 'feed' }, ten), '');
  assert.match(ctx.fileIssue({ channel: 'feed' }, [...ten, ten[0]]), /1–10/);
  assert.match(ctx.fileIssue({ channel: 'feed' }, [file('video.mp4', 'video/mp4', 100)]), /Use a Reel/);
});
test('upload uses multipart file only and attachment binds current campaign and post revisions', () => {
  assert.match(code, /new FormData\(\)/);
  assert.match(code, /form.append\('file', draft.items\[i\].file\)/);
  assert.equal((code.match(/form.append\(/g) || []).length, 1);
  assert.match(code, /social-campaign-media-upload/);
  assert.match(code, /op: 'save_media'.*expected_version: draft.version.*request_id: draft.requestId.*expected_revision_snapshot: draft.revision/);
  assert.match(code, /error.unknown \? 'upload_unknown'/);
  assert.match(code, /No save was retried/);
});
