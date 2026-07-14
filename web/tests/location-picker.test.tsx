import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocationPicker from "@/components/map/LocationPicker";

const leafletMocks = vi.hoisted(() => {
  const map = {
    invalidateSize: vi.fn(),
    locate: vi.fn(),
    off: vi.fn(),
    on: vi.fn(),
    remove: vi.fn(),
    setView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
  };
  const marker = {
    addTo: vi.fn(),
    getLatLng: vi.fn(),
    setLatLng: vi.fn(),
  };
  const tileLayer = {
    addTo: vi.fn(),
    setUrl: vi.fn(),
  };

  return {
    map,
    mapFactory: vi.fn(),
    marker,
    markerFactory: vi.fn(),
    markerPosition: undefined as { lat: number; lng: number } | undefined,
    tileLayer,
    tileLayerFactory: vi.fn(),
    tileUrl: "https://tiles.example/light/{z}/{x}/{y}.png",
  };
});

vi.mock("leaflet", () => {
  class Control {
    addTo() {
      return this;
    }

    remove() {}
  }

  return {
    default: {
      Control,
      DomEvent: {
        disableClickPropagation: () => {},
        disableScrollPropagation: () => {},
      },
      DomUtil: {
        create: () => document.createElement("div"),
      },
      map: leafletMocks.mapFactory,
      marker: leafletMocks.markerFactory,
      tileLayer: leafletMocks.tileLayerFactory,
    },
  };
});

vi.mock("@/components/map/map-utils", () => ({
  defaultMarkerIcon: {},
  observeMapSize: () => () => {},
  useThemedTileUrl: () => leafletMocks.tileUrl,
}));

beforeEach(() => {
  leafletMocks.markerPosition = undefined;
  leafletMocks.tileUrl = "https://tiles.example/light/{z}/{x}/{y}.png";
  leafletMocks.mapFactory.mockImplementation(() => leafletMocks.map);
  leafletMocks.markerFactory.mockImplementation(() => leafletMocks.marker);
  leafletMocks.tileLayerFactory.mockImplementation(() => leafletMocks.tileLayer);
  leafletMocks.marker.addTo.mockImplementation(() => leafletMocks.marker);
  leafletMocks.marker.getLatLng.mockImplementation(() => leafletMocks.markerPosition);
  leafletMocks.marker.setLatLng.mockImplementation((position) => {
    leafletMocks.markerPosition = position;
    return leafletMocks.marker;
  });
  leafletMocks.tileLayer.addTo.mockImplementation(() => leafletMocks.tileLayer);
});

describe("LocationPicker", () => {
  it("does not recenter when rerendered with the same coordinates", () => {
    const { rerender } = render(<LocationPicker latlng={{ lat: 1, lng: 2 }} />);

    expect(leafletMocks.map.setView).toHaveBeenCalledTimes(1);

    rerender(<LocationPicker latlng={{ lat: 1, lng: 2 }} />);

    expect(leafletMocks.map.setView).toHaveBeenCalledTimes(1);

    rerender(<LocationPicker latlng={{ lat: 3, lng: 4 }} />);

    expect(leafletMocks.map.setView).toHaveBeenCalledTimes(2);
    expect(leafletMocks.marker.setLatLng).toHaveBeenLastCalledWith({ lat: 3, lng: 4 });
  });

  it("updates the local marker before notifying the parent", () => {
    const onChange = vi.fn();
    render(<LocationPicker onChange={onChange} />);

    const clickHandler = leafletMocks.map.on.mock.calls.find(([eventName]) => eventName === "click")?.[1];
    expect(clickHandler).toBeTypeOf("function");

    act(() => {
      clickHandler({ latlng: { lat: 12.34, lng: 56.78 } });
    });

    expect(leafletMocks.marker.setLatLng).toHaveBeenLastCalledWith({ lat: 12.34, lng: 56.78 });
    expect(onChange).toHaveBeenCalledWith({ lat: 12.34, lng: 56.78 });
  });

  it("does not select a location when readonly", () => {
    const onChange = vi.fn();
    render(<LocationPicker readonly onChange={onChange} />);

    const clickHandler = leafletMocks.map.on.mock.calls.find(([eventName]) => eventName === "click")?.[1];
    expect(clickHandler).toBeTypeOf("function");

    act(() => {
      clickHandler({ latlng: { lat: 12.34, lng: 56.78 } });
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("updates the active tile layer when the theme changes", () => {
    const { rerender } = render(<LocationPicker />);

    leafletMocks.tileUrl = "https://tiles.example/dark/{z}/{x}/{y}.png";
    rerender(<LocationPicker />);

    expect(leafletMocks.tileLayer.setUrl).toHaveBeenLastCalledWith("https://tiles.example/dark/{z}/{x}/{y}.png");
  });

  it("removes the native map on unmount", () => {
    const { unmount } = render(<LocationPicker />);

    unmount();

    expect(leafletMocks.map.remove).toHaveBeenCalledTimes(1);
  });
});
