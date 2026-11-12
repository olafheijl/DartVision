
const sectors = [
    20, 1, 18, 4, 13, 6, 10, 15, 2, 17,
    3, 19, 7, 16, 8, 11, 14, 9, 12, 5
];

export function calculateScore(x, y) {
    const radius = Math.hypot(x, y);

    // Bull
    if (radius <= 6.35) return { score: 50, label: "Bull" };
    if (radius <= 15.9) return { score: 25, label: "Outer Bull" };

    // Outside the board
    if (radius > 170) return { score: 0, label: "Miss" };

    // Determine sector
    const angle = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
    const index = Math.floor((angle + 9) / 18) % 20;
    const number = sectors[index];

    // Double and triple rings
    if (radius >= 162) {
        return { score: number * 2, label: `D${number}` };
    }

    if (radius >= 99 && radius <= 107) {
        return { score: number * 3, label: `T${number}` };
    }

    return { score: number, label: `S${number}` };
}
