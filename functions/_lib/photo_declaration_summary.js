// Owner-card readback of stored declarations. This does not reread or certify R2 bytes.
export async function photoDeclarationSummaries(env, posts) {
  const result = new Map(posts.map(post => [post.id, { status: 'read', slides: [] }]));
  if (!posts.length) return result;
  try {
    const rows = await env.DB.prepare(`SELECT m.post_id,m.id AS media_id,m.seq,m.media_key,
      r.id AS receipt_id,r.source_sha256,r.output_sha256,r.evidence_tier
      FROM social_post_media m LEFT JOIN marketing_render_receipts r
      ON r.post_id=m.post_id AND r.media_id=m.id AND r.output_key=m.media_key AND r.state='attached'
      WHERE m.post_id IN (SELECT id FROM social_posts ORDER BY created_at DESC LIMIT 60)
      ORDER BY m.seq,m.id`).all();
    for (const row of rows.results || []) {
      const entry=result.get(row.post_id);
      if (!entry || entry.slides.length>=10) continue;
      const recorded=row.evidence_tier==='browser_declared' && typeof row.receipt_id==='string' &&
        /^rr_[a-f0-9]{64}$/.test(row.receipt_id) && /^[a-f0-9]{64}$/.test(row.source_sha256 || '') &&
        /^[a-f0-9]{64}$/.test(row.output_sha256 || '');
      entry.slides.push({media_id:row.media_id,seq:row.seq,recorded,
        receipt_id:recorded?row.receipt_id:null,evidence_tier:recorded?'browser_declared':null,
        bytes_verified_now:false,visual_review_required:true});
    }
  } catch {
    for (const entry of result.values()) entry.status='unavailable';
  }
  return result;
}
