import os
import json
import numpy as np

JSON_DATASET_PATH = "mandi_prices.json"

# Official Minimum Support Price (MSP) Floor rates (₹ / Metric Ton)
CROP_MSP_FLOOR_PER_TON_INR = {
    'Wheat': 22750.0,
    'Rice': 23000.0,
    'Cotton': 71200.0,
    'Mustard': 56500.0,
    'Maize': 20900.0,
    'Sugarcane': 3150.0,
    'AnnualCrop': 22000.0,
    'PermanentCrop': 35000.0
}

def get_mandi_price_inr(crop_name: str, state: str = "Rajasthan") -> tuple[float, str]:
    """
    Reads local mandi_prices.json to fetch market modal price (in ₹/metric ton).
    Falls back to CACP MSP floor values if state/crop is unlisted.
    """
    if os.path.exists(JSON_DATASET_PATH):
        try:
            with open(JSON_DATASET_PATH, 'r') as f:
                data = json.load(f)
            state_data = data.get(state, data.get("National_Average", {}))
            modal_price_qtl = state_data.get(crop_name)
            if modal_price_qtl:
                return round(float(modal_price_qtl) * 10.0, 2), f"Agmarknet Mandi ({state})"
        except Exception:
            pass
    return CROP_MSP_FLOOR_PER_TON_INR.get(crop_name, 22000.0), "Official CACP MSP Floor Benchmark"


def generate_explainability_and_advice(
    credit_score: int, 
    coverage_ratio: float, 
    requested_loan_inr: float, 
    max_rec_loan_inr: float,
    crop_name: str,
    ndvi: float
):
    """
    Upgrade 3: AI Underwriter Explainability & Path-to-Approval Advisor.
    """
    drivers = []
    advice = []

    # Explainability Drivers
    if coverage_ratio >= 2.0:
        drivers.append(f"Strong Debt Coverage Ratio (DSCR = {round(coverage_ratio, 2)}): Estimated harvest revenue substantially covers debt request.")
    elif coverage_ratio < 1.0:
        drivers.append(f"High Default Risk (DSCR = {round(coverage_ratio, 2)}): Requested loan exceeds safe harvest valuation capacity.")
    else:
        drivers.append(f"Moderate Debt Coverage (DSCR = {round(coverage_ratio, 2)}): Loan request is close to maximum debt threshold.")
    
    if ndvi >= 0.60:
        drivers.append(f"High Vegetation Density (NDVI Proxy = {ndvi}): Satellite patch confirms healthy crop canopy.")
    else:
        drivers.append(f"Sub-optimal Crop Biomass (NDVI Proxy = {ndvi}): Sparse vegetation detected on agricultural plot.")

    # Path to Approval Advice
    if credit_score < 650:
        if requested_loan_inr > max_rec_loan_inr:
            advice.append(f"Reduce requested loan amount to ₹{max_rec_loan_inr:,.2f} or below to meet 100% approval threshold.")
        advice.append("Switch crop selection to a higher-value cash crop (e.g., Cotton or Mustard) to increase revenue buffer.")
    else:
        advice.append("Application meets all underwriting standards. Eligible for immediate milestone disbursement.")

    return {
        "top_decision_drivers": drivers,
        "path_to_approval_advice": advice
    }


def generate_tranche_schedule(approved_loan_inr: float, credit_score: int):
    """
    Upgrade 1: Smart Milestone / Tranche-Based Disbursement Schedule.
    """
    if credit_score < 500 or approved_loan_inr <= 0:
        return {"status": "NO DISBURSEMENT", "tranches": []}
        
    return {
        "status": "MILESTONE_BASED_DISBURSEMENT",
        "tranches": [
            {
                "tranche": "Tranche 1 (Sowing Phase)",
                "percentage": "30%",
                "amount_inr": round(approved_loan_inr * 0.30, 2),
                "trigger_condition": "Disbursed immediately upon Stage 0 Land Verification."
            },
            {
                "tranche": "Tranche 2 (Mid-Season Crop Growth)",
                "percentage": "40%",
                "amount_inr": round(approved_loan_inr * 0.40, 2),
                "trigger_condition": "Disbursed at Day 45 post satellite NDVI verification of crop germination."
            },
            {
                "tranche": "Tranche 3 (Pre-Harvest & Fertilizers)",
                "percentage": "30%",
                "amount_inr": round(approved_loan_inr * 0.30, 2),
                "trigger_condition": "Disbursed at Day 90 prior to harvest cycle."
            }
        ]
    }


