import { type SecurityContact, securityContact } from "../lib/contact";
import { FROZEN_AT, FROZEN_SOURCES, type FrozenSource } from "../lib/frozen-build";
import { bountyRewards, type Rewards } from "../lib/rewards";
import { type ScopeAddresses, scopeAddresses } from "../lib/scope";

export interface SecurityData {
  contact: SecurityContact | null;
  rewards: Rewards;
  addresses: ScopeAddresses;
  sources: readonly FrozenSource[];
  frozenAt: string;
}

/** Everything the Security page shows besides its text: build-time public values and the frozen build. */
export async function getSecurityData(): Promise<SecurityData> {
  return {
    contact: securityContact(),
    rewards: bountyRewards(),
    addresses: scopeAddresses(),
    sources: FROZEN_SOURCES,
    frozenAt: FROZEN_AT,
  };
}
