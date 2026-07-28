'use client';

import { CalendarRange } from 'lucide-react';
import { Select, cn } from '@kelvyntube/ui';
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
    <div className={cn('w-full feed-2:w-auto', className)}>
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
        // `selectSize="sm"` = 32 px : trop bas pour le doigt. On force 44 px
        // jusqu'à feed-2, où la souris reprend la main et où la densité prime.
        className="h-11 text-kt-base feed-2:h-8 feed-2:text-kt-sm"
        containerClassName="w-full feed-2:w-[13.5rem]"
      />
    </div>
  );
}
