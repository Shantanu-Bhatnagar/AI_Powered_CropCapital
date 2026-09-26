import io
import joblib
import pandas as pd
from PIL import Image
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from Verify_Land import transform, model, CLASSES, device, torch
from credit_engine import evaluate_credit_risk
from geo_services import extract_vari_ndvi_proxy, fetch_live_weather, fetch_soil_ph

app = FastAPI(
    title="CropCapital API Engine",
    description="Automated Land Verification, Seasonal Climate Telemetry & Rupee Crop Valuation",
    version="2.2.0"
)

try:
    yield_model = joblib.load("crop_yield_model.pkl")
    print("XGBoost model loaded successfully!")
except Exception as e:
    print(f"FAILED TO LOAD MODEL: {str(e)}")
    yield_model = None

@app.get("/")
def read_root():
    return {"status": "Active", "system": "CropCapital Rupee Valuation Engine v2.2"}

@app.post("/evaluate-loan-auto")
async def evaluate_loan_auto(
    image: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    farm_size_ha: float = Form(...),
    requested_loan_amount_inr: float = Form(100000.0), # Default ₹1,00,000
    crop_name: str = Form("Wheat"),                     # Choices: Wheat, Rice, Cotton, Mustard, Maize, Sugarcane
    state: str = Form("Rajasthan")
):
    if yield_model is None:
        raise HTTPException(status_code=500, detail="Yield prediction model binary is missing.")

    # Step 1: Stage 0 Land Verification & VARI NDVI Extraction
    try:
        image_bytes = await image.read()
        img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        
        auto_ndvi = extract_vari_ndvi_proxy(img)
        
        img_tensor = transform(img).unsqueeze(0).to(device)
        with torch.no_grad():
            output = model(img_tensor)
            _, pred = torch.max(output, 1)
        
        predicted_class = CLASSES[pred.item()]
        is_valid_land = predicted_class in ['AnnualCrop', 'PermanentCrop']
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process image payload: {str(e)}")

    if not is_valid_land:
        return {
            "status": "REJECTED",
            "reason": f"Land classified as '{predicted_class}'. Financing requires active agricultural land.",
            "verified_land_type": predicted_class,
            "credit_score": 300
        }

    # Step 2: Fetch 120-Day Seasonal Climate Telemetry via GPS
    seasonal_temp, seasonal_rainfall = fetch_live_weather(latitude, longitude, season_days=120)
    auto_ph = fetch_soil_ph(latitude, longitude)

    # Step 3: Run Stage 1 XGBoost Yield Prediction
    input_data = pd.DataFrame([{
        'mean_ndvi': auto_ndvi,
        'seasonal_rainfall_mm': seasonal_rainfall,
        'avg_temp_c': seasonal_temp,
        'soil_ph': auto_ph
    }])
    
    predicted_yield = float(yield_model.predict(input_data)[0])

    # Step 4: Run Stage 2 Rupee Credit Engine
    credit_analysis = evaluate_credit_risk(
        predicted_yield_tons_ha=predicted_yield,
        farm_size_ha=farm_size_ha,
        requested_loan_amount_inr=requested_loan_amount_inr,
        crop_name=crop_name,
        state=state
    )

    return {
        "status": "SUCCESS",
        "seasonal_telemetry_120d": {
            "vegetation_index_ndvi_proxy": auto_ndvi,
            "seasonal_avg_daytime_temp_c": seasonal_temp,
            "seasonal_total_rainfall_mm": seasonal_rainfall,
            "soil_ph": auto_ph
        },
        "land_verification": {
            "verified_class": predicted_class,
            "is_valid": is_valid_land
        },
        "yield_prediction": {
            "predicted_yield_tons_ha": round(predicted_yield, 2),
            "total_estimated_production_tons": round(predicted_yield * farm_size_ha, 2)
        },
        "credit_evaluation": credit_analysis
    }