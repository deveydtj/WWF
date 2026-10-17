# Link previews

The home page has a 1200 × 630 PNG social card. New room links use
`/invite.html#lobby/ABC123` or `/invite.html#private/<invitation>` and have a
separate “Your squad is waiting” card. Share the full link: a bare room code
is text and cannot produce a link preview.

`invite.html` and the images are static frontend files served by S3 through
CloudFront, so a messaging crawler can fetch them while the game server is
asleep. Their Open Graph and Twitter metadata is present in the initial HTML;
JavaScript is not needed to discover the image. The preview is intentionally
generic and never reads room state or includes player names or invitations.

Opening the link in a browser routes public rooms to `/#lobby/ABC123` and
private invitations to `/join#<invitation>`. Normal eligibility and host
approval still apply. Private credentials remain in URL fragments, which
are not sent in HTTP requests. Existing `/join#…` invitations still work.

Regenerate the artwork with `node scripts/generate_share_cards.mjs`. This uses
the existing Playwright dependency. The generated PNGs are committed under
`frontend/public/assets/`; production needs no screenshot tool or image API.
When replacing published artwork, increment the `v1` filenames in the
generator and metadata to avoid stale messaging-app image caches.

Build with `npm run build`, then deploy both the frontend and API using the
normal deployment process. Frontend publishing uploads the images and static
preview page; the API image includes the updated room-sharing code. Existing
messages may retain an older preview cached by their messaging app.

Verification: `python -m pytest tests/test_share_previews.py` checks crawler
HTML and PNG delivery without eligibility. The sharing browser tests cover
copy/native sharing, fragment routing, and private admission. Preview rendering
in Apple Messages itself requires the updated public site; local browser QA
cannot confirm Apple's cache or presentation decisions.
