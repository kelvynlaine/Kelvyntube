'use client';

import { CalendarRange } from 'lucide-react';
import { Select } from '@kelvyntube/ui';
import { ANALYTICS_PRESETS, type AnalyticsPreset } from './studio-api';
import { useStudioUrlState } from './useStudioUrlState';

/**
 * Sélecteur de période des analytics. La valeur pilote `?preset=` :
 * l'écran est donc partageable et rechargeable à l'identique.
 */
export function RangeSelect({
  value,
  className,
}: {
  value: AnalyticsPreset;
  className?: string;
}) {
  const { setQuery } = useStudioUrlState();

  return (
    <div className={className}>
      <Select
        label={
          <span className="flex items-center gap-1.5">
            <CalendarRange size={14} aria-hidden="true" />
            Période
          </span>
        }
        selectSize="sm"
        value={value}
        onChange={(event) => setQuery({ preset: event.target.value }, { resetPage: true })}
        options={ANALYTICS_PRESETS.map((preset) => ({
          value: preset.value,
          label: preset.label,
        }))}
        containerClassName="w-[13.5rem]"
      />
    </div>
  );
}
