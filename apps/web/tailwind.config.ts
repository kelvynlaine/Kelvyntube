import type { Config } from 'tailwindcss';
import preset from '@kelvyntube/ui/tailwind-preset';

const config: Config = {
  presets: [preset as Config],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
