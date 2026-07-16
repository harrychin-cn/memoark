import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ExternalLinkIcon, MinusIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { defaultMarkerIcon, observeMapSize, useThemedTileUrl } from "./map-utils";
import type { MapPoint } from "./types";

const fromLatLng = (latlng: L.LatLng): MapPoint => ({ lat: latlng.lat, lng: latlng.lng });

const samePoint = (left: MapPoint | undefined, right: MapPoint) => left?.lat === right.lat && left.lng === right.lng;

// Reusable glass-style button component
interface GlassButtonProps {
  icon: ReactNode;
  onClick: () => void;
  ariaLabel: string;
  title: string;
}

const GlassButton = ({ icon, onClick, ariaLabel, title }: GlassButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={cn(
        "h-8 w-8 flex items-center justify-center rounded-lg",
        "cursor-pointer transition-all duration-200",
        "border border-border/80 bg-background/88 text-foreground shadow-sm backdrop-blur-md",
        "hover:scale-105 hover:bg-background hover:shadow-md active:scale-95",
        "focus:outline-none focus:ring-2 focus:ring-ring/60",
      )}
    >
      {icon}
    </button>
  );
};

// Container for all map control buttons
interface ControlButtonsProps {
  position: MapPoint | undefined;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenGoogleMaps: () => void;
}

const ControlButtons = ({ position, onZoomIn, onZoomOut, onOpenGoogleMaps }: ControlButtonsProps) => {
  const t = useTranslate();
  return (
    <div className="flex flex-col gap-1.5">
      {position && (
        <GlassButton
          icon={<ExternalLinkIcon size={16} className="text-foreground" />}
          onClick={onOpenGoogleMaps}
          ariaLabel={t("ui.open-location-google-maps")}
          title={t("ui.open-google-maps")}
        />
      )}
      <GlassButton
        icon={<PlusIcon size={16} className="text-foreground" />}
        onClick={onZoomIn}
        ariaLabel={t("ui.zoom-in")}
        title={t("ui.zoom-in")}
      />
      <GlassButton
        icon={<MinusIcon size={16} className="text-foreground" />}
        onClick={onZoomOut}
        ariaLabel={t("ui.zoom-out")}
        title={t("ui.zoom-out")}
      />
    </div>
  );
};

// Custom Leaflet Control class
class MapControlsContainer extends L.Control {
  private container: HTMLDivElement | undefined = undefined;

  onAdd(_map: L.Map) {
    this.container = L.DomUtil.create("div", "");
    this.container.style.pointerEvents = "auto";

    // Prevent map interactions when clicking controls
    L.DomEvent.disableClickPropagation(this.container);
    L.DomEvent.disableScrollPropagation(this.container);

    return this.container;
  }

  onRemove() {
    this.container = undefined;
  }

  getContainer() {
    return this.container;
  }
}

const renderMapControls = (root: Root, map: L.Map, position: MapPoint | undefined) => {
  const handleOpenInGoogleMaps = () => {
    if (!position) return;
    const url = `https://www.google.com/maps?q=${position.lat},${position.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  root.render(
    <ControlButtons
      position={position}
      onZoomIn={() => map.zoomIn()}
      onZoomOut={() => map.zoomOut()}
      onOpenGoogleMaps={handleOpenInGoogleMaps}
    />,
  );
};

interface LocationPickerProps {
  readonly?: boolean;
  latlng?: MapPoint;
  onChange?: (position: MapPoint) => void;
  className?: string;
}

const DEFAULT_CENTER: MapPoint = { lat: 48.8584, lng: 2.2945 };
const noopOnLocationChange = () => {};

const LocationPicker = ({ readonly: readOnly = false, latlng, onChange = noopOnLocationChange, className }: LocationPickerProps) => {
  const tileUrl = useThemedTileUrl();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const controlRef = useRef<MapControlsContainer | null>(null);
  const controlRootRef = useRef<Root | null>(null);
  const initialPositionRef = useRef(latlng ?? DEFAULT_CENTER);
  const initialTileUrlRef = useRef(tileUrl);
  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);
  const [map, setMap] = useState<L.Map | null>(null);

  onChangeRef.current = onChange;
  readOnlyRef.current = readOnly;

  useEffect(() => {
    const mapContainer = mapContainerRef.current;
    if (!mapContainer) return;

    const createdMap = L.map(mapContainer, {
      attributionControl: false,
      center: initialPositionRef.current,
      scrollWheelZoom: false,
      zoom: 13,
      zoomControl: false,
    });
    const tileLayer = L.tileLayer(initialTileUrlRef.current).addTo(createdMap);
    const control = new MapControlsContainer({ position: "topright" });
    const stopObservingMapSize = observeMapSize(createdMap, mapContainer);

    control.addTo(createdMap);
    const controlContainer = control.getContainer();
    if (controlContainer) {
      const controlRoot = createRoot(controlContainer);
      controlRef.current = control;
      controlRootRef.current = controlRoot;
      renderMapControls(controlRoot, createdMap, latlng);
    }

    mapRef.current = createdMap;
    tileLayerRef.current = tileLayer;
    setMap(createdMap);

    return () => {
      controlRootRef.current?.unmount();
      controlRootRef.current = null;
      controlRef.current?.remove();
      controlRef.current = null;
      markerRef.current = null;
      tileLayerRef.current = null;
      mapRef.current = null;
      stopObservingMapSize();
      createdMap.remove();
    };
  }, []);

  useEffect(() => {
    if (!map) return;

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      if (readOnlyRef.current) return;

      const nextPosition = fromLatLng(event.latlng);
      const marker = markerRef.current ?? L.marker(nextPosition, { icon: defaultMarkerIcon }).addTo(map);
      marker.setLatLng(nextPosition);
      markerRef.current = marker;
      map.locate();
      onChangeRef.current(nextPosition);
    };

    map.on("click", handleMapClick);
    map.locate();

    return () => {
      map.off("click", handleMapClick);
    };
  }, [map]);

  useEffect(() => {
    tileLayerRef.current?.setUrl(tileUrl);
  }, [tileUrl]);

  useEffect(() => {
    if (!map) return;

    const nextPosition = latlng ?? DEFAULT_CENTER;
    if (samePoint(markerRef.current?.getLatLng(), nextPosition)) return;

    const marker = markerRef.current ?? L.marker(nextPosition, { icon: defaultMarkerIcon }).addTo(map);
    marker.setLatLng(nextPosition);
    markerRef.current = marker;
    map.setView(nextPosition);
  }, [latlng?.lat, latlng?.lng, map]);

  useEffect(() => {
    const controlRoot = controlRootRef.current;
    const currentMap = mapRef.current;
    if (!controlRoot || !currentMap) return;

    renderMapControls(controlRoot, currentMap, latlng);
  }, [latlng?.lat, latlng?.lng]);

  const statusLabel = readOnly ? "Pinned location" : latlng ? "Selected location" : "Choose a location";

  return (
    <div
      className={cn(
        "memo-location-map relative isolate h-72 w-full overflow-hidden rounded-xl border border-border bg-background shadow-sm",
        className,
      )}
    >
      <div ref={mapContainerRef} className="h-full w-full !bg-muted" />

      <div className="pointer-events-none absolute left-3 top-3 z-[450] flex items-center gap-2">
        <div className="rounded-full border border-border bg-background/92 px-2.5 py-1 text-[11px] font-medium tracking-[0.02em] text-foreground/80 shadow-sm backdrop-blur-sm">
          {statusLabel}
        </div>
      </div>
    </div>
  );
};

export default LocationPicker;
