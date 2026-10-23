#!/usr/bin/env python3
"""Resize the EchoFlow logo into the icon sizes the desktop build needs.

The upstream desktop app references three PNGs by path
(`resources/icon.png`, `icon-windows.png`, `icon-macos.png`) at 1104x1104 and
1024x1024, and electron-builder derives the platform icons from them. Our
source logo is 180x180, so it has to be scaled up.

Scaling is nearest-neighbour with a transparent surround: the logo is a square
mark on a transparent background, and blowing it up with smoothing would
blur the edges into the surround. No image library is used - PNG decode and
encode here are plain zlib plus the chunk layout - so this runs anywhere
Python 3 does.
"""
import struct
import sys
import zlib


def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    pos = 8
    width = height = bit_depth = color_type = None
    idat = b''
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if kind == b'IHDR':
            width, height, bit_depth, color_type = struct.unpack('>IIBB', body[:10])
        elif kind == b'IDAT':
            idat += body
        pos += 12 + length
    raw = zlib.decompress(idat)
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color_type]
    stride = width * channels
    # undo the per-scanline filter
    out = bytearray()
    prev = bytearray(stride)
    for y in range(height):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if f == 0:
                pass
            elif f == 1:
                line[i] = (line[i] + a) & 0xFF
            elif f == 2:
                line[i] = (line[i] + b) & 0xFF
            elif f == 3:
                line[i] = (line[i] + (a + b) // 2) & 0xFF
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        out += line
        prev = line
    return width, height, channels, bytes(out)


def write_png(path, width, height, channels, pixels):
    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xFFFFFFFF)

    raw = bytearray()
    stride = width * channels
    for y in range(height):
        raw.append(0)
        raw += pixels[y * stride:(y + 1) * stride]
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, {1: 0, 2: 2, 3: 4, 4: 6}[channels], 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    open(path, 'wb').write(png)


def scale(width, height, channels, pixels, target, pad_ratio=0.06):
    """Nearest-neighbour scale, with a transparent margin so the mark is not
    clipped against the icon edge."""
    src_w, src_h = width, height
    inner = int(target * (1 - 2 * pad_ratio))
    sx, sy = inner / src_w, inner / src_h
    out = bytearray(target * target * channels)
    for y in range(target):
        for x in range(target):
            ox = int((x - target * pad_ratio) / sx)
            oy = int((y - target * pad_ratio) / sy)
            if 0 <= ox < src_w and 0 <= oy < src_h:
                s = (oy * src_w + ox) * channels
                d = (y * target + x) * channels
                out[d:d + channels] = pixels[s:s + channels]
    return bytes(out)


def main():
    src, outdir = sys.argv[1], sys.argv[2]
    w, h, ch, px = read_png(src)
    print(f'  source: {w}x{h}, {ch} channels')
    if ch == 3:
        # add alpha so the surround can be transparent
        alpha = bytearray()
        for i in range(0, len(px), 3):
            alpha += px[i:i + 3] + b'\xff'
        px, ch = bytes(alpha), 4
    for name, size in (('icon.png', 1104), ('icon-windows.png', 1024), ('icon-macos.png', 1024)):
        scaled = scale(w, h, ch, px, size)
        write_png(f'{outdir}/{name}', size, size, ch, scaled)
        print(f'  wrote {name} ({size}x{size})')


if __name__ == '__main__':
    main()
