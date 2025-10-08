# ZMCDN

> CDN to serve AI-generated images for Inform/Z-Machine text prompts

## Theory of Operation

- TSZM (The Typescript Z-Machine) sends us a JSON query of the form:
```
zmcdnSessionID: string        // A unique UUID to identify this session (game)
lastZMachineOutput: string    // Last output from the Z-Machine
lastZMachineInput: string     // Last thing the user typed into the Z-Machine
playerLocation: string        // What TSZM thinks the players current location is (we peek inside the Z-Machine to find out)
gameIdentifier: string        // Game identified by release/serial combination (ie "59.860730" for Leather Goddesses)
illustrationFormat: string    // just 'sixel' for now, but oh boy do we have ideas for some fun targets
```

From here, we implement what we're calling "The Art Director Pattern":

<img width="806" height="520" alt="image" src="https://github.com/user-attachments/assets/309c4904-40f4-4d4e-b65d-d7cacb17d46b" />

The most recent 8 moves are sent into Qwen3-32B, along with the master prompt. Qwen, acting as Art Director, then generates a JSON prompt for the Illustrator, along with a unique name for the image and a suggestion on whether or not we need to redraw (that is, if we can re-use an old image instead of asking the Illustrator).

The Illustrator, FLUX-1-schnell, transforms the JSON input into a PNG image for us.

We convert that PNG image to Sixel format, so TSZM can dump it out to a terminal.

## Current Status
08-Oct-2025: As more focus shifts to ZMCDN, it got a much-needed refactor and documentation update.

## Public ZMCDN Server

`http://zmcdn.ballmerpeak.org:3003`

## Credits
- All code by Christopher Shepherd <node@js.contractors>