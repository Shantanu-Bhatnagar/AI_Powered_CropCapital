import io
import joblib
import pandas as pd
from PIL import Image
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from Verify_Land import transform, model, CLASSES, device, torch
from credit_engine import evaluate_credit_risk
from geo_services import extract_vari_ndvi_proxy, fetch_live_weather, fetch_soil_ph
from agtech_api import AgTechAPIClient

agtech_client = AgTechAPIClient()

app = FastAPI(
    title="CropCapital API Engine",
    description="Automated Agricultural Loan Evaluation & Underwriting Engine",
    version="3.0.0"
)

try:
    yield_model = joblib.load("crop_yield_model.pkl")
    print("XGBoost model loaded successfully!")
except Exception as e:
    print(f"FAILED TO LOAD MODEL: {str(e)}")
    yield_model = None

@app.get("/")
def read_root():
    return {"status": "Active", "system": "CropCapital Enterprise Underwriting v3.0"}

@app.post("/evaluate-loan-auto")
async def evaluate_loan_auto(
    image: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    farm_size_ha: float = Form(...),
    requested_loan_amount_inr: float = Form(100000.0),
    crop_name: str = Form("Wheat"),
    state: str = Form("Rajasthan")
):
    if yield_model is None:
        raise HTTPException(status_code=500, detail="Yield prediction model binary is missing.")

    # Step 1: Stage 0 Land Verification & VARI Extraction
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
            "credit_score": 300,
            "ai_explainability": {
                "top_decision_drivers": [f"Stage 0 Vision Model flagged land patch as {predicted_class}."],
                "path_to_approval_advice": ["Provide satellite patch corresponding to active agricultural farmland."]
            }
        }

    # Step 2: Fetch 120-Day Seasonal Climate Telemetry via GPS & AgTech API
    real_ag_data = agtech_client.fetch_real_climate_and_soil(latitude, longitude)
    seasonal_temp = real_ag_data["temp_c"]
    seasonal_rainfall = real_ag_data["rainfall_mm"]
    soil_moisture = real_ag_data["soil_moisture_pct"]
    
    auto_ph = fetch_soil_ph(latitude, longitude)
    
    # AgTech API: Specific Crop Verification
    detected_specific_crop = agtech_client.detect_crop_type(latitude, longitude)

    # Step 3: Run Stage 1 XGBoost Yield Prediction
    input_data = pd.DataFrame([{
        'mean_ndvi': auto_ndvi,
        'seasonal_rainfall_mm': seasonal_rainfall,
        'avg_temp_c': seasonal_temp,
        'soil_ph': auto_ph
    }])
    
    predicted_yield = float(yield_model.predict(input_data)[0])

    # Step 4: Run Stage 2 Underwriting Engine (Upgrades 1, 2, & 3)
    credit_analysis = evaluate_credit_risk(
        predicted_yield_tons_ha=predicted_yield,
        farm_size_ha=farm_size_ha,
        requested_loan_amount_inr=requested_loan_amount_inr,
        crop_name=crop_name,
        state=state,
        ndvi=auto_ndvi,
        rainfall_mm=seasonal_rainfall
    )

    return {
        "status": "SUCCESS",
        "seasonal_telemetry_120d": {
            "vegetation_index_ndvi_proxy": auto_ndvi,
            "seasonal_avg_daytime_temp_c": seasonal_temp,
            "seasonal_total_rainfall_mm": seasonal_rainfall,
            "soil_ph": auto_ph,
            "soil_moisture": soil_moisture
        },
        "land_verification": {
            "verified_class": predicted_class,
            "detected_crop": detected_specific_crop,
            "is_valid": is_valid_land
        },
        "yield_prediction": {
            "predicted_yield_tons_ha": round(predicted_yield, 2),
            "total_estimated_production_tons": round(predicted_yield * farm_size_ha, 2)
        },
        "credit_evaluation": credit_analysis
    }