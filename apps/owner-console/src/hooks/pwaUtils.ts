export type PwaInstallMode = 'installed' | 'native_prompt' | 'ios_guide' | 'browser_guide';

export interface PwaPlatformSignals {
  isStandaloneMedia: boolean;
  isNavigatorStandalone: boolean;
  userAgent: string;
  hasDeferredPrompt: boolean;
}

export function detectIOSUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) || (ua.includes('macintosh') && ua.includes('mobile'));
}

export function resolvePwaInstallMode(signals: PwaPlatformSignals): PwaInstallMode {
  if (signals.isStandaloneMedia || signals.isNavigatorStandalone) {
    return 'installed';
  }
  if (signals.hasDeferredPrompt) {
    return 'native_prompt';
  }
  if (detectIOSUserAgent(signals.userAgent)) {
    return 'ios_guide';
  }
  return 'browser_guide';
}

export interface ManifestComplianceSummary {
  valid: boolean;
  errors: string[];
}

export function validateManifestCompliance(manifest: {
  id?: string;
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  icons?: Array<{ sizes?: string; type?: string; purpose?: string }>;
}): ManifestComplianceSummary {
  const errors: string[] = [];
  if (!manifest.id) errors.push('missing_id');
  if (!manifest.name) errors.push('missing_name');
  if (!manifest.short_name) errors.push('missing_short_name');
  if (manifest.short_name && manifest.short_name.length > 12) errors.push('short_name_too_long');
  if (manifest.start_url !== '/') errors.push('invalid_start_url');
  if (manifest.scope !== '/') errors.push('invalid_scope');
  if (manifest.display !== 'standalone') errors.push('display_not_standalone');

  const icons = manifest.icons ?? [];
  const has192 = icons.some((i) => i.sizes === '192x192' && i.type === 'image/png');
  const has512 = icons.some((i) => i.sizes === '512x512' && i.type === 'image/png' && i.purpose === 'any');
  const hasMaskable = icons.some((i) => i.sizes === '512x512' && i.type === 'image/png' && i.purpose === 'maskable');
  if (!has192) errors.push('missing_192_png');
  if (!has512) errors.push('missing_512_any_png');
  if (!hasMaskable) errors.push('missing_512_maskable_png');

  return { valid: errors.length === 0, errors };
}
