# Semaphora Local

Semaphora has two editions with different jobs.

## Studio

The public GitHub Pages app is **Semaphora Studio**: import or edit a CSV, write one personalized message, inspect each recipient, and hand off a draft or send through a mailbox the user connected. It needs no Semaphora account or service. Recipient and message data stay in the browser session.

## Local

**Semaphora Local** is the planned localhost workbench for deeper campaign analysis and ongoing mail management. It will run on the user's computer, with contact and mailbox data under their control.

### Business workspace

- Import campaign exports and compare performance across campaigns, segments, and time.
- Find duplicate or malformed addresses, missing fields, stale contacts, suppression conflicts, and risky segments before a send.
- Analyze clicks, conversions, bounces, unsubscribes, and attributed outcomes. Show opens as estimates because privacy features and image proxies distort them.
- Check links, accessibility, sender authentication records, and unsubscribe readiness before launch.
- Export findings, clean lists, segments, and reports to portable formats.

### Personal mailbox care

- Find bulk mail, stale subscriptions, large attachments, and recurring senders across connected inboxes.
- Group suggested archive, unsubscribe, label, and delete actions for review.
- Start read-only, show exactly which messages an action affects, require explicit approval for changes, and provide undo where provider APIs support it.

### Local architecture

Bind the app to `127.0.0.1`; use a small local API and SQLite for opt-in history; keep provider tokens in the operating-system credential store. Share CSV parsing, personalization, and message rendering with Studio. Keep mailbox and delivery integrations modular and request the narrowest delegated permissions.

Local execution makes the software free and keeps data under user control. It does not make reliable bulk delivery, domains, AI inference, or provider access free. For business campaigns, let users bring a delivery service they choose or use their own credentials in the local app. Do not present consumer Gmail or Outlook as unlimited bulk mail infrastructure. Do not promise unlimited free sending.

## Who to serve first

Start with solo operators and small teams whose contacts and campaign reports live in spreadsheets, plus individuals who want a transparent inbox-cleanup assistant. The shared advantage is inspectability: show the rows, messages, events, and proposed actions behind each recommendation.

1. Stabilize Studio's editing, personalization, preview, and provider send states.
2. Build a Local import-and-analysis prototype: duplicates, address and field quality, suppression checks, and downloadable findings. No provider sign-in is needed for this first release.
3. Add report imports, cohort and time-series comparisons, and tagged-link attribution.
4. Add read-only mailbox connections and cleanup suggestions before enabling reviewed actions.
5. Add user-selected delivery integrations and scheduling after opt-in records, suppression, unsubscribe, bounce handling, rate limits, and abuse controls are in place.

## Product landscape

These are useful comparison points, not a feature checklist to copy:

- [Brevo](https://www.brevo.com/) combines marketing channels and CRM.
- [MailerLite](https://www.mailerlite.com/) pairs newsletters with forms, landing pages, and automation.
- [Kit](https://kit.com/) focuses on creator broadcasts, forms, and audience growth.
- [beehiiv](https://www.beehiiv.com/newsletter-platform) combines newsletter publishing, growth, analytics, and monetization.
- [Loops](https://loops.so/) focuses on SaaS lifecycle and transactional email.
- [Resend](https://resend.com/features/email-api) is a developer email API, not a complete marketing suite.
- [listmonk](https://listmonk.app/) and [Mautic](https://www.mautic.org/) show that open-source self-hosted newsletter and marketing automation are established categories.

Semaphora should win a narrower opening by joining spreadsheet-native campaigns with local, explainable analysis and personal inbox care. Open-source the software, keep imports and exports interoperable, and let users choose delivery infrastructure. Gmail's own sender guidance calls for confirmed subscriptions, easy unsubscribe, domain authentication, and provider limits; those must be product requirements, not afterthoughts. See [Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en) and [subscription guidelines](https://support.google.com/mail/answer/15263077?hl=en).
