"use client";
import { useEffect, useRef, useState } from "react";
import type { Incident } from "@/lib/types";
import { useLanguage } from "./language";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapType, GeoJSONSource, Marker } from "maplibre-gl";
import { places, isOpen } from "@/lib/city";
export default function GuardianMap({ incident: i }: { incident: Incident }) {
  const { t } = useLanguage(),
    box = useRef<HTMLDivElement>(null),
    map = useRef<MapType | null>(null),
    markers = useRef<Marker[]>([]),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [threeD, setThreeD] = useState(true);
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
          for(const layer of m.getStyle().layers){
            if(layer.type==='symbol'&&layer.layout?.['text-field']){m.setPaintProperty(layer.id,'text-color','#b3c4d4');m.setPaintProperty(layer.id,'text-halo-color','#080f18');m.setPaintProperty(layer.id,'text-halo-width',1.4);}
            if(layer.type==='line'&&/road|street|highway|transportation/.test(layer.id)&&!/rail|bridge|tunnel|case/.test(layer.id))m.setPaintProperty(layer.id,'line-color','#435b70');
          }
          m.addSource("route", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          m.addLayer({
            id: "route-casing",
            type: "line",
            source: "route",
            paint: { "line-color": "#ffffff", "line-width": 10 },
          });
          m.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            paint: { "line-color": "#3be1bd", "line-width": 5 },
          });
          for (const [id, color, dash] of [
            ["history", "#718096", false],
            ["reference", "#7db7ff", true],
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
                "fill-extrusion-color": "#24394a",
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
    const m = map.current;
    if (!m || !ready) return;
    void import("maplibre-gl").then((lib) => {
      if (map.current !== m) return;
      markers.current.forEach((x) => x.remove());
      markers.current = [];
      const locations = [
        ...(i.location
          ? [{ point: i.location, label: t("Bạn", "You"), confirmed: false }]
          : []),
        ...(i.mode === "DEMO" && i.sosAt
          ? places
              .filter(
                (p) => isOpen(p) && !i.replies.some((r) => r.memberId === p.id),
              )
              .map((p) => ({ point: p.point, label: p.name, confirmed: false }))
          : []),
        ...i.replies
          .filter((r) => r.role === "PARTNER" && r.location)
          .map((r) => ({
            point: r.location!,
            label: r.name,
            confirmed: r.state === "ACCEPTED",
          })),
      ];
      for (const p of locations) {
        const el = document.createElement("button");
        el.className = "venue-pin";
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
        svg.appendChild(mark);
        el.appendChild(svg);
        el.setAttribute("aria-label", p.label);
        el.title = p.label;
        const popup = new lib.Popup({ offset: 20 }).setText(p.label);
        markers.current.push(
          new lib.Marker({ element: el })
            .setLngLat([p.point.lng, p.point.lat])
            .setPopup(popup)
            .addTo(m),
        );
      }
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
      const focusPoints = i.reference?.route.points || points;
      const nextCameraKey = `${i.id}:${i.reference?.name || plan?.id || "overview"}`;
      if (focusPoints.length && cameraKey.current !== nextCameraKey) {
        const bounds = new lib.LngLatBounds();
        focusPoints.forEach((p) => bounds.extend([p.lng, p.lat]));
        m.fitBounds(bounds, {
          padding: 70,
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
  }, [ready, i.updatedAt, i.reference?.name]);
  return (
    <div className="guardian-map">
      <div ref={box} className="map-canvas" />
      <button
        className="map-3d"
        aria-pressed={threeD}
        onClick={() => {
          setThreeD(!threeD);
          map.current?.easeTo({ pitch: threeD ? 0 : 50, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500 });
        }}
      >
        {threeD ? "2D" : "3D"}
      </button>
      <div className="map-label">
        {i.mode === "DEMO"
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
