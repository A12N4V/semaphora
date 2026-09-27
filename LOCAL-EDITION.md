# Semaphora Local

Semaphora has two editions with different jobs.

## Studio

The public GitHub Pages app is **Semaphora Studio**: import or edit a CSV, write one personalized message, inspect each recipient, and hand off a draft or send through a mailbox the user connected. It needs no Semaphora account or service. Recipient and message data stay in the browser session.

## Local

**Semaphora Local** is the self-hosted workbench for deeper campaign analysis and ongoing mail management. Its first contact-audit slice is available to run on the user's own computer. It does not require an account or external service.

## Run the first version

From the repository root, build and start the Docker edition:

```sh
docker compose -f compose.local.yaml up --build
```

Open `http://127.0.0.1:8787`. Stop it with `Ctrl+C`. Docker publishes the service to the local machine only. To run without Docker, use Node.js 22 or newer:

```sh
node local-edition/server.mjs
```

The current contact audit accepts CSV files up to 10 MB, 100,000 rows, and 200 columns. It reports missing and malformed email addresses, duplicate addresses, suppression and unsubscribe signals, and missing fields. It can download a clean-contact CSV and a findings CSV. The clean export keeps the original columns and excludes invalid addresses, duplicates, and detected suppressed contacts.

This is the first Local feature slice. Campaign report comparisons, link and deliverability checks, mailbox connections, and reviewed inbox cleanup remain planned work. The audit uses deterministic local rules. It does not verify addresses by sending messages or querying third parties.

## Data handling and network boundary

The browser reads the selected file and sends its CSV text to the Semaphora process on loopback for analysis. The process analyzes it in memory and returns the result. Neither the app nor the container writes the CSV, results, or exports to disk. An export is created only when the user clicks a download button. Restarting the app clears the working data.

The first version has no login, mailbox tokens, database, or mail delivery. Docker maps the port to `127.0.0.1`. Do not expose this prototype directly to a public network. Remote cloud hosting needs authentication, TLS, and an explicit deployment/security design first. Users will own and operate their own cloud deployment when that path is ready.

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

### Future Local architecture

Keep the app bound to `127.0.0.1` by default. If opt-in history is added, keep it local and explicit. Store provider tokens in the operating-system credential store. Share CSV parsing, personalization, and message rendering with Studio. Keep mailbox and delivery integrations modular and request the narrowest delegated permissions.

Local execution makes the software free and keeps data under user control. It does not make reliable bulk delivery, domains, AI inference, or provider access free. For business campaigns, let users bring a delivery service they choose or use their own credentials in the local app. Do not present consumer Gmail or Outlook as unlimited bulk mail infrastructure. Do not promise unlimited free sending.

## Who to serve first

Start with solo operators and small teams whose contacts and campaign reports live in spreadsheets, plus individuals who want a transparent inbox-cleanup assistant. The shared advantage is inspectability: show the rows, messages, events, and proposed actions behind each recommendation.

1. Stabilize Studio's editing, personalization, preview, and provider send states.
2. Expand the Local contact auditor with explicit suppression-field mapping and larger-file performance work.
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
