import pandas as pd
import numpy as np
import pyodbc
import re

def clean_data(file_path):
    print("Chargement du fichier CSV...")
    try:
        df = pd.read_csv(file_path, sep=';', encoding='latin1')
        print(f"Fichier CSV chargé avec succès. Nombre de lignes: {len(df)}")
        
        print(f"Colonnes dans le fichier: {df.columns.tolist()}")
        
        # Remove any unnamed/empty columns
        if df.columns[-1].startswith('Unnamed:'):
            df = df.drop(columns=[df.columns[-1]])
            print(f"Colonne vide supprimée: {df.columns.tolist()}")
        
        # Identify the timestamp column
        time_col = 'Timestamp' if 'Timestamp' in df.columns else df.columns[0]
        
        # Clean timestamp column
        df[time_col] = df[time_col].str.replace(' CEST', '')
        df[time_col] = pd.to_datetime(df[time_col], errors='coerce')
        
        # Remove rows with invalid dates
        na_dates = df[time_col].isna().sum()
        if na_dates > 0:
            print(f"{na_dates} lignes avec dates invalides supprimées")
            df = df.dropna(subset=[time_col])
        
        # Set timestamp as index
        df = df.set_index(time_col)
        
        # Strip whitespace from column names
        df.columns = df.columns.str.strip()
        
        def clean_value(val):
            if pd.isna(val) or val == '':
                return np.nan
            
            val_str = str(val)
            
            # Remove kWh-related suffixes
            val_str = re.sub(r'k[Ww]h(-[Dd]if)?', '', val_str, flags=re.IGNORECASE)
            
            # Replace both comma and semicolon with dot for decimal
            val_str = val_str.replace(';', '.').replace(',', '.')
            
            # Remove quotes
            val_str = val_str.replace('"', '')
            
            try:
                return float(val_str)
            except ValueError:
                print(f"⚠️ Impossible de convertir la valeur: '{val_str}'")
                return np.nan
        
        # Apply cleaning to all columns
        for col in df.columns:
            df[col] = df[col].apply(clean_value)
        
        # Report missing values
        na_counts = df.isna().sum()
        total_na = na_counts.sum()
        if total_na > 0:
            print(f"{total_na} valeurs manquantes trouvées:")
            for col, count in na_counts[na_counts > 0].items():
                print(f"  - {col}: {count} valeurs manquantes")
        
        if not df.empty:
            # Identify rows where all machines are off (all values are 0 or NaN)
            mask_machines_off = (df == 0.0).all(axis=1)
            
            df_running = df[~mask_machines_off].copy()
            
            print(f"Nombre total de lignes : {df.shape[0]}")
            print(f"Nombre de lignes avec machines allumées : {df_running.shape[0]}")
            print(f"Nombre de lignes ignorées (machines arrêtées) : {mask_machines_off.sum()}")
            
            # Identify columns that are all zero or NaN
            cols_all_zero = df_running.apply(lambda col: ((col == 0.0) | col.isna()).all(), axis=0)
            cols_all_zero = cols_all_zero[cols_all_zero].index.tolist()
            
            print(f"Colonnes totalement à zéro : {cols_all_zero}")
            
            if cols_all_zero:
                df_running = df_running.drop(columns=cols_all_zero)
                print(f"Colonnes supprimées : {cols_all_zero}")
            else:
                print("Aucune colonne totalement à zéro. Rien à supprimer.")
            
            df_running = df_running.reset_index()
            
            print("Aperçu des données nettoyées:")
            print(df_running.head())
            
            return df_running
        else:
            print("Aucune ligne de données valide après nettoyage")
            return None
    
    except Exception as e:
        print(f"Erreur lors du nettoyage des données: {str(e)}")
        return None

