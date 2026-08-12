-- 0092 - Draft-only Founder Legacy thank-you promo campaign.
--
-- This seeds the Marketing Team Lead's email lane with a reusable HTML template and a matching
-- campaign draft. It does NOT create or activate a promo code, send anything, schedule anything,
-- or set a postal address. Before sending, the owner must set:
--   - the real CAN-SPAM postal address in the HUB campaign settings;
--   - the exact promo code and discount;
--   - the exact 48-hour expiry timestamp;
--   - the video URL/asset behind the hero CTA.

INSERT OR IGNORE INTO team_briefs (
  id, title, objective, audience, angle, channels, assets_json, cadence, success_metric,
  status, created_by, created_at, updated_at
) VALUES (
  'tb_founder_legacy_today_only_promo_20260804',
  'Founder Legacy Members - Today Only 48-hour thank-you promo',
  'Thank Founder Legacy Members for early support and move them into any weekly subscription plan with a short 48-hour offer.',
  'Founder Legacy Members only: launch-list members who earned legacy standing with at least one paid order.',
  'Premium founder-to-member thank-you, video-first, warm Cuban-American legacy tone, no generic sale language.',
  '["email"]',
  '{"email_template_id":"tpl_founder_legacy_today_only_promo_20260804","campaign_id":"cmp_founder_legacy_today_only_promo_20260804","placeholders":["{{first_name}}","{{name}}","{{promo_code}}","{{promo_discount}}","{{promo_expires_at}}","{{promo_video_url}}","{{postal_address}}","{{unsubscribe_url}}"],"approval_required":["discount amount","actual promo code","48-hour expiry timestamp","video URL or hosted asset","campaign postal address","send approval"]}',
  'Today-only launch, send only after Dayan approves the exact offer and compliance settings.',
  'Subscription starts attributed to this campaign within 48 hours of send.',
  'draft',
  'system:migration:0092',
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000
);

INSERT INTO campaign_templates (
  id, name, channel, subject, body, body_format, created_by, created_at, updated_at
) VALUES (
  'tpl_founder_legacy_today_only_promo_20260804',
  'Founder Legacy Today Only Promo - Video Thank You',
  'email',
  'A 48-hour Founder Legacy thank-you from Añejo',
  '<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Founder Legacy Thank You</title>
</head>
<body style="margin:0;padding:0;background:#07150f;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">A thank-you offer for Founder Legacy Members, open for 48 hours only.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07150f;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:28px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fffdf7;border-collapse:collapse;border-radius:18px;overflow:hidden;">
          <tr>
            <td style="background:#123421;padding:28px 30px 22px;color:#d9c273;font-family:Georgia,serif;">
              <div style="font-size:12px;letter-spacing:4px;text-transform:uppercase;">AÑEJO CATERING CO.</div>
              <h1 style="margin:18px 0 0;font-size:34px;line-height:1.05;font-weight:400;color:#fff8dd;">A Founder Legacy thank-you</h1>
              <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#f3ead0;">Today only. Your private promo window stays open for 48 hours.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 30px 10px;font-family:Arial,Helvetica,sans-serif;color:#183326;font-size:16px;line-height:1.65;">
              <p style="margin:0 0 16px;">{{first_name}},</p>
              <p style="margin:0 0 16px;">You were one of the people who supported Añejo early, before it was polished, before it was obvious, before the full vision was built out. That matters.</p>
              <p style="margin:0 0 20px;">As a thank you, I opened a short Founder Legacy promo for any weekly subscription plan: 5, 10, or 12 bowls.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 22px;">
              <a href="{{promo_video_url}}" style="text-decoration:none;display:block;border-radius:16px;overflow:hidden;border:1px solid #d8ca92;background:#0b2016;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td align="center" style="padding:42px 22px;background:linear-gradient(135deg,#0d2a1b,#24472d 52%,#c8a95a);">
                      <div style="width:72px;height:72px;border-radius:50%;background:#fffdf7;color:#153421;font-size:28px;line-height:72px;text-align:center;margin:0 auto 18px;font-family:Arial,Helvetica,sans-serif;">▶</div>
                      <div style="font-family:Georgia,serif;font-size:27px;line-height:1.15;color:#fff8dd;">Watch the 30-second thank-you video</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#fff8dd;margin-top:10px;">Video URL placeholder: {{promo_video_url}}</div>
                    </td>
                  </tr>
                </table>
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 26px;font-family:Arial,Helvetica,sans-serif;color:#183326;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f5efd9;border:1px solid #d8ca92;border-radius:14px;">
                <tr>
                  <td style="padding:22px;text-align:center;">
                    <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#866629;">Founder Legacy code</div>
                    <div style="font-family:Georgia,serif;font-size:34px;line-height:1.1;color:#153421;margin:8px 0;">{{promo_code}}</div>
                    <div style="font-size:15px;line-height:1.5;color:#3c4a3f;">{{promo_discount}} off any subscription plan. Valid until {{promo_expires_at}}.</div>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;font-size:15px;line-height:1.65;">Use it on the plan that fits your week. The food stays premium, fresh, and built around the Añejo standard. This is simply my way of saying: thank you for being here early.</p>
              <p style="margin:24px 0 28px;text-align:center;">
                <a href="https://anejocateringco.com/subscribe?promo={{promo_code}}" style="display:inline-block;background:#c8a95a;color:#0b2016;text-decoration:none;padding:15px 24px;border-radius:10px;font-weight:700;letter-spacing:.04em;">Choose your weekly plan</a>
              </p>
              <p style="margin:0 0 6px;font-size:15px;line-height:1.6;">With gratitude,<br>Dayan</p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#6d746d;">Founder, Añejo Catering Co.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f4f2ec;padding:22px 28px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.75;color:#5b5b5b;">
              You are receiving this because you are a Founder Legacy Member of Añejo Catering Co.<br>
              <a href="{{unsubscribe_url}}" style="color:#8B6B3E;">Unsubscribe from marketing email</a><br>
              {{postal_address}}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  'html',
  'system:migration:0092',
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000
)
ON CONFLICT(channel, name) DO UPDATE SET
  subject=excluded.subject,
  body=excluded.body,
  body_format=excluded.body_format,
  updated_at=excluded.updated_at;

INSERT OR IGNORE INTO campaigns (
  id, channel, name, subject, body, body_format, segment, status, created_by, created_at, updated_at
)
SELECT
  'cmp_founder_legacy_today_only_promo_20260804',
  'email',
  'DRAFT - Founder Legacy Today Only Promo - 48 Hour Thank You',
  subject,
  body,
  body_format,
  'founder_legacy_members',
  'draft',
  'system:migration:0092',
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000
FROM campaign_templates
WHERE id = 'tpl_founder_legacy_today_only_promo_20260804';
