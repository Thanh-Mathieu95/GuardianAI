"use client";
// 3D street map. Preserve MapLibre's marker positioning classes across every state update.
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cityAnchor, cityBounds, incidents, nodes, riskyEdges, edges, toLL } from "@/lib/city";
import { assessPlace } from "@/lib/place-context";
import { mapPlaceAppearance, visibleMapPlaces, venueCode } from "@/lib/map-places";
import type { Incident, Point } from "@/lib/types";

type State = Omit<Incident, "owner">;
const STYLE = "https://tiles.openfreemap.org/styles/positron";
const ll = (p: Point): [number, number] => [p.lng, p.lat];
const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const lineF = (pts: Point[], props = {}): GeoJSON.Feature => ({
  type: "Feature",
  properties: props,
  geometry: { type: "LineString", coordinates: pts.map(ll) },
});
const venueIcon: Record<string, string> = { CONVENIENCE: "▣", HOTEL: "H", PHARMACY: "+", CAFE: "☕", RESTAURANT: "♨", PETROL: "P", BANK: "₫", MARKET: "▦", POLICE: "⚑", CLINIC: "+", HOSPITAL: "✚", SECURITY: "◇" };
const el = (cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement("div");
  e.className = cls;
  if (text) e.textContent = text;
  parent?.appendChild(e);
  return e;
};

