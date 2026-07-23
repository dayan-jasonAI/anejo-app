import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as recipeCreate } from '../../functions/api/hub/kitchen/recipe/create.js';
import { onRequestPost as briefProposal } from '../../functions/api/hub/kitchen/studio/brief-proposal.js';
import { onRequestPost as mediaUpload } from '../../functions/api/hub/kitchen/studio/media.js';
import { onRequestPost as transcribeVoice } from '../../functions/api/hub/kitchen/studio/transcribe.js';

function envWithForeignSession() {
  const staff = {
    id: 'stf_self',
    role: 'kitchen',
    team: 'kitchen',
    email: 'stf_self@staff.anejo.local',
    active: 1,
  };
  const session = {
    id: 'rsess_other',
    staff_id: 'stf_other',
    status: 'active',
    started_at: Date.now() - 60000,
  };
  return {
    ANTHROPIC_API_KEY: 'test-key',
    SESSIONS: {
      async get(key) {
        assert.equal(key, 'session:test-session');
        return JSON.stringify({
          type: 'staff',
          uid: staff.id,
          role: staff.role,
          team: staff.team,
          email: staff.email,
          la: Date.now(),
          created: Date.now(),
        });
      },
      async put() {},
      async delete() {},
    },
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (/SELECT active FROM staff/.test(sql)) return { active: 1 };
                if (/SELECT \* FROM staff WHERE/.test(sql)) return staff;
                if (/SELECT \* FROM recipe_sessions WHERE id = \?/.test(sql)) return session;
                if (/SELECT id, staff_id FROM recipe_sessions WHERE id = \?/.test(sql)) return session;
                throw new Error('Unexpected first() SQL: ' + sql);
              },
              async all() {
                throw new Error('Unexpected all() SQL: ' + sql);
              },
              async run() {
                throw new Error('Unexpected run() SQL: ' + sql);
              },
            };
          },
        };
      },
    },
  };
}

function authedRequest(path, body) {
  return new Request('https://anejocateringco.com' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'anejo_sess=test-session' },
    body: JSON.stringify(body),
  });
}

test('recipe AI draft hides sessions owned by another kitchen staffer', async () => {
  const res = await recipeCreate({
    request: authedRequest('/api/hub/kitchen/recipe/create?ai_draft=1', { session_id: 'rsess_other' }),
    env: envWithForeignSession(),
  });
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Session not found/i);
});

test('recipe save hides sessions owned by another kitchen staffer', async () => {
  const res = await recipeCreate({
    request: authedRequest('/api/hub/kitchen/recipe/create', {
      session_id: 'rsess_other',
      name: 'QA Recipe',
      summary: 'Test summary',
      ingredients: ['one ingredient'],
      steps: ['one step'],
    }),
    env: envWithForeignSession(),
  });
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Session not found/i);
});

test('brief AI draft hides sessions owned by another kitchen staffer', async () => {
  const res = await briefProposal({
    request: authedRequest('/api/hub/kitchen/studio/brief-proposal?ai_draft=1', {
      session_id: 'rsess_other',
      instruction: 'Update the brief.',
    }),
    env: envWithForeignSession(),
  });
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Session not found/i);
});

test('brief submit hides sessions owned by another kitchen staffer', async () => {
  const res = await briefProposal({
    request: authedRequest('/api/hub/kitchen/studio/brief-proposal', {
      session_id: 'rsess_other',
      title: 'QA proposal',
      proposed_body: 'A complete proposed brief body.',
    }),
    env: envWithForeignSession(),
  });
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Session not found/i);
});

test('studio media upload hides sessions owned by another kitchen staffer', async () => {
  const res = await mediaUpload({
    request: authedRequest('/api/hub/kitchen/studio/media', {
      session_id: 'rsess_other',
      media_type: 'photo',
      content: '/api/hub/media/test.jpg',
    }),
    env: envWithForeignSession(),
  });
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Session not found/i);
});

test('studio transcription hides sessions owned by another kitchen staffer', async () => {
  const res = await transcribeVoice({
    request: authedRequest('/api/hub/kitchen/studio/transcribe', {
      session_id: 'rsess_other',
      audio: 'data:audio/webm;base64,AAAA',
    }),
    env: envWithForeignSession(),
  });
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Session not found/i);
});
