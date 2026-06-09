# OBS Setup

Use the overlay page as a normal OBS browser source.

## Browser Source

- URL: `https://your-domain.example/overlay`
- Width: `1920`
- Height: `1080`
- FPS: `30` or `60`
- Shutdown source when not visible: off
- Refresh browser when scene becomes active: optional

The overlay is transparent and renders a lower-third feed by default.

## Overlay Layouts

Use one of these URLs as a 1920 x 1080 browser source:

```text
https://your-domain.example/overlay
https://your-domain.example/overlay?layout=rail&position=right&messages=5
https://your-domain.example/overlay?layout=rail&position=left&messages=5
https://your-domain.example/overlay?layout=compact&position=bottom-right&messages=3
```

Layout options:

- `layout=lower` or no layout param: full-width lower third with the latest two messages.
- `layout=rail`: vertical side box for talk-show, gameplay, and guest/source scenes where the bottom is already occupied.
- `layout=compact`: small corner box for scenes with limited free space.

Optional params:

- `position=right`, `position=left`, `position=bottom-right`, or `position=bottom-left`
- `messages=1` through `8`
- `title=Your%20Show%20Chat`

## Custom Source Defaults

You can prefill the dashboard from URL params:

```text
/?twitch=yourchannel&x=(@yourhandle OR #yourhashtag)
```

OBS should use `/overlay`, not the dashboard URL.
