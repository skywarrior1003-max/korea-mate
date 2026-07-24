/**
 * Removes ALL APP1 segments (EXIF/XMP) from a JPEG binary.
 *
 * Binary segment manipulation only — does NOT re-encode pixels.
 * APP0, APP2, COM, and all other non-APP1 segments are preserved.
 * Parsing stops at SOS; compressed image data is copied as-is.
 *
 * @throws {Error} on malformed, truncated, or structurally suspicious input
 */
export function stripJpegApp1(input: Uint8Array): Uint8Array {
  if (input.length < 4) {
    throw new Error("Input too small to be a valid JPEG");
  }
  if (input[0] !== 0xff || input[1] !== 0xd8) {
    throw new Error("Not a JPEG: missing SOI marker (FF D8)");
  }

  const kept: Uint8Array[] = [input.slice(0, 2)]; // SOI always preserved
  let pos = 2;
  let foundEoi = false;

  while (pos < input.length) {
    // Every segment must start with 0xFF
    if (input[pos] !== 0xff) {
      throw new Error(
        `Expected marker 0xFF at offset ${pos}, got 0x${input[pos].toString(16).padStart(2, "0")}`
      );
    }

    // JPEG spec allows multiple 0xFF fill bytes before the marker type byte
    while (pos < input.length && input[pos] === 0xff) {
      pos++;
    }
    if (pos >= input.length) {
      throw new Error("Unexpected end of input while reading marker type byte");
    }

    const markerByte = input[pos++];
    const marker = 0xff00 | markerByte;

    // ── EOI: done ────────────────────────────────────────────────────────────
    if (marker === 0xffd9) {
      kept.push(new Uint8Array([0xff, 0xd9]));
      foundEoi = true;
      break;
    }

    // ── SOS: copy remainder as-is (compressed data has no segment structure) ─
    if (marker === 0xffda) {
      if (pos + 1 >= input.length) {
        throw new Error("Truncated SOS segment header");
      }
      const sosHdrLen = (input[pos] << 8) | input[pos + 1];
      if (sosHdrLen < 2) {
        throw new Error(`Invalid SOS header length ${sosHdrLen} at offset ${pos}`);
      }
      if (pos + sosHdrLen > input.length) {
        throw new Error(
          `SOS header length ${sosHdrLen} exceeds buffer at offset ${pos}`
        );
      }
      // EOI must be the last 2 bytes of input
      if (input[input.length - 2] !== 0xff || input[input.length - 1] !== 0xd9) {
        throw new Error("Not a valid JPEG: missing EOI marker (FF D9) at end");
      }
      // Push FF DA marker + everything remaining (SOS header + scan data + EOI)
      kept.push(new Uint8Array([0xff, 0xda]));
      kept.push(input.slice(pos)); // pos = SOS length field; copy to end
      foundEoi = true;
      break;
    }

    // ── RST0-RST7, TEM: standalone markers with no length field ───────────────
    if ((markerByte >= 0xd0 && markerByte <= 0xd7) || markerByte === 0x01) {
      kept.push(new Uint8Array([0xff, markerByte]));
      continue;
    }

    // ── All other segments: 2-byte big-endian length (includes the 2 bytes) ──
    if (pos + 1 >= input.length) {
      throw new Error(`Truncated segment length field at offset ${pos}`);
    }
    const segLen = (input[pos] << 8) | input[pos + 1];

    if (segLen < 2) {
      throw new Error(
        `Segment 0x${marker.toString(16)} at offset ${pos - 1} has invalid length ${segLen} (minimum 2)`
      );
    }

    const nextPos = pos + segLen;
    if (nextPos > input.length) {
      throw new Error(
        `Segment 0x${marker.toString(16)} at offset ${pos - 1} claims length ${segLen}` +
          ` but only ${input.length - pos} bytes remain`
      );
    }

    if (marker === 0xffe1) {
      // APP1 (EXIF/XMP) — discard
    } else {
      // All other segments — preserve
      kept.push(new Uint8Array([0xff, markerByte]));
      kept.push(input.slice(pos, nextPos));
    }

    pos = nextPos;
  }

  if (!foundEoi) {
    throw new Error("Not a valid JPEG: missing EOI marker (FF D9)");
  }

  // ── Assemble result ───────────────────────────────────────────────────────
  const totalLen = kept.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of kept) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  // Post-condition guards
  if (result.length < 4) {
    throw new Error("Result is too small to be a valid JPEG");
  }
  if (result[0] !== 0xff || result[1] !== 0xd8) {
    throw new Error("BUG: result does not start with JPEG SOI (FF D8)");
  }

  return result;
}
