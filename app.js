// Mobile menu toggle
document.addEventListener('DOMContentLoaded', () => {
  const menuBtn = document.getElementById('menu-toggle');
  const navMenu = document.getElementById('nav-menu');
  if (menuBtn && navMenu) {
    menuBtn.addEventListener('click', () => navMenu.classList.toggle('open'));
  }
});

// HAMK search logic
const NGO_DATA = [
  { id: "ngo1", name: "Hope Foundation", lat: 28.9845, lon: 77.7064, city: "Meerut", state: "UP", phone: "+91 90000 00001", url: "https://example.org/hope" },
  { id: "ngo2", name: "ClothCare NGO", lat: 28.6139, lon: 77.2090, city: "New Delhi", state: "DL", phone: "+91 90000 00002", url: "https://example.org/clothcare" },
  { id: "ngo3", name: "WarmHands", lat: 29.4727, lon: 77.7085, city: "Muzaffarnagar", state: "UP", phone: "+91 90000 00003", url: "https://example.org/warmhands" },
  { id: "ngo4", name: "Share & Wear", lat: 28.4646, lon: 77.0299, city: "Gurugram", state: "HR", phone: "+91 90000 00004", url: "https://example.org/sharewear" }
];

function toRadians(deg){return (deg*Math.PI)/180}
function distanceKm(aLat,aLon,bLat,bLon){const R=6371;const dLat=toRadians(bLat-aLat);const dLon=toRadians(bLon-aLon);const lat1=toRadians(aLat);const lat2=toRadians(bLat);const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))}

