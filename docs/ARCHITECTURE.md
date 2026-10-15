# Application Architecture

The landing page creates ordinary LAN-discoverable lobbies or private rooms. Both use the same game client and rules; their admission and persistence differ.

Ordinary rooms use uppercase six-character codes, `/lobby/<code>`, the existing public lobby dictionary, and Redis/JSON persistence. Their player IDs and host tokens retain the existing client storage behavior. Reading an unknown room never creates one; creation is explicit through `POST /lobby`. Multiple devices can register distinct players from the same LAN address.

Private rooms use opaque HttpOnly browser sessions, host approval, and a separate shared store containing both authorization and game state. They never enter public discovery or public persistence. A room identifier is only a selector. Private player IDs come from server-side membership and never authorize access by themselves. Invitations use fragments exchanged in POST bodies, then the browser displays `/game`. See [PRIVATE_ROOMS.md](PRIVATE_ROOMS.md) for the route inventory, lifecycle, limits, and deployment requirements.

Each game request selects its state through a ContextVar. Scoped routes never mutate the legacy default `current_state`, so concurrent room requests cannot swap one another's state. Public SSE uses room-local listener queues. Private SSE reads committed state from shared storage and rechecks membership every second, supporting revocation across workers.

Private production state requires durable shared Redis and atomic lease-checked transactions; missing or failed storage denies access. Development can use an atomically replaced JSON file with a cross-process file lock. Public rooms keep their existing in-memory state/persistence behavior and should not be assumed coherent across multiple workers simply because Redis is configured.

The age gate remains separate from membership and service authorization. Public assets and the neutral join/age screens contain no private game data. Maintenance routes require a dedicated operator credential. CloudFront forwards private APIs and both session cookies without caching; the production origin boundary must be verified before launch.
