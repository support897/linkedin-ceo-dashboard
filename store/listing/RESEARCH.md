# Listing research — LinkedIn CEO Dashboard (Business / Productivity)

Researched 13 Oct 2026 from public ASO sources. Findings are paraphrased;
figures are the sources' own claims and are labelled by source quality.

## What the top listings in this category do

The leading Business and Productivity listings (LinkedIn, Slack, Notion,
Todoist, Microsoft To Do and similar) share one shape:

- A plain app icon, one object, no words, readable at thumbnail size.
- Branded screenshot frames: solid brand background, one big benefit
  caption per frame, the real screen inside a phone outline.
- Portrait frames (they mirror how the app is actually used).
- The description opens with the outcome, not a feature list; features
  come after, in short scannable blocks.

## Screenshot evidence

- AppFollow's review of 1,200 top-grossing iOS listings (2025–26 guide):
  the **first three frames carry roughly 70% of the conversion weight**;
  frame one must state the core promise almost instantly. Users scan in
  an F-pattern, so short captions and strong contrast beat crowded
  layouts. Portrait is the winning layout for utility and finance apps.
  Source: https://appfollow.io/blog/aso-screenshots-best-practices
- StoreMaven's widely cited finding: **about 60% of users never swipe
  past the first two screenshots**; leading with the two strongest
  frames is associated with conversion gains of up to ~25%.
  Reported via: https://medium.com/@marcuskay/app-store-optimization-30728bfe2e23
- Benefit-led frames (a stated outcome, not a bare UI grab) are reported
  to lift conversion by up to ~30% versus generic feature shots.
  Source: https://www.cubix.co/blog/app-store-optimization-aso-how-to-get-discovered/
- Search results show the first one to three screenshots (or the preview
  video) right in the results list, so those frames are the ad.
  Captions must be readable at thumbnail size. Apple rejects screenshots
  that misrepresent the app — frames must show real screens.
  Source: https://extensionbooster.net/blog/how-to-improve-ios-app-store-listing-product-page-guide-2026/

### Applied to this listing

- Seven frames, ordered story-first: Home (the whole week, frame 1) →
  Posts → Outreach → one lead's next step → Freebies → Photo vault →
  Workers. All real features appear; order follows value, not the menu.
- One benefit per frame, caption first, screen second. Frames are built
  by `make_frames.py` in this folder; real captures drop into `raw/` and
  are composited automatically.

## Preview video — the evidence, both ways

For:
- Vendor guides claim a good preview can lift conversion 20–40%
  (SplitMetrics guide claim, no study cited) and ~16–17% average uplift
  across creative types (FoxAdvert internal analysis).
- A Google-cited figure of "up to 20%" circulates for app videos, but it
  concerns app marketing video generally, not store preview slots.

Against / caution:
- A critical review of the vendor numbers notes the 20–40% claim cites
  no study, and that **Apple's only published number points the other
  way**. Source: https://blakecrosley.com/blog/app-store-screenshots-sell-the-why
- Practical ASO guidance for this app shape is explicit: **a preview
  earns its place when the app has a strong visual hook; an app that is
  mostly text and forms should skip it** and put the effort into
  screenshots. A weak video in slot one is worse than a strong frame,
  because the video replaces the first screenshots in search results.
  Sources: Cubix guide above; extensionbooster guide above.

### Decision: no preview video at launch

This app is lists, counts and forms — there is no motion hook. The
strong evidence favours frames; the video evidence is vendor-grade and
contested. A 30-second storyboard is kept in LISTING.md so a preview can
be produced later and A/B tested with Product Page Optimization /
Store Listing Experiments once the listing is live.

## Description structure (applied in LISTING.md)

- First three lines carry the whole pitch (all that shows before
  "more"): outcome, what is on the one screen, who runs it.
- Then one short block per real feature, plain words, no hype, and the
  honest numbers note (comments and likes are the app's true counts;
  nothing is estimated).
- Keywords sit in the title/subtitle and Apple keyword field, not
  stuffed into the description.
