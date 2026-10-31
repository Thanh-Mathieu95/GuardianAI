"use client";
import { useEffect, useRef, useState } from "react";
import type { Incident } from "@/lib/types";
import { useLanguage } from "./language";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapType, GeoJSONSource, Marker } from "maplibre-gl";
import { places, isOpen, roadWarnings } from "@/lib/city";
import { venuePaths, VenueSymbol } from "./venue-symbol";
import { PlaceDetails } from "./place-details";
import {
  Moon,
  Footprints,
  TriangleAlert,
  X,
  ScanLine,
  CheckCircle2,
  Clock,
} from "lucide-react";
export default function GuardianMap({ incident: i }: { incident: Incident }) {
  const { t } = useLanguage(),
    box = useRef<HTMLDivElement>(null),
    map = useRef<MapType | null>(null),
    markers = useRef<Marker[]>([]),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [threeD, setThreeD] = useState(true);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null),
    [selectedRoad, setSelectedRoad] = useState<string | null>(null),
    [scanning, setScanning] = useState(false),
    [scanEpoch, setScanEpoch] = useState(0);
  const radar = useRef<HTMLDivElement>(null);
  const minute = i.scenarioMinute ?? 1335,
    showArea = i.mode !== "LIVE" && !!i.sosAt,
    openPlaces = places.filter((p) => isOpen(p, minute));
  const selectedPlace = showArea
    ? openPlaces.find((p) => p.id === selectedVenue)
    : undefined;
  const road = showArea
    ? roadWarnings.find((r) => r.id === selectedRoad)
    : undefined;
  const cameraKey = useRef("");
  const plan = i.plans.findLast((p) => !p.invalidatedAt);
  useEffect(() => {
    let disposed = false;
    setReady(false);
    setFailed("");
    cameraKey.current = "";
    const timeout = setTimeout(() => {
      if (!disposed) setFailed("MAP_LOAD_TIMEOUT");
    }, 15000);
    void import("maplibre-gl")
      .then((lib) => {
        if (disposed || !box.current) return;
        // v6 no longer inlines its worker. Next must emit this explicit asset.
        lib.setWorkerUrl(
          new URL(
            "maplibre-gl/dist/maplibre-gl-worker.mjs",
            import.meta.url,
          ).toString(),
        );
        const m = new lib.Map({
          container: box.current,
          style: "https://tiles.openfreemap.org/styles/dark",
          center: i.location
            ? [i.location.lng, i.location.lat]
            : [106.7058, 10.772],
          zoom: 16,
          pitch: 50,
          attributionControl: { compact: true },
        });
        map.current = m;
        m.addControl(new lib.NavigationControl(), "top-right");
        m.on("style.load", () => {
          if (disposed) return;
          for (const layer of m.getStyle().layers) {
            if (layer.type === "symbol" && layer.layout?.["text-field"]) {
              m.setPaintProperty(layer.id, "text-color", "#c3cec8");
              m.setPaintProperty(layer.id, "text-halo-color", "#0c1210");
              m.setPaintProperty(layer.id, "text-halo-width", 1.4);
            }
            if (
              layer.type === "line" &&
              /road|street|highway|transportation/.test(layer.id) &&
              !/rail|bridge|tunnel|case/.test(layer.id)
            )
              m.setPaintProperty(layer.id, "line-color", "#56665f");
            if (layer.type === "background")
              m.setPaintProperty(layer.id, "background-color", "#0c1210");
            if (layer.type === "fill" && /water/.test(layer.id))
              m.setPaintProperty(layer.id, "fill-color", "#12233d");
          }
          m.addSource("road-warnings", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          const warningColor: [
            "match",
            ["get", string],
            string,
            string,
            string,
            string,
            string,
          ] = [
            "match",
            ["get", "condition"],
            "INCIDENT",
            "#f3867a",
            "DARK",
            "#f2b65e",
            "#b9a6ee",
          ];
          m.addLayer({
            id: "warning-glow",
            type: "line",
            source: "road-warnings",
            paint: {
              "line-color": [...warningColor],
              "line-width": 15,
              "line-blur": 7,
              "line-opacity": 0.45,
            },
          });
          m.addLayer({
            id: "warning-line",
            type: "line",
            source: "road-warnings",
            paint: {
              "line-color": [...warningColor],
              "line-width": 3,
              "line-opacity": 0.9,
            },
          });
          m.on("click", "warning-line", (event) => {
            const id = event.features?.[0]?.properties?.id;
            if (typeof id === "string") {
              setSelectedRoad(id);
              setSelectedVenue(null);
            }
          });
          m.on("mouseenter", "warning-line", () => {
            m.getCanvas().style.cursor = "pointer";
          });
          m.on("mouseleave", "warning-line", () => {
            m.getCanvas().style.cursor = "";
          });
          m.addSource("route", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          m.addLayer({
            id: "route-casing",
            type: "line",
            source: "route",
            paint: { "line-color": "#ecf1ea", "line-width": 10 },
          });
          m.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            paint: { "line-color": "#4fd1b0", "line-width": 5 },
          });
          for (const [id, color, dash] of [
            ["history", "#8d9c95", false],
            ["reference", "#7fb0f2", true],
          ] as const) {
            m.addSource(id, {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            });
            m.addLayer({
              id: `${id}-line`,
              type: "line",
              source: id,
              paint: {
                "line-color": color,
                "line-width": id === "history" ? 3 : 4,
                ...(dash
                  ? { "line-dasharray": [2, 2] }
                  : { "line-opacity": 0.45 }),
              },
            });
          }
          if (m.getSource("openmaptiles"))
            m.addLayer({
              id: "guardian-buildings",
              type: "fill-extrusion",
              source: "openmaptiles",
              "source-layer": "building",
              minzoom: 14,
              paint: {
                "fill-extrusion-color": "#24302b",
                "fill-extrusion-height": [
                  "coalesce",
                  ["get", "render_height"],
                  ["get", "height"],
                  8,
                ],
                "fill-extrusion-base": [
                  "coalesce",
                  ["get", "render_min_height"],
                  0,
                ],
                "fill-extrusion-opacity": 0.7,
              },
            });
          setReady(true);
        });
        m.on("load", () => {
          clearTimeout(timeout);
          if (!disposed) setFailed("");
        });
        m.on("error", (event) => {
          if (disposed) return;
          clearTimeout(timeout);
          setFailed(event.error?.message || "MAP_RESOURCE_FAILED");
        });
        const resize = new ResizeObserver(() => m.resize());
        resize.observe(box.current);
        m.once("remove", () => resize.disconnect());
      })
      .catch((error) => {
        clearTimeout(timeout);
        if (!disposed)
          setFailed(
            error instanceof Error
              ? error.message
              : "MAP_INITIALIZATION_FAILED",
          );
      });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    setSelectedVenue(null);
    setSelectedRoad(null);
    if (
      !i.sosAt ||
      ["COMPLETE", "CANCELLED", "SIGNAL_LOST"].includes(i.status)
    ) {
      setScanning(false);
      return;
    }
    setScanEpoch((n) => n + 1);
    setScanning(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const timer = setTimeout(() => setScanning(false), 3400);
    return () => clearTimeout(timer);
  }, [i.id, i.sosAt]);
  useEffect(() => {
    if (["COMPLETE", "CANCELLED", "SIGNAL_LOST"].includes(i.status))
      setScanning(false);
  }, [i.status]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !radar.current || !i.location) return;
    const position = () => {
      if (!radar.current) return;
      const p = m.project([i.location!.lng, i.location!.lat]);
      radar.current.style.left = `${p.x}px`;
      radar.current.style.top = `${p.y}px`;
    };
    position();
    m.on("move", position);
    m.on("resize", position);
    return () => {
      m.off("move", position);
      m.off("resize", position);
    };
  }, [ready, i.location?.lat, i.location?.lng, scanning]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    void import("maplibre-gl").then((lib) => {
      if (map.current !== m) return;
      markers.current.forEach((x) => x.remove());
      markers.current = [];
      const locations: {
        point: { lat: number; lng: number };
        label: string;
        confirmed: boolean;
        venueId?: string;
        kind?: number;
        state?: string;
        user?: boolean;
      }[] = [
        ...(i.location
          ? [
              {
                point: i.location,
                label: t("Bạn", "You"),
                confirmed: false,
                user: true,
              },
            ]
          : []),
        ...(i.mode !== "LIVE" && i.sosAt
          ? openPlaces.map((p) => ({
              point: p.point,
              label: p.name,
              confirmed: i.replies.some(
                (r) => r.memberId === p.id && r.state === "ACCEPTED",
              ),
              venueId: p.id,
              kind: p.kind,
              state: i.replies.find((r) => r.memberId === p.id)?.state,
            }))
          : []),
        ...i.replies
          .filter(
            (r) =>
              r.role === "PARTNER" &&
              r.location &&
              !(i.mode === "DEMO" && places.some((p) => p.id === r.memberId)),
          )
          .map((r) => ({
            point: r.location!,
            label: r.name,
            confirmed: r.state === "ACCEPTED",
          })),
      ];
      for (const p of locations) {
        const el = document.createElement("button");
        el.className = "venue-pin";
        if (p.venueId) {
          el.dataset.venueId = p.venueId;
          el.dataset.open = "true";
          el.classList.add("venue-discovered");
        }
        el.classList.add(
          p.confirmed
            ? "pin-confirmed"
            : p.label === t("Bạn", "You")
              ? "pin-user"
              : "pin-available",
        );
        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "20");
        svg.setAttribute("height", "20");
        svg.setAttribute("aria-hidden", "true");
        const mark = document.createElementNS(
          "http://www.w3.org/2000/svg",
          p.confirmed ? "path" : "circle",
        );
        if (p.confirmed) {
          mark.setAttribute("d", "m5 12 4 4 10-10");
          mark.setAttribute("fill", "none");
        } else {
          mark.setAttribute("cx", "12");
          mark.setAttribute("cy", "12");
          mark.setAttribute("r", "5");
          mark.setAttribute(
            "fill",
            p.label === t("Bạn", "You") ? "currentColor" : "none",
          );
        }
        mark.setAttribute("stroke", "currentColor");
        mark.setAttribute("stroke-width", "2");
        if (p.kind !== undefined) {
          for (const d of venuePaths[p.kind] || venuePaths[0]) {
            const path = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "path",
            );
            path.setAttribute("d", d);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", "currentColor");
            path.setAttribute("stroke-width", "1.7");
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("stroke-linejoin", "round");
            svg.appendChild(path);
          }
        } else svg.appendChild(mark);
        el.appendChild(svg);
        if (p.venueId) {
          const label = document.createElement("span");
          label.className = "venue-pin-name";
          label.textContent = p.label;
          el.appendChild(label);
          const badge = document.createElement("span");
          badge.className = `venue-pin-badge ${p.confirmed ? "badge-confirmed" : "badge-open"}`;
          badge.setAttribute("aria-hidden", "true");
          if (p.confirmed) {
            const check = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "svg",
            );
            check.setAttribute("viewBox", "0 0 24 24");
            check.setAttribute("width", "12");
            check.setAttribute("height", "12");
            const path = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "path",
            );
            path.setAttribute("d", "m5 12 4 4 10-10");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", "currentColor");
            path.setAttribute("stroke-width", "3");
            check.appendChild(path);
            badge.appendChild(check);
          }
          el.appendChild(badge);
          el.addEventListener("click", (event) => {
            event.stopPropagation();
            setSelectedVenue(p.venueId!);
            setSelectedRoad(null);
          });
        }
        el.setAttribute("aria-label", p.label);
        el.title = p.label;
        const marker = new lib.Marker({ element: el }).setLngLat([
          p.point.lng,
          p.point.lat,
        ]);
        if (!p.venueId)
          marker.setPopup(new lib.Popup({ offset: 20 }).setText(p.label));
        markers.current.push(marker.addTo(m));
      }
      (m.getSource("road-warnings") as GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: showArea
          ? roadWarnings.map((r) => ({
              type: "Feature",
              properties: {
                id: r.id,
                condition: r.condition,
                street: r.name,
                source: r.source,
              },
              geometry: {
                type: "LineString",
                coordinates: r.points.map((p) => [p.lng, p.lat]),
              },
            }))
          : [],
      });
      const points = plan?.route.points || [];
      const line = (points: { lat: number; lng: number }[]) => ({
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: points.map((p) => [p.lng, p.lat]),
        },
      });
      (m.getSource("history") as GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: i.plans
          .filter((p) => p.invalidatedAt)
          .map((p) => line(p.route.points)),
      });
      (m.getSource("reference") as GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: i.reference ? [line(i.reference.route.points)] : [],
      });
      const source = m.getSource("route") as GeoJSONSource | undefined;
      source?.setData({
        type: "FeatureCollection",
        features: points.length
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: points.map((p) => [p.lng, p.lat]),
                },
              },
            ]
          : [],
      });
      const focusPoints =
        i.reference?.route.points ||
        (points.length
          ? points
          : showArea
            ? [
                ...(i.location ? [i.location] : []),
                ...openPlaces.map((p) => p.point),
              ]
            : []);
      const nextCameraKey = `${i.id}:${i.reference?.name || plan?.id || (showArea ? `area-${minute}` : "overview")}`;
      if (focusPoints.length && cameraKey.current !== nextCameraKey) {
        const bounds = new lib.LngLatBounds();
        focusPoints.forEach((p) => bounds.extend([p.lng, p.lat]));
        m.fitBounds(bounds, {
          padding: { top: 100, bottom: 85, left: 55, right: 55 },
          maxZoom: 17,
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 900,
        });
        cameraKey.current = nextCameraKey;
      } else if (
        !points.length &&
        i.location &&
        cameraKey.current !== nextCameraKey
      ) {
        m.easeTo({
          center: [i.location.lng, i.location.lat],
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 600,
        });
        cameraKey.current = nextCameraKey;
      }
    });
  }, [ready, i.updatedAt, i.reference?.name, minute]);
  return (
    <div className="guardian-map">
      <div ref={box} className="map-canvas" />
      {scanning && (
        <div
          ref={radar}
          key={scanEpoch}
          className="sos-radar"
          aria-hidden="true"
        >
          <div className="radar-sweep" />
          <div className="radar-ring" />
          <div className="radar-ring radar-ring-delayed" />
        </div>
      )}
      {!!i.sosAt && (
        <div
          className={`sos-scan-status ${scanning ? "is-scanning" : ""}`}
          role="status"
        >
          <ScanLine size={16} />
          <span>
            {scanning
              ? t("Đang quét dữ liệu khu vực…", "Scanning area data…")
              : showArea
                ? t(
                    `${openPlaces.length} điểm mở · ${places.length - openPlaces.length} điểm đóng đã ẩn`,
                    `${openPlaces.length} open places · ${places.length - openPlaces.length} closed hidden`,
                  )
                : t(
                    "Đang phối hợp với người đã tham gia",
                    "Coordinating with joined recipients",
                  )}
          </span>
          {showArea && <small>SIMULATED</small>}
        </div>
      )}
      {showArea && (
        <div
          className="map-warning-legend"
          aria-label={t(
            "Chú giải dữ liệu đường mô phỏng",
            "Simulated road-data legend",
          )}
        >
          <span className="legend-dark">
            <Moon size={13} />
            {t("Thiếu sáng", "Low light")}
          </span>
          <span className="legend-quiet">
            <Footprints size={13} />
            {t("Vắng", "Quiet")}
          </span>
          <span className="legend-incident">
            <TriangleAlert size={13} />
            {t("Có cảnh báo", "Incident flag")}
          </span>
        </div>
      )}
      {selectedPlace && (
        <section
          className="map-place-card"
          aria-label={`${selectedPlace.name} ${t("Chi tiết", "Details")}`}
        >
          <header>
            <div>
              <h3>{selectedPlace.name}</h3>
              <p>
                {i.replies.some(
                  (r) =>
                    r.memberId === selectedPlace.id && r.state === "ACCEPTED",
                ) ? (
                  <>
                    <CheckCircle2 size={14} />
                    {t("Đã đồng ý tiếp nhận", "Reception confirmed")}
                  </>
                ) : (
                  <>
                    <Clock size={14} />
                    {t(
                      "Đang mở · chưa xác nhận tiếp nhận",
                      "Open · reception unconfirmed",
                    )}
                  </>
                )}
              </p>
            </div>
            <button
              aria-label={t("Đóng chi tiết", "Close details")}
              onClick={() => setSelectedVenue(null)}
            >
              <X size={17} />
            </button>
          </header>
          <PlaceDetails place={selectedPlace} minute={minute} />
        </section>
      )}
      {road && (
        <section
          className="map-road-card"
          aria-label={t("Chi tiết đoạn đường", "Street segment details")}
        >
          <button
            aria-label={t("Đóng cảnh báo đường", "Close road details")}
            onClick={() => setSelectedRoad(null)}
          >
            <X size={16} />
          </button>
          <h3>{road.name}</h3>
          <p>
            {road.condition === "DARK"
              ? t("Đoạn đường thiếu ánh sáng", "Low-light street segment")
              : road.condition === "QUIET"
                ? t(
                    "Đoạn đường ít người qua lại",
                    "Low-footfall street segment",
                  )
                : t(
                    "Đoạn đường có cảnh báo sự cố",
                    "Street segment with an incident flag",
                  )}
          </p>
          <small>
            {t(
              "Tình trạng mô phỏng; chưa kiểm chứng thực địa. Bộ định tuyến dùng dữ liệu này để tăng chi phí đi qua.",
              "Simulated condition; not field verified. The router increases the cost of using this segment.",
            )}
          </small>
        </section>
      )}
      <button
        className="map-3d"
        aria-pressed={threeD}
        onClick={() => {
          setThreeD(!threeD);
          map.current?.easeTo({
            pitch: threeD ? 0 : 50,
            duration: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? 0
              : 500,
          });
        }}
      >
        {threeD ? "2D" : "3D"}
      </button>
      <div className="map-label">
        {i.mode !== "LIVE"
          ? t("BẢN ĐỒ MÔ PHỎNG", "SIMULATED MAP")
          : t("VỊ TRÍ ĐƯỢC CHIA SẺ", "SHARED LOCATION")}
      </div>
      {!ready && !failed && (
        <div className="map-wait" role="status">
          {t("Đang tải bản đồ nền…", "Loading the basemap…")}
        </div>
      )}
      {failed && (
        <div className="map-notice" role="status">
          <p>
            {t(
              "Bản đồ nền chưa tải đủ. Dùng tên điểm và thông tin phương án bên cạnh.",
              "Basemap is incomplete. Refer to the destination and plan details alongside.",
            )}
          </p>
          <button onClick={() => setAttempt((n) => n + 1)}>
            {t("Tải lại bản đồ", "Reload map")}
          </button>
          <details>
            <summary>{t("Chi tiết lỗi", "Error details")}</summary>
            <small>{failed}</small>
          </details>
        </div>
      )}
      {plan && (
        <div className="map-plan">
          <b>{plan.destination}</b>
          <span>
            {plan.route.meters} m ·{" "}
            {plan.acceptedAt
              ? t("Đã chấp nhận", "Accepted")
              : t("Chờ chấp nhận", "Awaiting acceptance")}
          </span>
          {plan.route.steps?.[0] && (
            <span>
              {plan.route.steps[0].street} ·{" "}
              {Math.max(0, plan.route.meters - (plan.progressMeters || 0))} m{" "}
              {t("còn lại", "remaining")}
            </span>
          )}
        </div>
      )}
      {i.reference && (
        <div className="reference-label">
          {i.reference.name} · {i.reference.route.meters} m ·{" "}
          {t("Chưa xác nhận tiếp nhận", "Reception unconfirmed")}
        </div>
      )}
    </div>
  );
}
