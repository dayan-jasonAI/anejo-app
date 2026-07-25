// POST /api/hub/kitchen/ticket/create — kitchen-surface alias for the shared staff ticket
// handler. Same body, same severity/urgency conventions, same owner alert; re-exported rather
// than reimplemented so `INSERT INTO tickets` stays in exactly one file.
export { onRequestPost } from '../../driver/ticket/create.js';
