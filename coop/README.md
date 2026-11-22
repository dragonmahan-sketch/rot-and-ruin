# ROT & RUIN co-op — room server (M1)

One process hosts every room. A room is one simulation; players join with a code,
send inputs, and the server broadcasts 20 snapshots a second.

```
npm install       # no dependencies, but keeps hosts happy
npm start         # listens on $PORT, or 3000
```

Routes: `/` the client page, `/events` the snapshot stream (SSE), `/input` the newest
input per player, `/free-id` a free seat for a tab with no id, `/stats`, `/health`.

Open `https://<host>/?room=AB12` in two tabs — the first gets `p1`, the second `p2`.
Send a friend the same address with the same room code.

Keyboard: WASD move, mouse aim, click fire, R reload, F medkit, Shift sprint.

State lives in memory. A restart (or a free host spinning the service down when idle)
ends any run in progress; players just open the link again for a fresh room.
