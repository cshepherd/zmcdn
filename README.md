# ZMCDN

> CDN to serve AI-generated images for Inform/Z-Machine text prompts

## Theory of Operation

- Game identified by release/serial combination (ie "59.860730" for Leather Goddesses)
- Image fetched by URL format `https://domain/print/<game ID>/<address>/<format>`

So that https://zmcdn.ballmerpeak.org/59.860730/0x5f63/sixel will fetch the introduction text for Leather Goddesses in Sixel format, suitable for dumping to most terminal programs (say iTerm2 but not Apple Terminal.app).

When images don't exist on the server side, they're queued for generation by the AI backend (which should ideally be configurable via plugins/subclasses). Master image format will be png. Everything else will be converted from that

## Current Status
3-Oct-2025: tszm has reached enough of a level of maturity that we've just begun to specify and break ground on this. Nothing is done yet, but we're moving fast.

## Credits
- All code by Christopher Shepherd <node@js.contractors>