import pandas as pd
import numpy as np
from joblib import load
from sklearn.preprocessing import MinMaxScaler
import os
import logging
import pyodbc
from datetime import datetime, timedelta

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s', 
    handlers=[
        logging.FileHandler("anomaly_detection.log"),
        logging.StreamHandler()
    ]
)

# Configuration SQL Server utilisant les informations de votre script
DB_CONFIG = {
    'driver': '{ODBC Driver 17 for SQL Server}',
    'server': "mokrani",  # Remplacez par le nom de votre serveur SQL Server
    'database': 'MISFAT',
    'trusted_connection': 'yes',  # Authentification Windows
    
}

MACHINES = [
    'G19', 'G26', 'MISFAT_3_Compresseur_3', 'MISFAT_3_G39f', 
    'MISFAT_3_D18f', 'MISFAT_3_G10f', 'MISFAT_3_TGBT_N3f'
]

# Dictionnaire de correspondance entre colonnes de la base de données et noms des modèles
MODEL_MAPPING = {
    'G19': 'Misfat3_G19',
    'G26': 'Misfat3_G26',
    'MISFAT_3_Compresseur_3': 'Compresseur3',
    'MISFAT_3_G39f': 'Misfat_3_G39',
    'MISFAT_3_D18f': 'Misfat_3_D18',
    'MISFAT_3_G10f': 'Misfat__G10',
    'MISFAT_3_TGBT_N3f': 'TGBT_3'
}

MODELS_FOLDER = "models"

def get_db_connection():
    """Établit une connexion à la base de données SQL Server."""
    try:
        # Construction de la chaîne de connexion pour SQL Server
        conn_str = (
            f"DRIVER={DB_CONFIG['driver']};"
            f"SERVER={DB_CONFIG['server']};"
            f"DATABASE={DB_CONFIG['database']};"
        )
        
        # Ajout de l'authentification Windows ou SQL Server selon la configuration
        if 'trusted_connection' in DB_CONFIG and DB_CONFIG['trusted_connection'] == 'yes':
            conn_str += "Trusted_Connection=yes;"
        else:
            conn_str += f"UID={DB_CONFIG['uid']};PWD={DB_CONFIG['pwd']};"
        
        connection = pyodbc.connect(conn_str)
        return connection
    except Exception as e:
        logging.error(f"Erreur de connexion à la base de données SQL Server: {e}")
        return None

def fetch_recent_data(hours=24):
    """Récupère les données des dernières heures depuis la base de données."""
    connection = get_db_connection()
    if not connection:
        return None

    try:
        with connection.cursor() as cursor:
            start_time = datetime.now() - timedelta(hours=hours)
            
            # Requête SQL Server (paramètres avec ? au lieu de %s pour pyodbc)
            sql = """
            SELECT * FROM misfat 
            WHERE Timestamp >= ? 
            ORDER BY Timestamp ASC
            """
            
            cursor.execute(sql, (start_time,))
            
            # Récupération des noms de colonnes
            columns = [column[0] for column in cursor.description]
            
            # Récupération de tous les résultats
            rows = cursor.fetchall()
            
            # Création du DataFrame à partir des résultats
            df = pd.DataFrame.from_records(rows, columns=columns)
            
            if df.empty:
                logging.warning(f"Aucune donnée trouvée pour les dernières {hours} heures")
                return None
                
            return df
    
    except Exception as e:
        logging.error(f"Erreur lors de la récupération des données: {e}")
        return None
    
    finally:
        connection.close()

def load_models():
    """Charge tous les modèles Elliptic Envelope."""
    models = {}
    
    for db_column, model_name_part in MODEL_MAPPING.items():
        model_name = f"elliptic_envelope_{model_name_part}.pkl"
        model_path = os.path.join(MODELS_FOLDER, model_name)
        
        try:
            if os.path.exists(model_path):
                models[db_column] = load(model_path)
                logging.info(f"Modèle chargé: {model_name}")
            else:
                logging.warning(f"Modèle non trouvé: {model_path}")
        except Exception as e:
            logging.error(f"Erreur lors du chargement du modèle {model_name}: {e}")
    
    return models

