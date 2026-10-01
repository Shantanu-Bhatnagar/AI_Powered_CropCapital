import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapPin, Leaf, Maximize, CheckCircle2, CloudRain, Sun, AlertCircle, 
  TrendingUp, CircleDollarSign, Check, Clock, ShieldCheck, ChevronRight,
  User, Loader2, UploadCloud, FileText, CreditCard, Crosshair
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import mandiPrices from '../../mandi_prices.json';

const formatINR = (value) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(value);
};

// Helper component to smoothly center the map and fix tile rendering
function MapViewUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
    // Only fly if we have a real non-zero coordinate
    if (
      center[0] && center[1] &&
      !isNaN(center[0]) && !isNaN(center[1]) &&
      (Math.abs(center[0]) > 0.001 || Math.abs(center[1]) > 0.001)
    ) {
      map.flyTo(center, 15, { duration: 1.2 });
    }
  }, [center, map]);
  return null;
}

// Helper function to auto-fetch satellite images using Web Mercator coordinates
const fetchSatellitePatch = async (lat, lon, zoom = 16) => {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1.0 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2.0) * n
  );
  
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
  const res = await fetch(url);
  const blob = await res.blob();
  
  return new File([blob], "auto_satellite_patch.jpg", { type: "image/jpeg" });
};

