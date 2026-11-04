// A dated route remains visible until closed. Explicit selection is always ownership-bound.
import {today} from './hub.js';
export async function findDriverRoute(env,driverId,routeId=null){
 if(routeId)return env.DB.prepare("SELECT * FROM routes WHERE id=? AND driver_id=? AND status IN ('assigned','started')").bind(routeId,driverId).first();
 return env.DB.prepare("SELECT * FROM routes WHERE driver_id=? AND status IN ('assigned','started') ORDER BY CASE WHEN status='started' THEN 0 WHEN route_date=? AND offer_status='accepted' THEN 1 WHEN offer_status='pending' THEN 2 WHEN route_date=? THEN 3 ELSE 4 END,CASE WHEN route_date=? THEN 0 ELSE 1 END,route_date,created_at DESC LIMIT 1").bind(driverId,today(),today(),today()).first();
}
export async function pendingDriverOffers(env,driverId){
 return (await env.DB.prepare("SELECT id,route_date,stop_count,dispatch_mode,offered_at FROM routes WHERE driver_id=? AND status='assigned' AND offer_status='pending' ORDER BY route_date,created_at DESC LIMIT 50").bind(driverId).all()).results||[];
}
