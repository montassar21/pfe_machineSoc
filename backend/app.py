from flask import Flask, jsonify, request
import pandas as pd
import threading
from flask_cors import CORS
import time
import json

from config import EMAIL_CONFIG
from functions import (
    get_machine_data, 
    check_machines_status, 
    detect_machine_stops, 
    send_alert_email, 
    surveiller_machines_automatique,
    call_detect_anomalies_periodically
)

from anomaly_detection import detect_anomalies, get_historical_anomalies
from prediction import load_models, predict_next_day_consumption


app = Flask(__name__)
CORS(app)

monitoring_active = False
monitoring_thread = None

# Global variable to store models
prediction_models = None

# API pour récupérer les données des machines
@app.route('/api/machine-data', methods=['GET'])
def api_get_machine_data():
    """API pour récupérer toutes les données des machines"""
    hours = request.args.get('hours', default=None, type=int)
    data = get_machine_data(hours)
    
    if isinstance(data, tuple) and len(data) > 1:
        return jsonify(data[0]), data[1]
    return jsonify(data)

# API pour récupérer le statut des machines
@app.route('/api/machine-status', methods=['GET'])
def api_get_machine_status():
    """API pour récupérer le statut des machines"""
    status = check_machines_status()
    
    if isinstance(status, tuple) and len(status) > 1:
        return jsonify(status[0]), status[1]
    return jsonify(status)

# API pour récupérer les arrêts de machines
@app.route('/api/machine-stops', methods=['GET'])
def api_get_machine_stops():
    """API pour récupérer les arrêts de machines"""
    stops = detect_machine_stops()
    
    if isinstance(stops, tuple) and len(stops) > 1:
        return jsonify(stops[0]), stops[1]
    return jsonify(stops)

