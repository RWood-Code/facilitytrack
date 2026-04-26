export interface PoolLimitsInput {
  poolType: string;
  customPhMin?: number | null;
  customPhMax?: number | null;
  customFreeChlorineMin?: number | null;
  customFreeChlorineMax?: number | null;
  customTempMin?: number | null;
  customTempMax?: number | null;
  customTurbidityMax?: number | null;
  customCombinedChlorineMax?: number | null;
}

export interface EffectiveLimits {
  freeChlorineMin: number;
  freeChlorineMax: number;
  phMin: number;
  phMax: number;
  tempMin: number;
  tempMax: number;
  turbidityMax: number;
  combinedChlorineMax: number;
}

export function effectiveLimits(p: PoolLimitsInput): EffectiveLimits {
  const isSpa = p.poolType === "spa";
  return {
    freeChlorineMin: p.customFreeChlorineMin ?? (isSpa ? 2.0 : 1.5),
    freeChlorineMax: p.customFreeChlorineMax ?? 5.0,
    phMin: p.customPhMin ?? 7.2,
    phMax: p.customPhMax ?? 8.0,
    tempMin: p.customTempMin ?? (isSpa ? 36 : 24),
    tempMax: p.customTempMax ?? (isSpa ? 40 : 35),
    turbidityMax: p.customTurbidityMax ?? (isSpa ? 1.0 : 0.5),
    combinedChlorineMax: p.customCombinedChlorineMax ?? 0.5,
  };
}

export function formatRange(min: number, max: number): string {
  return `${min}–${max}`;
}

export function formatMax(max: number): string {
  return `< ${max}`;
}

export function poolTypeLabel(t: string): string {
  switch (t) {
    case "spa": return "Spa";
    case "sauna": return "Sauna";
    case "steam_room": return "Steam Room";
    case "pool":
    default: return "Pool";
  }
}