def detect_anomalies(data=None, hours=24):
   
    if data is None:
        data = fetch_recent_data(hours)
    
    if data is None or data.empty:
        return {"error": "Pas de données disponibles pour l'analyse"}
    
    if 'Timestamp' in data.columns:
        timestamp_col = 'Timestamp'
    elif 'timestamp' in data.columns:
        timestamp_col = 'timestamp'
    else:
        datetime_cols = [col for col in data.columns if data[col].dtype == 'datetime64[ns]']
        if datetime_cols:
            timestamp_col = datetime_cols[0]
        else:
            return {"error": "Aucune colonne d'horodatage trouvée dans les données"}
    
    if not pd.api.types.is_datetime64_dtype(data[timestamp_col]):
        try:
            data[timestamp_col] = pd.to_datetime(data[timestamp_col])
        except:
            return {"error": "Impossible de convertir la colonne d'horodatage en datetime"}
    
    models = load_models()
    if not models:
        return {"error": "Aucun modèle n'a pu être chargé"}
    
    results = {}
    anomalies_found = False
    
    for machine in MACHINES:
        if machine not in data.columns:
            machine_col = machine.replace('_', ' ')
            if machine_col not in data.columns:
                results[machine] = {"status": "error", "message": "Données non disponibles"}
                continue
            else:
                machine = machine_col
        
        if machine not in models:
            results[machine] = {"status": "error", "message": "Modèle non disponible"}
            continue
        
        machine_data = data[[timestamp_col, machine]].dropna().copy()
        
        if machine_data.empty:
            results[machine] = {"status": "warning", "message": "Pas de données valides"}
            continue
        
        scaler = MinMaxScaler()
        scaled_data = scaler.fit_transform(machine_data[[machine]])
        
        try:
            model = models[machine]
            predictions = model.predict(scaled_data)
            anomaly_scores = model.decision_function(scaled_data)
            
            anomaly_indices = np.where(predictions == -1)[0]
            
            if len(anomaly_indices) > 0:
                anomalies = machine_data.iloc[anomaly_indices].copy()
                anomalies['score'] = anomaly_scores[anomaly_indices]
                anomalies_list = anomalies.to_dict('records')
                anomalies_found = True
            else:
                anomalies_list = []
            
            results[machine] = {
                "status": "success",
                "total_points": len(machine_data),
                "anomalies_count": len(anomaly_indices),
                "anomalies": anomalies_list,
                "mean_score": float(np.mean(anomaly_scores))
            }
            
            logging.info(f"Machine {machine}: {len(anomaly_indices)} anomalies détectées sur {len(machine_data)} points")
            
        except Exception as e:
            logging.error(f"Erreur lors de la détection pour {machine}: {e}")
            results[machine] = {"status": "error", "message": str(e)}
    
    results["summary"] = {
        "machines_count": len(MACHINES),
        "machines_processed": sum(1 for m in results if results[m].get("status") == "success"),
        "anomalies_found": anomalies_found,
        "timestamp": datetime.now().isoformat()
    }
    
    return results

def get_historical_anomalies(start_date=None, end_date=None, machines=None):
    """
    Récupère les anomalies sur une période historique.
    
    Args:
        start_date: Date de début (str ou datetime)
        end_date: Date de fin (str ou datetime)
        machines: Liste des machines à analyser (si None, toutes les machines)
        
    Returns:
        dict: Résultats historiques de détection d'anomalies
    """
    if isinstance(start_date, str):
        start_date = pd.to_datetime(start_date)
    if isinstance(end_date, str):
        end_date = pd.to_datetime(end_date)
    
    if start_date is None:
        start_date = datetime.now() - timedelta(days=7)
    if end_date is None:
        end_date = datetime.now()
    if machines is None:
        machines = MACHINES
    
    connection = get_db_connection()
    if not connection:
        return {"error": "Impossible de se connecter à la base de données"}
    
    try:
        with connection.cursor() as cursor:
            # Requête adaptée pour SQL Server avec ? au lieu de %s
            sql = """
            SELECT * FROM misfat 
            WHERE Timestamp BETWEEN ? AND ? 
            ORDER BY Timestamp ASC
            """
            
            cursor.execute(sql, (start_date, end_date))
            
            # Récupération des noms de colonnes
            columns = [column[0] for column in cursor.description]
            
            # Récupération de tous les résultats
            rows = cursor.fetchall()
            
            # Création du DataFrame à partir des résultats
            data = pd.DataFrame.from_records(rows, columns=columns)
            
            if data.empty:
                return {"error": "Aucune donnée trouvée pour la période sélectionnée"}
            
            machines_to_analyze = [m for m in machines if m in data.columns]
            
            if not machines_to_analyze:
                return {"error": "Aucune des machines spécifiées n'est présente dans les données"}
            
            return detect_anomalies(data)
    
    except Exception as e:
        logging.error(f"Erreur lors de la récupération des données historiques: {e}")
        return {"error": str(e)}
    
    finally:
        connection.close()

if __name__ == "__main__":
    results = detect_anomalies(hours=48)
    print(f"Résultats: {len(results)} machines analysées")
    
    for machine, result in results.items():
        if machine != "summary":
            if result.get("status") == "success":
                print(f"{machine}: {result.get('anomalies_count')} anomalies sur {result.get('total_points')} points")
            else:
                print(f"{machine}: {result.get('message')}")