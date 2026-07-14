import { DivIcon, type Map as LeafletMap } from "leaflet";
import { MapPinIcon } from "lucide-react";
import { useMemo } from "react";
import ReactDOMServer from "react-dom/server";
import { useAuth } from "@/contexts/AuthContext";
import { resolveTheme } from "@/utils/theme";

const TILE_URLS = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
} as const;

export const useThemedTileUrl = () => {
  const { userGeneralSetting } = useAuth();
  return useMemo(
    () => (resolveTheme(userGeneralSetting?.theme || "system").includes("dark") ? TILE_URLS.dark : TILE_URLS.light),
    [userGeneralSetting?.theme],
  );
};

interface MarkerIconOptions {
  fill?: string;
  size?: number;
  className?: string;
}

export const createMarkerIcon = (options?: MarkerIconOptions): DivIcon => {
  const { fill = "var(--primary)", size = 28, className = "" } = options || {};
  return new DivIcon({
    className: "relative border-none bg-transparent",
    html: ReactDOMServer.renderToString(
      <div className={`relative flex items-center justify-center ${className}`.trim()}>
        <MapPinIcon fill={fill} size={size} strokeWidth={1.9} style={{ filter: "drop-shadow(0 6px 10px rgba(15, 23, 42, 0.22))" }} />
      </div>,
    ),
    iconSize: [size + 8, size + 8],
    iconAnchor: [(size + 8) / 2, size + 4],
    popupAnchor: [0, -(size * 0.7)],
  });
};

export const defaultMarkerIcon = createMarkerIcon();

export const observeMapSize = (map: LeafletMap, container: HTMLElement) => {
  if (typeof ResizeObserver === "undefined") {
    return () => {};
  }

  let frame: number | undefined;
  const observer = new ResizeObserver(() => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }

    frame = requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      frame = undefined;
    });
  });

  observer.observe(container);

  return () => {
    observer.disconnect();
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
  };
};
