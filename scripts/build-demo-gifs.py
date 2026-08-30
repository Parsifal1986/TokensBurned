#!/usr/bin/env python3

import argparse
from pathlib import Path

from PIL import Image


def arguments():
    parser = argparse.ArgumentParser(description="Build a normalized animated demo GIF.")
    parser.add_argument("--crop", type=int, default=0, help="Crop this many pixels from every edge.")
    parser.add_argument("output", type=Path)
    parser.add_argument("frames", nargs="+", type=Path)
    return parser.parse_args()


def main() -> int:
    args = arguments()
    output = args.output
    sources = []
    for name in args.frames:
        source = Image.open(name).convert("RGB")
        if args.crop:
            source = source.crop((args.crop, args.crop, source.width - args.crop, source.height - args.crop))
        if source.width > 960:
            height = round(source.height * 960 / source.width)
            source = source.resize((960, height), Image.Resampling.LANCZOS)
        sources.append(source)

    width = max(source.width for source in sources)
    height = max(source.height for source in sources)
    frames = []
    for source in sources:
        frame = Image.new("RGB", (width, height), "#12100f")
        frame.paste(source, ((width - source.width) // 2, (height - source.height) // 2))
        frames.append(frame.quantize(colors=128, method=Image.Quantize.MEDIANCUT))

    output.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        output,
        save_all=True,
        append_images=frames[1:],
        duration=1350,
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(f"Wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