def insert_into_sql_server(df, server="mokrani", database="MISFAT", username=None, password=None, trusted_connection=True):
    if df is None or df.empty:
        print("Aucune donnée à insérer dans SQL Server")
        return
        
    try:
        print("Connexion à SQL Server...")
        
        # Configuration de la chaîne de connexion
        if trusted_connection:
            # Authentification Windows
            conn_str = f'DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={server};DATABASE={database};Trusted_Connection=yes;'
        else:
            # Authentification SQL Server
            conn_str = f'DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={server};DATABASE={database};UID={username};PWD={password}'
        
        conn = pyodbc.connect(conn_str)
        
        print("Connexion SQL Server réussie")
        cursor = conn.cursor()
        
        # Créer la base de données si elle n'existe pas
        cursor.execute(f"IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '{database}') CREATE DATABASE {database}")
        conn.commit()
        
        # Utiliser la base de données
        cursor.execute(f"USE {database}")
        
        columns = df.columns.tolist()
        
        # Clean column names for SQL Server
        clean_columns = []
        for col in columns:
            clean_col = col.replace(' KWh-Dif', '').replace(' kWh-Diff', '').replace(' KWh-Diff', '')
            clean_col = clean_col.replace('.', '_').replace(' ', '_').replace('°', '')
            clean_columns.append(clean_col)
        
        # Vérifier si la table existe et la supprimer si c'est le cas
        cursor.execute(f"IF OBJECT_ID('dbo.misfat', 'U') IS NOT NULL DROP TABLE dbo.misfat")
        conn.commit()
        
        # Create table with cleaned column names
        create_table_query = f"""
        CREATE TABLE misfat (
            id INT IDENTITY(1,1) PRIMARY KEY,
            {clean_columns[0]} DATETIME,
            {', '.join([f'[{col}] FLOAT' for col in clean_columns[1:]])}
        )
        """
        cursor.execute(create_table_query)
        conn.commit()
        print("Table 'misfat' créée avec succès")
        
        df_clean = df.copy()
        df_clean.columns = clean_columns
        
        batch_size = 1000
        total_rows = len(df_clean)
        
        # Préparer la requête d'insertion
        placeholders = ', '.join(['?' for _ in clean_columns])
        insert_query = f"""
        INSERT INTO misfat ({', '.join([f'[{col}]' for col in clean_columns])})
        VALUES ({placeholders})
        """
        
        for i in range(0, total_rows, batch_size):
            batch = df_clean.iloc[i:i + batch_size]
            batch_copy = batch.copy()
            if clean_columns[0] == 'Timestamp':
                batch_copy['Timestamp'] = batch_copy['Timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S')
            
            # Préparer les valeurs pour l'insertion par lots
            values = [tuple(row) for row in batch_copy.values]
            
            # Insertion par lots
            cursor.fast_executemany = True  # Améliore les performances d'insertion par lots
            cursor.executemany(insert_query, values)
            conn.commit()
            print(f"Insertion des lignes {i+1} à {min(i+batch_size, total_rows)} terminée")
        
        print(f"Toutes les données ({total_rows} lignes) ont été insérées avec succès")
        
    except Exception as e:
        print(f"Erreur avec SQL Server: {e}")
    
    finally:
        if 'conn' in locals() and conn:
            cursor.close()
            conn.close()
            print("Connexion SQL Server fermée")

def main():
    csv_file_path = "Fini.csv"  # Update with your new CSV file path
    sql_server = "mokrani"  # Mettez à jour avec votre nom de serveur SQL Server
    sql_database = "MISFAT"
    
    # Options d'authentification
    use_windows_auth = True  # True pour l'authentification Windows, False pour l'authentification SQL Server
    sql_username = "sa"  # N'utilisé que si use_windows_auth = False
    sql_password = "password"  # N'utilisé que si use_windows_auth = False
    
    print("Démarrage du nettoyage et de l'importation des données...")
    
    cleaned_data = clean_data(csv_file_path)
    
    if cleaned_data is not None and not cleaned_data.empty:
        print(f"Données nettoyées avec succès! Forme finale: {cleaned_data.shape}")
        
        insert_into_sql_server(
            cleaned_data,
            server=sql_server,
            database=sql_database,
            username=sql_username,
            password=sql_password,
            trusted_connection=use_windows_auth
        )
    else:
        print("Échec du nettoyage des données.")

if __name__ == "__main__":
    main()