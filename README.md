# Semaphora

![Semaphora banner: Hermes in a dithered engraving](assets/hermes-header.png)

A static mail merge workspace. Load a CSV, write a message with `(column_name)` fields, review each recipient, and open a personalized draft in your system mail app.

## Use

Open `index.html` in a modern browser. Import `sample-recipients.example.csv` to try the app. The Input tab has a sample message and subject. Replace the sample values with your own list and message.

CSV files need a header row and an `email`, `e-mail`, or `email address` column. Fields match headers without regard to capitalization. Click a field chip to insert it into the message.

Choose a recipient in the List tab, review the personalized message, then select **Open mail**. This hands a `mailto:` draft to the system mail app. The browser cannot confirm whether a message was sent. The green check in the log means the mail app handoff was requested.

Recipient lists and the log stay in browser memory for the current page session. Semaphora has no backend, database, account, or analytics.

## Design

The banner dither adapts the 8×8 Bayer ordered screen and luminance stretch from Homonin's `homonin-landing/apps/web/src/components/ethics/DitherCanvas.tsx`. JetBrains Mono is bundled locally from `projects/homonin/assets/fonts/jetbrains-mono/` under the SIL Open Font License 1.1. See `assets/fonts/OFL.txt`.

## GitHub Pages

Semaphora is a static site with no build step. In repository settings, choose **Pages**, set the source to the `main` branch and `/ (root)`, then save.

## License

MIT. See [LICENSE](LICENSE).
