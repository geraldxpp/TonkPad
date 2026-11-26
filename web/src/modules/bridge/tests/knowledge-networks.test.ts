import { describe, expect, it } from "vitest";
import { buildKnowledge } from "@/shared/bot/knowledge";
import { BRIDGE_NETWORK_NAMES, CODE_FACTS } from "@/shared/bot/knowledge-facts";
import { BRIDGE_NETWORKS } from "../lib/networks";

describe("the bot's knowledge of the Bridge", () => {
  it("names the Bridge's 17 networks, in its order", () => {
    expect(BRIDGE_NETWORK_NAMES).toEqual(BRIDGE_NETWORKS.map((network) => network.name));
    expect(BRIDGE_NETWORK_NAMES).toHaveLength(17);
  });

  it("states each of them in the pack", () => {
    const fact = CODE_FACTS.find((line) => line.startsWith("Bridge moves major assets between 17 networks: "));
    expect(fact).toBeDefined();
    expect(buildKnowledge().core).toContain(fact);
    for (const { name } of BRIDGE_NETWORKS) expect(fact).toContain(name);
  });
});
