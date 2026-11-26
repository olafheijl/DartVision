const sectors = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const sectorAngle = 2 * Math.PI / sectors.length;

/** Score board coordinates in millimetres, with the bull at (0, 0) and 20 above it. */
export function scoreBoardPoint({ x, y }) {
    const radius = Math.hypot(x, y);
    if (!Number.isFinite(radius)) throw new Error('Ongeldige bordcoördinaten.');
    if (radius > 170) return { field: 'Mis', score: 0 };
    if (radius <= 6.35) return { field: 'Bull', score: 50 };
    if (radius <= 15.9) return { field: 'Buitenbull', score: 25 };

    // Measure clockwise from 20 and shift half a sector to start at the wire.
    const angle = Math.atan2(x, -y);
    const index = Math.floor(angle / sectorAngle + 0.5);
    const number = sectors[(index + sectors.length) % sectors.length];
    if (radius >= 162) return { field: `D${number}`, score: 2 * number };
    if (radius >= 99 && radius <= 107) return { field: `T${number}`, score: 3 * number };
    return { field: `S${number}`, score: number };
}