export default function Map3D({
  state,
  selected,
  showClosed = false,
  scanning,
  tapMove,
  onSelect,
  onTap,
}: {
  state: State;
  selected: string;
  showClosed?: boolean;
  scanning: boolean;
  tapMove: boolean;
  onSelect: (id: string) => void;
  onTap: (p: Point) => void;
}) {
  const box = useRef<HTMLDivElement>(null),
    map = useRef<MLMap | null>(null),
    ml = useRef<typeof import("maplibre-gl") | null>(null),
    markers = useRef(new Map<string, Marker>()),
    props = useRef({ tapMove, onSelect, onTap }),
    drawnRoute = useRef(""),
    drawnFree = useRef(""),
    framedAt = useRef(0),
    focusedStep = useRef(""),
    camera = useRef<(() => void) | null>(null),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    city = state.routeAdapter === "CITY";
  props.current = { tapMove, onSelect, onTap };

  // Map + static layers, once.
  useEffect(() => {
    let dead = false;
    void import("maplibre-gl").then((lib) => {
      if (dead || !box.current) return;
      ml.current = lib;
      const sw = toLL(cityAnchor, { x: cityBounds.minX, y: cityBounds.minY }),
        ne = toLL(cityAnchor, { x: cityBounds.maxX, y: cityBounds.maxY });
      const m = new lib.Map({
        container: box.current,
        style: STYLE,
        bounds: [ll(sw), ll(ne)],
        fitBoundsOptions: { padding: 20 },
        pitch: 50,
        bearing: -18,
        maxPitch: 70,
        attributionControl: { compact: true },
      });
      map.current = m;
      m.addControl(new lib.NavigationControl({ showCompass: true }), "bottom-right");
      const recordCamera = () => {
        box.current?.setAttribute("data-map-pitch", String(m.getPitch()));
        box.current?.setAttribute("data-map-bearing", String(m.getBearing()));
        box.current?.setAttribute("data-map-zoom", String(m.getZoom()));
      };
      m.on("moveend", recordCamera);
      // Compare DOM marker centres with the map's geographic projection after rendering.
      // Read-only diagnostics let the browser regression test catch real drift during zoom/rotation.
      const recordAnchors = () => {
        if (dead || !box.current) return;
        const bounds = m.getContainer().getBoundingClientRect();
        let count = 0, maximum = 0;
        for (const [key, marker] of markers.current) {
          if (!key.startsWith("place:")) continue;
          const projected = m.project(marker.getLngLat()), rect = marker.getElement().getBoundingClientRect();
          maximum = Math.max(maximum, Math.hypot(rect.left + rect.width / 2 - bounds.left - projected.x, rect.top + rect.height / 2 - bounds.top - projected.y));
          count++;
        }
        box.current.setAttribute("data-anchor-count", String(count));
        box.current.setAttribute("data-anchor-error", maximum.toFixed(2));
        box.current.setAttribute("data-anchor-zoom", String(m.getZoom()));
        box.current.setAttribute("data-anchor-bearing", String(m.getBearing()));
        recordCamera();
      };
      m.on("idle", recordAnchors);
      // Layout changes (SOS flips the grid) resize the map and cancel camera moves: re-apply.
      m.on("resize", () => camera.current?.());
      let loaded = false;
      m.on("error", (e) => {
        if (!loaded) setFailed(true);
        console.warn("map", e.error?.message);
      });
      m.on("load", () => {
        loaded = true;
        setFailed(false);
        if (dead) return;
        box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        // Keep upstream shop/POI labels from bypassing the incident's own discovery visibility.
        for (const layer of m.getStyle().layers ?? []) {
          if (layer.type === "symbol" && (/poi/i.test(layer.id) || ("source-layer" in layer && layer["source-layer"] === "poi")))
            m.setLayoutProperty(layer.id, "visibility", "none");
        }
        if (m.getSource("openmaptiles") && !m.getLayer("guardian-buildings")) m.addLayer({
          id: "guardian-buildings", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
          paint: { "fill-extrusion-color": "#dfe2e8", "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": .9 },
        });
        recordCamera();
        m.addSource("risky", {
          type: "geojson",
          data: fc(riskyEdges.map((e) => lineF([toLL(cityAnchor, nodes.get(e.a)!), toLL(cityAnchor, nodes.get(e.b)!)]))),
        });
        m.addLayer({ id: "risky-glow", type: "line", source: "risky", paint: { "line-color": "#d22f27", "line-width": 10, "line-blur": 6, "line-opacity": 0.12 } });
        m.addLayer({ id: "risky", type: "line", source: "risky", paint: { "line-color": "#d22f27", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.8 } });
        m.addSource("incidents", {
          type: "geojson",
          data: fc(
            incidents.map((i) => ({
              type: "Feature",
              properties: { id: i.id, severity: i.severity, kind: i.kind, when: `${i.month} · ~${i.hour}h`, note: i.note, street: i.street },
              geometry: { type: "Point", coordinates: ll(toLL(cityAnchor, i)) },
            })),
          ),
        });
        m.addLayer({
          id: "incident-heat",
          type: "heatmap",
          source: "incidents",
          paint: {
            "heatmap-weight": ["/", ["get", "severity"], 3],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 13, 25, 17, 70],
            "heatmap-intensity": 1.1,
            "heatmap-opacity": 0.75,
            "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, "rgba(210,47,39,0.12)", 0.5, "rgba(210,47,39,0.3)", 1, "rgba(210,47,39,0.55)"],
          },
        });
        m.addLayer({
          id: "incident-dot",
          type: "circle",
          source: "incidents",
          minzoom: 14.5,
          paint: {
            "circle-radius": ["+", 3, ["get", "severity"]],
            "circle-color": ["match", ["get", "kind"], "Đèn đường hỏng", "#a86200", "#d22f27"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
          },
        });
        m.addSource("observed-dark", { type: "geojson", data: fc([]) });
        m.addLayer({ id: "observed-dark", type: "line", source: "observed-dark", paint: { "line-color": "#a86200", "line-width": 5, "line-dasharray": [2, 1], "line-opacity": .9 } });
        m.addSource("routes-old", { type: "geojson", data: fc([]) });
        m.addLayer({ id: "routes-old", type: "line", source: "routes-old", paint: { "line-color": "#8a90a8", "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.6 } });
        m.addSource("route-free", { type: "geojson", data: fc([]) });
        m.addLayer({ id: "route-free", type: "line", source: "route-free", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#2a4cc0", "line-width": 4, "line-dasharray": [2, 1.4] } });
        m.addSource("route", { type: "geojson", data: fc([]), lineMetrics: true });
        m.addLayer({ id: "route-glow", type: "line", source: "route", layout: { "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 11, "line-blur": 0, "line-opacity": 1 } });
        m.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-width": 5, "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "#1b2550", 1, "#2a4cc0"] } });
        const popup = new lib.Popup({ closeButton: false, className: "gm-popup", offset: 10 });
        m.on("click", "incident-dot", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as Record<string, string>,
            body = el("gm-pop");
          el("gm-pop-kind", body, `${p.kind} · ${p.when}`);
          el("", body, p.note);
          el("gm-pop-src", body, `${p.street} · dữ liệu mô phỏng`);
          popup.setLngLat(e.lngLat).setDOMContent(body).addTo(m);
        });
        m.on("mouseenter", "incident-dot", () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", "incident-dot", () => (m.getCanvas().style.cursor = ""));
        setReady(true);
      });
      m.on("click", (e) => {
        if ((e.originalEvent.target as HTMLElement).closest(".gm-marker")) return;
        if (props.current.tapMove) props.current.onTap({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        else if (!m.getLayer("incident-dot") || !m.queryRenderedFeatures(e.point, { layers: ["incident-dot"] }).length) props.current.onSelect("");
      });
    });
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Dynamic data: routes and markers, all using the same geographic coordinates.
  useEffect(() => {
    const m = map.current,
      lib = ml.current;
    if (!ready || !m || !lib) return;
    const plan = state.plans.find((p) => !p.superseded);
    const discovery = !!state.metrics.sosAt;
    for (const layer of ["risky-glow", "risky", "incident-heat", "incident-dot", "observed-dark"])
      m.setLayoutProperty(layer, "visibility", discovery ? "visible" : "none");
    const dark = new Set(state.roadObservations?.map(r => r.edgeId) ?? []);
    (m.getSource("observed-dark") as GeoJSONSource).setData(fc(edges.filter(e => dark.has(e.id)).map(e => lineF([toLL(cityAnchor, nodes.get(e.a)!), toLL(cityAnchor, nodes.get(e.b)!)]))));
    (m.getSource("routes-old") as GeoJSONSource).setData(fc(state.plans.filter((p) => p.superseded).map((p) => lineF(p.route.points))));
    const free = !plan?.acceptedAt ? state.freeRoute : undefined;
    (m.getSource("route-free") as GeoJSONSource).setData(fc(free ? [lineF(free.points)] : []));
    // A newly requested destination: frame the whole walk once so the user sees where it goes.
    if (free && drawnFree.current !== free.id) {
      drawnFree.current = free.id;
      const bounds = free.points.reduce((b, p) => b.extend([p.lng, p.lat]), new lib.LngLatBounds([free.points[0].lng, free.points[0].lat], [free.points[0].lng, free.points[0].lat]));
      m.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 1200 });
      framedAt.current = Date.now();
    }
    (m.getSource("route") as GeoJSONSource).setData(fc(plan ? [lineF(plan.route.points)] : []));
    // Showcase: each step points the camera at what it is about (places called, chosen place, police, attack spot…).
    const focus = state.showcase?.status === "RUNNING" ? state.showcase.focus : undefined, focusKey = state.showcase?.narrationId;
    if (focus?.length && focusKey && focusedStep.current !== focusKey) {
      focusedStep.current = focusKey;
      if (focus.length === 1) m.flyTo({ center: ll(focus[0]), zoom: 16.8, duration: 1400 });
      else m.fitBounds(focus.reduce((b, p) => b.extend(ll(p)), new lib.LngLatBounds(ll(focus[0]), ll(focus[0]))), { padding: 90, maxZoom: 16.8, duration: 1400 });
      framedAt.current = Date.now();
    }
    // Draw-in animation whenever a new route appears.
    if (plan && drawnRoute.current !== plan.route.id) {
      drawnRoute.current = plan.route.id;
      const t0 = performance.now(),
        frame = (now: number) => {
          const t = Math.min(1, (now - t0) / 1400);
          if (!map.current?.getLayer("route")) return;
          m.setPaintProperty(
            "route",
            "line-gradient",
            t < 1
              ? ["interpolate", ["linear"], ["line-progress"], 0, "#1b2550", t, "#2a4cc0", Math.min(1, t + 0.001), "rgba(42,76,192,0)"]
              : ["interpolate", ["linear"], ["line-progress"], 0, "#1b2550", 1, "#2a4cc0"],
          );
          if (t < 1) requestAnimationFrame(frame);
        };
      requestAnimationFrame(frame);
    }
    // HTML markers (keep CSS animations); built with textContent, never innerHTML.
    const want = new Set<string>();
    const put = (id: string, at: Point, build: () => HTMLElement, update: (e: HTMLElement) => void, opts = {}) => {
      want.add(id);
      let mk = markers.current.get(id);
      if (!mk) {
        mk = new lib.Marker({ element: build(), ...opts }).setLngLat(ll(at)).addTo(m);
        markers.current.set(id, mk);
      } else mk.setLngLat(ll(at));
      update(mk.getElement());
    };
    visibleMapPlaces(state, showClosed).forEach((p, idx) => {
      const context = assessPlace(state, p);
      const appearance = mapPlaceAppearance(state, p);
      const partner = p.id.startsWith("partner-"),
        isSel = p.id === selected;
      put(
        "place:" + p.id,
        p,
        () => {
          const e = el("gm-marker gm-place");
          e.tabIndex = 0; e.setAttribute("role", "button");
          el("gm-ping", e);
          el("gm-dot", e);
          el("gm-label", e);
          e.addEventListener("click", (ev) => {
            ev.stopPropagation();
            props.current.onSelect(e.dataset.sel === "1" ? "" : e.dataset.id!);
          });
          e.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); e.click(); } });
          return e;
        },
        (e) => {
          e.dataset.id = p.id;
          e.dataset.kind = p.profile?.kind ?? "UNKNOWN";
          e.dataset.affiliation = appearance.group;
          e.dataset.availability = appearance.availability;
          e.dataset.sel = isSel ? "1" : "";
          // Never assign className here: addTo() adds maplibregl-marker and its anchor class.
          // Removing those makes the element participate in normal flow, so it drifts on zoom.
          for (const status of ["UNKNOWN", "CONTACTED", "CONFIRMED", "DECLINED"]) e.classList.toggle(status, p.supportStatus === status);
          e.classList.toggle("partner", partner);
          e.classList.toggle("sel", isSel);
          e.classList.toggle("dest", p.id === plan?.selectedPlaceId);
          e.classList.toggle("venue-closed", appearance.closed);
          e.classList.toggle("support-list", appearance.listed);
          e.classList.toggle("reference-place", !appearance.listed);
          const major = ["a", "b", "c", "police", "hospital-demo"].includes(p.id) || p.supportStatus === "CONTACTED";
          e.classList.toggle("venue-major", major); e.classList.toggle("venue-minor", !major);
          e.title = `${p.name} · ${appearance.groupLabel} · ${appearance.availabilityLabel} · ${context.hours?.label ?? "Giờ chưa xác minh"} · ${context.blockers[0] ?? context.reasons[0]}`;
          e.setAttribute("aria-label", e.title);
          (e.children[0] as HTMLElement).style.animationDelay = `${(idx % 4) * 0.55}s`;
          e.children[1].textContent = p.supportStatus === "CONFIRMED" ? "✓" : venueIcon[p.profile?.kind ?? ""] ?? String(idx + 1);
          e.children[2].textContent = `${venueCode(state.places, p.id)} · ${p.name}`;
        },
        { anchor: "center", offset: [0, 0], pitchAlignment: "viewport", rotationAlignment: "viewport" },
      );
    });
    if (free?.points.length)
      put("free-target", free.points[free.points.length - 1], () => el("gm-marker gm-target", undefined, "◎"), (e) => {
        e.title = `${free.target} · ${free.distanceMeters ?? "?"} m · nơi bạn chọn, chưa xác nhận tiếp nhận`;
        e.dataset.label = free.target;
      });
    if (state.trip)
      put("home", state.trip.destination, () => el("gm-marker gm-home", undefined, "⌂"), (e) => (e.title = state.trip!.destination.label));
    state.plans.forEach((p) => {
      if (p.route.darkAt) put("dark:" + p.id, p.route.darkAt, () => el("gm-marker gm-dark", undefined, "☾"), e => { e.title = "Đoạn vừa báo tối · tuyến cũ đã được kiểm tra lại"; });
      const at = p.route.blocked && (p.route.blockedAt || p.route.points[1]);
      if (at) put("blocked:" + p.id, at, () => el("gm-marker gm-blocked", undefined, "✕"), () => {});
    });
    put(
      "radar",
      state.location,
      () => {
        const e = el("gm-radar");
        el("gm-radar-beam", e);
        return e;
      },
      (e) => e.classList.toggle("on", scanning),
      { pitchAlignment: "map", rotationAlignment: "map" },
    );
    put(
      "user",
      state.location,
      () => {
        const e = el("gm-marker gm-user");
        el("gm-user-dot", e);
        el("gm-user-label", e, "Bạn");
        return e;
      },
      (e) => e.classList.toggle("stale", state.location.stale),
    );
    for (const [id, mk] of markers.current)
      if (!want.has(id)) {
        mk.remove();
        markers.current.delete(id);
      }
  }, [ready, state, selected, scanning, showClosed]);

  // Camera: fly in when SOS starts; follow the walker while navigating.
  const following = scanning || !!state.nav;
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (!city) {
      const pts = [state.location, ...state.places];
      const lng = pts.map((p) => p.lng),
        lat = pts.map((p) => p.lat);
      m.fitBounds([[Math.min(...lng) - 0.003, Math.min(...lat) - 0.003], [Math.max(...lng) + 0.003, Math.max(...lat) + 0.003]], { padding: 40, pitch: 50, bearing: -18, duration: 800 });
      camera.current = null;
    } else {
      const at = ll(state.location);
      camera.current = following ? () => m.easeTo({ center: at, zoom: Math.max(m.getZoom(), 16.2), pitch: m.getPitch(), bearing: m.getBearing(), duration: 800 }) : null;
      // Let the user see a just-drawn route in full before the camera returns to following them.
      if (Date.now() - framedAt.current > 6000) camera.current?.();
    }
  }, [ready, city, following, state.location.lat, state.location.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={"map3d " + (tapMove ? "tap-move" : "")}>
      <div ref={box} className="map3d-gl" aria-label="Bản đồ đường phố 3D: các điểm neo tại tọa độ khi zoom và xoay" />
      <span className="map-flat-label">3D · Điểm neo theo tọa độ</span>
      {failed && <div className="map3d-fail">Không tải được bản đồ nền — cần kết nối mạng.</div>}
    </div>
  );
}
