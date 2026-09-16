# Browser access diagnostic - September 15, 2026

Status: Blocked - needs proof of restored browser access. No support request submitted.

## Scope and authorization

Dayan requested diagnosis and repair in task `019f90e5-f2b5-7580-9544-126707b5490e` on September 15, 2026. This investigation is read-only. It does not change browser policy, credentials, Cloudflare, DNS, Google accounts, or production.

## Observed evidence

- Browser Use rejects both `https://anejocateringco.com` and `https://business.google.com` with: "A saved user permission setting blocks this action."
- User screenshots show Always allow for both origins. Targeted reads of `/Users/aiagent/.codex/config.toml` also show `access = "allow"` for both exact HTTPS origins.
- `/Applications/ChatGPT.app/Contents/Info.plist` reports version `26.908.70816`; the configured browser runtime version matches.
- Read-only inspection of `/Users/aiagent/.codex/plugins/cache/openai-bundled/browser/26.908.70816/scripts/browser-service.mjs` maps `browser-use-persisted-state` to `persisted_user_denied` and `user_persisted_setting`, with the exact returned message. Enterprise and site-status denials are separate error classes in that runtime.
- Targeted searches of September 15 app logs did not reveal the effective denying record. General shell approval-policy log entries do not establish the browser origin policy.
- User-reported app restart and extension reconnection did not resolve the rejection. Cookies were not cleared by this agent.

## Conclusion and limits

The observed failure is a Browser Use permission rejection, not an observed Cloudflare challenge or Google Business account error. A stale or inconsistent persisted permission is a hypothesis, not a confirmed root cause. The component or record responsible for the contradiction is still unidentified. Independent website or Google account issues remain Unverified.

Do not change DNS, disable Cloudflare protections, clear all cookies, modify policy storage, or use alternate browser surfaces to bypass this denial. No such action was taken.

## Support request draft

Browser Use rejects https://anejocateringco.com and https://business.google.com with "A saved user permission setting blocks this action." Both exact origins show Always allow in the UI and access = "allow" in the local configuration. App restart and Chrome extension reconnection have not resolved it. Desktop and browser runtime versions both report 26.908.70816. The local runtime maps the rejection to browser-use-persisted-state / persisted_user_denied. Please identify the effective denying permission record and provide a supported repair for this contradiction.

Task: 019f90e5-f2b5-7580-9544-126707b5490e

Observed: September 15, 2026, approximately 3:15-3:50 AM America/New_York.

Attach only the permission screenshots and this diagnostic. Do not attach full configuration files, browser cookies, credentials, or unredacted logs.

Support channel: https://help.openai.com/en/articles/6614161-how-can-i-contact-support

## Recovery acceptance

Use the supported Browser Use interface after the effective policy is repaired. Access to each origin must succeed before claiming recovery. Then resume authenticated HUB and Google account checks, desktop/mobile visual QA, and approved deployment. Existing deployment approval is not being requested again.
