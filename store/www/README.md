# LinkedIn CEO Dashboard

A phone-first dashboard for the LinkedIn engine: this week's posts, comments
and likes, the Friday freebie queue, and the personal-photo vault.

- Static PWA, no build step: `index.html`, `app.js`, `styles.css`,
  `manifest.webmanifest`, `sw.js`.
- Data: the dedicated `linkedin-dashboard` Supabase project, read with the
  public anon key (row-level security is on). The engine
  (support897/linkedin-engine) writes posts and stats with its service key.
- Likes and comment counts only: LinkedIn does not expose impressions or
  saves to member apps, so those are never faked.
- Reminders: the app can register a push subscription ("Turn on reminders"
  on Home). Sending pushes is groundwork only for now.
