# Lop rabbit source

`rabbit-realistic.blend` is the editable Blender 4.5 scene. `rabbit-portrait.png` is its Cycles render. `build_rabbit.py` reproducibly builds the anatomy, colour variation, whiskers and groom without external textures or downloads.

Run with Blender:

```sh
blender --background --python assets/blender/build_rabbit.py
```

The script also exports `scenes/bunny/assets/rabbit.json` and `rabbit.bin`. The live scene uses tapered mesh strands and PBR shading; the Blender portrait uses native groomed hair curves and path-traced lighting. These renderers have different visual fidelity.

The runtime loader retains the existing head, ear, eye and foreleg pivots, so chasing, pouncing, biting the broom, petting, feeding and sleeping remain interactive. The front legs rotate from the shoulders rather than the floor.

Validate the live model and behaviour:

```sh
node scenes/bunny/tests/rabbit-behavior.mjs --model
```
