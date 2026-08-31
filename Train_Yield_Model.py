import pandas as pd
import numpy as np 
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
import joblib

def generate_synthetic_data(num_samples=1000):
    np.random.seed(42)
    mean_ndvi = np.random.uniform(0.3, 0.85, num_samples)
    seasonal_rainfall_mm = np.random.uniform(400, 1200, num_samples)
    avg_temp_c = np.random.uniform(18, 35, num_samples)
    soil_ph = np.random.uniform(5.5, 7.5, num_samples)

    #Mathemathical formulation for crop yield (tons/ha)
    yield_tons_ha =(
        (mean_ndvi * 4.5) + (seasonal_rainfall_mm * 0.002) - np.random.normal(0, 0.2, num_samples)
    )
    yield_tons_ha = np.clip(yield_tons_ha, 0.5 , 8.0)

    data = pd.DataFrame({
        'mean_ndvi': mean_ndvi,
        'seasonal_rainfall_mm': seasonal_rainfall_mm,
        'avg_temp_c': avg_temp_c,
        'soil_ph': soil_ph,
        'yield_tons_ha': yield_tons_ha
    })
    return data

def train_model():
    df = generate_synthetic_data(num_samples=1000)

    X=df[['mean_ndvi', 'seasonal_rainfall_mm', 'avg_temp_c', 'soil_ph']]
    Y = df['yield_tons_ha']

    X_train, X_test , Y_train, Y_test = train_test_split(X, Y, test_size=0.2 , random_state=42)
    model = XGBRegressor(n_estimators=100, learning_rate=0.05, max_depth=4, random_state=42)
    model.fit(X_train, Y_train)

    predictions = model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(Y_test, predictions))
    r2 = r2_score(Y_test, predictions)

    print(f"Model Trained Successfully!")
    print(f"Validation RSME: {rmse:.4f} tons/ha")
    print(f"Validation R2 Score:{r2:.4f}")

    joblib.dump(model, "crop_yield_model.pkl")
    print("Saved model to crop_yield_model.pkl")

if __name__ == "__main__":
    train_model()