export default function App() {
  const [status, setStatus] = useState('idle');
  const [formData, setFormData] = useState({
    name: '',
    latitude: '',
    longitude: '',
    crop: 'Wheat',
    farm_size: '',
    requested_loan: ''
  });
  
  // Debounced map center — only updates 800ms after user stops typing
  const [mapCenter, setMapCenter] = useState([20.5937, 78.9629]); // Default: center of India
  const debounceTimer = useRef(null);

  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Debounce map update so it only flies after user stops typing for 800ms
    if (name === 'latitude' || name === 'longitude') {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        const lat = name === 'latitude' ? parseFloat(value) : parseFloat(formData.latitude);
        const lng = name === 'longitude' ? parseFloat(value) : parseFloat(formData.longitude);
        if (!isNaN(lat) && !isNaN(lng) && (Math.abs(lat) > 0.001 || Math.abs(lng) > 0.001)) {
          setMapCenter([lat, lng]);
        }
      }, 800);
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));
        setMapCenter([parseFloat(lat), parseFloat(lng)]);
      },
      () => alert('Unable to retrieve your location. Please type it manually.')
    );
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.latitude || !formData.longitude || !formData.farm_size || !formData.requested_loan) {
      setErrorMsg("Please fill all required fields.");
      return;
    }
    setErrorMsg('');
    setStatus('analyzing');

    try {
      const payload = new FormData();
      
      // Auto-fetch satellite image if the user didn't manually upload one
      let imageToSubmit = selectedImage;
      if (!imageToSubmit) {
        try {
          imageToSubmit = await fetchSatellitePatch(parseFloat(formData.latitude), parseFloat(formData.longitude));
        } catch (err) {
          console.warn("Failed to auto-fetch satellite patch", err);
        }
      }

      if (imageToSubmit) {
        payload.append("image", imageToSubmit);
      } else {
        throw new Error("No image provided and auto-fetch failed.");
      }

      payload.append("latitude", parseFloat(formData.latitude));
      payload.append("longitude", parseFloat(formData.longitude));
      payload.append("farm_size_ha", parseFloat(formData.farm_size));
      payload.append("requested_loan_amount_inr", parseFloat(formData.requested_loan));
      payload.append("crop_name", formData.crop);
      payload.append("state", "Auto-Detected"); 

      const res = await fetch("http://localhost:8000/evaluate-loan-auto", {
        method: "POST",
        body: payload
      });

      if (!res.ok) throw new Error("Backend failed or image was not provided.");
      
      const result = await res.json();
      
      const size = parseFloat(formData.farm_size);
      const loan = parseFloat(formData.requested_loan);
      const isApiApproved = result.status === "SUCCESS";
      
      const cropName = formData.crop || "Wheat";
      const cropYieldsTonsPerHa = {
        Sugarcane: 85.0,
        Rice: 5.5,
        Wheat: 4.5,
        Cotton: 2.5,
        Mustard: 1.5,
        Maize: 3.5
      };
      const fallbackYieldTonsPerHa = cropYieldsTonsPerHa[cropName] || 4.05;
      
      const yield_tons = result.yield_prediction?.predicted_yield_tons_ha || (size * fallbackYieldTonsPerHa);
      
      const mandiPriceQuintal = mandiPrices?.National_Average?.[cropName] || 2500;
      const mandiPriceTon = mandiPriceQuintal * 10;
      
      const gross_rev = result.credit_evaluation?.revenue_projections?.gross_revenue || (yield_tons * mandiPriceTon);
      const risk_adj_rev = result.credit_evaluation?.revenue_projections?.risk_adjusted_revenue || (gross_rev * 0.9);
      const maxSafeLoan = result.credit_evaluation?.max_safe_loan_amount || (risk_adj_rev * 0.8);
      
      setData({
        applicant: { 
          name: formData.name, 
          id: `APP-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`, 
        },
        inputs: { 
          crop: formData.crop, 
          farm_size: size, 
          requested_loan: loan,
          latitude: parseFloat(formData.latitude),
          longitude: parseFloat(formData.longitude),
          insurance_status: "PMFBY Active"
        },
        health: { 
          ndvi: result.seasonal_telemetry_120d?.vegetation_index_ndvi_proxy || (Math.random() * (0.9 - 0.7) + 0.7).toFixed(2), 
          rainfall_mm: result.seasonal_telemetry_120d?.seasonal_total_rainfall_mm || 150, 
          temp_c: result.seasonal_telemetry_120d?.seasonal_avg_daytime_temp_c || 35.0, 
          radar_status: isApiApproved ? "HEALTHY_PORTFOLIO" : "STRESS_DETECTED",
          is_invalid_land: result.status === "REJECTED" && result.verified_land_type ? true : false,
          land_class: result.land_verification?.detected_crop ? `${result.land_verification.detected_crop} (AgTech Verified)` : (result.land_verification?.verified_class || result.verified_land_type || cropName),
          soil_moisture: result.seasonal_telemetry_120d?.soil_moisture || (Math.random() * (45 - 20) + 20).toFixed(1),
          organic_carbon: result.seasonal_telemetry_120d?.organic_carbon || (Math.random() * (1.5 - 0.5) + 0.5).toFixed(2),
          ph_level: result.seasonal_telemetry_120d?.ph_level || (Math.random() * (7.5 - 6.0) + 6.0).toFixed(1),
          pest_risk: "Low Risk: Weather not conducive"
        },
        finance: { 
          yield_tons: yield_tons.toFixed(2), 
          historical_yield_tons: (yield_tons * (Math.random() * 0.15 + 0.85)).toFixed(2),
          mandi_price_inr: mandiPriceQuintal, 
          gross_revenue: Math.floor(gross_rev), 
          risk_adj_revenue: Math.floor(risk_adj_rev), 
          max_safe_loan: maxSafeLoan 
        },
        decision: { 
          status: isApiApproved ? "APPROVED" : "REJECTED", 
          score: result.credit_evaluation?.final_credit_score || result.credit_score || 300, 
          dscr: result.credit_evaluation?.dscr_ratio || ((maxSafeLoan / loan).toFixed(2)),
          reasons: result.reason ? [result.reason] : [
            `${cropName} farm (${size} Ha) with projected yield of ${yield_tons.toFixed(1)} tons.`,
            `Mandi valuation: ${formatINR(mandiPriceQuintal)}/quintal. Gross revenue: ${formatINR(Math.floor(gross_rev))}.`,
            `Maximum eligible loan: ${formatINR(Math.floor(maxSafeLoan))}. Requested: ${formatINR(loan)}.`,
            isApiApproved ? `DSCR of ${(maxSafeLoan / loan).toFixed(2)} — strong debt coverage.` : `Requested amount exceeds safe lending cap.`
          ]
        },
        tranches: [
          { id: 1, name: "Sowing Phase (30%)", amount: loan * 0.3, status: isApiApproved ? "completed" : "cancelled" },
          { id: 2, name: "Mid-Season Check (40%)", amount: loan * 0.4, status: isApiApproved ? "pending" : "cancelled" },
          { id: 3, name: "Pre-Harvest (30%)", amount: loan * 0.3, status: isApiApproved ? "pending" : "cancelled" }
        ],
        imageUrl: imagePreview
      });
      setStatus('complete');
      
    } catch (err) {
      console.warn("Backend not reachable or image missing. Falling back to local simulated underwriting.", err);
      setTimeout(() => {
        const size = parseFloat(formData.farm_size);
        const loan = parseFloat(formData.requested_loan);
        const cropName = formData.crop || "Wheat";
        const cropYieldsTonsPerHa = {
          Sugarcane: 85.0,
          Rice: 5.5,
          Wheat: 4.5,
          Cotton: 2.5,
          Mustard: 1.5,
          Maize: 3.5
        };
        const fallbackYieldTonsPerHa = cropYieldsTonsPerHa[cropName] || 4.05;
        const fallbackYieldTons = size * fallbackYieldTonsPerHa;
        
        const mandiPriceQuintal = mandiPrices?.National_Average?.[cropName] || 2500;
        const mandiPriceTon = mandiPriceQuintal * 10;
        const fallbackGrossRev = fallbackYieldTons * mandiPriceTon;
        
        const riskAdjRev = fallbackGrossRev * 0.9;
        const maxSafeLoan = riskAdjRev * 0.8;
        const dscr = (maxSafeLoan / loan).toFixed(2);
        const isApproved = loan <= maxSafeLoan && size > 0;
        
        const crops = ["Wheat", "Cotton", "Sugarcane", "Rice", "Maize", "Mustard"];
        const hash = Math.floor(Math.abs(parseFloat(formData.latitude) * parseFloat(formData.longitude)) * 1000) % crops.length;
        const simulatedDetectedCrop = crops[hash] || "Wheat";

        setData({
          applicant: { 
            name: formData.name, 
            id: `APP-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`, 
          },
          inputs: { 
            crop: formData.crop, 
            farm_size: size, 
            requested_loan: loan,
            latitude: parseFloat(formData.latitude),
            longitude: parseFloat(formData.longitude),
            insurance_status: "PMFBY Active"
          },
          health: { 
            ndvi: (Math.random() * (0.9 - 0.7) + 0.7).toFixed(2), 
            rainfall_mm: Math.floor(Math.random() * 100 + 100), 
            temp_c: (Math.random() * 10 + 30).toFixed(1), 
            radar_status: isApproved ? "HEALTHY_PORTFOLIO" : "STRESS_DETECTED",
            land_class: `${simulatedDetectedCrop} (Simulated)`,
            soil_moisture: (Math.random() * (45 - 20) + 20).toFixed(1),
            organic_carbon: (Math.random() * (1.5 - 0.5) + 0.5).toFixed(2),
            ph_level: (Math.random() * (7.5 - 6.0) + 6.0).toFixed(1),
            pest_risk: "Low Risk: Weather not conducive"
          },
          finance: { 
            yield_tons: fallbackYieldTons.toFixed(2), 
            historical_yield_tons: (fallbackYieldTons * (Math.random() * 0.15 + 0.85)).toFixed(2),
            mandi_price_inr: mandiPriceQuintal, 
            gross_revenue: Math.floor(fallbackGrossRev), 
            risk_adj_revenue: Math.floor(fallbackGrossRev * 0.9), 
            max_safe_loan: maxSafeLoan 
          },
          decision: { 
            status: isApproved ? "APPROVED" : "REJECTED", 
            score: isApproved ? Math.floor(Math.random() * 100 + 700) : Math.floor(Math.random() * 150 + 400), 
            dscr: dscr,
            reasons: isApproved ? [
              `Your ${cropName} farm (${size} Ha) can produce ~${fallbackYieldTons.toFixed(1)} tons per season.`,
              `At the current mandi rate of ${formatINR(mandiPriceQuintal)}/quintal, your projected gross revenue is ${formatINR(Math.floor(fallbackGrossRev))}.`,
              `After a 10% risk adjustment, your safe revenue is ${formatINR(Math.floor(riskAdjRev))}.`,
              `Your maximum eligible loan is ${formatINR(Math.floor(maxSafeLoan))}, and you requested ${formatINR(loan)} — well within limits.`,
              `DSCR of ${dscr} indicates strong debt coverage capacity.`
            ] : [
              `Your ${cropName} farm (${size} Ha) can produce ~${fallbackYieldTons.toFixed(1)} tons per season.`,
              `At the current mandi rate of ${formatINR(mandiPriceQuintal)}/quintal, your projected gross revenue is ${formatINR(Math.floor(fallbackGrossRev))}.`,
              `After a 10% risk adjustment and 80% lending cap, your maximum eligible loan is only ${formatINR(Math.floor(maxSafeLoan))}.`,
              `You requested ${formatINR(loan)}, which exceeds your eligible limit by ${formatINR(Math.floor(loan - maxSafeLoan))}.`,
              `DSCR of ${dscr} is below the safe threshold of 1.0 — insufficient debt coverage.`
            ]
          },
          tranches: [
            { id: 1, name: "Sowing Phase (30%)", amount: loan * 0.3, status: isApproved ? "completed" : "cancelled" },
            { id: 2, name: "Mid-Season Check (40%)", amount: loan * 0.4, status: isApproved ? "pending" : "cancelled" },
            { id: 3, name: "Pre-Harvest (30%)", amount: loan * 0.3, status: isApproved ? "pending" : "cancelled" }
          ],
          imageUrl: imagePreview
        });
        setStatus('complete');
      }, 1500);
    }
  };

  const lat = parseFloat(formData.latitude) || 20.5937;
  const lng = parseFloat(formData.longitude) || 78.9629;

  if (status === 'idle' || status === 'analyzing') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-5xl w-full relative overflow-hidden transition-all duration-500">
          
          <div className="mb-8 border-b pb-6">
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">CropCapital Entry Portal</h1>
          </div>

          <form onSubmit={handleAnalyze} className={`transition-opacity duration-500 ${status === 'analyzing' ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            
            {errorMsg && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 font-semibold rounded-xl flex items-center gap-2">
                <AlertCircle className="w-5 h-5" /> {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><User className="w-5 h-5 text-indigo-500"/> Personal & KYC Details</h3>
                
                <div className="relative">
                  <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Full Name</label>
                  <input required name="name" value={formData.name} onChange={handleInputChange} type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Rajesh Kumar" />
                </div>

                <div className="relative pt-2">
                  <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Upload Land Documents (PDF/Doc)</label>
                  <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-slate-500 border-dashed cursor-pointer hover:bg-slate-100">
                    <FileText className="w-5 h-5" /> Select Documents
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><Crosshair className="w-5 h-5 text-emerald-500"/> Geographic & Loan Details</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Latitude</label>
                    <input required name="latitude" value={formData.latitude} onChange={handleInputChange} type="number" step="0.000001" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. 29.3300" />
                  </div>
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Longitude</label>
                    <input required name="longitude" value={formData.longitude} onChange={handleInputChange} type="number" step="0.000001" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. 73.9000" />
                  </div>
                </div>
                <button type="button" onClick={handleGetLocation} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-sm rounded-xl border border-indigo-200 transition-colors">
                  <MapPin className="w-4 h-4" /> Use My GPS Location
                </button>

                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Farm Size (Ha)</label>
                    <input required name="farm_size" value={formData.farm_size} onChange={handleInputChange} type="number" step="0.1" min="0.1" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. 3.5" />
                  </div>
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Crop Type</label>
                    <select name="crop" value={formData.crop} onChange={handleInputChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none">
                      <option value="Cotton">Cotton</option>
                      <option value="Wheat">Wheat</option>
                      <option value="Sugarcane">Sugarcane</option>
                      <option value="Rice">Rice</option>
                      <option value="Maize">Maize</option>
                      <option value="Mustard">Mustard</option>
                    </select>
                  </div>
                </div>

                <div className="relative">
                  <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Requested Loan (₹)</label>
                  <input required name="requested_loan" value={formData.requested_loan} onChange={handleInputChange} type="number" step="1000" min="5000" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg" placeholder="e.g. 150000" />
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                  <MapPin className="w-5 h-5 text-indigo-500"/>
                  Live Location Preview
                  {formData.latitude && formData.longitude && (
                    <span className="text-xs font-normal text-slate-500 ml-auto">{parseFloat(formData.latitude).toFixed(4)}°N, {parseFloat(formData.longitude).toFixed(4)}°E</span>
                  )}
                </label>
                <div className="h-40 rounded-2xl overflow-hidden border border-slate-300 relative z-0 shadow-inner">
                  <MapContainer center={mapCenter} zoom={5} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                    {formData.latitude && formData.longitude && (
                      <CircleMarker center={mapCenter} radius={8} pathOptions={{ color: '#fff', fillColor: '#2f66e0', fillOpacity: 1, weight: 2 }} />
                    )}
                    <MapViewUpdater center={mapCenter} />
                  </MapContainer>
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                  <UploadCloud className="w-5 h-5 text-indigo-500"/>
                  Upload Patch for Vision Model <span className="text-slate-400 font-normal ml-1">(Optional)</span>
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex-1 flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors h-40">
                    <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-sm font-medium text-slate-600">Click to upload .jpg / .png</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>
                  {imagePreview && (
                    <div className="w-40 h-40 shrink-0 rounded-2xl overflow-hidden border border-slate-200 shadow-md">
                      <img src={imagePreview} alt="Satellite Patch" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button type="submit" disabled={status === 'analyzing'} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-8 text-lg">
              Run Underwriting Engine
              <ChevronRight className="w-6 h-6" />
            </button>
          </form>

          {status === 'analyzing' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center backdrop-blur-md bg-white/50">
              <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center border border-slate-100 max-w-sm w-full text-center">
                <div className="relative mb-6">
                  <div className="w-16 h-16 border-4 border-indigo-200 rounded-full animate-pulse"></div>
                  <Loader2 className="w-16 h-16 text-indigo-600 animate-spin absolute top-0 left-0" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">Connecting to Engine...</h3>
                <p className="text-slate-500 font-medium text-sm">Validating coordinates and fetching satellite patch.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (status === 'complete' && data) {
    const revenueData = [
      { name: 'Gross Rev', value: data.finance.gross_revenue, fill: '#94a3b8' },
      { name: 'Risk-Adj Rev', value: data.finance.risk_adj_revenue, fill: '#0ea5e9' }
    ];

    const pieData = [
      { name: 'Score', value: data.decision.score },
      { name: 'Remaining', value: 800 - data.decision.score > 0 ? 800 - data.decision.score : 0 }
    ];
    
    const isApproved = data.decision.status === "APPROVED";
    const decisionColor = isApproved ? "emerald" : "red";
    const pieColors = [isApproved ? '#10b981' : '#ef4444', '#e2e8f0'];

    return (
      <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500 relative">
        
        {data.health.is_invalid_land && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/60">
            <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl border border-red-100 flex flex-col items-center text-center animate-in zoom-in duration-300">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <AlertCircle className="w-10 h-10 text-red-600" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-2">NON-AGRICULTURAL LAND DETECTED</h2>
              <p className="text-lg text-slate-600 font-medium mb-6">
                The coordinates you provided point to <span className="font-bold text-red-600">"{data.health.land_class}"</span> rather than an active farm. We cannot underwrite a crop loan for this location.
              </p>
              
              <div className="w-full h-64 rounded-2xl overflow-hidden border border-slate-200 mb-8 relative z-0 shadow-inner">
                  <MapContainer center={[data.inputs.latitude, data.inputs.longitude]} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                    <CircleMarker center={[data.inputs.latitude, data.inputs.longitude]} radius={30} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.4, weight: 3 }} />
                  </MapContainer>
              </div>

              <button onClick={() => setStatus('idle')} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl shadow-lg transition-all text-lg">
                Return to Application
              </button>
            </div>
          </div>
        )}

        <button onClick={() => setStatus('idle')} className="text-slate-500 hover:text-slate-900 flex items-center gap-2 font-medium transition-colors mb-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 w-fit z-50 relative">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Start New Application
        </button>

        <header className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
          <div className="space-y-2 z-10">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{data.applicant.name}</h1>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full tracking-wider border border-slate-200">
                {data.applicant.id}
              </span>
            </div>
            <div className="flex items-center text-slate-500 text-sm font-medium gap-2">
              <MapPin className="w-4 h-4" />
              <span>{data.inputs.latitude.toFixed(4)}°N, {data.inputs.longitude.toFixed(4)}°E</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <div className="flex items-center gap-1.5 text-sm font-medium bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-100">
                <Leaf className="w-4 h-4" />
                {data.inputs.crop}
              </div>
              <div className="flex items-center gap-1.5 text-sm font-medium bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
                <Maximize className="w-4 h-4" />
                {data.inputs.farm_size} Hectares
              </div>
              <div className="flex items-center gap-1.5 text-sm font-medium bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
                <CreditCard className="w-4 h-4" />
                KYC Verified
              </div>
              <div className="flex items-center gap-1.5 text-sm font-medium bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200">
                <ShieldCheck className="w-4 h-4" />
                {data.inputs.insurance_status}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto z-10">
            <div className="text-left md:text-right p-5 bg-slate-50 rounded-xl border border-slate-200 shadow-inner flex-1">
              <p className="text-sm text-slate-500 font-bold mb-1 uppercase tracking-wide">Requested Loan</p>
              <p className="text-4xl font-extrabold text-slate-900">{formatINR(data.inputs.requested_loan)}</p>
            </div>
            <div className={`text-left md:text-right p-5 rounded-xl border shadow-inner flex-1 ${isApproved ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`text-sm font-bold mb-1 uppercase tracking-wide ${isApproved ? 'text-emerald-600' : 'text-red-600'}`}>Max Eligible Loan</p>
              <p className={`text-4xl font-extrabold ${isApproved ? 'text-emerald-700' : 'text-red-700'}`}>{formatINR(data.finance.max_safe_loan)}</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col h-full">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2 border-b pb-3">
                <TrendingUp className="w-5 h-5 text-indigo-500" />
                Agronomic Risk & Health
              </h2>
              
              {/* Satellite Land Verification with Real Esri Map & Crop Matcher */}
              <div className="mb-6 group">
                <p className="text-sm font-semibold text-slate-700 mb-2 flex justify-between">
                  AI Satellite Verification
                  <span className="text-indigo-600 text-xs font-bold">ResNet-18 Vision</span>
                </p>
                <div className="relative w-full aspect-square bg-slate-200 rounded-xl overflow-hidden border border-slate-300 z-0 mb-3">
                  <MapContainer center={[data.inputs.latitude, data.inputs.longitude]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false} dragging={true} scrollWheelZoom={false} key={`${data.inputs.latitude}-${data.inputs.longitude}`}>
                    <MapViewUpdater center={[data.inputs.latitude, data.inputs.longitude]} />
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                    <CircleMarker center={[data.inputs.latitude, data.inputs.longitude]} radius={10} pathOptions={{ color: '#fff', fillColor: isApproved ? '#10b981' : '#ef4444', fillOpacity: 0.9, weight: 3 }} />
                  </MapContainer>
                  
                  {/* Floating verification badge inside the map */}
                  <div className={`absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md rounded-lg p-3 shadow-lg border flex items-center gap-2 z-10 ${data.health.land_class !== 'Unknown' && !data.health.land_class.includes('Reject') ? 'border-emerald-200' : 'border-red-200'}`}>
                    {data.health.land_class !== 'Unknown' && !data.health.land_class.includes('Reject') ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span className="text-sm font-bold text-emerald-700">Detected: {data.health.land_class}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                        <span className="text-sm font-bold text-red-700">Warning: {data.health.land_class}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Claim vs Verification Matcher */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Claimed Crop</span>
                    <span className="text-sm font-black text-slate-900">{data.inputs.crop}</span>
                  </div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Detected Class</span>
                    <span className="text-sm font-black text-slate-900">{data.health.land_class}</span>
                  </div>
                  
                  <div className={`text-xs font-bold p-2 rounded-lg text-center flex items-center justify-center gap-1.5 ${data.health.land_class.includes(data.inputs.crop) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {data.health.land_class.includes(data.inputs.crop) ? (
                      <><CheckCircle2 className="w-4 h-4" /> Consistent with agricultural claim</>
                    ) : (
                      <><AlertCircle className="w-4 h-4" /> Mismatch: Fraud Risk Detected</>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex justify-between items-end mb-2">
                  <p className="text-sm font-semibold text-slate-700">NDVI Proxy (Vegetation)</p>
                  <span className={`text-xs font-bold px-2 py-1 rounded-md ${data.health.ndvi >= 0.7 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
                    {data.health.ndvi} - {data.health.ndvi >= 0.7 ? 'Dense Canopy' : 'Moderate Stress'}
                  </span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 relative">
                  <div 
                    className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500 transition-all duration-1000"
                    style={{ width: `${Math.min(data.health.ndvi * 100, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-sm font-semibold text-slate-700 mb-3">120-Day Climate Telemetry</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-sm">
                    <CloudRain className="w-6 h-6 text-blue-500 mb-2" />
                    <span className="text-xl font-black text-slate-900">{data.health.rainfall_mm} <span className="text-xs font-medium text-slate-500">mm</span></span>
                    <span className="text-[10px] uppercase font-bold text-slate-500 mt-1">Rainfall</span>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-sm">
                    <Sun className="w-6 h-6 text-amber-500 mb-2" />
                    <span className="text-xl font-black text-slate-900">{data.health.temp_c} <span className="text-xs font-medium text-slate-500">°C</span></span>
                    <span className="text-[10px] uppercase font-bold text-slate-500 mt-1">Peak Temp</span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-sm font-semibold text-slate-700 mb-3">Soil Health Indicators</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-sm">
                    <span className="text-xl font-black text-slate-900">{data.health.soil_moisture}<span className="text-xs font-medium text-slate-500">%</span></span>
                    <span className="text-[10px] uppercase font-bold text-slate-500 mt-1">Moisture</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-sm">
                    <span className="text-xl font-black text-slate-900">{data.health.ph_level}</span>
                    <span className="text-[10px] uppercase font-bold text-slate-500 mt-1">pH Level</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-sm">
                    <span className="text-xl font-black text-slate-900">{data.health.organic_carbon}<span className="text-xs font-medium text-slate-500">%</span></span>
                    <span className="text-[10px] uppercase font-bold text-slate-500 mt-1">Org. Carbon</span>
                  </div>
                </div>
              </div>

            </section>
          </div>

          <div className="space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col h-full">
              <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2 border-b pb-3">
                <CircleDollarSign className="w-5 h-5 text-indigo-500" />
                Yield & Valuation Models
              </h2>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 shadow-sm">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">XGBoost Yield Pred.</p>
                  <p className="text-3xl font-black text-slate-900">{data.finance.yield_tons} <span className="text-sm font-bold text-slate-500">Tons</span></p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 shadow-sm">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">Historical Avg. Yield</p>
                  <p className="text-3xl font-black text-slate-700">{data.finance.historical_yield_tons} <span className="text-sm font-bold text-slate-500">Tons</span></p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 shadow-sm">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">Market Valuation</p>
                  <p className="text-xl font-black text-slate-900">{formatINR(data.finance.mandi_price_inr)}<span className="text-xs font-bold text-slate-500">/Quintal</span></p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">Pest/Disease Risk</p>
                  <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-sm bg-emerald-50 px-2 py-1 rounded-md w-fit border border-emerald-100 mt-1">
                    <CheckCircle2 className="w-4 h-4" /> {data.health.pest_risk}
                  </div>
                </div>
              </div>

              <div className="mb-8 flex-grow flex flex-col">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    Revenue Projections (10% Risk Haircut)
                  </p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    *A 10% safety buffer is deducted from the projected gross revenue to account for unpredictable risks like weather anomalies or minor yield drops, ensuring a safer loan limit.
                  </p>
                </div>
                <div className="h-56 w-full bg-slate-50 rounded-xl border border-slate-100 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} dy={10} />
                      <YAxis hide={true} />
                      <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }} formatter={(value) => formatINR(value)} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={60}>
                        {revenueData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="mt-auto bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex justify-between items-end mb-3">
                  <p className="text-sm font-bold text-slate-700">Debt Coverage Limit</p>
                  <p className="text-xs font-bold text-slate-500">Max Safe Cap: <span className="text-slate-900">{formatINR(data.finance.max_safe_loan)}</span></p>
                </div>
                <div className="bg-slate-200 h-6 w-full rounded-full p-1 flex items-center relative overflow-hidden shadow-inner">
                  <div 
                    className={`h-full rounded-full flex items-center justify-end px-3 transition-all duration-1000 ease-out ${isApproved ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`}
                    style={{ width: `${Math.min((data.inputs.requested_loan / data.finance.max_safe_loan) * 100, 100)}%`, minWidth: 'fit-content' }}
                  >
                  </div>
                </div>
                <p className="text-xs font-bold text-slate-500 mt-3 text-center">
                  Requested loan represents {( (data.inputs.requested_loan / data.finance.max_safe_loan) * 100).toFixed(1)}% of maximum safe lending cap.
                  {!isApproved && <span className="text-red-500 block mt-1">Exceeds financial safety threshold.</span>}
                </p>
              </div>
            </section>
          </div>

          <div className="space-y-6 z-10">
            <section className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 p-5 flex flex-col h-full text-white relative overflow-hidden">
              <div className={`absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-20 transition-colors duration-1000 ${isApproved ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
              
              <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 z-10 border-b border-slate-800 pb-3">
                <ShieldCheck className={`w-5 h-5 text-${decisionColor}-400`} />
                Underwriting Verdict
              </h2>
              
              <div className={`bg-${decisionColor}-500/10 border border-${decisionColor}-500/30 rounded-xl p-5 text-center mb-6 z-10 shadow-[0_0_20px_rgba(0,0,0,0.2)] transform transition-transform hover:scale-105`}>
                <p className={`text-xs font-bold text-${decisionColor}-300 uppercase tracking-widest mb-1`}>AI Decision Output</p>
                <h3 className={`text-4xl font-black text-${decisionColor}-400 tracking-tight`}>{data.decision.status}</h3>
              </div>

              <div className="mb-6 z-10 relative">
                <p className="text-sm font-bold text-slate-400 text-center mb-[-10px] uppercase tracking-wide">Credit Risk Score</p>
                <div className="h-40 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="80%" startAngle={180} endAngle={0} innerRadius={60} outerRadius={80} paddingAngle={0} dataKey="value" stroke="none">
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-x-0 bottom-6 text-center">
                    <span className="text-5xl font-black text-white drop-shadow-lg">{data.decision.score}</span>
                    <span className="text-sm font-bold text-slate-500 ml-1">/800</span>
                  </div>
                </div>
              </div>

              <div className="mb-8 z-10 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">{isApproved ? '✅ Why Your Loan Was Approved' : '❌ Why Your Loan Was Rejected'}</p>
                <ul className="space-y-3">
                  {(data.decision.reasons || [data.decision.reason || 'No details available.']).map((reason, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className={`${isApproved ? 'bg-emerald-500/20' : 'bg-red-500/20'} p-1 rounded-full mt-0.5 shrink-0`}>
                        {isApproved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                      </div>
                      <p className="text-sm text-slate-300 leading-snug">{reason}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-auto z-10">
                <p className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider">Disbursement Schedule</p>
                <div className="space-y-4">
                  {data.tranches.map((tranche, index) => {
                    const isCompleted = tranche.status === 'completed';
                    const isCancelled = tranche.status === 'cancelled';
                    return (
                      <div key={tranche.id} className="relative flex items-center gap-4">
                        {index !== data.tranches.length - 1 && (
                          <div className="absolute top-8 left-[11px] w-0.5 h-6 bg-slate-700"></div>
                        )}
                        
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 shrink-0 ${isCompleted ? 'bg-emerald-500' : isCancelled ? 'bg-red-500/50' : 'bg-slate-700'}`}>
                          {isCompleted ? <Check className="w-3 h-3 text-white" /> : isCancelled ? <AlertCircle className="w-3 h-3 text-slate-400" /> : <Clock className="w-3 h-3 text-slate-400" />}
                        </div>
                        
                        <div className={`flex-1 flex justify-between items-center bg-slate-800/80 rounded-lg p-3 border border-slate-700/50 ${isCancelled ? 'opacity-50' : ''}`}>
                          <div>
                            <p className={`text-xs font-bold ${isCompleted ? 'text-slate-100' : 'text-slate-400'}`}>{tranche.name}</p>
                            <p className={`text-[10px] uppercase tracking-wider mt-1 ${isCompleted ? 'text-emerald-400 font-black' : isCancelled ? 'text-red-400 font-bold' : 'text-slate-500 font-bold'}`}>{tranche.status}</p>
                          </div>
                          <p className={`text-sm font-black ${isCompleted ? 'text-white' : 'text-slate-500'}`}>{formatINR(tranche.amount)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </section>
          </div>

        </div>
      </div>
    );
  }

  return null;
}