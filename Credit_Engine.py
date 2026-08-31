import numpy as np

CROP_PRICES_PER_TON = {
    'AnnualCrop': 250.0,
    "PermanentCrop":350.0
}

def evaluate_credit_risk(predicted_yield_tons_ha, farm_size_ha, requested_loan_amount, crop_type='AnnualCrop'):
    price_per_ton = CROP_PRICES_PER_TON.get(crop_type, 250.0)
    expected_revenue = predicted_yield_tons_ha*farm_size_ha*price_per_ton

    if requested_loan_amount>0:
        coverage_ratio = expected_revenue / requested_loan_amount

    else:
        coverage_ratio = 2.0 

    if coverage_ratio>=2.0:
        prob_default = 0.05
    elif coverage_ratio>=1.5:
        prob_default = 0.12
    elif coverage_ratio >= 1.1:
        prob_default = 0.25
    elif coverage_ratio >= 0.8:
        prob_default = 0.45
    else:
        prob_default = 0.75

    raw_score = 300 + (500 * (1.0 - prob_default))
    credit_score = int(np.clip(round(raw_score), 300, 800))

    max_recommended_loan = round(expected_revenue * 0.70 , 2)

    if credit_score >= 650:
        decision = "APPROVED"
    elif credit_score >= 500:
        decision = "CONDITIONAL APPROVAL"
    else:
        decision = "REJECTED"

    return {
        "expected_revenue": round(expected_revenue, 2),
        "probability_of_default": round(prob_default, 4),
        "credit_score": credit_score,
        "max_recommended_loan": max_recommended_loan,
        "decision": decision
    }

if __name__ == "__main__":
    sample_result = evaluate_credit_risk(
        predicted_yield_tons_ha= 3.85,
        farm_size_ha= 2.5,
        requested_loan_amount= 1200.0,
        crop_type='AnnualCrop'
    )
    print("Credit Risk Evaluation Output:")
    for key, value in sample_result.items():
        print(f" {key}:{value}")