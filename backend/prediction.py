import os
import pandas as pd
import numpy as np
import joblib
from typing import Dict, List, Union, Optional

def load_models(models_dir: str = 'prediction_models') -> Dict:
    """
    Load all Linear Regression models from the specified directory.
    
    Args:
        models_dir (str): Directory containing the saved models
        
    Returns:
        Dict: Dictionary mapping machine names to their respective models
    """
    models = {}
    
    if not os.path.exists(models_dir):
        raise FileNotFoundError(f"Models directory '{models_dir}' not found")
    
    for filename in os.listdir(models_dir):
        if filename.startswith('LinearRegression_') and filename.endswith('.pkl'):
            # Extract machine name from filename
            machine_name = filename.replace('LinearRegression_', '').replace('.pkl', '')
            
            # Load the model
            model_path = os.path.join(models_dir, filename)
            model = joblib.load(model_path)
            
            # Add to dictionary
            models[machine_name] = model
    
    if not models:
        print("Warning: No models found in the specified directory")
    else:
        print(f"Loaded {len(models)} models: {', '.join(models.keys())}")
    
    return models

def predict_next_day_consumption(
    current_consumption: Dict[str, float],
    models: Optional[Dict] = None,
    models_dir: str = 'prediction_models'
) -> Dict[str, Dict[str, float]]:
    """
    Predict next day consumption for machines using previously trained Linear Regression models.
    
    Args:
        current_consumption (Dict[str, float]): Dictionary mapping machine names to their current consumption values
        models (Dict, optional): Pre-loaded models dictionary. If None, models will be loaded from models_dir
        models_dir (str): Directory containing the saved models, used only if models=None
        
    Returns:
        Dict[str, Dict[str, float]]: Dictionary with prediction results for each machine
    """
    # Load models if not provided
    if models is None:
        models = load_models(models_dir)
    
    results = {}
    
    for machine, consumption in current_consumption.items():
        # Skip if consumption value is None or NaN
        if consumption is None or (isinstance(consumption, float) and np.isnan(consumption)):
            results[machine] = {
                'prediction': None,
                'status': 'error',
                'message': 'Current consumption value is None or NaN'
            }
            continue
        
        # Check if we have a model for this machine
        model_key = machine
        if model_key not in models:
            # Try alternative key formats
            alternative_keys = [k for k in models.keys() if machine in k]
            if alternative_keys:
                model_key = alternative_keys[0]
                print(f"Using model '{model_key}' for machine '{machine}'")
            else:
                results[machine] = {
                    'prediction': None,
                    'status': 'error',
                    'message': f'No model found for machine {machine}'
                }
                continue
        
        try:
            # Predict next day consumption
            model = models[model_key]
            prediction = model.predict([[consumption]])[0]
            
            results[machine] = {
                'prediction': prediction,
                'status': 'success',
                'message': 'Prediction successful'
            }
        except Exception as e:
            results[machine] = {
                'prediction': None,
                'status': 'error',
                'message': f'Prediction error: {str(e)}'
            }
    
    return results