"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

interface CalendarProps {
  value?: Date
  onSelect?: (date: Date) => void
  /** Disable dates before this date */
  fromDate?: Date
  className?: string
}

export function Calendar({ value, onSelect, fromDate, className }: CalendarProps) {
  const today = new Date()
  const [viewYear, setViewYear] = React.useState(
    value?.getFullYear() ?? today.getFullYear()
  )
  const [viewMonth, setViewMonth] = React.useState(
    value?.getMonth() ?? today.getMonth()
  )

  function goToPrevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }

  function goToNextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function isSelected(day: number) {
    return (
      value != null &&
      value.getFullYear() === viewYear &&
      value.getMonth() === viewMonth &&
      value.getDate() === day
    )
  }

  function isToday(day: number) {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    )
  }

  function isDisabled(day: number) {
    if (!fromDate) return false
    const d = new Date(viewYear, viewMonth, day)
    d.setHours(0, 0, 0, 0)
    const from = new Date(fromDate)
    from.setHours(0, 0, 0, 0)
    return d < from
  }

  return (
    <div className={cn("p-3 select-none w-[280px]", className)}>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="text-sm font-semibold text-zinc-900">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={goToNextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors"
          aria-label="Next month"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEK_DAYS.map((d) => (
          <div
            key={d}
            className="flex h-8 items-center justify-center text-[0.68rem] font-medium text-zinc-400 uppercase tracking-wide"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="h-8" />
          const disabled = isDisabled(day)
          const selected = isSelected(day)
          const todayCell = isToday(day)
          return (
            <div key={`day-${day}`} className="flex items-center justify-center p-0.5">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect?.(new Date(viewYear, viewMonth, day))}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors",
                  selected && "bg-zinc-900 text-white font-semibold",
                  !selected && todayCell &&
                    "text-blue-600 font-semibold ring-1 ring-inset ring-blue-300",
                  !selected && !disabled && !todayCell &&
                    "hover:bg-zinc-100 text-zinc-700",
                  disabled && "text-zinc-300 cursor-not-allowed pointer-events-none"
                )}
              >
                {day}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
