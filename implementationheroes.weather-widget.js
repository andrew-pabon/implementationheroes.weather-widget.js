(function () {
  /* ---------- tiny DOM helper ---------- */
  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "style" && typeof attrs[k] === "object") Object.assign(el.style, attrs[k]);
        else if (k.startsWith("on") && typeof attrs[k] === "function") el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else el.setAttribute(k, attrs[k]);
      }
    }
    (kids || []).forEach(c => el.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return el;
  }

  /* ---------- strings and settings schema ---------- */
  const STR = { loading: "Loading weather…", error: "Error: " };

  const configurationSchema = {
    type: "object",
    properties: {
      useProfileLocation: { type: "boolean", title: "Use user.profile location", default: true },
      locationFieldKey:  { type: "string",  title: "Profile field key",        default: "location" },
      fallbackCity:      { type: "string",  title: "Fallback city",            default: "New York, US" },
      defaultUnits:      { type: "string",  title: "Default units",            enum: ["imperial", "metric"], default: "imperial" },
      showCredit:        { type: "boolean", title: "Show WeatherAPI credit",   default: false }
    }
  };

  /* ---------- helper funcs (no API key required) ---------- */
  async function geocode(city) {
    const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
    u.searchParams.set("name", city);
    u.searchParams.set("count", "1");
    const r = await fetch(u.toString(), { cache: "no-store" });
    if (!r.ok) throw new Error("Geocoding " + r.status);
    const j = await r.json();
    const res = j?.results?.[0];
    if (!res) throw new Error("City not found: " + city);
    return { lat: res.latitude, lon: res.longitude, name: res.name, country: res.country };
  }

  async function fetchWeather(lat, lon) {
    const u = new URL("https://api.open-meteo.com/v1/forecast");
    u.searchParams.set("latitude", lat);
    u.searchParams.set("longitude", lon);
    u.searchParams.set("current", "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m");
    u.searchParams.set("timezone", "auto");
    const r = await fetch(u.toString(), { cache: "no-store" });
    if (!r.ok) throw new Error("Weather " + r.status);
    return r.json();
  }

  const W_CODES = {
    0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Freezing fog", 51: "Light drizzle", 53: "Moderate drizzle", 55: "Heavy drizzle",
    61: "Light rain", 63: "Moderate rain", 65: "Heavy rain", 71: "Light snow", 73: "Moderate snow",
    75: "Heavy snow", 80: "Light rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    95: "Thunderstorm"
  };
  const codeToText = c => W_CODES[c] || "Unknown";

  /* ---------- Staffbase block factory ---------- */
  const factory = (Base, widgetApi) => class Weather extends Base {
    constructor() {
      super();
      this.state = { loading: false, error: null, data: null };
    }

    async resolveCity(cfg) {
      if (cfg.useProfileLocation) {
        try {
          const user = await widgetApi.getUserInformation();
          const key  = cfg.locationFieldKey || "location";
          const val  = user?.[key]?.trim();
          if (val) return val;
        } catch { /* silent fallback */ }
      }
      return (cfg.fallbackCity || "New York, US").trim();
    }

    async load(cfg) {
      try {
        this.update({ loading: true, error: null });
        const city = await this.resolveCity(cfg);
        const g    = await geocode(city);
        const w    = await fetchWeather(g.lat, g.lon);
        const cur  = w.current || {};
        const tempC = Number(cur.temperature_2m);
        const data  = {
          name: g.name, country: g.country,
          localtime: new Date().toLocaleString("en-US", { timeZone: w.timezone || "UTC" }),
          tempC, tempF: tempC * 9/5 + 32,
          windKph: cur.wind_speed_10m, windMph: cur.wind_speed_10m / 1.609,
          humidity: cur.relative_humidity_2m,
          text: codeToText(cur.weather_code)
        };
        this.update({ loading: false, data });
      } catch (e) {
        this.update({ loading: false, error: e.message || "Request failed" });
      }
    }

    update(patch) { this.state = { ...this.state, ...patch }; this.render(); }

    render() {
      const cfg = this.props?.config || {};
      const useF = (cfg.defaultUnits === "metric") ? false : true;
      const { loading, error, data } = this.state;

      this.container.innerHTML = "";
      const card = h("div", { style: { border:"1px solid #e5e7eb", borderRadius:"12px", padding:"16px", width:"320px", fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, sans-serif" } }, []);
      this.container.appendChild(card);

      if (loading) { card.appendChild(h("div", null, [STR.loading])); return; }
      if (error)   { card.appendChild(h("div", { style:{color:"#b91c1c"} }, [STR.error + error])); return; }
      if (!data)   { return; }

      card.appendChild(h("div", { style:{fontSize:"18px",fontWeight:600} }, [data.name + ", " + data.country]));
      card.appendChild(h("div", { style:{fontSize:"12px",color:"#6b7280"} }, [data.localtime]));
      card.appendChild(h("div", { style:{fontSize:"48px",fontWeight:700,margin:"8px 0"} }, [
        Math.round(useF ? data.tempF : data.tempC) + "°" + (useF ? "F" : "C")
      ]));
      card.appendChild(h("div", null, [data.text]));
      card.appendChild(h("div", null, [
        "Wind " + (useF ? Math.round(data.windMph) + " mph" : Math.round(data.windKph) + " kph") +
        " – Humidity " + data.humidity + "%"
      ]));

      /* toggle button */
      card.appendChild(h("button", {
        style:{marginTop:"8px",border:"1px solid #e5e7eb",borderRadius:"6px",padding:"4px 8px",cursor:"pointer"},
        onclick: () => { cfg.defaultUnits = useF ? "metric" : "imperial"; this.render(); }
      }, ["Toggle °F / °C"]));

      /* optional credit */
      if (cfg.showCredit) card.appendChild(h("div",{style:{fontSize:"11px",color:"#6b7280",marginTop:"6px"}},[
        "Powered by Open-Meteo"
      ]));
    }

    /* Staffbase calls this */
    renderBlock(container) { this.container = container; this.load(this.props?.config || {}); }
    destroy()              { if (this.container) this.container.innerHTML = ""; }
  };

  /* ---------- register with Staffbase ---------- */
  window.defineBlock({
    name: "weather-profile-widget",
    label: "Weather – profile location",
    blockLevel: "block",
    factory,
    configurationSchema
  });
})();
