/* Staffbase Weather – profile location (no API key required) */
(function () {

  /* --- tiny DOM helper --- */
  function h(t,a,k){const e=document.createElement(t);if(a)for(const p in a){if(p==="style")Object.assign(e.style,a[p]);else if(p.startsWith("on"))e.addEventListener(p.slice(2).toLowerCase(),a[p]);else e.setAttribute(p,a[p]);} (k||[]).forEach(c=>e.appendChild(typeof c==="string"?document.createTextNode(c):c));return e;}

  /* --- settings schema (must be inside blockDefinition) --- */
  const configurationSchema={
    type:"object",
    properties:{
      useProfileLocation:{type:"boolean",title:"Use user.profile location",default:true},
      locationFieldKey:{type:"string",title:"Profile field key",default:"location"},
      fallbackCity:{type:"string",title:"Fallback city",default:"New York, US"},
      defaultUnits:{type:"string",title:"Default units",enum:["imperial","metric"],default:"imperial"},
      showCredit:{type:"boolean",title:"Show credit line",default:false}
    }
  };

  /* --- helper functions (Open-Meteo, key-less) --- */
  async function geocode(c){const u=new URL("https://geocoding-api.open-meteo.com/v1/search");u.searchParams.set("name",c);u.searchParams.set("count","1");const r=await fetch(u);if(!r.ok)throw new Error("Geo "+r.status);const j=await r.json();if(!j.results?.length)throw new Error("City not found");return j.results[0];}
  async function weather(lat,lon){const u=new URL("https://api.open-meteo.com/v1/forecast");u.searchParams.set("latitude",lat);u.searchParams.set("longitude",lon);u.searchParams.set("current","temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m");u.searchParams.set("timezone","auto");const r=await fetch(u);if(!r.ok)throw new Error("Wx "+r.status);return r.json();}
  const WTXT={0:"Clear",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Freezing fog",51:"Drizzle",53:"Drizzle",55:"Drizzle",61:"Rain",63:"Rain",65:"Rain",71:"Snow",73:"Snow",75:"Snow",80:"Rain showers",81:"Rain showers",82:"Rain showers",95:"Thunderstorm"};

  /* --- factory (Base/ctx sig not needed for external bundles) --- */
  function factory(el,ctx){
    const cfg=ctx.config||{};let units=cfg.defaultUnits==="metric"?"metric":"imperial";
    const set=(s)=>{state={...state,...s};render();};
    let state={loading:true};

    const render=()=>{el.innerHTML="";
      if(state.loading)return el.append("Loading…");
      if(state.error)return el.append("Error: "+state.error);
      const d=state.data,useF=units==="imperial";
      el.appendChild(h("div",{style:{fontFamily:"system-ui"}},[
        h("div",{style:{fontWeight:600,fontSize:"18px"}},[d.place]),
        h("div",{style:{color:"#6b7280",fontSize:"12px"}},[d.local]),
        h("div",{style:{fontSize:"48px",fontWeight:700,margin:"8px 0"}},[Math.round(useF?d.tempF:d.tempC)+"°"+(useF?"F":"C")]),
        h("div",null,[d.text]),
        h("div",null,["Wind "+(useF?Math.round(d.windMph)+" mph":Math.round(d.windKph)+" kph")+" – Humidity "+d.humidity+"%"]),
        h("button",{style:{marginTop:"8px",padding:"4px 8px"},onClick:()=>{units=useF?"metric":"imperial";render();}},["Toggle °F / °C"]),
        cfg.showCredit?h("div",{style:{fontSize:"11px",color:"#6b7280",marginTop:"6px"}},["Powered by Open-Meteo"]):null
      ]));};

    (async()=>{try{
      const city=await(async()=>{if(cfg.useProfileLocation){try{const u=await ctx.widgetApi.getUserInformation();const key=cfg.locationFieldKey||"location";const v=u?.[key]?.trim();if(v)return v;}catch{}}return cfg.fallbackCity||"New York, US";})();
      const g=await geocode(city);const w=await weather(g.latitude,g.longitude);const cur=w.current;
      set({loading:false,data:{place:g.name+", "+g.country,local:new Date().toLocaleString("en-US",{timeZone:w.timezone}),tempC:cur.temperature_2m,tempF:cur.temperature_2m*9/5+32,windKph:cur.wind_speed_10m,windMph:cur.wind_speed_10m/1.609,humidity:cur.relative_humidity_2m,text:WTXT[cur.weather_code]||"Weather"}});
    }catch(e){set({loading:false,error:e.message||"failed"});}})();

    return{destroy(){el.innerHTML="";}};
  }

  /* --- ONE required registration --------------- */
  window.defineBlock({
    author:"Implementation Heroes",
    version:"0.1.0",
    blockDefinition:{
      name:"weather-profile-widget",
      label:"Weather – profile location",
      blockLevel:"block",            // mandatory
      factory,
      configurationSchema            // <- now inside blockDefinition
    }
  });

})();
