import { timestampDate } from "@bufbuild/protobuf/wkt";
import L, { DivIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { ArrowUpRightIcon, MapPinIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { defaultMarkerIcon, observeMapSize, useThemedTileUrl } from "@/components/map/map-utils";
import { buildMemoCreatorFilter } from "@/helpers/resource-names";
import { useInfiniteMemos } from "@/hooks/useMemoQueries";
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";

interface Props {
  creator: string;
  className?: string;
}

interface ClusterGroup {
  getChildCount(): number;
}

interface PopupHost {
  memo: Memo;
  element: HTMLDivElement;
}

const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 };
const POPUP_CLASS_NAME = cn(
  "w-64!",
  "[&_.leaflet-popup-content-wrapper]:rounded-lg",
  "[&_.leaflet-popup-content-wrapper]:border",
  "[&_.leaflet-popup-content-wrapper]:border-border",
  "[&_.leaflet-popup-content-wrapper]:bg-background",
  "[&_.leaflet-popup-content-wrapper]:shadow-lg",
  "[&_.leaflet-popup-content]:m-1",
  "[&_.leaflet-popup-content]:[font-size:inherit]",
  "[&_.leaflet-popup-content]:[line-height:inherit]",
  "[&_.leaflet-popup-tip]:bg-background",
);

const createClusterCustomIcon = (cluster: ClusterGroup) => {
  return new DivIcon({
    html: `<span class="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/95 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm">${cluster.getChildCount()}</span>`,
    className: "border-none bg-transparent",
    iconSize: L.point(32, 32, true),
  });
};

const MemoPopup = ({ memo }: { memo: Memo }) => {
  return (
    <div className="flex flex-col gap-2.5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <span className="inline-flex rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Memo
          </span>
          <span className="block text-[11px] font-medium text-muted-foreground">
            {memo.createTime &&
              timestampDate(memo.createTime).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
          </span>
        </div>
        <Link
          to={`/memos/${memo.name.split("/").pop()}`}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-all hover:border-primary/40 hover:text-primary"
        >
          Open
          <ArrowUpRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="space-y-1">
        <div className="line-clamp-3 text-sm leading-snug font-medium text-foreground">{memo.snippet || "No content"}</div>
        <div className="text-[11px] text-muted-foreground">
          {memo.location!.latitude.toFixed(2)}°, {memo.location!.longitude.toFixed(2)}°
        </div>
      </div>
    </div>
  );
};

interface MemoMapCanvasProps {
  memos: Memo[];
  tileUrl: string;
}

const MemoMapCanvas = ({ memos, tileUrl }: MemoMapCanvasProps) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const initialTileUrlRef = useRef(tileUrl);
  const [map, setMap] = useState<L.Map | null>(null);
  const [popupHosts, setPopupHosts] = useState<PopupHost[]>([]);

  useEffect(() => {
    const mapContainer = mapContainerRef.current;
    if (!mapContainer) return;

    const createdMap = L.map(mapContainer, {
      attributionControl: false,
      center: DEFAULT_CENTER,
      scrollWheelZoom: true,
      zoom: 2,
      zoomControl: false,
    });
    const tileLayer = L.tileLayer(initialTileUrlRef.current).addTo(createdMap);
    const stopObservingMapSize = observeMapSize(createdMap, mapContainer);

    tileLayerRef.current = tileLayer;
    setMap(createdMap);

    return () => {
      tileLayerRef.current = null;
      stopObservingMapSize();
      createdMap.remove();
    };
  }, []);

  useEffect(() => {
    tileLayerRef.current?.setUrl(tileUrl);
  }, [tileUrl]);

  useEffect(() => {
    if (!map) return;

    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      iconCreateFunction: createClusterCustomIcon,
      maxClusterRadius: 40,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
    });
    const hosts = memos.flatMap((memo): PopupHost[] => {
      if (!memo.location) return [];

      const popupHost = document.createElement("div");
      const marker = L.marker([memo.location.latitude, memo.location.longitude], { icon: defaultMarkerIcon });
      marker.bindPopup(popupHost, { closeButton: false, className: POPUP_CLASS_NAME });
      clusterGroup.addLayer(marker);

      return [{ memo, element: popupHost }];
    });

    clusterGroup.addTo(map);
    setPopupHosts(hosts);

    if (hosts.length > 0) {
      map.fitBounds(L.latLngBounds(hosts.map(({ memo }) => [memo.location!.latitude, memo.location!.longitude])), { padding: [50, 50] });
    } else {
      map.setView(DEFAULT_CENTER, 2);
    }

    return () => {
      clusterGroup.remove();
      clusterGroup.clearLayers();
    };
  }, [map, memos]);

  return (
    <>
      <div ref={mapContainerRef} className="h-full w-full !bg-muted" />
      {popupHosts.map(({ memo, element }) => createPortal(<MemoPopup memo={memo} />, element, memo.name))}
    </>
  );
};

const UserMemoMap = ({ creator, className }: Props) => {
  const creatorFilter = useMemo(() => buildMemoCreatorFilter(creator), [creator]);

  const { data, isLoading } = useInfiniteMemos(
    {
      state: State.NORMAL,
      orderBy: "create_time desc",
      pageSize: 1000,
      filter: creatorFilter,
    },
    { enabled: Boolean(creatorFilter) },
  );
  const memosWithLocation = useMemo(() => data?.pages.flatMap((page) => page.memos).filter((memo) => memo.location) || [], [data]);
  const tileUrl = useThemedTileUrl();

  if (isLoading) return null;

  return (
    <div
      className={cn(
        "memo-user-map relative z-0 h-[380px] w-full overflow-hidden rounded-xl border border-border bg-background shadow-sm",
        className,
      )}
    >
      {memosWithLocation.length === 0 && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background/92 px-5 py-3 shadow-sm backdrop-blur-sm">
            <MapPinIcon className="h-5 w-5 text-muted-foreground opacity-70" />
            <p className="text-xs font-medium tracking-[0.02em] text-muted-foreground">No location data found</p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-4 top-4 z-[950] flex items-start justify-between gap-3 rounded-xl border border-border bg-background/92 px-3 py-2.5 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary">
            <MapPinIcon className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Mapped memos</p>
            <p className="text-sm font-semibold text-foreground">{memosWithLocation.length} places pinned</p>
          </div>
        </div>
      </div>

      <MemoMapCanvas memos={memosWithLocation} tileUrl={tileUrl} />
    </div>
  );
};

export default UserMemoMap;
