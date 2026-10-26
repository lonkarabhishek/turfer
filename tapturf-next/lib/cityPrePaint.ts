import { CITY_COOKIE, CITY_RESERVED_RE } from "./city";

/**
 * Runs as the first thing in <head>, before any paint. It mirrors the
 * tt_city cookie onto <html> (data-city-state, data-city, data-city-src)
 * so CSS shows the right city line and "Make this my city" from the
 * very first frame, with no hydration swap.
 *
 * It also migrates the old localStorage pick (tapturf_city_v1) into the
 * cookie once. When the page just served a different city than that
 * pick, it hides <html> and reloads once before first paint so the
 * proxy serves the right city. Loop-guarded by tapturf_city_mig_v2.
 *
 * Each step has its own try, so a storage error (quota, sandboxed
 * frames) never skips the attributes. A city is a slug that is not
 * reserved (R), the same rule as parseCityCookie's pick.
 * ES5, no other side effects.
 */
export const CITY_PREPAINT_JS = `(function(){
var d=document.documentElement,S=/^[a-z][a-z-]{1,30}$/,R=/${CITY_RESERVED_RE}/,v="";
function rd(){var m=document.cookie.match(/(?:^|;\\s*)${CITY_COOKIE}=([^;]*)/);return m?m[1]:""}
try{v=rd()}catch(e){}
try{var L=window.localStorage;
if(L&&!L.getItem("tapturf_city_mig_v2")){
 var o=L.getItem("tapturf_city_v1");L.setItem("tapturf_city_mig_v2","1");L.removeItem("tapturf_city_autodetect_v1");
 if(o&&S.test(o)&&!R.test(o)&&o!==v&&(v===""||v==="unknown"||v.indexOf("geo.")===0)){
  var served=v.indexOf("geo.")===0?v.slice(4):"";
  document.cookie="${CITY_COOKIE}="+o+"; Path=/; Max-Age=31536000; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"");
  if(rd()===o){v=o;var p=location.pathname;
   if(served!==o&&(p==="/"||p==="/games"||(p==="/turfs"&&!/[?&]q=[^&]/.test(location.search)))){d.style.visibility="hidden";location.reload();return}}
 }
}}catch(e){}
try{
var s="none",c="",src="";
if(v==="all")s="all";else if(v==="unknown")s="unknown";else if(v){var g=v.indexOf("geo.")===0;c=g?v.slice(4):v;if(S.test(c)&&!R.test(c)){s="city";src=g?"geo":"pick"}else c=""}
d.setAttribute("data-city-state",s);if(c){d.setAttribute("data-city",c);d.setAttribute("data-city-src",src)}
}catch(e){}
})();`;
