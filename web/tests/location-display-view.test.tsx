import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import LocationDisplayView from "@/components/MemoMetadata/Location/LocationDisplayView";
import type { Location } from "@/types/proto/api/v1/memo_service_pb";

vi.mock("@/components/map/LazyLocationPicker", () => ({
  LazyLocationPicker: () => null,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: PropsWithChildren) => <>{children}</>,
  PopoverContent: ({ children }: PropsWithChildren) => <>{children}</>,
  PopoverTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
}));

describe("<LocationDisplayView>", () => {
  it("keeps a long address in a constrained, truncatable chip", () => {
    const address = "1600 Amphitheatre Parkway, Mountain View, California, United States of America";
    const location = {
      latitude: 37.422,
      longitude: -122.084,
      placeholder: address,
    } as Location;

    render(<LocationDisplayView location={location} />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("title", address);
    expect(button).toHaveClass("inline-flex", "max-w-full", "min-w-0");
    expect(screen.getByText("[37.42°, -122.08°]")).toHaveClass("shrink-0");
    expect(screen.getByText(address)).toHaveClass("min-w-0", "truncate");
  });
});
