import * as React from "react"
import { cn } from "@/lib/utils"

export interface SliderProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  unit?: string
  min: number
  max: number
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, label, unit, min, max, value, ...props }, ref) => {
    return (
      <div className="w-full space-y-4">
        <div className="flex justify-between items-center">
          {label && (
            <label className="text-sm font-semibold text-gray-700">
              {label}
            </label>
          )}
          <div className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-sm font-bold">
            {value} {unit}
          </div>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          className={cn(
            "w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500",
            className
          )}
          ref={ref}
          {...props}
        />
        <div className="flex justify-between text-[10px] text-gray-400 font-medium px-1">
          <span>{min} {unit}</span>
          <span>{max} {unit}</span>
        </div>
      </div>
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
