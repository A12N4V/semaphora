# Semaphora

![Semaphora banner: Hermes in a dithered engraving](assets/hermes-header.png)

A static mail merge workspace. Edit a recipient table or import a CSV, write a message with `(column_name)` fields, then prepare drafts or send through a connected Gmail or Microsoft mailbox.

## Use

Open `index.html` in a modern browser. Import `sample-recipients.example.csv` to try the app, or enter recipients in the editable table. Edit cells, add rows or columns, and download the table as CSV.

CSV files need a header row and an `email`, `e-mail`, or `email address` column. Fields match headers without regard to capitalization. Click a field chip to insert it into the message.

Paste formatted text and images into the message editor, or attach media and other files. Without a connected mailbox, text drafts open in the system mail app and rich drafts download as `.eml` files. With a connected mailbox, create a provider draft or send one personalized message at a time from the List tab or Integrations tab. The log shows provider accepted, failed, and draft states. Provider acceptance does not confirm final delivery.

## Mailbox setup

Mailbox connections require your own OAuth app registrations. Add their public client IDs to `oauth-config.js`. Never add client secrets.

- **Microsoft:** Register a single-page application in Microsoft Entra. Add `https://a12n4v.github.io/semaphora/` as a SPA redirect URI. Grant delegated `User.Read`, `Mail.ReadWrite`, and `Mail.Send` permissions. MSAL Browser is bundled locally in `assets/vendor/` under its MIT license.
- **Google:** Create a web OAuth client in Google Cloud. Add `https://a12n4v.github.io` as an authorized JavaScript origin, enable the Gmail API, configure the consent screen, and allow the `gmail.compose` and `userinfo.email` scopes. Google token access is short-lived and held in memory only. Users may need to reconnect after tokens expire.

Recipient lists, message content, attachments, logs, and OAuth access tokens are held in browser memory for the current page session. Semaphora does not save this data. Connected messages go directly from the browser to the selected mail provider. Semaphora has no app backend or database.

## Design

The banner dither adapts the 8×8 Bayer ordered screen and luminance stretch from Homonin's `homonin-landing/apps/web/src/components/ethics/DitherCanvas.tsx`. JetBrains Mono is bundled locally from `projects/homonin/assets/fonts/jetbrains-mono/` under the SIL Open Font License 1.1. See `assets/fonts/OFL.txt`.

## GitHub Pages

Semaphora is a static site with no build step. In repository settings, choose **Pages**, set the source to the `main` branch and `/ (root)`, then save.

## License

MIT. See [LICENSE](LICENSE).
