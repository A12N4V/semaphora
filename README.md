# Semaphora

![Semaphora banner: Hermes in a dithered engraving](assets/hermes-header.png)

A static mail merge workspace. Edit a recipient table or import a CSV, write a message with `(column_name)` fields, and prepare personalized drafts.

## Use

Open `index.html` in a modern browser. Import `sample-recipients.example.csv` to try the app, or enter recipients in the editable table. Edit cells, add rows or columns, and download the table as CSV.

CSV files need a header row and an `email`, `e-mail`, or `email address` column. Fields match headers without regard to capitalization. Click a field chip to insert it into the message.

Paste formatted text and images into the message editor, or attach media and other files. Text-only drafts open in the system mail app. Drafts with rich formatting or media download as `.eml` files, which can be opened in a mail app. The log records draft preparation, not confirmed delivery.

Recipient lists, message content, attachments, and the log stay in browser memory for the current page session. Semaphora has no backend, database, account, or analytics.

## Design

The banner dither adapts the 8×8 Bayer ordered screen and luminance stretch from Homonin's `homonin-landing/apps/web/src/components/ethics/DitherCanvas.tsx`. JetBrains Mono is bundled locally from `projects/homonin/assets/fonts/jetbrains-mono/` under the SIL Open Font License 1.1. See `assets/fonts/OFL.txt`.

## GitHub Pages

Semaphora is a static site with no build step. In repository settings, choose **Pages**, set the source to the `main` branch and `/ (root)`, then save.

## License

MIT. See [LICENSE](LICENSE).
