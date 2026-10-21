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
  const bmrRaw =
    profile.gender === 'Male'
      ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + 5
      : 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age - 161

  const tdeeRaw = bmrRaw * ACTIVITY_MULTIPLIERS[profile.activityLevel]
  let targetCaloriesRaw = tdeeRaw

  if (profile.goal === 'LoseFat') {
    targetCaloriesRaw = tdeeRaw - 500
  } else if (profile.goal === 'GainMuscle') {
    targetCaloriesRaw = tdeeRaw + 300
  }

  const targetCalories = Math.max(1200, Math.round(targetCaloriesRaw))
  const macroRatio = MACRO_RATIOS[profile.goal]

  return {
    bmr: Math.round(bmrRaw),
    tdee: Math.round(tdeeRaw),
    targetCalories,
    macroDistribution: {
      protein: Math.round((targetCalories * macroRatio.protein) / 4),
      carb: Math.round((targetCalories * macroRatio.carb) / 4),
      fat: Math.round((targetCalories * macroRatio.fat) / 9)
    }
  }
}
