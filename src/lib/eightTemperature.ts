export type TempUnit = "c" | "f";

const RAW_TO_CELSIUS_MAP = new Map<number, number>([
  [-100, 13],
  [-97, 14],
  [-94, 15],
  [-91, 16],
  [-83, 17],
  [-75, 18],
  [-67, 19],
  [-58, 20],
  [-50, 21],
  [-42, 22],
  [-33, 23],
  [-25, 24],
  [-17, 25],
  [-8, 26],
  [0, 27],
  [6, 28],
  [11, 29],
  [17, 30],
  [22, 31],
  [28, 32],
  [33, 33],
  [39, 34],
  [44, 35],
  [50, 36],
  [56, 37],
  [61, 38],
  [67, 39],
  [72, 40],
  [78, 41],
  [83, 42],
  [89, 43],
  [100, 44],
]);

const RAW_TO_FAHRENHEIT_MAP = new Map<number, number>([
  [-100, 55],
  [-99, 56],
  [-97, 57],
  [-95, 58],
  [-94, 59],
  [-92, 60],
  [-90, 61],
  [-86, 62],
  [-81, 63],
  [-77, 64],
  [-72, 65],
  [-68, 66],
  [-63, 67],
  [-58, 68],
  [-54, 69],
  [-49, 70],
  [-44, 71],
  [-40, 72],
  [-35, 73],
  [-31, 74],
  [-26, 75],
  [-21, 76],
  [-17, 77],
  [-12, 78],
  [-7, 79],
  [-3, 80],
  [1, 81],
  [4, 82],
  [7, 83],
  [10, 84],
  [14, 85],
  [17, 86],
  [20, 87],
  [23, 88],
  [26, 89],
  [29, 90],
  [32, 91],
  [35, 92],
  [38, 93],
  [41, 94],
  [44, 95],
  [48, 96],
  [51, 97],
  [54, 98],
  [57, 99],
  [60, 100],
  [63, 101],
  [66, 102],
  [69, 103],
  [72, 104],
  [75, 105],
  [78, 106],
  [81, 107],
  [85, 108],
  [88, 109],
  [92, 110],
  [100, 111],
]);

function mapForUnit(unit: TempUnit) {
  return unit === "c" ? RAW_TO_CELSIUS_MAP : RAW_TO_FAHRENHEIT_MAP;
}

export function rawLevelToTemp(rawLevel: number | null, unit: TempUnit): number | null {
  if (rawLevel === null) {
    return null;
  }

  const map = mapForUnit(unit);
  let lastRawUnit = -100;

  for (const [rawUnit, degreeValue] of map.entries()) {
    if (rawLevel === rawUnit) {
      return degreeValue;
    }

    if (rawUnit > rawLevel) {
      const lastDegreeUnit = map.get(lastRawUnit);
      if (lastDegreeUnit === undefined) {
        return null;
      }
      const ratio = (rawLevel - lastRawUnit) / (rawUnit - lastRawUnit);
      const deltaDegrees = degreeValue - lastDegreeUnit;
      return lastDegreeUnit + ratio * deltaDegrees;
    }

    lastRawUnit = rawUnit;
  }

  return map.get(lastRawUnit) ?? null;
}

export function tempToRawLevel(temp: number, unit: TempUnit): number {
  const map = mapForUnit(unit);
  let closestKey = 0;
  let closestDiff = Number.POSITIVE_INFINITY;

  for (const [key, mappedTemp] of map.entries()) {
    const diff = Math.abs(mappedTemp - temp);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestKey = key;
    }
  }

  return closestKey;
}

export function formatTemp(temp: number | null, unit: TempUnit, digits = 0) {
  if (temp === null || Number.isNaN(temp)) {
    return "--";
  }

  return `${temp.toFixed(digits)}°${unit.toUpperCase()}`;
}
