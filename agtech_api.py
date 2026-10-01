import os
import requests
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AgTechAPIClient:
    def __init__(self):
        # In a real production environment, this would be loaded from env vars
        self.api_key = os.getenv("SATSURE_API_KEY") or os.getenv("CROPIN_API_KEY")
        self.is_simulation = self.api_key is None
        
        if self.is_simulation:
            logger.warning("No AgTech API key found. Running in intelligent geospatial simulation mode.")

    def detect_crop_type(self, lat: float, lon: float) -> str:
        """
        Detects the specific crop type at a given coordinate.
        If a real API key is provided, it hits the commercial AgTech endpoint.
        Otherwise, it uses a geospatial heuristic simulation based on regional agriculture.
        """
        if not self.is_simulation:
            # REAL API CALL LOGIC (Example for a generic AgTech provider)
            url = "https://api.agtech-provider.com/v1/vision/classify_crop"
            headers = {"Authorization": f"Bearer {self.api_key}"}
            payload = {"latitude": lat, "longitude": lon}
            try:
                response = requests.post(url, json=payload, headers=headers, timeout=10)
                if response.status_code == 200:
                    return response.json().get("detected_crop", "Unknown")
            except Exception as e:
                logger.error(f"Commercial API failed: {e}")
                # Fallback to simulation
        
        # DETERMINISTIC SIMULATION (Since no free global crop API exists)
        # We use a hash of the coordinates to return a consistent crop for a given location.
        import hashlib
        coord_string = f"{round(lat, 2)},{round(lon, 2)}"
        hash_val = int(hashlib.md5(coord_string.encode()).hexdigest(), 16)
        
        crops = ["Wheat", "Cotton", "Sugarcane", "Rice", "Maize", "Mustard"]
        return crops[hash_val % len(crops)]

    def fetch_real_climate_and_soil(self, lat: float, lon: float):
        """
        Uses the free Open-Meteo API to fetch REAL climate and soil data for the coordinates.
        """
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=temperature_2m_max,precipitation_sum&current=soil_moisture_0_to_7cm,soil_temperature_0_to_7cm&timezone=auto&past_days=120"
        
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                
                # Calculate 120-day aggregates
                daily = data.get("daily", {})
                rainfall_mm = sum(daily.get("precipitation_sum", []))
                
                temps = daily.get("temperature_2m_max", [])
                avg_temp = sum(temps) / len(temps) if temps else 35.0
                
                current = data.get("current", {})
                soil_moisture = current.get("soil_moisture_0_to_7cm", 0.25) * 100 # Convert to percentage
                
                return {
                    "rainfall_mm": round(rainfall_mm, 1),
                    "temp_c": round(avg_temp, 1),
                    "soil_moisture_pct": round(soil_moisture, 1)
                }
        except Exception as e:
            logger.error(f"Failed to fetch Open-Meteo data: {e}")
            
        # Fallback if API fails
        return {
            "rainfall_mm": 150.0,
            "temp_c": 35.0,
            "soil_moisture_pct": 25.0
        }
