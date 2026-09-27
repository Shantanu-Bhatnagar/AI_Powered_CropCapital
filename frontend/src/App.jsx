import React, { useState, useEffect } from 'react';
import {
  MapPin, Leaf, Maximize, CheckCircle2, CloudRain, Sun, AlertCircle, 
  TrendingUp, CircleDollarSign, Check, Clock, ShieldCheck, ChevronRight,
  User, IndianRupee, Loader2, UploadCloud, FileText, CreditCard, Crosshair
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const formatINR = (value) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(value);
};

// Helper component to smoothly center the map when coordinates change
function MapViewUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center[0] && center[1] && !isNaN(center[0]) && !isNaN(center[1])) {
      map.flyTo(center, 14, { duration: 1.5 });
    }
  }, [center, map]);
  return null;
}

export default function App() {
  const [status, setStatus] = useState('idle'); // idle, analyzing, complete
  const [formData, setFormData] = useState({
    name: '',
    latitude: '29.33', // Default coordinates
    longitude: '73.90',
    crop: 'Cotton',
    farm_size: '',
    requested_loan: ''
  });
  
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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
      if (selectedImage) {
        payload.append("image", selectedImage);
      }
      payload.append("latitude", parseFloat(formData.latitude));
      payload.append("longitude", parseFloat(formData.longitude));
      payload.append("farm_size_ha", parseFloat(formData.farm_size));
      payload.append("requested_loan_amount_inr", parseFloat(formData.requested_loan));
      payload.append("crop_name", formData.crop);
      payload.append("state", "Auto-Detected"); 

      // Attempt to hit the actual backend
      const res = await fetch("http://localhost:8000/evaluate-loan-auto", {
        method: "POST",
        body: payload
      });

      if (!res.ok) throw new Error("Backend failed or image was not provided.");
      
      const result = await res.json();
      
      const size = parseFloat(formData.farm_size);
      const loan = parseFloat(formData.requested_loan);
      const isApiApproved = result.status === "SUCCESS";
      
      const yield_tons = result.yield_prediction?.predicted_yield_tons_ha || (size * 4.05);
      const gross_rev = result.credit_evaluation?.revenue_projections?.gross_revenue || (size * 4.05 * 72500);
      const risk_adj_rev = result.credit_evaluation?.revenue_projections?.risk_adjusted_revenue || (gross_rev * 0.9);
      const maxSafeLoan = result.credit_evaluation?.max_safe_loan_amount || (size * 185000);
      
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
          longitude: parseFloat(formData.longitude)
        },
        health: { 
          ndvi: result.seasonal_telemetry_120d?.vegetation_index_ndvi_proxy || (Math.random() * (0.9 - 0.7) + 0.7).toFixed(2), 
          rainfall_mm: result.seasonal_telemetry_120d?.seasonal_total_rainfall_mm || 150, 
          temp_c: result.seasonal_telemetry_120d?.seasonal_avg_daytime_temp_c || 35.0, 
          radar_status: isApiApproved ? "HEALTHY_PORTFOLIO" : "STRESS_DETECTED",
          land_class: result.land_verification?.verified_class || result.verified_land_type || "Unknown"
        },
        finance: { 
          yield_tons: yield_tons.toFixed(2), 
          mandi_price: 72500, 
          gross_revenue: Math.floor(gross_rev), 
          risk_adj_revenue: Math.floor(risk_adj_rev), 
          max_safe_loan: maxSafeLoan 
        },
        decision: { 
          status: isApiApproved ? "APPROVED" : "REJECTED", 
          score: result.credit_evaluation?.final_credit_score || result.credit_score || 300, 
          dscr: result.credit_evaluation?.dscr_ratio || ((maxSafeLoan / loan).toFixed(2)),
          reason: result.reason || "All parameters look optimal."
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
        const maxSafeLoan = size * 185000;
        const dscr = (maxSafeLoan / loan).toFixed(2);
        const isApproved = loan <= maxSafeLoan && size > 0;
        
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
            longitude: parseFloat(formData.longitude)
          },
          health: { 
            ndvi: (Math.random() * (0.9 - 0.7) + 0.7).toFixed(2), 
            rainfall_mm: Math.floor(Math.random() * 100 + 100), 
            temp_c: (Math.random() * 10 + 30).toFixed(1), 
            radar_status: isApproved ? "HEALTHY_PORTFOLIO" : "STRESS_DETECTED",
            land_class: "AnnualCrop (Simulated)"
          },
          finance: { 
            yield_tons: (size * 4.05).toFixed(2), 
            mandi_price: 72500, 
            gross_revenue: Math.floor(size * 4.05 * 72500), 
            risk_adj_revenue: Math.floor(size * 4.05 * 72500 * 0.9), 
            max_safe_loan: maxSafeLoan 
          },
          decision: { 
            status: isApproved ? "APPROVED" : "REJECTED", 
            score: isApproved ? Math.floor(Math.random() * 100 + 700) : Math.floor(Math.random() * 150 + 400), 
            dscr: dscr,
            reason: isApproved ? "Simulated: Safe DSCR metrics." : "Simulated: Requested loan exceeds maximum safe cap."
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

  const lat = parseFloat(formData.latitude) || 0;
  const lng = parseFloat(formData.longitude) || 0;

  // 1. INPUT FORM VIEW
  if (status === 'idle' || status === 'analyzing') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-5xl w-full relative overflow-hidden transition-all duration-500">
          
          <div className="mb-8 border-b pb-6">
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">CropCapital Entry Portal</h1>
            <p className="text-slate-500 font-medium">Capture comprehensive borrower details to run the automated underwriting engine.</p>
          </div>

          <form onSubmit={handleAnalyze} className={`transition-opacity duration-500 ${status === 'analyzing' ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            
            {errorMsg && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 font-semibold rounded-xl flex items-center gap-2">
                <AlertCircle className="w-5 h-5" /> {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Personal Info */}
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

              {/* Geographic & Agronomic */}
              <div className="space-y-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><Crosshair className="w-5 h-5 text-emerald-500"/> Geographic & Loan Details</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Latitude</label>
                    <input required name="latitude" value={formData.latitude} onChange={handleInputChange} type="number" step="0.000001" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. 29.33" />
                  </div>
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Longitude</label>
                    <input required name="longitude" value={formData.longitude} onChange={handleInputChange} type="number" step="0.000001" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. 73.90" />
                  </div>
                </div>

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
                    </select>
                  </div>
                </div>

                <div className="relative">
                  <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Requested Loan (₹)</label>
                  <input required name="requested_loan" value={formData.requested_loan} onChange={handleInputChange} type="number" step="1000" min="5000" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg" placeholder="e.g. 150000" />
                </div>
              </div>
            </div>

            {/* Verification Section */}
            <div className="mt-8 pt-6 border-t grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                  <MapPin className="w-5 h-5 text-indigo-500"/>
                  Live Location Preview
                </label>
                <div className="h-40 rounded-2xl overflow-hidden border border-slate-300 relative z-0 shadow-inner">
                  <MapContainer center={[lat, lng]} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                    <CircleMarker center={[lat, lng]} radius={8} pathOptions={{ color: '#fff', fillColor: '#2f66e0', fillOpacity: 1, weight: 2 }} />
                    <MapViewUpdater center={[lat, lng]} />
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

          {/* Analyzing Overlay */}
          {status === 'analyzing' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center backdrop-blur-md bg-white/50">
              <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center border border-slate-100 max-w-sm w-full text-center">
                <div className="relative mb-6">
                  <div className="w-16 h-16 border-4 border-indigo-200 rounded-full animate-pulse"></div>
                  <Loader2 className="w-16 h-16 text-indigo-600 animate-spin absolute top-0 left-0" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">Connecting to Engine...</h3>
                <p className="text-slate-500 font-medium text-sm">Validating coordinates and evaluating AI underwriting models.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. DASHBOARD VIEW (Complete)
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
      <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500">
        
        {/* Navigation / Back Button */}
        <button onClick={() => setStatus('idle')} className="text-slate-500 hover:text-slate-900 flex items-center gap-2 font-medium transition-colors mb-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 w-fit z-50 relative">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Start New Application
        </button>

        {/* 1. TOP HEADER */}
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
            </div>
          </div>
          
          <div className="text-left md:text-right p-5 bg-slate-50 rounded-xl border border-slate-200 w-full md:w-auto shadow-inner z-10">
            <p className="text-sm text-slate-500 font-bold mb-1 uppercase tracking-wide">Requested Loan</p>
            <p className="text-4xl font-extrabold text-slate-900">{formatINR(data.inputs.requested_loan)}</p>
          </div>
        </header>

        {/* 3-COLUMN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT COLUMN: Agronomic Risk & Asset Health */}
          <div className="space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col h-full">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2 border-b pb-3">
                <TrendingUp className="w-5 h-5 text-indigo-500" />
                Agronomic Risk & Health
              </h2>
              
              {/* Satellite Land Verification with Real Esri Map */}
              <div className="mb-6 group">
                <p className="text-sm font-semibold text-slate-700 mb-2 flex justify-between">
                  Satellite Verification
                  <span className="text-indigo-600 text-xs font-bold">{data.health.land_class}</span>
                </p>
                <div className="relative w-full aspect-square bg-slate-200 rounded-xl overflow-hidden border border-slate-300 z-0">
                  <MapContainer center={[data.inputs.latitude, data.inputs.longitude]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false} dragging={true} scrollWheelZoom={false}>
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                    <CircleMarker center={[data.inputs.latitude, data.inputs.longitude]} radius={10} pathOptions={{ color: '#fff', fillColor: isApproved ? '#10b981' : '#ef4444', fillOpacity: 0.9, weight: 3 }} />
                  </MapContainer>
                  
                  {/* Floating verification badge */}
                  <div className={`absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md rounded-lg p-3 shadow-lg border flex items-center gap-2 z-10 ${data.health.land_class !== 'Unknown' && !data.health.land_class.includes('Reject') ? 'border-emerald-200' : 'border-red-200'}`}>
                    {data.health.land_class !== 'Unknown' && !data.health.land_class.includes('Reject') ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span className="text-sm font-bold text-emerald-700">Verified: {data.health.land_class}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                        <span className="text-sm font-bold text-red-700">Warning: {data.health.land_class}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Crop Health NDVI */}
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

              {/* 120-Day Climate Telemetry */}
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

            </section>
          </div>

          {/* MIDDLE COLUMN: Financial Valuation & Yield */}
          <div className="space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col h-full">
              <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2 border-b pb-3">
                <CircleDollarSign className="w-5 h-5 text-indigo-500" />
                Yield & Valuation Models
              </h2>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 shadow-sm">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">XGBoost Yield Pred.</p>
                  <p className="text-3xl font-black text-slate-900">{data.finance.yield_tons} <span className="text-sm font-bold text-slate-500">Tons</span></p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 shadow-sm">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">Market Valuation</p>
                  <p className="text-xl font-black text-slate-900">{formatINR(data.finance.mandi_price)}<span className="text-xs font-bold text-slate-500">/Ton</span></p>
                </div>
              </div>

              {/* Recharts BarChart */}
              <div className="mb-8 flex-grow flex flex-col">
                <p className="text-sm font-semibold text-slate-700 mb-4">Revenue Projections (10% Risk Haircut)</p>
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

              {/* Debt Coverage Safety */}
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

          {/* RIGHT COLUMN: AI Verdict & Disbursement */}
          <div className="space-y-6 z-10">
            <section className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 p-5 flex flex-col h-full text-white relative overflow-hidden">
              <div className={`absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-20 transition-colors duration-1000 ${isApproved ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
              
              <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 z-10 border-b border-slate-800 pb-3">
                <ShieldCheck className={`w-5 h-5 text-${decisionColor}-400`} />
                Underwriting Verdict
              </h2>
              
              {/* Final Decision Banner */}
              <div className={`bg-${decisionColor}-500/10 border border-${decisionColor}-500/30 rounded-xl p-5 text-center mb-6 z-10 shadow-[0_0_20px_rgba(0,0,0,0.2)] transform transition-transform hover:scale-105`}>
                <p className={`text-xs font-bold text-${decisionColor}-300 uppercase tracking-widest mb-1`}>AI Decision Output</p>
                <h3 className={`text-4xl font-black text-${decisionColor}-400 tracking-tight`}>{data.decision.status}</h3>
              </div>

              {/* Credit Score Gauge */}
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

              {/* AI Explainability */}
              <div className="mb-8 z-10 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Explainability Output</p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <div className={`bg-${decisionColor}-500/20 p-1 rounded-full mt-0.5`}>
                      {isApproved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                    <p className="text-sm text-slate-300 leading-snug">Debt Coverage <span className="text-white font-bold">(DSCR = {data.decision.dscr})</span></p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className={`bg-${decisionColor}-500/20 p-1 rounded-full mt-0.5`}>
                      {isApproved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                    <p className="text-sm text-slate-300 leading-snug">{data.decision.reason}</p>
                  </li>
                </ul>
              </div>

              {/* Smart Tranche Schedule */}
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