def generate_early_warning_radar(ndvi: float, rainfall_mm: float):
    """
    Upgrade 2: Post-Disbursement Satellite Early Warning Radar.
    """
    alerts = []
    if ndvi < 0.40:
        alerts.append("CRITICAL: Drop in vegetation index detected. Possible pest infestation or severe crop failure.")
    if rainfall_mm < 120:
        alerts.append("WARNING: Severe rainfall deficit over 120-day period. High drought stress risk.")
        
    status = "HIGH_RISK_ALERT" if len(alerts) > 0 else "HEALTHY_PORTFOLIO"
    return {
        "satellite_radar_status": status,
        "active_alerts": alerts if alerts else ["No stress factors detected. Farm trajectory optimal."]
    }


def evaluate_credit_risk(
    predicted_yield_tons_ha: float, 
    farm_size_ha: float, 
    requested_loan_amount_inr: float, 
    crop_name: str = 'Wheat',
    state: str = 'Rajasthan',
    ndvi: float = 0.65,
    rainfall_mm: float = 300.0
):
    # 1. Fetch Price per Ton in ₹
    price_per_ton_inr, pricing_source = get_mandi_price_inr(crop_name, state)
    
    # 2. Production & Revenue Calculations in ₹
    total_production_tons = predicted_yield_tons_ha * farm_size_ha
    gross_market_value_inr = total_production_tons * price_per_ton_inr
    
    # 3. Market Risk Buffer (10% Haircut)
    risk_adjusted_revenue_inr = gross_market_value_inr * 0.90
    
    # 4. Debt Coverage Assessment (DSCR)
    coverage_ratio = risk_adjusted_revenue_inr / requested_loan_amount_inr if requested_loan_amount_inr > 0 else 2.0
    
    # 5. Default Probability Mapping
    if coverage_ratio >= 2.0:
        prob_default = 0.04
    elif coverage_ratio >= 1.5:
        prob_default = 0.10
    elif coverage_ratio >= 1.1:
        prob_default = 0.22
    elif coverage_ratio >= 0.8:
        prob_default = 0.42
    else:
        prob_default = 0.75

    # 6. Dynamic Credit Score (300 - 800)
    credit_score = int(np.clip(round(300 + (500 * (1.0 - prob_default))), 300, 800))
    max_recommended_loan_inr = round(risk_adjusted_revenue_inr * 0.70, 2)
    
    decision = "APPROVED" if credit_score >= 650 else ("CONDITIONAL APPROVAL" if credit_score >= 500 else "REJECTED")
    approved_amount = min(requested_loan_amount_inr, max_recommended_loan_inr) if decision != "REJECTED" else 0.0

    # Execute 3 Core Upgrades
    tranche_schedule = generate_tranche_schedule(approved_amount, credit_score)
    radar = generate_early_warning_radar(ndvi, rainfall_mm)
    explainability = generate_explainability_and_advice(
        credit_score, coverage_ratio, requested_loan_amount_inr, max_recommended_loan_inr, crop_name, ndvi
    )

    return {
        "selected_crop": crop_name,
        "pricing_source": pricing_source,
        "market_price_per_quintal_inr": round(price_per_ton_inr / 10.0, 2),
        "gross_market_value_inr": round(gross_market_value_inr, 2),
        "risk_adjusted_revenue_inr": round(risk_adjusted_revenue_inr, 2),
        "credit_score": credit_score,
        "max_recommended_loan_inr": max_recommended_loan_inr,
        "decision": decision,
        "ai_explainability": explainability,
        "disbursement_schedule": tranche_schedule,
        "satellite_health_radar": radar
    }