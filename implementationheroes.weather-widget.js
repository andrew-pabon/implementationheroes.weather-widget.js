/* Weather – profile location widget
   Implementation Heroes – v0.1.0
   (no API key required, uses open-meteo.com) */
(function () {
  /* ---------- tiny DOM helper ---------- */
  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "style" && typeof attrs[k] === "object") Object.assign(el.style, attrs[k]);
      else if (k.startsWith("on") && typeof attrs[k] === "function")
        el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(c => el.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return el;
  }

  /* ---------- settings schema ---------- */
  const configurationSchema = {
    type: "object",
    properties: {
      useProfileLocation : { type: "boolean", title: "Use user.profile location", default: true },
      locationFieldKey   : { type: "string",  title: "Profile field key",       default: "location" },
      fallbackCity       : { type: "string",  title: "Fallback city",            default: "New York, US" },
      defaultUnits       : { type: "string",  title: "Default units", enum:["imperial","metric"], default: "imperial" },
      showCredit         : { type: "boolean", title: "Show credit line",         default: false }
    }
  };

  /* ---------- fetch helpers (Open-Meteo, no key) ---------- */
  async function geocode(city) {
    const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
    u.searchParams.set("name", city);
    u.searchParams.set("count", "1");
    const r = await fetch(u);
    const j = await r.json();
    const hit = j.results?.[0];
    if (!hit) throw new Error("City not found");
    return { lat: hit.latitude, lon: hit.longitude, name: hit.name, country: hit.country };
  }
  async function weather(lat, lon) {
    const u = new URL("https://api.open-meteo.com/v1/forecast");
    u.searchParams.set("latitude",  lat);
    u.searchParams.set("longitude", lon);
    u.searchParams.set("current",   "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m");
    u.searchParams.set("timezone",  "auto");
    const r = await fetch(u);
    return r.json();
  }
  const WTXT = {0:"Clear",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",
    45:"Fog",48:"Freezing fog",51:"Drizzle",53:"Drizzle",55:"Drizzle",
    61:"Rain",63:"Rain",65:"Heavy rain",71:"Snow",73:"Snow",75:"Snow",
    80:"Rain showers",81:"Rain showers",82:"Rain showers",95:"Thunderstorm"};

  /* ---------- widget implementation ---------- */
  function factory(el, ctx){
    const cfg = ctx.config ?? {};
    let units = cfg.defaultUnits === "metric" ? "metric" : "imperial";
    let state = { loading:true };

    const set = patch => { state = { ...state, ...patch }; render(); };

    const render = () => {
      el.innerHTML = "";
      if (state.loading)              return el.append("Loading…");
      if (state.error)               return el.append("Error: "+state.error);

      const d = state.data, useF = units === "imperial";
      el.append(
        h("div",{style:{fontFamily:"system-ui",padding:"12px",border:"1px solid #e5e7eb",borderRadius:"12px",width:"320px",boxShadow:"0 1px 3px rgba(0,0,0,.06)" }},[
          h("div",{style:{fontWeight:600,fontSize:"18px"}},[d.place]),
          h("div",{style:{color:"#6b7280",fontSize:"12px"}},[d.local]),
          h("div",{style:{fontSize:"48px",fontWeight:700,margin:"8px 0"}},
            [Math.round(useF?d.tempF:d.tempC)+"°"+(useF?"F":"C")]),
          h("div",null,[d.text]),
          h("div",null,["Wind "+(useF?Math.round(d.windMph)+" mph":Math.round(d.windKph)+" kph")+" – Humidity "+d.humidity+"%"]),
          h("button",{style:{marginTop:"8px",padding:"4px 8px"},
            onClick:()=>{units=useF?"metric":"imperial";render();}},["Toggle °F / °C"]),
          cfg.showCredit && h("div",{style:{fontSize:"11px",color:"#6b7280",marginTop:"6px"}},["Powered by Open-Meteo"])
        ]));
    };

    (async()=>{ try{
      const city = cfg.useProfileLocation
        ? (await ctx.widgetApi.getUserInformation())[cfg.locationFieldKey||"location"] || cfg.fallbackCity
        : cfg.fallbackCity;
      const g = await geocode(city);
      const w = await weather(g.lat, g.lon);
      const cur = w.current;
      set({ loading:false, data:{
        place : g.name+", "+g.country,
        local : new Date().toLocaleString("en-US",{ timeZone:w.timezone }),
        tempC : cur.temperature_2m,
        tempF : cur.temperature_2m*9/5+32,
        windKph: cur.wind_speed_10m,
        windMph: cur.wind_speed_10m/1.609,
        humidity: cur.relative_humidity_2m,
        text  : WTXT[cur.weather_code] ?? "Weather"
      }}); }
      catch(err){ set({ loading:false, error:err.message }); }
    })();

    return { destroy(){ el.innerHTML=""; } };
  }

  /* ---------- block definition ---------- */
  const blockDefinition = {
    name : "weather-profile-widget",
    label: "Weather – profile location",
    blockLevel:"block",
    factory
  };

  /* ---------- expose to Staffbase Studio ---------- */
  const external = {
    author : "Implementation Heroes",
    version: "0.1.0",
    configurationSchema,
    blockDefinition
  };

  (function register(){
    if (typeof window !== "undefined" && typeof window.defineBlock === "function"){
      window.defineBlock(external);
    } else {
      setTimeout(register, 50);
    }
  })();
})();
