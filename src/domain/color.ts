import type { Lab } from "./types";

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * CIEDE2000 色差 ΔE00（Sharma, Wu, Dalal 2005 公式，kL=kC=kH=1）。
 * 参考测试向量：ΔE00(Lab(50,2.6772,-79.7751), Lab(50,0,-82.7485)) = 2.0425
 */
export function deltaE2000(std: Lab, smp: Lab): number {
  const { l: L1, a: a1, b: b1 } = std;
  const { l: L2, a: a2, b: b2 } = smp;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));

  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1);
  const Cp2 = Math.hypot(ap2, b2);

  const hp1 = b1 === 0 && ap1 === 0 ? 0 : hueAngle(b1, ap1);
  const hp2 = b2 === 0 && ap2 === 0 ? 0 : hueAngle(b2, ap2);

  const dLp = L2 - L1;
  const dCp = Cp2 - Cp1;
  let dhp = 0;
  if (Cp1 * Cp2 !== 0) {
    const raw = hp2 - hp1;
    if (raw > 180) dhp = raw - 360;
    else if (raw < -180) dhp = raw + 360;
    else dhp = raw;
  }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(toRad(dhp / 2));

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (Cp1 + Cp2) / 2;
  let hbarp = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) {
      hbarp = hbarp < 360 ? (hbarp + 360) / 2 : (hbarp - 360) / 2;
    } else {
      hbarp = hbarp / 2;
    }
  }

  const T =
    1 -
    0.17 * Math.cos(toRad(hbarp - 30)) +
    0.24 * Math.cos(toRad(2 * hbarp)) +
    0.32 * Math.cos(toRad(3 * hbarp + 6)) -
    0.2 * Math.cos(toRad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(toRad(2 * dTheta)) * Rc;

  const termL = dLp / Sl;
  const termC = dCp / Sc;
  const termH = dHp / Sh;
  return Math.sqrt(termL * termL + termC * termC + termH * termH + Rt * termC * termH);
}

function hueAngle(b: number, ap: number): number {
  const h = toDeg(Math.atan2(b, ap));
  return h >= 0 ? h : h + 360;
}

// ΔE00 → ISO 105-A02 变色样卡等级（含半级，数值越大色差越小）
const GRAY_SCALE_BREAKPOINTS: Array<[number, number]> = [
  [1.7, 1],
  [1.25, 1.5],
  [0.9, 2],
  [0.65, 2.5],
  [0.4, 3],
  [0.25, 3.5],
  [0.15, 4],
  [0.08, 4.5],
  [0, 5],
];

export function grayScaleLevel(de: number): number {
  for (const [ceiling, level] of GRAY_SCALE_BREAKPOINTS) {
    if (de > ceiling) return level;
  }
  return 5;
}

export function levelLabel(level: number): string {
  return Number.isInteger(level) ? `${level}级` : `${level}级`;
}
