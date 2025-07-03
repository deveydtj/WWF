# Application Architecture

This document provides a high level view of how the landing page and lobby system work together. It also illustrates how the frontend stays in sync with the backend using Server‑Sent Events (SSE).

```
+-------------+       +---------------------+       +---------------------+
| Landing     |  --\  |  Flask API          |  -->  |  Redis / JSON Store  |
| Page (/)    |     \ |  (backend/server.py)|       |  (persistence)       |
+-------------+       +---------------------+       +---------------------+
       |                     ^     |
       | create/join lobby   |     | SSE / HTTP JSON
       v                     |     v
+-------------+       +---------------------+
| Lobby View  | <---> |  Lobby game state   |
| (/lobby/<id>)|       |  per lobby          |
+-------------+       +---------------------+
```

1. **Landing page** – The player begins on `/` and can create or join a lobby. A POST to `/lobby` returns a six‑character code and host token. Joining uses `GET /lobby/<id>/state`.
2. **Lobby view** – `/lobby/<id>` loads the game client which fetches the current state and subscribes to `GET /lobby/<id>/stream` for real‑time updates.
3. **Backend** – `server.py` manages a dictionary of lobby objects in memory. Each lobby tracks players, chat, guesses and timestamps. Data is persisted either to a JSON file when running in single instance mode or to Redis when `REDIS_URL` is configured.
   Players are identified by a short `player_id` returned when claiming an emoji. This id is stored in `localStorage` and sent with every request so multiple devices can join from the same IP without conflict.
4. **SSE updates** – Each lobby maintains its own set of listeners so that state broadcasts only reach the correct lobby.

This model supports any number of concurrent lobbies while keeping the API stateless. Clients reconnect using the stored lobby id and host token.
