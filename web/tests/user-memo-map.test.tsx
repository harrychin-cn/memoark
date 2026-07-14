import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserMemoMap from "@/components/UserMemoMap";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

const leafletMocks = vi.hoisted(() => {
  const map = {
    fitBounds: vi.fn(),
    remove: vi.fn(),
    setView: vi.fn(),
  };
  const marker = {
    bindPopup: vi.fn(),
  };
  const clusterGroup = {
    addLayer: vi.fn(),
    addTo: vi.fn(),
    clearLayers: vi.fn(),
    remove: vi.fn(),
  };

  return {
    clusterGroup,
    latLngBounds: vi.fn(),
    map,
    mapFactory: vi.fn(),
    marker,
    markerClusterGroup: vi.fn(),
    markerFactory: vi.fn(),
    tileLayer: {
      addTo: vi.fn(),
      setUrl: vi.fn(),
    },
    tileLayerFactory: vi.fn(),
    useInfiniteMemos: vi.fn(),
  };
});

vi.mock("leaflet", () => {
  class DivIcon {
    constructor(_options: unknown) {}
  }

  return {
    default: {
      latLngBounds: leafletMocks.latLngBounds,
      map: leafletMocks.mapFactory,
      marker: leafletMocks.markerFactory,
      markerClusterGroup: leafletMocks.markerClusterGroup,
      point: vi.fn(),
      tileLayer: leafletMocks.tileLayerFactory,
    },
    DivIcon,
  };
});

vi.mock("leaflet.markercluster", () => ({}));

vi.mock("@/components/map/map-utils", () => ({
  defaultMarkerIcon: {},
  observeMapSize: () => () => {},
  useThemedTileUrl: () => "https://tiles.example/light/{z}/{x}/{y}.png",
}));

vi.mock("@/hooks/useMemoQueries", () => ({
  useInfiniteMemos: leafletMocks.useInfiniteMemos,
}));

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

beforeEach(() => {
  leafletMocks.mapFactory.mockImplementation(() => leafletMocks.map);
  leafletMocks.markerFactory.mockImplementation(() => leafletMocks.marker);
  leafletMocks.markerClusterGroup.mockImplementation(() => leafletMocks.clusterGroup);
  leafletMocks.tileLayerFactory.mockImplementation(() => leafletMocks.tileLayer);
  leafletMocks.tileLayer.addTo.mockImplementation(() => leafletMocks.tileLayer);
  leafletMocks.clusterGroup.addTo.mockImplementation(() => leafletMocks.clusterGroup);
  leafletMocks.latLngBounds.mockImplementation((points) => points);
});

describe("UserMemoMap", () => {
  it("builds a native cluster map and keeps popup navigation in the SPA router", async () => {
    const memo = {
      location: { latitude: 12.34, longitude: 56.78 },
      name: "memos/42",
      snippet: "Mapped memo",
    } as unknown as Memo;
    leafletMocks.useInfiniteMemos.mockReturnValue({
      data: { pages: [{ memos: [memo] }] },
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <UserMemoMap creator="users/1" />
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(leafletMocks.clusterGroup.addLayer).toHaveBeenCalledTimes(1);
    });

    expect(leafletMocks.map.fitBounds).toHaveBeenCalledWith([[12.34, 56.78]], { padding: [50, 50] });
    const popupHost = leafletMocks.marker.bindPopup.mock.calls[0]?.[0] as HTMLDivElement;
    expect(popupHost).toBeInstanceOf(HTMLDivElement);

    await waitFor(() => {
      expect(popupHost.querySelector("a")).toHaveAttribute("href", "/memos/42");
    });

    document.body.append(popupHost);
    fireEvent.click(popupHost.querySelector("a")!);

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/memos/42");
    });
    popupHost.remove();
  });
});
