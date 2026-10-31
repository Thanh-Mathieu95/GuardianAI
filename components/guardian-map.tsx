"use client";
import { useEffect, useRef, useState } from "react";
import type { Incident } from "@/lib/types";
import { useLanguage } from "./language";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapType, GeoJSONSource, Marker } from "maplibre-gl";
export default function GuardianMap({ incident: i }: { incident: Incident }) {
  const { t } = useLanguage(),
    box = useRef<HTMLDivElement>(null),
    map = useRef<MapType | null>(null),
    markers = useRef<Marker[]>([]),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  const plan = i.plans.findLast((p) => !p.invalidatedAt);
  useEffect(() => {
    let disposed = false;
    void import("maplibre-gl")
      .then((lib) => {
        if (disposed || !box.current) return;
        const m = new lib.Map({
          container: box.current,
          style: "https://tiles.openfreemap.org/styles/positron",
          center: i.location
            ? [i.location.lng, i.location.lat]
            : [106.7058, 10.772],
          zoom: 16,
          pitch: 30,
          attributionControl: { compact: true },
        });
        map.current = m;
        m.addControl(new lib.NavigationControl(), "top-right");
        m.on("load", () => {
          if (disposed) return;
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
            paint: { "line-color": "#2a4cc0", "line-width": 5 },
          });
          setReady(true);
        });
        m.on("error", () => setFailed(true));
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);
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
        el.textContent = p.confirmed
          ? "✓"
          : p.label === t("Bạn", "You")
            ? "●"
            : "○";
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
      if (points.length) {
        const bounds = new lib.LngLatBounds();
        points.forEach((p) => bounds.extend([p.lng, p.lat]));
        m.fitBounds(bounds, {
          padding: 70,
          maxZoom: 17,
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 900,
        });
      } else if (i.location)
        m.easeTo({ center: [i.location.lng, i.location.lat], duration: 600 });
    });
  }, [ready, i.updatedAt]);
  return (
    <div className="guardian-map">
      <div ref={box} className="map-canvas" />
      <div className="map-label">
        {i.mode === "DEMO"
          ? t("BẢN ĐỒ MÔ PHỎNG", "SIMULATED MAP")
          : t("VỊ TRÍ ĐƯỢC CHIA SẺ", "SHARED LOCATION")}
      </div>
      {!ready && (
        <div className="map-wait" role="status">
          {t("Đang tải bản đồ nền…", "Loading the basemap…")}
        </div>
      )}
      {failed && (
        <div className="map-notice" role="status">
          {t(
            "Bản đồ nền chưa tải đủ. Dùng tên điểm và thông tin phương án bên cạnh.",
            "Basemap is incomplete. Refer to the destination and plan details alongside.",
          )}
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
        </div>
      )}
    </div>
  );
}
