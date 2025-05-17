import pyodbc
import pandas as pd
from datetime import datetime, timedelta
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import time
import threading

from config import DB_CONFIG, EMAIL_CONFIG, MACHINE_COLUMNS


def get_db_connection():
    """Établit une connexion à la base de données SQL Server"""
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
        
        conn = pyodbc.connect(conn_str)
        return conn
    except pyodbc.Error as err:
        print(f"Erreur de connexion à la base de données: {err}")
        return None

def envoyer_mail_arret_machine(machine_name, start_time, hours_stopped, sender_email, sender_password, receiver_email):
    """
    Envoie un email pour signaler qu'une machine est arrêtée depuis X heures.
    """
    subject = f"🚨 Machine {machine_name} arrêtée depuis {hours_stopped}h"
    logo_url = "https://misfat.com.tn/wp-content/uploads/2020/10/misfsat-filtration-logo_1.png"
    
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px;">
        <div style="background-color: white; padding: 30px; border-radius: 12px; max-width: 700px; margin: auto; border: 1px solid #ddd;">
            <div style="text-align: center;">
                <img src="{logo_url}" alt="Logo MISFAT" style="width: 200px;"/>
                <h2 style="color: #e60000;">🚨 Alerte Machine Arrêtée</h2>
            </div>
            <p style="font-size: 16px; color: #333;">
                Bonjour,<br><br>
                La machine <strong>{machine_name}</strong> est arrêtée depuis <strong>{hours_stopped} heures</strong>.<br><br>
                <strong>Début de l'arrêt :</strong> {start_time.strftime('%d/%m/%Y %H:%M')}<br><br>
                Merci de vérifier rapidement.<br><br>
                <em>(Ceci est un message automatique)</em>
            </p>
            <p style="color: #555; font-size: 12px; text-align: center;">
                © 2025 MISFAT Filtration
            </p>
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["From"] = sender_email
    msg["To"] = receiver_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.send_message(msg)
            print(f"✅ Email envoyé pour {machine_name} arrêtée depuis {hours_stopped}h.")
            return True
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi : {e}")
        return False

