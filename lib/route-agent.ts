import { cityAnchor, cityRoute } from "./city";
import { getRoute } from "./adapters";
import {
  checkSupport,
  emptyNeeds,
  latestSupport,
  supportSignature,
} from "./support";
import type { Incident, Place, Route } from "./types";

// Route worker: creates source-backed options and watches the adopted plan.
// GPT may choose an option; it never supplies geometry or executes a route itself.
export class RouteAgent {
  private watches = new Map<string, string>();
  async options(i: Incident, p: Place, revision: number): Promise<Route[]> {
    const id = `route-${revision}-${p.id}`;
    if (i.routeAdapter !== "CITY") {
      // No invented alternatives if this adapter only returns one verified route.
      return [
        {
          ...(await getRoute(
            i.location,
            p,
            revision,
            i.blockedCount,
            i.routeAdapter,
          )),
          id,
        },
      ];
    }
    const baseline = cityRoute(
      cityAnchor,
      i.location,
      p,
      p.name,
      i.blockedEdges,
      id,
      i.roadObservations?.filter(r => r.kind === "DARK").map(r => r.edgeId),
    );
    const routes = [baseline],
      seen = new Set([JSON.stringify(baseline.points)]);
    // Bounded edge exclusions produce real alternative walks on the same street graph.
    // Extra exclusions are a search strategy, not claims that those streets are unsafe/closed.
    for (const edge of [...new Set(baseline.edges ?? [])].slice(0, 12)) {
      if (routes.length === 3) break;
      try {
        const route = cityRoute(
          cityAnchor,
          i.location,
          p,
          p.name,
          [...(i.blockedEdges ?? []), edge],
          `${id}-alt-${routes.length}`,
          i.roadObservations?.filter(r => r.kind === "DARK").map(r => r.edgeId),
        );
        const geometry = JSON.stringify(route.points);
        if (!seen.has(geometry)) {
          routes.push(route);
          seen.add(geometry);
        }
      } catch {
        /* A graph may have no alternative; retain only actual routes. */
      }
    }
    return routes;
  }
  monitor(i: Incident): string | null {
    if (["CLOSED", "USER_CANCELLED"].includes(i.status)) {
      this.forget(i.id);
      return null;
    }
    const plan = i.plans.find((p) => !p.superseded);
    if (!plan) return null;
    const support = latestSupport(i, plan.selectedPlaceId);
    const checks = checkSupport(support, i.needs ?? emptyNeeds(), plan.route);
    const signature = JSON.stringify([
      plan.id,
      i.location.stale,
      i.needs,
      supportSignature(support),
      checks,
      i.blockedEdges,
      i.roadObservations,
      plan.route.blocked,
    ]);
    if (this.watches.get(i.id) === signature) return null;
    this.watches.set(i.id, signature);
    if (i.location.stale) return "ROUTE_AGENT_LOCATION_STALE";
    if (
      plan.route.edges?.some(edge => i.roadObservations?.some(r => r.edgeId === edge && r.kind === "DARK"))
    ) return "ROAD_DARK";
    if (
      plan.route.blocked ||
      plan.route.edges?.some((edge) => i.blockedEdges?.includes(edge))
    )
      return "ROAD_BLOCKED";
    if (checks.length || plan.supportSignature !== supportSignature(support))
      return "SUPPORT_UPDATED";
    return null;
  }
  forget(id: string) {
    this.watches.delete(id);
  }
}