async function geocode(query){
  const resp=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`,{headers:{"Accept":"application/json"}});
  if(!resp.ok) throw new Error('Failed to geocode');
  const data=await resp.json();
  if(!Array.isArray(data)||data.length===0) throw new Error('Location not found');
  const {lat,lon,display_name}=data[0];
  return {lat:parseFloat(lat),lon:parseFloat(lon),label:display_name};
}

// Overpass API search for nearby NGOs / donation-social facilities only
async function searchPlacesNear(origin){
  const radiusMeters = 20000; // 20km
  const query = `
    [out:json][timeout:25];
    (
      nwr["office"="ngo"](around:${radiusMeters},${origin.lat},${origin.lon});
      nwr["charity"]["charity"!="no"](around:${radiusMeters},${origin.lat},${origin.lon});
      nwr["amenity"="social_facility"]["social_facility"~"outreach|shelter|charity|clothes|clothing", i](around:${radiusMeters},${origin.lat},${origin.lon});
      nwr["donation:clothes"="yes"](around:${radiusMeters},${origin.lat},${origin.lon});
      nwr["donation"~"clothes|clothing|garment", i](around:${radiusMeters},${origin.lat},${origin.lon});
    );
    out center;`;
  const resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
  if(!resp.ok) return null;
  const data = await resp.json();
  if(!data || !Array.isArray(data.elements)) return null;
  const mapped = data.elements.map((el,i)=>{
    const tags = el.tags || {};           
    const name = (tags.name || tags.operator || 'NGO');
    const lat = el.lat || (el.center && el.center.lat);
    const lon = el.lon || (el.center && el.center.lon);
    const city = (tags['addr:city'] || tags['addr:district'] || '');
    const state = (tags['addr:state'] || '');
    const url = (tags.website || tags['contact:website'] || '');
    const phone = (tags.phone || tags['contact:phone'] || '');
    return { id: el.id || `ovp-${i}`, name, lat, lon, city, state, phone, url, tags };
  }).filter(x=>x.lat!=null && x.lon!=null)
  .filter(x=>{
    const t = x.tags || {};
    const isNgo = t.office === 'ngo';
    const isCharity = typeof t.charity !== 'undefined' && t.charity !== 'no';
    const isSocial = t.amenity === 'social_facility' && /outreach|shelter|charity|clothes|clothing/i.test(t.social_facility||'');
    const isDonation = t['donation:clothes'] === 'yes' || (t.donation && /cloth|garment/i.test(t.donation));
    const allowed = isNgo || isCharity || isSocial || isDonation;
    const excludedAmenity = ['clinic','doctors','hospital','pharmacy','restaurant','cafe','bar','bank','atm','school','college','university','furniture','nursing_home'].includes(t.amenity);
    const isShop = !!t.shop;
    const isHealthcare = !!t.healthcare;
    const isNursingHome = (t.social_facility && /nursing_home|assisted_living|group_home|residential|day_care/i.test(t.social_facility));
    return allowed && !excludedAmenity && !isShop && !isHealthcare && !isNursingHome;
  })       
  .map(({tags, ...rest})=>rest);
  return mapped;
}

function renderResults(origin, ngos){
  const results=document.getElementById('results');
  if(!results) return;
  const sorted=ngos.map(n=>({...n,distanceKm:distanceKm(origin.lat,origin.lon,n.lat,n.lon)})).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,10);
  if(sorted.length===0){results.innerHTML='<div class="results-hint">No NGOs found near your location.</div>';return}
  const items=sorted.map(n=>`<li class="ngo-item"><h4>${n.name}</h4><div class="ngo-meta">${n.city}${n.state?`, ${n.state}`:''} • ${n.distanceKm.toFixed(1)} km away</div><div class="ngo-actions">${n.url?`<a class=\"link\" href=\"${n.url}\" target=\"_blank\" rel=\"noopener\">Visit</a>`:''}${n.phone?`<a class=\"link\" href=\"tel:${(n.phone||'').replace(/\\s/g,'')}\">Call</a>`:''}</div></li>`).join('');
  results.innerHTML=`<div class="results-hint">Showing NGOs near you</div><ul class="ngo-list">${items}</ul>`;
}

async function handleSearch(){
  const input=document.getElementById('location-input');
  const results=document.getElementById('results');
  if(!input||!results) return;
  results.innerHTML='<div class="results-hint">Searching…</div>';
  try{
    const origin=await geocode(input.value.trim());
    const places=await searchPlacesNear(origin);
    const data=(places&&places.length)?places:NGO_DATA;
    renderResults(origin, data);
    renderMap(origin, data);
  }catch(e){results.innerHTML=`<div class="results-hint">${e.message||'Could not find that location.'}</div>`}
}

function handleGeolocate(){
  const results=document.getElementById('results');
  if(!navigator.geolocation){ if(results)results.innerHTML='<div class="results-hint">Geolocation not supported. Type your city instead.</div>'; return }
  if(results)results.innerHTML='<div class="results-hint">Getting your location…</div>';
  navigator.geolocation.getCurrentPosition(async p=>{
    const origin={lat:p.coords.latitude,lon:p.coords.longitude};
    const places=await searchPlacesNear(origin);
    const data=(places&&places.length)?places:NGO_DATA;
    renderResults(origin, data);
    renderMap(origin, data);
  },e=>{
    const insecure = location.protocol!=='https:' && location.hostname!=='localhost';
    const msg = e && e.code===1 ? 'Location permission denied. Type your city above.' : (insecure ? 'Geolocation requires HTTPS. Open via HTTPS or type your city.' : 'Could not get location. Type your city above.');
    if(results)results.innerHTML=`<div class="results-hint">${msg}</div>`;
  },{enableHighAccuracy:true,timeout:15000,maximumAge:0})
}

document.addEventListener('DOMContentLoaded',()=>{
  const input=document.getElementById('location-input');
  const searchBtn=document.getElementById('search-btn');
  const geoBtn=document.getElementById('use-my-location');
  if(input){input.addEventListener('keydown',e=>{if(e.key==='Enter')handleSearch()})}
  if(searchBtn)searchBtn.addEventListener('click',handleSearch);
  if(geoBtn)geoBtn.addEventListener('click',handleGeolocate);
});

// Leaflet map rendering
let mapInstance=null; let markersLayer=null;
function ensureMap(origin){
  const mapDiv=document.getElementById('map');
  if(!mapDiv || !window.L) return null;
  if(!mapInstance){
    mapInstance=L.map('map').setView([origin.lat,origin.lon], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance);
    markersLayer=L.layerGroup().addTo(mapInstance);
  }
  return mapInstance;
}
function renderMap(origin, ngos){
  const map=ensureMap(origin);
  if(!map || !markersLayer) return;
  markersLayer.clearLayers();
  L.marker([origin.lat, origin.lon]).addTo(markersLayer).bindPopup('You are here');
  ngos.forEach(n=>{
    L.marker([n.lat, n.lon]).addTo(markersLayer).bindPopup(`<strong>${n.name}</strong><br>${(n.city||'')}${n.state?`, ${n.state}`:''}`);
  });
  const bounds=L.latLngBounds([[origin.lat,origin.lon]]);
  ngos.forEach(n=>bounds.extend([n.lat,n.lon]));
  if(bounds.isValid()) map.fitBounds(bounds.pad(0.2));
}


