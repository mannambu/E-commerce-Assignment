import { ActivityLevel, HealthGoal } from '~/models/schemas/User.schema'

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  Sedentary: 1.2,
  Light: 1.375,
  Moderate: 1.55,
  Active: 1.725,
  'Very Active': 1.9
}

const MACRO_RATIOS: Record<HealthGoal, { protein: number; carb: number; fat: number }> = {
  LoseFat: { protein: 0.4, carb: 0.3, fat: 0.3 },
  GainMuscle: { protein: 0.3, carb: 0.45, fat: 0.25 },
  MaintainWeight: { protein: 0.3, carb: 0.4, fat: 0.3 }
}

export function calculateHealthMetrics(profile: {
  gender: 'Male' | 'Female'
  age: number
  heightCm: number
  weightKg: number
  activityLevel: ActivityLevel
  goal: HealthGoal
}) {
  if (
    !profile ||
    (profile.gender !== 'Male' && profile.gender !== 'Female') ||
    profile.age === undefined ||
    profile.age === null ||
    !Number.isFinite(Number(profile.age)) ||
    profile.heightCm === undefined ||
    profile.heightCm === null ||
    !Number.isFinite(Number(profile.heightCm)) ||
    profile.weightKg === undefined ||
    profile.weightKg === null ||
    !Number.isFinite(Number(profile.weightKg)) ||
    !profile.activityLevel ||
    !profile.goal
  ) {
    throw new Error('Chưa đủ dữ liệu để tính chỉ số')
  }

  const age = Number(profile.age)
  const heightCm = Number(profile.heightCm)
  const weightKg = Number(profile.weightKg)

  const bmrRaw =
    profile.gender === 'Male'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161

  const activityMultiplier = ACTIVITY_MULTIPLIERS[profile.activityLevel] ?? 1.2
  const tdeeRaw = bmrRaw * activityMultiplier

  // Target theo mục tiêu: LoseFat -15%, GainMuscle +10%, MaintainWeight 0% (FR-HLT-007)
  let targetCaloriesRaw: number
  if (profile.goal === 'LoseFat') {
    targetCaloriesRaw = tdeeRaw * 0.85
  } else if (profile.goal === 'GainMuscle') {
    targetCaloriesRaw = tdeeRaw * 1.1
  } else {
    targetCaloriesRaw = tdeeRaw
  }

  const bmr = Math.round(bmrRaw)
  const tdee = Math.round(tdeeRaw)

  // Sàn an toàn: Target >= BMR kèm cờ cảnh báo khi Target thấp hơn BMR (FR-HLT-008)
  let targetCalories = Math.round(targetCaloriesRaw)
  let targetAdjustedToBmr = false

  if (targetCalories < bmr) {
    targetCalories = bmr
    targetAdjustedToBmr = true
  }

  const macroRatio = MACRO_RATIOS[profile.goal] ?? MACRO_RATIOS.MaintainWeight

  return {
    bmr,
    tdee,
    targetCalories,
    targetAdjustedToBmr,
    macroDistribution: {
      protein: Math.round((targetCalories * macroRatio.protein) / 4),
      carb: Math.round((targetCalories * macroRatio.carb) / 4),
      fat: Math.round((targetCalories * macroRatio.fat) / 9)
    }
  }
}