# API pour envoyer une alerte manuellement
@app.route('/api/send-alert', methods=['POST'])
def api_send_alert():
    """API pour envoyer une alerte manuellement"""
    data = request.json
    
    if not data or 'anomalies' not in data or 'model_name' not in data:
        return jsonify({"error": "Données manquantes"}), 400
    
    try:
        anomalies = pd.DataFrame(data['anomalies'])
        
        success = send_alert_email(
            anomalies=anomalies,
            model_name=data['model_name'],
            sender_email=EMAIL_CONFIG['sender_email'],
            receiver_email=EMAIL_CONFIG['receiver_email'],
            password=EMAIL_CONFIG['sender_password']
        )
        
        if success:
            return jsonify({"status": "success", "message": "Alerte envoyée avec succès"})
        else:
            return jsonify({"status": "error", "message": "Échec de l'envoi de l'alerte"}), 500
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/start-monitoring', methods=['POST'])
def api_start_monitoring():
    """API pour démarrer la surveillance automatique"""
    global monitoring_active, monitoring_thread
    
    try:
        # Check if monitoring is already active
        if monitoring_active and monitoring_thread and monitoring_thread.is_alive():
            return jsonify({"status": "warning", "message": "La surveillance est déjà active"}), 200
            
        frequence = request.json.get('frequence_minutes', 5)
        
        monitoring_thread = threading.Thread(
            target=surveiller_machines_automatique,
            args=(frequence,),
            daemon=True
        )
        monitoring_active = True
        monitoring_thread.start()
        
        return jsonify({"status": "success", "message": f"Surveillance démarrée avec une fréquence de {frequence} minutes"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/stop-monitoring', methods=['POST'])
def api_stop_monitoring():
    """API pour arrêter la surveillance automatique"""
    global monitoring_active, monitoring_thread
    
    try:
        if monitoring_active and monitoring_thread and monitoring_thread.is_alive():
            monitoring_active = False
            
            time.sleep(0.5)
            
            return jsonify({"status": "success", "message": "Surveillance arrêtée"})
        else:
            return jsonify({"status": "warning", "message": "Aucune surveillance active à arrêter"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/monitoring-status', methods=['GET'])
def api_monitoring_status():
    """API pour vérifier l'état de la surveillance"""
    global monitoring_active, monitoring_thread
    
    is_active = monitoring_active and monitoring_thread and monitoring_thread.is_alive()
    
    return jsonify({
        "status": "active" if is_active else "inactive",
        "message": "Surveillance en cours" if is_active else "Surveillance arrêtée"
    })

# API pour détecter les anomalies
@app.route('/api/detect-anomalies', methods=['GET'])
def api_detect_anomalies():
    """API pour détecter les anomalies avec les modèles Elliptic Envelope"""
    try:
        hours = request.args.get('hours', default=48, type=int)
        
        results = detect_anomalies(hours=hours)
        
        return jsonify(results)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# API pour récupérer les anomalies sur une période historique
@app.route('/api/historical-anomalies', methods=['GET'])
def api_historical_anomalies():
    """API pour récupérer les anomalies sur une période historique"""
    try:
        start_date = request.args.get('start_date', default=None)
        end_date = request.args.get('end_date', default=None)
        machines = request.args.get('machines', default=None)
        
        if machines and isinstance(machines, str):
            machines = machines.split(',')
        
        results = get_historical_anomalies(
            start_date=start_date,
            end_date=end_date,
            machines=machines
        )

        print(results)
        
        return jsonify(results)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# API pour analyser une machine spécifique
@app.route('/api/analyze-machine', methods=['POST'])
def api_analyze_machine():
    """API pour analyser une machine spécifique avec des données fournies"""
    try:
        data = request.json
        
        if not data or 'data' not in data or 'machine' not in data:
            return jsonify({"error": "Données manquantes"}), 400
            
        machine_name = data['machine']
        machine_data = pd.DataFrame(data['data'])
        
        if 'timestamp' not in machine_data.columns.str.lower() and 'Timestamp' not in machine_data.columns:
            return jsonify({"error": "Les données doivent contenir une colonne d'horodatage (timestamp ou Timestamp)"}), 400
            
        if machine_name not in machine_data.columns:
            return jsonify({"error": f"Les données ne contiennent pas la colonne {machine_name}"}), 400
            
        results = detect_anomalies(data=machine_data)
        
        if machine_name in results:
            machine_results = {
                "machine": machine_name,
                "results": results[machine_name],
                "summary": results["summary"]
            }
            return jsonify(machine_results)
        else:
            return jsonify({"error": f"Pas de résultats pour la machine {machine_name}"}), 404
            
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Nouvelle API pour prédire la consommation d'énergie
@app.route('/api/predict-consumption', methods=['POST'])
def api_predict_consumption():
    """API pour prédire la consommation d'énergie pour le jour suivant"""
    global prediction_models
    
    try:
        data = request.json
        
        if not data or not isinstance(data, dict):
            return jsonify({"error": "Données manquantes. Fournissez les valeurs de consommation actuelles pour chaque machine"}), 400
        
        # Filter out non-numeric values
        current_consumption = {}
        for machine, value in data.items():
            try:
                current_consumption[machine] = float(value)
            except (ValueError, TypeError):
                current_consumption[machine] = None
        
        # Load models if not already loaded
        if prediction_models is None:
            models_dir = request.args.get('models_dir', default='prediction_models')
            prediction_models = load_models(models_dir)
        
        # Make predictions
        results = predict_next_day_consumption(current_consumption, prediction_models)
        
        # Format response
        formatted_results = {}
        for machine, result in results.items():
            if result['status'] == 'success':
                formatted_results[machine] = {
                    'current_value': current_consumption[machine],
                    'predicted_value': float(result['prediction']),
                    'status': 'success'
                }
            else:
                formatted_results[machine] = {
                    'current_value': current_consumption[machine],
                    'predicted_value': None,
                    'status': 'error',
                    'message': result['message']
                }
        
        return jsonify({
            "status": "success",
            "predictions": formatted_results
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# API pour obtenir la liste des modèles de prédiction disponibles
@app.route('/api/available-prediction-models', methods=['GET'])
def api_available_prediction_models():
    """API pour récupérer la liste des modèles de prédiction disponibles"""
    global prediction_models
    
    try:
        models_dir = request.args.get('models_dir', default='prediction_models')
        
        # Load models if not already loaded
        if prediction_models is None:
            prediction_models = load_models(models_dir)
        
        # Return the list of available models
        return jsonify({
            "status": "success",
            "models": list(prediction_models.keys())
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    # Load prediction models at startup
    try:
        prediction_models = load_models()
    except Exception as e:
        print(f"Error loading prediction models: {e}")
    
    # Lancer le thread en arrière-plan
    monitoring_thread_anomalies = threading.Thread(target=call_detect_anomalies_periodically, daemon=True)
    monitoring_thread_anomalies.start()    
   
    monitoring_thread = threading.Thread(
        target=surveiller_machines_automatique, 
        daemon=True
    )
    monitoring_thread.start()
    
    app.run(debug=True, use_reloader=False,host='0.0.0.0', port=5000)