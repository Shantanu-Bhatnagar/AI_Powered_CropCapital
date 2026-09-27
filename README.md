# CropCapital Enterprise Underwriting

CropCapital is an automated, AI-driven agricultural loan evaluation and underwriting engine. It bridges the gap between modern financial institutions and rural farmers by leveraging satellite imagery, machine learning yield predictions, and robust debt-coverage models to provide instantaneous, fair loan decisions.

## The Workflow (How It Works)

1. **Farmer Requests a Loan:** A farmer visits the bank to request an agricultural loan.
2. **Data Entry:** The bank employee enters the farmer's basic details, farm size, requested loan amount, and the exact **Latitude & Longitude** of the farmland into the CropCapital frontend.
3. **Live Satellite Verification:** The frontend instantly pulls live satellite imagery of the entered coordinates so the employee can visually confirm the farmland. (Optional: An image patch can be uploaded for deep-learning analysis).
4. **AI Underwriting Engine:** The frontend sends this data to the FastAPI backend. 
    - The backend uses an **XGBoost** model to predict crop yields based on historical and seasonal climate telemetry.
    - It uses **PyTorch (ResNet18)** to verify if the land patch is indeed agricultural (if an image is provided).
    - It runs financial models to calculate the maximum safe lending cap and a risk-adjusted revenue projection.
5. **Instant Decision:** The UI renders a gorgeous, easy-to-read dashboard detailing the AI's credit score, explainable debt-coverage metrics, and an automated "Smart Tranche" disbursement schedule (e.g. releasing 30% for sowing, 40% mid-season, 30% pre-harvest).

## How We Help Stakeholders
- **Primary Stakeholders (Banks & Financial Institutions):**
  - **Risk Mitigation:** Automatically rejects applications where the loan exceeds the maximum safe cap or where land is not actively agricultural.
  - **Operational Efficiency:** Reduces underwriting time from days to seconds.
  - **Continuous Monitoring:** The smart tranche system ensures funds are only released if mid-season satellite health (NDVI) remains optimal.
  
- **Secondary Stakeholders (Farmers):** 
  - Faster loan approvals without waiting weeks for manual land surveys. 
  - Fairer assessments based on actual data (satellite health & weather) rather than subjective human biases.
  - Smart milestone disbursements help farmers manage their capital efficiently throughout the crop cycle.

## How to Run the Project

The project is split into two parts: a Python Backend (FastAPI) and a React Frontend (Vite).

### 1. Running the Python Backend
Make sure you have Python installed. The backend requires the `.pkl` and `.pth` machine learning models to be present in the directory.

1. Navigate to the root directory where the python files (`main.py`, `Verify_Land.py`, etc.) are located.
2. Install the required dependencies using the `requirements.txt` file:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```
   *The backend will now be running on http://localhost:8000*

### 2. Running the React Frontend
Make sure you have Node.js installed.

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install the node modules:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The frontend will now be accessible at http://localhost:5173*

## Future Enhancements
- **Multi-spectral Satellite Analysis:** Integrate directly with Google Earth Engine or Sentinel-2 APIs to automatically pull historical NDVI data for the coordinates instead of relying on manual image uploads.
- **Drone Integration:** Allow high-resolution drone survey image uploads for micro-level crop stress detection.
- **Blockchain Smart Contracts:** Tie the "Smart Tranche Schedule" directly to a blockchain network, automatically releasing stablecoin funds to the farmer's wallet when satellite triggers hit certain health thresholds.
- **Insurance Cross-Selling:** Automatically offer parametric insurance if the climate telemetry detects high volatility (e.g., predicted droughts).
