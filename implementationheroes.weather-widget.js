(function () {
  // Minimal DOM helper
  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "style" && typeof attrs[k] === "object") Object.assign(el.style, attrs[k]);
      else if (k.startsWith("on") && typeof attrs[k] === "function") el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(c => el.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return el;
  }

  // UI strings
  const STR = {
    loading: "Loading weather…",
    notSet: "Profile location empty. Using fallback.",
    errorPrefix: "Error: "
  };

  // JSON Schema for the widget settings dialog in Studio
  const configurationSchema = {
    type: "object",
    properties: {
      useProfileLocation: { type: "boolean", title: "Use user.profile location", default: true },
      locationFieldKey: { type: "string", title: "Profile field key", default: "location" },
      fallbackCity: { type: "string", title: "Fallback city if profile is empty", default: "New York, US" },
      defaultUnits: { type: "string", title: "Default units", enum: ["imperial", "metric"], default: "imperial" },
      showCredit: { type: "boolean", title: "Show WeatherAPI credit link", default: false }
    }
  };

  // Geocode city name with Open-Meteo (no API key)
  async function geocode(city) {
    const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
    u.searchParams.set("name", city);
    u.searchParams.set("count", "1");
    u.searchParams.set("language", "en");
    const r = await fetch(u.toString(), { cache: "no-store" });
    if (!r.ok) throw new Error("Geocoding " + r.status);
    const j = await r.json();
    const item = j && j.results && j.results[0];
    if (!item) throw new Error("City not found: " + city);
    return { lat: item.latitude, lon: item.longitude, name: item.name, country: item.country };
  }

  // Fetch current weather from Open-Meteo (no API key)
  async function fetchWeather(lat, lon) {
    const u = new URL("https://api.open-meteo.com/v1/forecast");
    u.searchParams.set("latitude", String(lat));
    u.searchParams.set("longitude", String(lon));
    u.searchParams.set("current", "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m");
    u.searchParams.set("timezone", "auto");
    u.searchParams.set("temperature_unit", "celsius");
    u.searchParams.set("wind_speed_unit", "kmh");
    const r = await fetch(u.toString(), { cache: "no-store" });
    if (!r.ok) throw new Error("Weather " + r.status);
    return r.json();
  }

  function codeToText(code) {
    const m = {
      0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
      45: "Fog", 48: "Freezing fog",
      51: "Light drizzle", 53: "Moderate drizzle", 55: "Heavy drizzle",
      56: "Light freezing drizzle", 57: "Heavy freezing drizzle",
      61: "Light rain", 63: "Moderate rain", 65: "Heavy rain",
      66: "Light freezing rain", 67: "Heavy freezing rain",
      71: "Light snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
      80: "Light rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
      85: "Light snow showers", 86: "Heavy snow showers",
      95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail"
    };
    return m[code] || "Unknown";
  }

  // Staffbase factory uses (Base, widgetApi) => class extends Base
  const factory = (Base, widgetApi) => {
    return class WeatherBlock extends Base {
      constructor() {
        super();
        this._root = null;
        this._state = { loading: false, error: null, lastUpdated: null, data: null };
      }

      async _resolveCity(cfg) {
        if (cfg.useProfileLocation) {
          try {
            const user = await widgetApi.getUserInformation(); // has "location" system field
            const key = cfg.locationFieldKey || "location";
            const val = user && user[key] ? String(user[key]).trim() : "";
            if (val) return val;
          } catch (_) {
            // ignore and fallback
          }
        }
        return (cfg.fallbackCity || "New York, US").trim();
      }

      async _load(cfg) {
        try {
          this._set({ loading: true, error: null });
          const city = await this._resolveCity(cfg);
          const g = await geocode(city);
          const j = await fetchWeather(g.lat, g.lon);
          const cur = j.current || {};
          const tz = j.timezone || "UTC";
          const localtime = new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date());
          const tempC = Number(cur.temperature_2m);
          const windKph = Number(cur.wind_speed_10m);
          const data = {
            location: { name: g.name, region: "", country: g.country, localtime },
            current: {
              temp_c: tempC,
              temp_f: tempC * 9 / 5 + 32,
              condition: { text: codeToText(Number(cur.weather_code) || 0), icon: "", code: Number(cur.weather_code) || 0 },
              wind_kph: windKph,
              wind_mph: windKph / 1.609,
              humidity: Number(cur.relative_humidity_2m)
            }
          };
          this._set({ data, loading: false, error: null, lastUpdated: new Date() });
        } catch (e) {
          this._set({ loading: false, error: e && e.message ? e.message : "Request failed" });
        }
      }

      _set(patch) {
        this._state = Object.assign({}, this._state, patch);
        if (this._root) this._render();
      }

      _render() {
        const cfg = this.props?.config || {};
        const useF = (cfg.defaultUnits || "imperial") === "imperial";
        const s = this._state;

        this._root.innerHTML = "";

        const card = h("div", {
          style: {
            border: "1px solid #e5e7eb", borderRadius: "12px", padding: "16px",
            width: "320px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            position: "relative", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
          },
          "aria-live": "polite"
        }, []);

        const refreshBtn = h("button", {
          title: "Refresh", "aria-label": "Refresh weather",
          style: { position: "absolute", top: "10px", right: "10px", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "6px", background: "white", cursor: "pointer" },
          onclick: () => this._load(cfg)
        }, [
          (() => { const svg = h("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, []);
            svg.appendChild(h("path", { d: "M20 12a8 8 0 1 1-2.34-5.66", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }));
            svg.appendChild(h("path", { d: "M20 4v6h-6", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }));
            return svg; })()
        ]);
        card.appendChild(refreshBtn);

        const status = h("div", { style: { fontSize: "14px", color: "#111827" } }, []);
        const details = h("div", { style: { marginTop: "12px", fontSize: "14px" } }, []);
        card.appendChild(status); card.appendChild(details);
        this._root.appendChild(card);

        if (s.loading) {
          status.textContent = STR.loading;
          return;
        }
        if (s.error) {
          status.textContent = "";
          details.innerHTML = `<div style="color:#b91c1c">${STR.errorPrefix}${s.error}</div>`;
          return;
        }
        if (!s.data) {
          status.textContent = "";
          return;
        }

        const temp = useF ? s.data.current.temp_f : s.data.current.temp_c;

        const row = h("div", { style: { display: "flex", alignItems: "center", gap: "12px" } }, []);
        const meta = h("div", {}, [
          h("div", { style: { fontSize: "18px", fontWeight: "600" } }, [s.data.location.name]),
          h("div", { style: { fontSize: "12px", color: "#6b7280" } }, [
            (s.data.location.region ? s.data.location.region + ", " : "") + s.data.location.country
          ]),
          h("div", { style: { fontSize: "12px", color: "#6b7280" } }, [s.data.location.localtime])
        ]);
        const t = h("div", { style: { marginLeft: "auto", fontSize: "28px", fontWeight: "700" } }, [
          Math.round(temp) + "°" + (useF ? "F" : "C")
        ]);
        row.appendChild(meta); row.appendChild(t); details.appendChild(row);

        const line = h("div", { style: { display: "flex", gap: "16px", marginTop: "8px", color: "#374151", fontSize: "13px" } }, [
          h("span", {}, ["Wind " + (useF ? Math.round(s.data.current.wind_mph) + " mph" : Math.round(s.data.current.wind_kph) + " kph")]),
          h("span", {}, ["Humidity " + s.data.current.humidity + "%"])
        ]);

        const toggleWrap = h("span", { style: { marginLeft: "auto" } }, []);
        toggleWrap.appendChild(h("button", {
          title: "Toggle units", "aria-label": "Toggle units",
          style: { border: "1px solid #e5e7eb", borderRadius: "6px", padding: "2px 6px", background: "white", cursor: "pointer" },
          onclick: () => {
            const next = (this.props?.config?.defaultUnits || "imperial") === "imperial" ? "metric" : "imperial";
            this.props.config.defaultUnits = next;  // store in-memory for this render
            this._render();
          }
        }, ["°F | °C"]));

        const flex = h("div", { style: { display: "flex", gap: "16px", marginTop: "8px", color: "#374151", fontSize: "13px" } }, []);
        flex.appendChild(line.firstChild);
        flex.appendChild(line.lastChild);
        flex.appendChild(toggleWrap);
        details.appendChild(flex);

        if (this._state.lastUpdated) {
          details.appendChild(h("div", { style: { marginTop: "8px", fontSize: "12px", color: "#6b7280" } }, [
            "Updated " + this._state.lastUpdated.toLocaleTimeString()
          ]));
        }

        if (this.props?.config?.showCredit) {
          const credit = h("div", { style: { marginTop: "6px", fontSize: "11px", color: "#6b7280" } }, []);
          const a = h("a", { href: "https://www.weatherapi.com/", target: "_blank", rel: "noreferrer" }, ["WeatherAPI.com"]);
          credit.appendChild(document.createTextNode("Powered by "));
          credit.appendChild(a);
          details.appendChild(credit);
        }
      }

      renderBlock(container) {
        this._root = container;
        this._render();
        this._load(this.props?.config || {});
      }

      destroy() {
        if (this._root) this._root.innerHTML = "";
        this._root = null;
      }
    };
  };

  const blockDefinition = {
    name: "weather-widget",
    label: "Weather - profile location",
    factory,
    blockLevel: "block",
    configurationSchema
  };

  const external = { blockDefinition, author: "Implementation Heroes", version: "0.1.0" };

  // Register now or as soon as Staffbase provides defineBlock
  (function tryRegister() {
    if (typeof window !== "undefined" && typeof window.defineBlock === "function") {
      window.defineBlock(external);
    } else {
      setTimeout(tryRegister, 50);
    }
  })();
})();
