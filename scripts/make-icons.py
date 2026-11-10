#!/usr/bin/env python3
"""Generate simple PNG app icons (blue tile with three white bars). No dependencies."""
import struct, zlib, pathlib

def png(size, path):
    bg = (42, 120, 214)
    fg = (255, 255, 255)
    rows = []
    m = size * 0.22
    bw = size * 0.14
    gap = size * 0.07
    base = size * 0.78
    heights = [0.28, 0.46, 0.34]
    bars = []
    x = size * 0.5 - (3 * bw + 2 * gap) / 2
    for h in heights:
        bars.append((x, base - size * h, x + bw, base))
        x += bw + gap
    for y in range(size):
        row = bytearray([0])
        for xx in range(size):
            c = bg
            for (x0, y0, x1, y1) in bars:
                if x0 <= xx < x1 and y0 <= y < y1:
                    c = fg
            row += bytes(c)
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    pathlib.Path(path).write_bytes(data)

out = pathlib.Path(__file__).resolve().parent.parent / 'icons'
out.mkdir(exist_ok=True)
png(192, out / 'icon-192.png')
png(512, out / 'icon-512.png')
png(180, out / 'apple-touch-icon.png')
print('icons written')
