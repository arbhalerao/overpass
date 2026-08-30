import { useEffect, useRef, useState } from 'react'

import type { ObservationContext, TimeMode } from '../api/types'

interface Props {
  placed: boolean
  observation: ObservationContext | null
  instant: string | null
  timeMode: TimeMode
  onChange: (mode: TimeMode, isoTime: string | null) => void
}

// NOTE(aditya): made clocks read-only, flip this to true to bring it back
const TIME_PICKER_ENABLED = false

//  the viewer's own zone, as the browser reports it
const VIEWER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

function clockIn(iso: string | null, zone: string | undefined): string {
  if (!iso) return '--:--:--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date)
  } catch {
    // an unknown zone should degrade to UTC, not blank the header
    return date.toISOString().slice(11, 19)
  }
}

function dateIn(iso: string | null, zone: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      day: '2-digit',
      month: 'short',
    }).format(date)
  } catch {
    return ''
  }
}

function offsetLabel(minutes: number | null): string {
  if (minutes === null) return ''
  const sign = minutes < 0 ? '-' : '+'
  const total = Math.abs(minutes)
  return `${sign}${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function entryPhrase(icon: 'utc' | 'pin' | 'you'): string {
  if (icon === 'utc') return 'UTC'
  if (icon === 'you') return 'your local time'
  return 'local time at the pin'
}

function viewerOffsetMinutes(iso: string | null): number | null {
  const date = iso ? new Date(iso) : new Date()
  if (Number.isNaN(date.getTime())) return null
  return -date.getTimezoneOffset()
}

function awayFromNow(instant: string | null): string {
  if (!instant) return ''
  const delta = new Date(instant).getTime() - Date.now()
  const total = Math.round(Math.abs(delta) / 60_000)
  if (total < 1) return 'now'
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const minutes = total % 60
  const parts = [
    days ? `${days}d` : '',
    hours ? `${hours}h` : '',
    !days && minutes ? `${minutes}m` : '',
  ].filter(Boolean)
  return delta > 0 ? `in ${parts.join(' ')}` : `${parts.join(' ')} ago`
}

export function Clocks({ placed, observation, instant, timeMode, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [entryZone, setEntryZone] = useState<{ zone: string; phrase: string } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const observedZone = observation?.timezone ?? undefined

  const faces: Array<{
    key: string
    icon: 'utc' | 'pin' | 'you'
    label: string
    zone: string
    offset: number | null
    blank?: boolean
  }> = [
      { key: 'utc', icon: 'utc', label: 'UTC', zone: 'UTC', offset: null },
      {
        key: 'there',
        icon: 'pin',
        label: observation && !observedZone ? 'At sea' : 'Pin',
        zone: observedZone ?? 'UTC',
        offset: observation?.utc_offset_minutes ?? null,
        blank: !placed || observation === null,
      },
      {
        key: 'you',
        icon: 'you',
        label: 'You',
        zone: VIEWER_ZONE,
        offset: viewerOffsetMinutes(instant),
      },
    ]

  const fixed = timeMode === 'fixed'

  return (
    <div className="clocks" ref={rootRef}>
      {fixed && (
        <span className="clocks__away" title="The scene is computed for this instant, not for now.">
          {awayFromNow(instant)}
        </span>
      )}
      <div className={`clocks__faces${fixed ? ' is-fixed' : ''}`}>
        {faces.map((face) => (
          <button
            key={face.key}
            type="button"
            className={`clock${open ? ' is-open' : ''}${TIME_PICKER_ENABLED ? '' : ' is-static'}`}
            disabled={!TIME_PICKER_ENABLED}
            onClick={() => {
              setEntryZone({ zone: face.zone, phrase: entryPhrase(face.icon) })
              setOpen((was) => !was || entryZone?.zone !== face.zone)
            }}
            aria-expanded={open}
            title={
              face.icon === 'pin'
                ? observedZone
                  ? `Local time where the pin is (${observedZone})`
                  : 'No civil timezone at sea; showing UTC'
                : face.icon === 'you'
                  ? `Your local time (${VIEWER_ZONE})`
                  : 'Coordinated Universal Time'
            }
            aria-label={`${face.icon === 'pin'
              ? `Local time where the pin is${observedZone ? `, ${observedZone}` : ''}`
              : face.icon === 'you'
                ? 'Your local time'
                : 'Coordinated Universal Time'
              }: ${clockIn(instant, face.zone)}${TIME_PICKER_ENABLED ? '. Click to change the observation time.' : ''}`}
          >
            <span className="clock__label">
              <ClockIcon kind={face.icon} />
              {face.label}
              {face.offset !== null && <em>{offsetLabel(face.offset)}</em>}
            </span>
            <span className="clock__time">{clockIn(face.blank ? null : instant, face.zone)}</span>
            <span className="clock__date">{dateIn(face.blank ? null : instant, face.zone)}</span>
          </button>
        ))}
      </div>

      {TIME_PICKER_ENABLED && open && (
        <TimePopover
          instant={instant}
          timeMode={timeMode}
          zone={entryZone?.zone ?? 'UTC'}
          zonePhrase={entryZone?.phrase ?? 'UTC'}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function ClockIcon({ kind }: { kind: 'utc' | 'pin' | 'you' }) {
  const common = {
    width: 11,
    height: 11,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': true,
    className: 'clock__icon',
  } as const

  if (kind === 'utc') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2 8h12M8 2c1.9 2 1.9 10 0 12M8 2c-1.9 2-1.9 10 0 12"
          stroke="currentColor" strokeWidth="1.1" />
      </svg>
    )
  }
  if (kind === 'pin') {
    return (
      <svg {...common}>
        <path d="M8 14.5s4.6-4.6 4.6-8a4.6 4.6 0 1 0-9.2 0c0 3.4 4.6 8 4.6 8Z"
          stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="8" cy="6.4" r="1.7" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="5.2" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.9 14c0-2.8 2.3-4.6 5.1-4.6s5.1 1.8 5.1 4.6"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

const JUMPS: Array<{ label: string; minutes: number }> = [
  { label: '−6h', minutes: -360 },
  { label: '−1h', minutes: -60 },
  { label: '−10m', minutes: -10 },
  { label: '+10m', minutes: 10 },
  { label: '+1h', minutes: 60 },
  { label: '+6h', minutes: 360 },
]

function TimePopover({
  instant,
  timeMode,
  zone,
  zonePhrase,
  onChange,
  onClose,
}: {
  instant: string | null
  timeMode: TimeMode
  zone: string
  zonePhrase: string
  onChange: (mode: TimeMode, isoTime: string | null) => void
  onClose: () => void
}) {
  const base = instant ? new Date(instant) : new Date()

  const toFieldValue = (date: Date): string => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date)
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
  }

  const fromFieldValue = (value: string): Date | null => {
    if (!value) return null
    const guess = new Date(`${value}:00Z`)
    if (Number.isNaN(guess.getTime())) return null
    const landed = toFieldValue(guess)
    const drift = new Date(`${landed}:00Z`).getTime() - guess.getTime()
    return new Date(guess.getTime() - drift)
  }

  const nudge = (minutes: number) =>
    onChange('fixed', new Date(base.getTime() + minutes * 60_000).toISOString())

  return (
    <div className="timepop" role="dialog" aria-label="Set observation time">
      <div className="timepop__head">
        <span>Observation time</span>
        <span className="timepop__zone">Enter it in {zonePhrase}.</span>
      </div>

      <input
        type="datetime-local"
        className="timepop__input"
        aria-label="Observation date and time"
        value={toFieldValue(base)}
        onChange={(event) => {
          const parsed = fromFieldValue(event.target.value)
          if (parsed) onChange('fixed', parsed.toISOString())
        }}
      />

      <div className="timepop__jumps">
        {JUMPS.map((jump) => (
          <button key={jump.label} type="button" onClick={() => nudge(jump.minutes)}>
            {jump.label}
          </button>
        ))}
      </div>

      <div className="timepop__foot">
        <button
          type="button"
          className={`timepop__live${timeMode === 'live' ? ' is-active' : ''}`}
          onClick={() => {
            onChange('live', null)
            onClose()
          }}
        >
          {timeMode === 'live' ? (
            <>
              <span className="timepop__pip" aria-hidden="true" />
              Live
            </>
          ) : (
            'Go live'
          )}
        </button>
        <button type="button" className="timepop__done" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
