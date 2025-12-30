/**
 * CIEDE2000 Color Difference Algorithm
 * Reference: https://en.wikipedia.org/wiki/Color_difference#CIEDE2000
 */

// Convert degrees to radians
const rad = (deg) => deg * Math.PI / 180;
const deg = (rad) => rad * 180 / Math.PI;

/**
 * Calculate CIEDE2000 color difference
 * @param {number[]} lab1 - [L*, a*, b*] of first color
 * @param {number[]} lab2 - [L*, a*, b*] of second color
 * @returns {number} Delta E (CIEDE2000)
 */
function ciede2000(lab1, lab2) {
    const [L1, a1, b1] = lab1;
    const [L2, a2, b2] = lab2;

    // Weighing factors
    const kL = 1, kC = 1, kH = 1;

    // Step 1: Calculate C'i and h'i
    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const Cab = (C1 + C2) / 2;

    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cab, 7) / (Math.pow(Cab, 7) + Math.pow(25, 7))));

    const a1p = a1 * (1 + G);
    const a2p = a2 * (1 + G);

    const C1p = Math.sqrt(a1p * a1p + b1 * b1);
    const C2p = Math.sqrt(a2p * a2p + b2 * b2);

    let h1p = deg(Math.atan2(b1, a1p));
    if (h1p < 0) h1p += 360;

    let h2p = deg(Math.atan2(b2, a2p));
    if (h2p < 0) h2p += 360;

    // Step 2: Calculate ΔL', ΔC', ΔH'
    const dLp = L2 - L1;
    const dCp = C2p - C1p;

    let dhp;
    if (C1p * C2p === 0) {
        dhp = 0;
    } else if (Math.abs(h2p - h1p) <= 180) {
        dhp = h2p - h1p;
    } else if (h2p - h1p > 180) {
        dhp = h2p - h1p - 360;
    } else {
        dhp = h2p - h1p + 360;
    }

    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

    // Step 3: Calculate CIEDE2000 Color-Difference
    const Lp = (L1 + L2) / 2;
    const Cp = (C1p + C2p) / 2;

    let Hp;
    if (C1p * C2p === 0) {
        Hp = h1p + h2p;
    } else if (Math.abs(h1p - h2p) <= 180) {
        Hp = (h1p + h2p) / 2;
    } else if (h1p + h2p < 360) {
        Hp = (h1p + h2p + 360) / 2;
    } else {
        Hp = (h1p + h2p - 360) / 2;
    }

    const T = 1
        - 0.17 * Math.cos(rad(Hp - 30))
        + 0.24 * Math.cos(rad(2 * Hp))
        + 0.32 * Math.cos(rad(3 * Hp + 6))
        - 0.20 * Math.cos(rad(4 * Hp - 63));

    const dTheta = 30 * Math.exp(-Math.pow((Hp - 275) / 25, 2));

    const RC = 2 * Math.sqrt(Math.pow(Cp, 7) / (Math.pow(Cp, 7) + Math.pow(25, 7)));

    const SL = 1 + (0.015 * Math.pow(Lp - 50, 2)) / Math.sqrt(20 + Math.pow(Lp - 50, 2));
    const SC = 1 + 0.045 * Cp;
    const SH = 1 + 0.015 * Cp * T;

    const RT = -Math.sin(rad(2 * dTheta)) * RC;

    const dE = Math.sqrt(
        Math.pow(dLp / (kL * SL), 2) +
        Math.pow(dCp / (kC * SC), 2) +
        Math.pow(dHp / (kH * SH), 2) +
        RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
    );

    return dE;
}

/**
 * RGB to Lab conversion
 */
function rgbToLab(r, g, b) {
    // RGB to XYZ
    let rr = r / 255, gg = g / 255, bb = b / 255;

    rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
    gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
    bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

    rr *= 100; gg *= 100; bb *= 100;

    let x = rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375;
    let y = rr * 0.2126729 + gg * 0.7151522 + bb * 0.0721750;
    let z = rr * 0.0193339 + gg * 0.1191920 + bb * 0.9503041;

    // XYZ to Lab (D65)
    x /= 95.047; y /= 100.000; z /= 108.883;

    x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + 16 / 116;
    y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + 16 / 116;
    z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + 16 / 116;

    return [
        (116 * y) - 16,
        500 * (x - y),
        200 * (y - z)
    ];
}

/**
 * Find closest DMC colors
 * @param {number[]} targetLab - Target color in Lab space
 * @param {Array} dmcColors - Array of DMC color objects
 * @param {number} limit - Number of results to return
 * @returns {Array} Sorted matches with deltaE scores
 */
function findClosestDMC(targetLab, dmcColors, limit = 5) {
    const matches = dmcColors.map(dmc => ({
        ...dmc,
        deltaE: ciede2000(targetLab, dmc.lab)
    }));

    matches.sort((a, b) => a.deltaE - b.deltaE);

    return matches.slice(0, limit);
}

/**
 * Get match quality label based on deltaE
 */
function getMatchQuality(deltaE) {
    if (deltaE < 1) return { label: '完璧', class: 'excellent', percent: 100 };
    if (deltaE < 2) return { label: '非常に近い', class: 'excellent', percent: 95 };
    if (deltaE < 5) return { label: '近い', class: 'good', percent: 80 };
    if (deltaE < 10) return { label: '許容範囲', class: 'fair', percent: 60 };
    return { label: '差がある', class: 'poor', percent: 40 };
}

// Export for use in app.js
window.ColorMatcher = {
    ciede2000,
    rgbToLab,
    findClosestDMC,
    getMatchQuality
};
