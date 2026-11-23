export interface FeatureFlagPolicy {
  key: string;
  platformEnabled: boolean;
  allowedPlanCodes: string[];
  defaultQuota: number | null;
}

export interface UserEntitlementOverride {
  featureKey: string;
  overrideState: 'granted' | 'revoked';
  customLimit: number | null;
  expiresAt: string | null;
}

export interface ResolvedEntitlement {
  featureKey: string;
  enabled: boolean;
  source: 'platform_disabled' | 'user_revoked' | 'user_granted' | 'plan_included' | 'plan_excluded';
  effectiveLimit: number | null;
}

export function resolveEntitlement(
  flag: FeatureFlagPolicy,
  userPlanCode: string | null,
  override: UserEntitlementOverride | null,
  nowMs = Date.now()
): ResolvedEntitlement {
  if (!flag.platformEnabled) {
    return {
      featureKey: flag.key,
      enabled: false,
      source: 'platform_disabled',
      effectiveLimit: 0,
    };
  }

  const overrideActive =
    override !== null &&
    (override.expiresAt === null || Date.parse(override.expiresAt) > nowMs);

  if (overrideActive && override) {
    if (override.overrideState === 'revoked') {
      return {
        featureKey: flag.key,
        enabled: false,
        source: 'user_revoked',
        effectiveLimit: 0,
      };
    }
    return {
      featureKey: flag.key,
      enabled: true,
      source: 'user_granted',
      effectiveLimit: override.customLimit ?? flag.defaultQuota,
    };
  }

  const includedInPlan = Boolean(userPlanCode && flag.allowedPlanCodes.includes(userPlanCode));
  return {
    featureKey: flag.key,
    enabled: includedInPlan,
    source: includedInPlan ? 'plan_included' : 'plan_excluded',
    effectiveLimit: includedInPlan ? flag.defaultQuota : 0,
  };
}
