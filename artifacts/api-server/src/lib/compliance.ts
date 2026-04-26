/**
 * NZS 5826:2010 — Aquatic Facilities compliance logic
 *
 * Implements the water quality parameter limits specified in NZS 5826:2010
 * for pool and spa water including:
 *   - Free chlorine (residual disinfectant)
 *   - pH (controls chlorine efficacy and bather comfort)
 *   - Combined available chlorine / chloramines (CAC = total – free)
 *   - Temperature
 *   - Turbidity (water clarity — visual safety requirement)
 *
 * All thresholds are NZS 5826:2010 defaults unless overridden by
 * facility-specific values stored in the pools table.
 */

export interface ComplianceInput {
  poolType: string;
  freeChlorine?: number | null;
  totalAvailableChlorine?: number | null;
  combinedChlorine?: number | null;
  ph?: number | null;
  temperature?: number | null;
  turbidity?: number | null;
  customFreeChlorineMin?: number | null;
  customFreeChlorineMax?: number | null;
  customPhMin?: number | null;
  customPhMax?: number | null;
  customTempMin?: number | null;
  customTempMax?: number | null;
  customTurbidityMax?: number | null;
  customCombinedChlorineMax?: number | null;
}

export interface ComplianceViolation {
  parameter: string;
  value: number;
  limit: string;
  message: string;
}

export interface ComplianceResult {
  isCompliant: boolean;
  violations: ComplianceViolation[];
  combinedChlorine: number | null;
}

/**
 * Compute NZS 5826:2010 compliance for a water test result.
 * Returns a detailed result including all parameter violations.
 */
export function computeComplianceResult(input: ComplianceInput): ComplianceResult {
  const isSpa = input.poolType === "spa";

  const clMin  = input.customFreeChlorineMin ?? (isSpa ? 2.0 : 1.5);
  const clMax  = input.customFreeChlorineMax ?? 5.0;
  const phMin  = input.customPhMin ?? 7.2;
  const phMax  = input.customPhMax ?? 8.0;
  const tMin   = input.customTempMin ?? (isSpa ? 36 : 24);
  const tMax   = input.customTempMax ?? (isSpa ? 40 : 35);
  const cacMax = input.customCombinedChlorineMax ?? 0.5;
  const turbMax = input.customTurbidityMax ?? (isSpa ? 1.0 : 0.5);

  const violations: ComplianceViolation[] = [];

  if (input.freeChlorine == null || input.ph == null) {
    return {
      isCompliant: false,
      violations: [{ parameter: "data", value: 0, limit: "required", message: "Free chlorine and pH are required for compliance check" }],
      combinedChlorine: null,
    };
  }

  if (input.freeChlorine < clMin || input.freeChlorine > clMax) {
    violations.push({
      parameter: "freeChlorine",
      value: input.freeChlorine,
      limit: `${clMin}–${clMax} mg/L`,
      message: `Free chlorine ${input.freeChlorine} mg/L is outside NZS 5826:2010 range (${clMin}–${clMax} mg/L)`,
    });
  }

  if (input.ph < phMin || input.ph > phMax) {
    violations.push({
      parameter: "ph",
      value: input.ph,
      limit: `${phMin}–${phMax}`,
      message: `pH ${input.ph} is outside NZS 5826:2010 range (${phMin}–${phMax})`,
    });
  }

  if (input.temperature != null) {
    if (input.temperature < tMin || input.temperature > tMax) {
      violations.push({
        parameter: "temperature",
        value: input.temperature,
        limit: `${tMin}–${tMax} °C`,
        message: `Temperature ${input.temperature}°C is outside NZS 5826:2010 range (${tMin}–${tMax}°C) for ${isSpa ? "spa" : "pool"}`,
      });
    }
  }

  let combinedCl: number | null = input.combinedChlorine ?? null;
  if (combinedCl == null && input.totalAvailableChlorine != null) {
    combinedCl = input.totalAvailableChlorine - input.freeChlorine;
  }
  if (combinedCl != null && combinedCl >= cacMax) {
    violations.push({
      parameter: "combinedChlorine",
      value: combinedCl,
      limit: `< ${cacMax} mg/L`,
      message: `Combined available chlorine (CAC) ${combinedCl.toFixed(2)} mg/L exceeds NZS 5826:2010 limit of ${cacMax} mg/L`,
    });
  }

  if (input.turbidity != null && input.turbidity > turbMax) {
    violations.push({
      parameter: "turbidity",
      value: input.turbidity,
      limit: `≤ ${turbMax} NTU`,
      message: `Turbidity ${input.turbidity} NTU exceeds NZS 5826:2010 limit of ${turbMax} NTU for ${isSpa ? "spa" : "pool"}`,
    });
  }

  return {
    isCompliant: violations.length === 0,
    violations,
    combinedChlorine: combinedCl,
  };
}

/**
 * Simple boolean compliance check (backward-compatible wrapper).
 */
export function computeCompliance(input: ComplianceInput): boolean {
  return computeComplianceResult(input).isCompliant;
}

/**
 * NZS 5826:2010 default thresholds for reference and documentation.
 */
export const NZS5826Thresholds = {
  pool: {
    freeChlorineMin: 1.5,
    freeChlorineMax: 5.0,
    phMin: 7.2,
    phMax: 8.0,
    tempMin: 24,
    tempMax: 35,
    combinedChlorineMax: 0.5,
    turbidityMax: 0.5,
  },
  spa: {
    freeChlorineMin: 2.0,
    freeChlorineMax: 5.0,
    phMin: 7.2,
    phMax: 8.0,
    tempMin: 36,
    tempMax: 40,
    combinedChlorineMax: 0.5,
    turbidityMax: 1.0,
  },
} as const;