def send_alert_email(anomalies, model_name, sender_email, receiver_email, password):
    """
    Envoie un email d'alerte formaté proprement avec logo, tableau d'anomalies, et modèle utilisé.
    """
    subject = f"🚨 Alerte : Anomalies détectées - {model_name}"

    # Nettoyage
    anomalies_display = anomalies.copy()
    anomalies_display.columns = [col.lower() for col in anomalies_display.columns]  # tout en minuscule

    # Déterminer les colonnes à afficher
    expected_cols = ['machine', 'date']
    if 'consommation' in anomalies_display.columns:
        expected_cols.append('consommation')
    elif 'valeur' in anomalies_display.columns:
        expected_cols.append('valeur')
    
    anomalies_display = anomalies_display[expected_cols]

    # Convertir anomalies en tableau HTML
    table_html = anomalies_display.to_html(index=False, justify='center', border=1)

    # Logo Misfat
    logo_url = "https://misfat.com.tn/wp-content/uploads/2020/10/misfsat-filtration-logo_1.png"

    # Corps HTML du mail
    body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px;">
            <div style="background-color: white; padding: 30px; border-radius: 12px; border: 1px solid #ddd; max-width: 800px; margin: auto;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <img src="{logo_url}" alt="Logo MISFAT" style="width: 200px;"/>
                    <h2 style="color: #e60000;">🚨 Alerte : Anomalies Détectées</h2>
                </div>
                <p style="font-size: 16px; color: #333;">
                    Bonjour,<br><br>
                    Nous avons détecté des anomalies dans les données de consommation. 
                    Merci de bien vouloir <strong>vérifier rapidement</strong> les équipements concernés ci-dessous.
                </p>
                <br>
                <p style="font-size: 16px;"><strong>Modèle utilisé :</strong> {model_name}</p>
                <p style="font-size: 16px;"><strong>Détails des anomalies :</strong></p>
                {table_html}
                <br><br>
                <p style="color: #555; font-size: 12px; text-align: center;">
                    Merci de votre réactivité.<br>
                    © 2025 MISFAT Filtration - Tous droits réservés
                </p>
            </div>
        </body>
    </html>
    """

    # Création du message email
    msg = MIMEMultipart("alternative")
    msg['From'] = sender_email
    msg['To'] = receiver_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'html'))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(sender_email, password)
            server.send_message(msg)
            print("✅ Email d'alerte envoyé avec succès.")
            return True
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi de l'email : {e}")
        return False

def get_machine_data(hours=None):
    """
    Récupère les données des machines de la base de données
    Si hours est spécifié, limite les données aux dernières X heures
    """
    try:
        conn = get_db_connection()
        if not conn:
            return {"error": "Erreur de connexion à la base de données"}, 500
        
        cursor = conn.cursor(as_dict=True)
        
        if hours is not None:
            # Calculer la date limite
            time_limit = datetime.now() - timedelta(hours=hours)
            
            # Requête avec filtrage temporel
            query = """
            SELECT * FROM misfat 
            WHERE Timestamp >= ?
            ORDER BY Timestamp DESC
            """
            cursor.execute(query, (time_limit,))
        else:
            # Récupérer toutes les données sans filtrage temporel
            query = """
            SELECT * FROM misfat 
            ORDER BY Timestamp DESC
            """
            cursor.execute(query)
        
        results = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return results
    except pyodbc.Error as e:
        print(f"Erreur lors de la récupération des données: {e}")
        return {"error": str(e)}, 500

def check_machines_status():
    """
    Vérifie l'état de fonctionnement des machines
    Retourne un dictionnaire avec le statut de chaque machine
    """
    try:
        # Récupérer les dernières données
        data = get_machine_data()
        
        if isinstance(data, tuple) and "error" in data[0]:
            return data
        
        df = pd.DataFrame(data)
        
        if df.empty:
            return {"error": "Aucune donnée récente disponible"}, 404
        
        latest_data = df.iloc[0]
        
        machine_status = {}
        for machine in MACHINE_COLUMNS:
            if machine in latest_data:
                if latest_data[machine] is None:
                    machine_status[machine] = "Déconnecté"
                elif float(latest_data[machine]) < 0.5:  
                    machine_status[machine] = "Arrêtée"
                else:
                    machine_status[machine] = "En fonctionnement"
        
        timestamp = latest_data.get("Timestamp", datetime.now())
        if isinstance(timestamp, str):
            timestamp = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")
            
        result = {
            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "machines": machine_status
        }
        
        return result
    except Exception as e:
        print(f"Erreur lors de la vérification des machines: {e}")
        return {"error": str(e)}, 500

def detect_machine_stops():
    """
    Détecte les machines arrêtées et retourne les informations sur les arrêts
    """
    try:
        data = get_machine_data()
        
        if isinstance(data, tuple) and "error" in data[0]:
            return data
        
        df = pd.DataFrame(data)
        
        if df.empty:
            return {"error": "Aucune donnée récente disponible"}, 404
        
        if not pd.api.types.is_datetime64_any_dtype(df['Timestamp']):
            df['Timestamp'] = pd.to_datetime(df['Timestamp'])
        
        # Trier par ordre chronologique
        df = df.sort_values(by='Timestamp')
        
        # Lister les arrêts de machine
        machine_stops = []
        
        for machine in MACHINE_COLUMNS:
            if machine not in df.columns:
                continue
                
            df['is_stopped'] = df[machine].apply(lambda x: x is None or float(x) < 0.5 if x is not None else True)
            
            state_changes = df['is_stopped'].diff().fillna(0) != 0
            
            if state_changes.any():
                change_points = df[state_changes].copy()
                
                for i in range(len(change_points) - 1):
                    current_state = change_points.iloc[i]['is_stopped']
                    next_timestamp = change_points.iloc[i+1]['Timestamp']
                    current_timestamp = change_points.iloc[i]['Timestamp']
                    
                    if current_state:
                        duration = (next_timestamp - current_timestamp).total_seconds() / 3600  # en heures
                        
                        if duration >= 1:
                            machine_stops.append({
                                "machine": machine,
                                "start_time": current_timestamp,
                                "end_time": next_timestamp,
                                "duration_hours": round(duration, 2)
                            })
                
                if df.iloc[-1]['is_stopped']:
                    last_change = df[state_changes].iloc[-1]['Timestamp']
                    current_time = datetime.now()
                    duration = (current_time - last_change).total_seconds() / 3600
                    
                    if duration >= 1:
                        machine_stops.append({
                            "machine": machine,
                            "start_time": last_change,
                            "end_time": current_time,
                            "duration_hours": round(duration, 2),
                            "current": True
                        })
        
        return machine_stops
    except Exception as e:
        print(f"Erreur lors de la détection des arrêts: {e}")
        return {"error": str(e)}, 500

def detect_anomalies(recent_hours=12, model_name="Détection statistique"):
    """
    Détecte les anomalies dans les données de consommation
    Retourne un DataFrame avec les anomalies détectées
    """
    try:
        # Récupérer les données récentes (par défaut 12 dernières heures)
        data = get_machine_data(hours=recent_hours)
        
        if isinstance(data, tuple) and "error" in data[0]:
            return None
        
        df = pd.DataFrame(data)
        
        if df.empty:
            print("Aucune donnée récente disponible pour détecter les anomalies")
            return None
        
        # Convertir les timestamps en datetime si nécessaire
        if not pd.api.types.is_datetime64_any_dtype(df['Timestamp']):
            df['Timestamp'] = pd.to_datetime(df['Timestamp'])
        
        # Initialiser le DataFrame pour les anomalies
        anomalies = []
        
        # Pour chaque machine, détecter les anomalies
        for machine in MACHINE_COLUMNS:
            if machine not in df.columns:
                continue
            
            # Convertir en numérique et ignorer les valeurs nulles
            df[machine] = pd.to_numeric(df[machine], errors='coerce')
            machine_data = df[['Timestamp', machine]].dropna()
            
            if len(machine_data) < 5:  # Au moins 5 points pour calculer des statistiques
                continue
            
            # Calcul des seuils statistiques
            mean = machine_data[machine].mean()
            std = machine_data[machine].std()
            upper_threshold = mean + 3 * std  # Seuil supérieur à 3 écarts-types
            lower_threshold = max(0, mean - 3 * std)  # Seuil inférieur (minimum 0)
            
            # Identifier les anomalies
            machine_anomalies = machine_data[
                (machine_data[machine] > upper_threshold) | 
                ((machine_data[machine] < lower_threshold) & (machine_data[machine] > 0.5))  # Ignorer les machines arrêtées
            ]
            
            # Ajouter au DataFrame d'anomalies
            for _, row in machine_anomalies.iterrows():
                anomalies.append({
                    'Machine': machine,
                    'Date': row['Timestamp'],
                    'Consommation': row[machine],
                    'Seuil_Min': lower_threshold,
                    'Seuil_Max': upper_threshold,
                    'Moyenne': mean
                })
        
        if not anomalies:
            return None
            
        anomalies_df = pd.DataFrame(anomalies)
        anomalies_df = anomalies_df.sort_values(by='Date', ascending=False)
        
        return anomalies_df
    except Exception as e:
        print(f"Erreur lors de la détection des anomalies: {e}")
        return None

# Variables globales pour le monitoring
monitoring_active = False
anomaly_monitoring_active = False
monitoring_thread = None
anomaly_monitoring_thread = None

def surveiller_machines_automatique(frequence_verification_minutes=5):
    """
    Surveille en temps réel toutes les machines arrêtées et envoie un mail toutes les 2h d'arrêt prolongé.
    """
    global monitoring_active
    deja_alerte = {}
    
    # Set the flag to True when starting
    monitoring_active = True
    
    while monitoring_active:  # Check the flag on each iteration
        try:
            machine_stops = detect_machine_stops()
            
            if isinstance(machine_stops, tuple) and "error" in machine_stops[0]:
                print(f"Erreur lors de la détection des arrêts: {machine_stops[0]['error']}")
                time.sleep(frequence_verification_minutes * 60)
                continue
                
            now = datetime.now()
            
            current_stops = [stop for stop in machine_stops if stop.get("current", False)]
            
            for stop in current_stops:
                machine_name = stop['machine']
                start_time = stop['start_time']
                
                if isinstance(start_time, str):
                    start_time = datetime.strptime(start_time, "%Y-%m-%d %H:%M:%S")
                
                heures_ecoulees = int((now - start_time).total_seconds() / 3600)
                
                if heures_ecoulees > 0 and heures_ecoulees % 2 == 0:
                    dernier_alerte = deja_alerte.get(f"{machine_name}_{heures_ecoulees}", False)
                    
                    if not dernier_alerte:
                        envoyer_mail_arret_machine(
                            machine_name=machine_name,
                            start_time=start_time,
                            hours_stopped=heures_ecoulees,
                            sender_email=EMAIL_CONFIG['sender_email'],
                            sender_password=EMAIL_CONFIG['sender_password'],
                            receiver_email=EMAIL_CONFIG['receiver_email']
                        )
                        deja_alerte[f"{machine_name}_{heures_ecoulees}"] = True
            
            print(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] Surveillance effectuée, {len(current_stops)} machines actuellement arrêtées")
            
        except Exception as e:
            print(f"Erreur lors de la surveillance automatique: {e}")
        
        # Check if monitoring is still active before sleeping
        if monitoring_active:
            time.sleep(frequence_verification_minutes * 60)
    
    print("Surveillance arrêtée.")

def surveiller_anomalies_automatique(frequence_verification_minutes=15, recent_hours=12, model_name="Détection statistique"):
    """
    Surveille automatiquement les anomalies de consommation et envoie des alertes
    """
    global anomaly_monitoring_active
    anomaly_tracking = {}  # Pour suivre les anomalies déjà signalées
    
    # Activer la surveillance
    anomaly_monitoring_active = True
    
    while anomaly_monitoring_active:
        try:
            now = datetime.now()
            print(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] Vérification des anomalies...")
            
            # Détecter les anomalies
            anomalies_df = detect_anomalies(recent_hours=recent_hours, model_name=model_name)
            
            if anomalies_df is not None and not anomalies_df.empty:
                # Générer un ID unique pour ce lot d'anomalies (basé sur l'heure)
                current_anomalies_id = now.strftime("%Y%m%d_%H%M")
                
                # Vérifier si ces anomalies ont déjà été signalées
                # Créer une empreinte des anomalies actuelles
                anomalies_set = set()
                for _, row in anomalies_df.iterrows():
                    machine = row['Machine']
                    timestamp = row['Date'].strftime("%Y-%m-%d %H:%M:%S") if not isinstance(row['Date'], str) else row['Date']
                    anomalies_set.add(f"{machine}_{timestamp}")
                
                new_anomalies = False
                for anomaly_key in anomalies_set:
                    # Vérifier si cette anomalie spécifique a déjà été signalée dans les dernières 4 heures
                    if anomaly_key not in anomaly_tracking or (now - anomaly_tracking[anomaly_key]).total_seconds() / 3600 > 4:
                        new_anomalies = True
                        # Marquer cette anomalie comme signalée avec l'horodatage actuel
                        anomaly_tracking[anomaly_key] = now
                
                if new_anomalies:
                    print(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] {len(anomalies_df)} anomalies détectées, envoi d'alerte...")
                    
                    # Envoyer l'email d'alerte
                    send_alert_email(
                        anomalies=anomalies_df,
                        model_name=model_name,
                        sender_email=EMAIL_CONFIG['sender_email'],
                        receiver_email=EMAIL_CONFIG['receiver_email'],
                        password=EMAIL_CONFIG['sender_password']
                    )
                else:
                    print(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] Anomalies déjà signalées récemment, pas de nouvel email.")
            else:
                print(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] Aucune anomalie détectée.")
                
        except Exception as e:
            print(f"Erreur lors de la surveillance des anomalies: {e}")
        
        # Vérifier si la surveillance est toujours active avant de mettre en pause
        if anomaly_monitoring_active:
            time.sleep(frequence_verification_minutes * 60)
    
    print("Surveillance des anomalies arrêtée.")

def demarrer_surveillance_machines():
    """
    Démarre la surveillance des machines dans un thread séparé
    """
    global monitoring_thread, monitoring_active
    
    if monitoring_thread is not None and monitoring_thread.is_alive():
        print("La surveillance des machines est déjà active.")
        return
    
    monitoring_active = True
    monitoring_thread = threading.Thread(target=surveiller_machines_automatique)
    monitoring_thread.daemon = True
    monitoring_thread.start()
    print("Surveillance des machines démarrée.")

def arreter_surveillance_machines():
    """
    Arrête la surveillance des machines
    """
    global monitoring_active
    monitoring_active = False
    print("Demande d'arrêt de la surveillance des machines...")

def demarrer_surveillance_anomalies(frequence_minutes=15, recent_hours=12, model_name="Détection statistique"):
    """
    Démarre la surveillance des anomalies dans un thread séparé
    """
    global anomaly_monitoring_thread, anomaly_monitoring_active
    
    if anomaly_monitoring_thread is not None and anomaly_monitoring_thread.is_alive():
        print("La surveillance des anomalies est déjà active.")
        return
    
    anomaly_monitoring_active = True
    anomaly_monitoring_thread = threading.Thread(
        target=surveiller_anomalies_automatique,
        args=(frequence_minutes, recent_hours, model_name)
    )
    anomaly_monitoring_thread.daemon = True
    anomaly_monitoring_thread.start()
    print(f"Surveillance des anomalies démarrée (vérification toutes les {frequence_minutes} minutes).")

def arreter_surveillance_anomalies():
    """
    Arrête la surveillance des anomalies
    """
    global anomaly_monitoring_active
    anomaly_monitoring_active = False
    print("Demande d'arrêt de la surveillance des anomalies...")