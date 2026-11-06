import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Radar } from "../components/Radar";
import { getExploreData } from "../data/get-explore-data";

describe("Radar", () => {
  it("delays each blip's ping until the leading edge reaches it", async () => {
    const { blips } = await getExploreData();
    const { container } = render(<Radar blips={blips} />);
    const delay = (ticker: string) =>
      (container.querySelector(`[data-blip="${ticker}"] .tk-ping`) as HTMLElement).style.animationDelay;
    expect(delay("SCAT")).toBe("0.533s");
    expect(delay("TIDE")).toBe("1.167s");
    expect(delay("GHOST")).toBe("5.767s");
    // The blip brightens on the same beat.
    const art = container.querySelector('[data-blip="SCAT"] img') as HTMLElement;
    expect(art.style.animationDelay).toBe("0.533s");
  });

  it("draws the two labels, with $ORB on the right of its blip", async () => {
    const { blips } = await getExploreData();
    const { container } = render(<Radar blips={blips} />);
    const orb = container.querySelector('[data-blip="ORB"]') as HTMLElement;
    const label = container.querySelector('[data-blip-label="ORB"]') as HTMLElement;
    expect(label).toHaveTextContent("$ORB+221%");
    expect(parseFloat(label.style.left)).toBeGreaterThan(parseFloat(orb.style.left));
    expect(container.querySelectorAll("[data-blip-label]")).toHaveLength(2);
  });
});
