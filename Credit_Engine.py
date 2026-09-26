import os
import json
import numpy as np

JSON_DATASET_PATH = "mandi_prices.json"

# Official Minimum Support Price (MSP) Floor rates (₹ / Metric Ton)
CROP_MSP_FLOOR_PER_TON_INR = {
    'Wheat': 22750.0,      # ₹2,275 / quintal
    'Rice': 23000.0,       # ₹2,300 / quintal
    'Cotton': 71200.0,     # ₹7,120 / quintal
    'Mustard': 56500.0,    # ₹5,650 / quintal
    'Maize': 20900.0,      # ₹2,090 / quintal
    'Sugarcane': 3150.0,   # ₹315 / quintal
    'AnnualCrop': 22000.0,
    'PermanentCrop': 35000.0
}

def get_mandi_price_inr(crop_name: str, state: str = "Rajasthan") -> tuple[float, str]:
    """
    Reads local mandi_prices.json to fetch market modal price (converted to ₹/metric ton).
    Falls back to CACP MSP floor values if state/crop is unlisted.
    """
    if os.path.exists(JSON_DATASET_PATH):
        try:
            with open(JSON_DATASET_PATH, 'r') as f:
                data = json.load(f)
                
            state_data = data.get(state, data.get("National_Average", {}))
            modal_price_qtl = state_data.get(crop_name)
            
            if modal_price_qtl:
                # Convert ₹/quintal to ₹/metric ton (1 Ton = 10 Quintals)
                price_per_ton_inr = float(modal_price_qtl) * 10.0
                return round(price_per_ton_inr, 2), f"Agmarknet Mandi Dataset ({state})"
        except Exception as e:
            print(f"Dataset Notice: Using MSP floor due to error: {str(e)}")

    fallback_price = CROP_MSP_FLOOR_PER_TON_INR.get(crop_name, 22000.0)
    return fallback_price, "Official CACP MSP Floor Benchmark"

def evaluate_credit_risk(
    predicted_yield_tons_ha: float, 
    farm_size_ha: float, 
    requested_loan_amount_inr: float, 
    crop_name: str = 'Wheat',
    state: str = 'Rajasthan'
):
    # 1. Fetch Market Price per Ton in ₹
    price_per_ton_inr, pricing_source = get_mandi_price_inr(crop_name, state)
    
    # 2. Production & Revenue Calculations in ₹
    total_production_tons = predicted_yield_tons_ha * farm_size_ha
    gross_market_value_inr = total_production_tons * price_per_ton_inr
    
    # 3. Apply 10% Market Volatility Buffer (Risk-Adjusted Value)
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

    # 6. Credit Scoring (300 - 800)
    credit_score = int(np.clip(round(300 + (500 * (1.0 - prob_default))), 300, 800))
    max_recommended_loan_inr = round(risk_adjusted_revenue_inr * 0.70, 2)
    
    decision = "APPROVED" if credit_score >= 650 else ("CONDITIONAL APPROVAL" if credit_score >= 500 else "REJECTED")
        
    return {
        "selected_crop": crop_name,
        "pricing_source": pricing_source,
        "market_price_per_quintal_inr": round(price_per_ton_inr / 10.0, 2),
        "market_price_per_ton_inr": price_per_ton_inr,
        "gross_market_value_inr": round(gross_market_value_inr, 2),
        "risk_adjusted_revenue_inr": round(risk_adjusted_revenue_inr, 2),
        "probability_of_default": round(prob_default, 4),
        "credit_score": credit_score,
        "max_recommended_loan_inr": max_recommended_loan_inr,
        "decision": decision
    }