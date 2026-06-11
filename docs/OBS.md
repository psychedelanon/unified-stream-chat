# OBS Setup

Use the overlay page as a normal OBS browser source.

## Browser Source

- URL: `https://your-domain.example/overlay`
- Width: `1920`
- Height: `1080`
- FPS: `30` or `60`
- Shutdown source when not visible: off
- Refresh browser when scene becomes active: optional

The overlay is transparent. The **chat box** is the recommended layout.

## Overlay Layouts

The chat box fills whatever size you give the browser source; the other
layouts assume a 1920 x 1080 source.

```text
https://your-domain.example/overlay?layout=box
https://your-domain.example/overlay
https://your-domain.example/overlay?layout=rail&position=right&messages=5
https://your-domain.example/overlay?layout=compact&position=bottom-right&messages=3
```

Layout options:

- `layout=box` (recommended): a clean standalone scrolling chat panel,
  newest at the bottom, with platform badges and per-host color tags. Sizes
  to the browser source. Shows up to ~14 messages (`messages=` up to 30).
- `layout=lower` or no layout param: full-width lower third with the latest two messages.
- `layout=rail`: vertical side box for scenes where the bottom is already occupied.
- `layout=compact`: small corner box for scenes with limited free space.

Optional params:

- `position=right`, `position=left`, `position=bottom-right`, or `position=bottom-left` (rail/compact)
- `messages=N`
- `title=MarketBubble` to brand the header

## Choosing the room

Open the dashboard at `/?room=marketbubble` to manage that show's watchers.
The overlay reads the shared feed; OBS should use an `/overlay?...` URL,
not the dashboard URL.
